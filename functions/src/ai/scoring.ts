import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import * as https from 'https';
import { URL } from 'url';

const db = admin.firestore();

// Gemini AI configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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

async function callGeminiAPI(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.2,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    }
  };

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
      } as any
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const responseData = JSON.parse(data);
            if (!responseData.candidates || !responseData.candidates[0] || !responseData.candidates[0].content) {
              reject(new Error('Invalid Gemini API response structure'));
              return;
            }
            resolve(responseData.candidates[0].content.parts[0].text);
          } catch (e) {
            reject(new Error(`Failed to parse Gemini API response: ${e}`));
          }
        } else {
          reject(new Error(`Gemini API error: ${res.statusCode} ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

function generateScoringPrompt(questionItem: any, reviewData?: any): string {
  return `You are Dr. Michael Rodriguez, MD, a senior dermatology board item reviewer and psychometrician with 15 years of experience evaluating board examination questions. Score the question using this 5-criterion rubric (1–5 each; 25 max), then predict difficulty.

QUESTION:
\n\n${JSON.stringify(questionItem, null, 2)}

${reviewData ? `REVIEW_FEEDBACK:\n\n${JSON.stringify(reviewData, null, 2)}` : ''}

RUBRIC CRITERIA (score 1–5 each):
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

Also perform a cover-the-options check by attempting to answer using the stem only. Indicate pass/fail in feedback.

OUTPUT JSON EXACTLY:
{
  "rubric": {
    "cognitive_level": 3,
    "vignette_quality": 3,
    "options_quality": 3,
    "technical_clarity": 3,
    "rationale_explanations": 3,
    "feedback": {
      "cognitive_level": ["..."],
      "vignette_quality": ["..."],
      "options_quality": ["..."],
      "technical_clarity": ["..."],
      "rationale_explanations": ["..."],
      "overall": ["cover-the-options: pass|fail", "actionable #1", "actionable #2"]
    }
  },
  "difficulty_prediction": {
    "predicted_difficulty": 0.35,
    "confidence_interval": [0.30, 0.40],
    "difficulty_justification": "..."
  }
}
`;
}

async function processScoringInternal(questionItem: any, reviewData: any, draftId: string, iterationCount: number = 0): Promise<ScoringResult> {
  const scoringPrompt = generateScoringPrompt(questionItem, reviewData);
  try {
    const geminiResponse = await callGeminiAPI(scoringPrompt);
    const parsed = JSON.parse(geminiResponse);

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
    const geminiResponse = await callGeminiAPI(rewritePrompt);
    const mcqData = JSON.parse(geminiResponse);
    
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
