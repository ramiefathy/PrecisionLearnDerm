import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { getRobustGeminiClient } from '../util/robustGeminiClient';
import { parseGeminiResponse } from '../util/geminiResponseParser';
import { getGeminiApiKey, GEMINI_API_KEY } from '../util/config';

const db = admin.firestore();
const GEMINI_MODEL = 'gemini-2.5-pro'; // Using Gemini 2.5 Pro - Google's most intelligent AI model

interface ScoringResult {
  totalScore: number; // rubric total out of 25 (5 criteria × 5 points each)
  rubric: {
    cognitive_level: number; // 1-5
    vignette_quality: number; // 1-5
    options_quality: number; // 1-5
    technical_clarity: number; // 1-5
    rationale_explanations: number; // 1-5
    feedback: {
      cognitive_level: string[];
      vignette_quality: string[];
      options_quality: string[];
      technical_clarity: string[];
      rationale_explanations: string[];
      overall: string[];
    };
  };
  difficultyCalibration: {
    predicted_difficulty: number; // 0.0-1.0 (fraction incorrect)
    confidence_interval: [number, number];
    difficulty_justification: string;
  };
  qualityTier: 'Premium' | 'High' | 'Standard' | 'Needs Review';
  scoredAt: any;
  scoredBy: string;
  iterationCount: number;
  needsRewrite: boolean;
}

interface IterativeScoringResult {
  finalQuestion: any;
  finalScore: number;
  iterations: ScoringResult[];
  totalIterations: number;
  improvementAchieved: boolean;
}

// Use robust Gemini client instead of direct API calls

function generateScoringPrompt(questionItem: any, reviewData?: any): string {
  // Format options for display - handle both array and object formats
  const formattedOptions = Array.isArray(questionItem.options) 
    ? questionItem.options.map((opt: any, idx: number) => 
        `${String.fromCharCode(65 + idx)}) ${opt.text || opt}`
      ).join('\n')
    : typeof questionItem.options === 'object' && questionItem.options
    ? Object.keys(questionItem.options).sort().map(key => 
        `${key}) ${questionItem.options[key]}`
      ).join('\n')
    : 'No options provided';

  const formattedQuestion = {
    stem: questionItem.stem || '',
    leadIn: questionItem.leadIn || '',
    options: formattedOptions,
    correctAnswer: questionItem.correctAnswer || String.fromCharCode(65 + (questionItem.keyIndex || 0)),
    explanation: questionItem.explanation || ''
  };

  return `You are Dr. Michael Rodriguez, MD, a senior dermatology board item reviewer and psychometrician with 15 years of experience evaluating board examination questions for the American Board of Dermatology (ABD). You have personally scored over 3,000 board questions and are recognized as an expert in medical question psychometrics.

CRITICAL SCORING INSTRUCTIONS:
🎯 It is ESSENTIAL that you use the FULL RANGE of the 1-5 scale for each criterion. Do NOT default to middle scores (e.g., 3) unless truly justified by the evidence.
🎯 Provide scores of 1 or 5 when appropriate, backed by specific clinical and psychometric evidence.
🎯 Your 15 years of experience demands rigorous evaluation standards - be decisive in your scoring.

QUESTION TO EVALUATE:
\n\n${JSON.stringify(formattedQuestion, null, 2)}

${reviewData ? `REVIEW_FEEDBACK:\n\n${JSON.stringify(reviewData, null, 2)}` : ''}

RUBRIC CRITERIA (score 1–5 each - USE FULL RANGE):
1. cognitive_level: 
   - 1: Basic recall, no clinical reasoning required
   - 2: Simple application, minimal reasoning
   - 3: Moderate application, some clinical reasoning
   - 4: Complex application, significant clinical reasoning
   - 5: Advanced application, sophisticated clinical reasoning and differential diagnosis

2. vignette_quality: 
   - 1: Incomplete, missing critical information, unclear
   - 2: Basic information present but lacks focus
   - 3: Adequate information, somewhat focused
   - 4: Good information, well-focused, realistic
   - 5: Excellent, comprehensive, focused, highly realistic clinical scenario

3. options_quality: 
   - 1: Poor distractors, obvious correct answer, technical flaws
   - 2: Weak distractors, some technical issues
   - 3: Adequate distractors, minor technical issues
   - 4: Good distractors, plausible alternatives
   - 5: Excellent distractors, homogeneous, no technical flaws

4. technical_clarity: 
   - 1: Poor grammar, multiple cues, confusing language
   - 2: Some grammar issues, minor cues
   - 3: Generally clear, few minor issues
   - 4: Clear language, no cues, good structure
   - 5: Excellent clarity, precise language, perfect structure

5. rationale_explanations: 
   - 1: Missing or incorrect explanations
   - 2: Basic explanations, minimal detail
   - 3: Adequate explanations, some detail
   - 4: Good explanations, comprehensive detail
   - 5: Excellent explanations, comprehensive with educational pearls

SCORING EXAMPLES (to calibrate your evaluation):

📚 COGNITIVE LEVEL 5 Example: "Based on the clinical presentation of papulosquamous lesions on extensor surfaces with nail pitting and family history, integrate these findings to determine the most likely diagnosis among systemic inflammatory conditions."

📚 COGNITIVE LEVEL 1 Example: "Acne vulgaris typically presents in which age group?"

📚 VIGNETTE QUALITY 5 Example: "A 45-year-old construction worker presents with a 6-month history of progressive, well-demarcated erythematous plaques with silvery scale on bilateral elbows and knees. Physical exam reveals nail pitting in 8/10 fingernails, and the patient reports morning stiffness lasting 45 minutes. Family history reveals psoriasis in his mother and paternal uncle."

📚 VIGNETTE QUALITY 1 Example: "Patient has a rash. What is the diagnosis?"

📚 OPTIONS QUALITY 5 Example: All five diagnostic options are inflammatory dermatoses with overlapping presentations (psoriasis, eczema, lichen planus, seborrheic dermatitis, pityriasis rosea) - homogeneous and plausible.

📚 OPTIONS QUALITY 1 Example: Mixed categories (A) Psoriasis B) Antihistamine C) Age 25-35 D) Biopsy E) Topical steroid) - not homogeneous, obvious technical flaws.

📚 TECHNICAL CLARITY 5 Example: Clear, unambiguous medical terminology, no grammatical errors, no cueing words, consistent option structure, precise language throughout.

📚 TECHNICAL CLARITY 1 Example: "The best treatment for the patient's condition is..." when all options are diagnostic tests (grammatical inconsistency), or using "always" and "never" inappropriately.

📚 RATIONALE EXPLANATIONS 5 Example: Comprehensive explanation citing specific clinical features from the vignette, detailed pathophysiology, clear reasoning for why each distractor is incorrect with specific differentiating features, includes educational pearls about diagnostic pitfalls and management principles.

📚 RATIONALE EXPLANATIONS 1 Example: "The correct answer is A because it is the best option." with no medical reasoning or distractor analysis.

COVER-THE-OPTIONS TEST: A qualified dermatologist should be able to answer the question correctly using ONLY the clinical vignette, without seeing the answer choices. If the stem lacks sufficient information for diagnosis/management, mark as FAIL and provide specific feedback on what clinical details are missing. If FAIL, provide actionable feedback on how to make the stem self-contained.

PROVIDE YOUR RESPONSE IN THIS STRUCTURED FORMAT:

=== SCORING RUBRIC ===
COGNITIVE_LEVEL: [1-5]
VIGNETTE_QUALITY: [1-5]
OPTIONS_QUALITY: [1-5]
TECHNICAL_CLARITY: [1-5]
RATIONALE_EXPLANATIONS: [1-5]

=== FEEDBACK ===
COGNITIVE_LEVEL_FEEDBACK:
- [Specific feedback point 1]
- [Specific feedback point 2]

VIGNETTE_QUALITY_FEEDBACK:
- [Specific feedback point 1]
- [Specific feedback point 2]

OPTIONS_QUALITY_FEEDBACK:
- [Specific feedback point 1]
- [Specific feedback point 2]

TECHNICAL_CLARITY_FEEDBACK:
- [Specific feedback point 1]
- [Specific feedback point 2]

RATIONALE_EXPLANATIONS_FEEDBACK:
- [Specific feedback point 1]
- [Specific feedback point 2]

OVERALL_FEEDBACK:
- COVER_THE_OPTIONS: [PASS|FAIL]
- [Actionable improvement point 1]
- [Actionable improvement point 2]
- [Actionable improvement point 3]

=== DIFFICULTY PREDICTION ===
PREDICTED_DIFFICULTY: [0.0-1.0]
CONFIDENCE_INTERVAL_MIN: [0.0-1.0]
CONFIDENCE_INTERVAL_MAX: [0.0-1.0]
DIFFICULTY_JUSTIFICATION: [Detailed justification for difficulty prediction]
`;
}

// Helper function to parse structured scoring response
function parseStructuredScoringResponse(text: string): any {
  const result: any = {
    rubric: {},
    difficulty_prediction: {}
  };

  try {
    // Extract scoring values
    const cognitiveMatch = text.match(/COGNITIVE_LEVEL:\s*(\d+)/);
    const vignetteMatch = text.match(/VIGNETTE_QUALITY:\s*(\d+)/);
    const optionsMatch = text.match(/OPTIONS_QUALITY:\s*(\d+)/);
    const clarityMatch = text.match(/TECHNICAL_CLARITY:\s*(\d+)/);
    const rationaleMatch = text.match(/RATIONALE_EXPLANATIONS:\s*(\d+)/);

    result.rubric.cognitive_level = cognitiveMatch ? parseInt(cognitiveMatch[1]) : 3;
    result.rubric.vignette_quality = vignetteMatch ? parseInt(vignetteMatch[1]) : 3;
    result.rubric.options_quality = optionsMatch ? parseInt(optionsMatch[1]) : 3;
    result.rubric.technical_clarity = clarityMatch ? parseInt(clarityMatch[1]) : 3;
    result.rubric.rationale_explanations = rationaleMatch ? parseInt(rationaleMatch[1]) : 3;

    // Extract feedback sections
    result.rubric.feedback = {};
    
    const extractFeedback = (section: string, key: string) => {
      const pattern = new RegExp(`${section}:(.*?)(?=\\n[A-Z_]+_FEEDBACK:|\\n=== |$)`, 's');
      const match = text.match(pattern);
      if (match) {
        const feedbackLines = match[1].split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-'))
          .map(line => line.substring(1).trim())
          .filter(line => line.length > 0);
        result.rubric.feedback[key] = feedbackLines;
      } else {
        result.rubric.feedback[key] = [];
      }
    };

    extractFeedback('COGNITIVE_LEVEL_FEEDBACK', 'cognitive_level');
    extractFeedback('VIGNETTE_QUALITY_FEEDBACK', 'vignette_quality');
    extractFeedback('OPTIONS_QUALITY_FEEDBACK', 'options_quality');
    extractFeedback('TECHNICAL_CLARITY_FEEDBACK', 'technical_clarity');
    extractFeedback('RATIONALE_EXPLANATIONS_FEEDBACK', 'rationale_explanations');
    
    // Extract overall feedback
    const overallPattern = /OVERALL_FEEDBACK:(.*?)(?=\n=== |$)/s;
    const overallMatch = text.match(overallPattern);
    if (overallMatch) {
      const overallLines = overallMatch[1].split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('-'))
        .map(line => line.substring(1).trim())
        .filter(line => line.length > 0);
      result.rubric.feedback.overall = overallLines;
    } else {
      result.rubric.feedback.overall = [];
    }

    // Extract difficulty prediction
    const difficultyMatch = text.match(/PREDICTED_DIFFICULTY:\s*([\d.]+)/);
    const minMatch = text.match(/CONFIDENCE_INTERVAL_MIN:\s*([\d.]+)/);
    const maxMatch = text.match(/CONFIDENCE_INTERVAL_MAX:\s*([\d.]+)/);
    const justificationMatch = text.match(/DIFFICULTY_JUSTIFICATION:\s*(.*?)$/s);

    result.difficulty_prediction.predicted_difficulty = difficultyMatch ? parseFloat(difficultyMatch[1]) : 0.5;
    result.difficulty_prediction.confidence_interval = [
      minMatch ? parseFloat(minMatch[1]) : 0.4,
      maxMatch ? parseFloat(maxMatch[1]) : 0.6
    ];
    result.difficulty_prediction.difficulty_justification = justificationMatch ? justificationMatch[1].trim() : 'No justification provided';

    return result;
  } catch (error) {
    logError('scoring.structured_parse_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      textLength: text.length,
      timestamp: new Date().toISOString()
    });
    return result;
  }
}

async function processScoringInternal(questionItem: any, reviewData: any, draftId: string, iterationCount: number = 0): Promise<ScoringResult> {
  const scoringPrompt = generateScoringPrompt(questionItem, reviewData);
  try {
    // Use robust Gemini client with structured text parsing
    const client = getRobustGeminiClient({
      maxRetries: 3,
      fallbackToFlash: true,
      timeout: 120000
    });

    const response = await client.generateText({
      prompt: scoringPrompt,
      operation: 'enhanced_scoring_structured',
      preferredModel: 'gemini-2.5-pro'
    });

    if (!response.success || !response.text) {
      throw new Error(`Scoring failed: ${response.error || 'No response text'}`);
    }

    const parsed = parseStructuredScoringResponse(response.text);

    const r = parsed.rubric || {};
    const total = [r.cognitive_level, r.vignette_quality, r.options_quality, r.technical_clarity, r.rationale_explanations]
      .map((x: any) => Number(x) || 0).reduce((a: number, b: number) => a + b, 0);

    let qualityTier: 'Premium' | 'High' | 'Standard' | 'Needs Review';
    if (total >= 22) qualityTier = 'Premium';
    else if (total >= 18) qualityTier = 'High';
    else if (total >= 15) qualityTier = 'Standard';
    else qualityTier = 'Needs Review';

    return {
      totalScore: total,
      rubric: {
        cognitive_level: r.cognitive_level || 0,
        vignette_quality: r.vignette_quality || 0,
        options_quality: r.options_quality || 0,
        technical_clarity: r.technical_clarity || 0,
        rationale_explanations: r.rationale_explanations || 0,
        feedback: {
          cognitive_level: r.feedback?.cognitive_level || [],
          vignette_quality: r.feedback?.vignette_quality || [],
          options_quality: r.feedback?.options_quality || [],
          technical_clarity: r.feedback?.technical_clarity || [],
          rationale_explanations: r.feedback?.rationale_explanations || [],
          overall: r.feedback?.overall || []
        }
      },
      difficultyCalibration: {
        predicted_difficulty: parsed.difficulty_prediction?.predicted_difficulty || 0.5,
        confidence_interval: parsed.difficulty_prediction?.confidence_interval || [0.4, 0.6],
        difficulty_justification: parsed.difficulty_prediction?.difficulty_justification || 'Estimated from vignette complexity and option quality'
      },
      qualityTier,
      scoredAt: admin.firestore.FieldValue.serverTimestamp(),
      scoredBy: 'ai-scoring-agent',
      iterationCount,
      needsRewrite: total < 20
    };
  } catch (error: any) {
    logError('scoring.gemini_error', { draftId, error: error.message });
    return {
      totalScore: 15,
      rubric: {
        cognitive_level: 3,
        vignette_quality: 3,
        options_quality: 3,
        technical_clarity: 3,
        rationale_explanations: 3,
        feedback: {
          cognitive_level: [],
          vignette_quality: [],
          options_quality: [],
          technical_clarity: [],
          rationale_explanations: [],
          overall: ['AI rubric scoring fallback used']
        }
      },
      difficultyCalibration: {
        predicted_difficulty: 0.5,
        confidence_interval: [0.4, 0.6],
        difficulty_justification: 'AI scoring failed - manual calibration needed'
      },
      qualityTier: 'Standard',
      scoredAt: admin.firestore.FieldValue.serverTimestamp(),
      scoredBy: 'ai-scoring-agent-fallback',
      iterationCount,
      needsRewrite: true
    };
  }
}

// New function to rewrite questions based on scoring feedback
async function rewriteQuestionBasedOnFeedback(originalQuestion: any, scoringResult: ScoringResult, entityName: string, entity: any): Promise<any> {
  const rewritePrompt = `You are Dr. Lisa Thompson, MD, a board-certified dermatologist and expert medical question writer. You need to rewrite a dermatology board question based on specific scoring feedback to improve its quality.

ORIGINAL QUESTION:
${JSON.stringify(originalQuestion, null, 2)}

SCORING FEEDBACK (current score: ${scoringResult.totalScore}/25):
${JSON.stringify(scoringResult.rubric.feedback, null, 2)}

ORIGINAL ENTITY INFORMATION:
Entity Name: ${entityName}
Description: ${entity.description || 'N/A'}
Symptoms: ${entity.symptoms || 'N/A'}
Treatment: ${entity.treatment || 'N/A'}
Diagnosis: ${entity.diagnosis || 'N/A'}

TASK: Rewrite the question to address ALL the feedback points and improve the score. Focus on:
1. Enhancing clinical reasoning complexity (cognitive_level)
2. Improving vignette quality and realism
3. Creating better, more plausible distractors
4. Fixing any technical clarity issues
5. Strengthening explanations and rationale

MAINTAIN the same clinical scenario and learning objective, but improve the execution significantly.

PROVIDE YOUR RESPONSE IN THIS EXACT JSON FORMAT:
{
  "clinical_vignette": "A [AGE]-year-old [GENDER] presents to the dermatology clinic with [DURATION] history of [SYMPTOMS]. Physical examination reveals [FINDINGS]. [ADDITIONAL RELEVANT INFORMATION]. [RELEVANT HISTORY IF APPLICABLE].",
  "lead_in": "What is the most likely diagnosis?",
  "answer_options": [
    {"text": "[CORRECT ANSWER - specific diagnosis/treatment]", "is_correct": true},
    {"text": "[PLAUSIBLE DISTRACTOR 1 - same category]", "is_correct": false},
    {"text": "[PLAUSIBLE DISTRACTOR 2 - same category]", "is_correct": false},
    {"text": "[PLAUSIBLE DISTRACTOR 3 - same category]", "is_correct": false},
    {"text": "[PLAUSIBLE DISTRACTOR 4 - same category]", "is_correct": false}
  ],
  "comprehensive_explanation": {
    "correct_answer_rationale": "Detailed explanation of why this is the correct answer, citing specific elements from the clinical vignette and explaining the underlying pathophysiology or clinical reasoning.",
    "distractor_explanations": {
      "distractor_1": "Specific explanation of why this option is incorrect, including what clinical features would be expected if this were the correct diagnosis.",
      "distractor_2": "Specific explanation of why this option is incorrect, including what clinical features would be expected if this were the correct diagnosis.",
      "distractor_3": "Specific explanation of why this option is incorrect, including what clinical features would be expected if this were the correct diagnosis.",
      "distractor_4": "Specific explanation of why this option is incorrect, including what clinical features would be expected if this were the correct diagnosis."
    },
    "educational_pearls": [
      "Key learning point 1: [Specific clinical pearl or diagnostic tip]",
      "Key learning point 2: [Differential diagnosis consideration]",
      "Key learning point 3: [Management principle or clinical decision-making insight]"
    ]
  }
}`;

  try {
    const client = getRobustGeminiClient({
      maxRetries: 3,
      fallbackToFlash: true,
      timeout: 120000
    });

    const response = await client.generateText({
      prompt: rewritePrompt,
      operation: 'question_rewrite',
      preferredModel: 'gemini-2.5-pro'
    });

    if (!response.success || !response.text) {
      throw new Error(`Question rewrite failed: ${response.error || 'No response text'}`);
    }

    const mcqData = JSON.parse(response.text);
    
    // Extract correct answer index
    const correctIndex = mcqData.answer_options.findIndex((opt: any) => opt.is_correct);
    
    // Format options for consistency
    const options = mcqData.answer_options.map((opt: any) => ({ text: opt.text }));
    
    // Combine explanations into a comprehensive explanation in PLAIN TEXT format
    const explanation = `${entityName}

Correct Answer: ${mcqData.answer_options[correctIndex].text}

${mcqData.comprehensive_explanation.correct_answer_rationale}

Why other options are incorrect:

${Object.entries(mcqData.comprehensive_explanation.distractor_explanations || {}).map(([key, explanation]) => 
  `${mcqData.answer_options.find((opt: any) => opt.text.toLowerCase().includes(key.replace('_', ' ')))?.text || key}: ${explanation}`
).join('\n\n')}

Educational Pearls:
${(mcqData.comprehensive_explanation.educational_pearls || []).map((pearl: string) => `${pearl}`).join('\n')}

This explanation is based on current dermatological knowledge and evidence-based practice.`;

    return {
      type: 'A',
      topicIds: [entityName.toLowerCase().replace(/\s+/g, '.')],
      stem: mcqData.clinical_vignette,
      leadIn: mcqData.lead_in,
      options,
      keyIndex: correctIndex,
      explanation,
      citations: [{ source: `KB:${entityName.toLowerCase().replace(/\s+/g, '_')}` }],
      difficulty: originalQuestion.difficulty || 0.3,
      qualityScore: Math.min(95, 75 + (entity.completeness_score - 65) * 0.5),
      status: 'draft',
      aiGenerated: true,
      learningObjectives: mcqData.learning_objectives || [],
      boardRelevance: mcqData.board_relevance || 'Standard',
      createdBy: { type: 'agent', model: 'ai-enhanced-drafting-abd-rewrite', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      rewriteIteration: scoringResult.iterationCount + 1,
      originalQuestionId: originalQuestion.id || 'unknown'
    };
    
  } catch (error: any) {
    logError('rewrite_question_error', { error: error.message, entityName });
    // Return original question if rewrite fails
    return {
      ...originalQuestion,
      rewriteIteration: scoringResult.iterationCount + 1,
      rewriteFailed: true,
      rewriteError: error.message
    };
  }
}

// Main iterative scoring function
async function processIterativeScoring(originalQuestion: any, entityName: string, entity: any, maxIterations: number = 5): Promise<IterativeScoringResult> {
  const iterations: ScoringResult[] = [];
  let currentQuestion = { ...originalQuestion };
  let currentScore = 0;
  let iterationCount = 0;

  logInfo('iterative_scoring_started', { 
    entityName, 
    maxIterations, 
    questionId: originalQuestion.id || 'unknown' 
  });

  while (iterationCount < maxIterations) {
    iterationCount++;
    
    // Score the current question
    const scoringResult = await processScoringInternal(currentQuestion, null, originalQuestion.id || 'unknown', iterationCount);
    iterations.push(scoringResult);
    
    currentScore = scoringResult.totalScore;
    
    logInfo('scoring_iteration_complete', { 
      iteration: iterationCount, 
      score: currentScore, 
      needsRewrite: scoringResult.needsRewrite 
    });

    // Check if we've achieved the target score
    if (currentScore > 20) {
      logInfo('target_score_achieved', { 
        finalScore: currentScore, 
        totalIterations: iterationCount 
      });
      
      return {
        finalQuestion: currentQuestion,
        finalScore: currentScore,
        iterations,
        totalIterations: iterationCount,
        improvementAchieved: true
      };
    }

    // If we haven't reached the target and haven't hit max iterations, rewrite
    if (iterationCount < maxIterations) {
      logInfo('rewriting_question', { 
        iteration: iterationCount, 
        currentScore, 
        targetScore: 20 
      });
      
      const rewrittenQuestion = await rewriteQuestionBasedOnFeedback(
        currentQuestion, 
        scoringResult, 
        entityName, 
        entity
      );
      
      if (rewrittenQuestion.rewriteFailed) {
        logError('rewrite_failed', { 
          iteration: iterationCount, 
          error: rewrittenQuestion.rewriteError 
        });
        break;
      }
      
      currentQuestion = rewrittenQuestion;
    }
  }

  // If we've exhausted iterations without reaching target
  logInfo('max_iterations_reached', { 
    finalScore: currentScore, 
    totalIterations: iterationCount 
  });
  
  return {
    finalQuestion: currentQuestion,
    finalScore: currentScore,
    iterations,
    totalIterations: iterationCount,
    improvementAchieved: currentScore > 20
  };
}

export { processIterativeScoring, rewriteQuestionBasedOnFeedback };

// Export internal version for use in orchestrator
export async function scoreMCQInternal(questionItem: any): Promise<{
  scores: {
    clinicalRelevance: number;
    clarity: number;
    singleBestAnswer: number;
    difficulty: number;
    educationalValue: number;
  };
  totalScore: number;
  feedback: string;
}> {
  try {
    // Normalize options format to handle both array and object formats
    let normalizedItem = { ...questionItem };
    
    // Convert object format {A: "...", B: "..."} to array format
    if (normalizedItem.options && typeof normalizedItem.options === 'object' && !Array.isArray(normalizedItem.options)) {
      console.warn('[Scoring] Received object format for MCQ options, converting to array format');
      
      const optionsObject = normalizedItem.options as Record<string, string>;
      normalizedItem.options = Object.keys(optionsObject)
        .sort() // Ensure A, B, C, D, E order
        .map(key => ({ 
          text: optionsObject[key] 
        }));
      
      // Convert correctAnswer letter to keyIndex
      if (normalizedItem.correctAnswer && typeof normalizedItem.correctAnswer === 'string') {
        const answerLetter = normalizedItem.correctAnswer.toUpperCase();
        if (answerLetter.length === 1 && answerLetter >= 'A' && answerLetter <= 'E') {
          normalizedItem.keyIndex = answerLetter.charCodeAt(0) - 65;
        }
      }
      
      // Also handle if keyIndex is passed as a letter string
      if (typeof normalizedItem.keyIndex === 'string') {
        const keyLetter = normalizedItem.keyIndex.toUpperCase();
        if (keyLetter.length === 1 && keyLetter >= 'A' && keyLetter <= 'E') {
          normalizedItem.keyIndex = keyLetter.charCodeAt(0) - 65;
        }
      }
    }
    
    const scoringResult = await processScoringInternal(normalizedItem, null, `score_${Date.now()}`, 0);
    
    // Map the detailed scoring result to the simplified interface
    return {
      scores: {
        clinicalRelevance: scoringResult.rubric.vignette_quality,
        clarity: scoringResult.rubric.technical_clarity,
        singleBestAnswer: scoringResult.rubric.options_quality,
        difficulty: scoringResult.rubric.cognitive_level,
        educationalValue: scoringResult.rubric.rationale_explanations
      },
      totalScore: scoringResult.totalScore,
      feedback: [
        ...scoringResult.rubric.feedback.overall,
        `Quality Tier: ${scoringResult.qualityTier}`,
        `Predicted Difficulty: ${scoringResult.difficultyCalibration.predicted_difficulty}`,
        scoringResult.needsRewrite ? 'Question needs rewriting' : 'Question meets standards'
      ].join('\n')
    };
  } catch (error) {
    logError('scoreMCQInternal error', { error });
    throw new Error(`Scoring failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Rename original function
async function processScoringCore(questionItem: any, reviewData: any, draftId: string, iterationCount: number = 0): Promise<ScoringResult> {
  return await processScoringInternal(questionItem, reviewData, draftId, iterationCount);
}

// Cloud Function wrapper for processScoring
export const processScoring = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { item } = data || {};
    
    if (!item) {
      throw new Error('Missing required parameter: item');
    }
    
    const scoringResult = await processScoringCore(item, null, `score_${Date.now()}`, 0);
    
    return {
      success: true,
      ...scoringResult
    };
    
  } catch (error: any) {
    console.error('Error scoring question:', error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
});
