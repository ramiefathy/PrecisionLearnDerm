import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import * as https from 'https';
import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';

const db = admin.firestore();

// Gemini AI configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash-exp';

// Load knowledge base
let adaptiveKnowledgeBase: Record<string, any> = {};

try {
  const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
  const kbData = fs.readFileSync(kbPath, 'utf8');
  adaptiveKnowledgeBase = JSON.parse(kbData);
  console.log(`Adaptive generation loaded ${Object.keys(adaptiveKnowledgeBase).length} KB entries`);
} catch (error) {
  console.error('Failed to load KB for adaptive generation:', error);
}

interface MissedQuestion {
  questionId: string;
  missedAt: any;
  topicIds: string[];
  chosenIndex: number;
  correctIndex: number;
  confidenceLevel: string;
  timeSpent: number;
  questionContent: {
    stem: string;
    leadIn: string;
    options: Array<{ text: string }>;
    explanation: string;
  };
}

interface KnowledgeGap {
  topic: string;
  gapType: 'conceptual' | 'application' | 'differential' | 'treatment' | 'pathophysiology';
  severity: 'low' | 'medium' | 'high';
  evidence: {
    missedQuestions: number;
    lowConfidenceAnswers: number;
    consistentErrors: string[];
  };
  suggestedFocus: string[];
}

interface PersonalizedQuestionRequest {
  userId: string;
  targetTopic: string;
  gapAnalysis: KnowledgeGap;
  difficultyAdjustment: number; // -0.5 to +0.5 from user's current ability
  focusArea?: string; // User-specified or AI-determined
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
      temperature: 0.6, // Balanced creativity for personalized content
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 3072,
      responseMimeType: "application/json"
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
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

async function analyzeKnowledgeGaps(userId: string, missedQuestions: MissedQuestion[]): Promise<KnowledgeGap[]> {
  if (missedQuestions.length === 0) return [];

  const topicGroups = missedQuestions.reduce((groups, missed) => {
    missed.topicIds.forEach(topicId => {
      if (!groups[topicId]) groups[topicId] = [];
      groups[topicId].push(missed);
    });
    return groups;
  }, {} as Record<string, MissedQuestion[]>);

  const gaps: KnowledgeGap[] = [];

  for (const [topic, questions] of Object.entries(topicGroups)) {
    if (questions.length < 2) continue; // Need at least 2 missed questions to identify a gap

    // Analyze error patterns
    const lowConfidence = questions.filter(q => q.confidenceLevel === 'Low').length;
    const consistentErrors = analyzeErrorPatterns(questions);
    
    // Determine gap type based on question content and errors
    const gapType = determineGapType(questions, topic);
    const severity = calculateGapSeverity(questions, lowConfidence);

    gaps.push({
      topic,
      gapType,
      severity,
      evidence: {
        missedQuestions: questions.length,
        lowConfidenceAnswers: lowConfidence,
        consistentErrors
      },
      suggestedFocus: generateFocusAreas(topic, gapType, adaptiveKnowledgeBase[topic])
    });
  }

  return gaps.sort((a, b) => {
    const severityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
    return severityWeight[b.severity] - severityWeight[a.severity];
  });
}

function analyzeErrorPatterns(questions: MissedQuestion[]): string[] {
  const patterns: string[] = [];
  
  // Look for consistent distractor selection
  const distractorChoices = questions.map(q => q.chosenIndex);
  const mostCommonChoice = distractorChoices.reduce((a, b, i, arr) => 
    arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
  );
  
  if (distractorChoices.filter(choice => choice === mostCommonChoice).length >= questions.length * 0.6) {
    patterns.push(`Consistently chooses option ${String.fromCharCode(65 + mostCommonChoice)}`);
  }

  // Analyze confidence patterns
  const lowConfidenceRate = questions.filter(q => q.confidenceLevel === 'Low').length / questions.length;
  if (lowConfidenceRate > 0.7) {
    patterns.push('Low confidence across topic indicating conceptual uncertainty');
  }

  // Time pattern analysis
  const avgTime = questions.reduce((sum, q) => sum + q.timeSpent, 0) / questions.length;
  if (avgTime < 30) {
    patterns.push('Quick incorrect answers suggesting guessing or knowledge gaps');
  } else if (avgTime > 120) {
    patterns.push('Extended time with incorrect answers suggesting difficulty with application');
  }

  return patterns;
}

function determineGapType(questions: MissedQuestion[], topic: string): KnowledgeGap['gapType'] {
  const questionContent = questions.map(q => q.questionContent.stem + ' ' + q.questionContent.explanation).join(' ').toLowerCase();
  
  if (questionContent.includes('treatment') || questionContent.includes('management') || questionContent.includes('therapy')) {
    return 'treatment';
  } else if (questionContent.includes('pathophysiology') || questionContent.includes('mechanism') || questionContent.includes('cause')) {
    return 'pathophysiology';
  } else if (questionContent.includes('differential') || questionContent.includes('distinguish') || questionContent.includes('versus')) {
    return 'differential';
  } else if (questionContent.includes('clinical') || questionContent.includes('apply') || questionContent.includes('case')) {
    return 'application';
  } else {
    return 'conceptual';
  }
}

function calculateGapSeverity(questions: MissedQuestion[], lowConfidence: number): KnowledgeGap['severity'] {
  const missedCount = questions.length;
  const lowConfidenceRate = lowConfidence / missedCount;
  
  if (missedCount >= 4 && lowConfidenceRate > 0.6) {
    return 'high';
  } else if (missedCount >= 3 || lowConfidenceRate > 0.4) {
    return 'medium';
  } else {
    return 'low';
  }
}

function generateFocusAreas(topic: string, gapType: KnowledgeGap['gapType'], entityData: any): string[] {
  const areas: string[] = [];
  
  if (!entityData) return ['General topic review'];

  switch (gapType) {
    case 'pathophysiology':
      areas.push('Disease mechanisms and etiology');
      if (entityData.causes) areas.push('Underlying pathophysiology');
      break;
    case 'treatment':
      areas.push('Therapeutic approaches');
      if (entityData.treatment) areas.push('Treatment protocols and management');
      break;
    case 'differential':
      areas.push('Distinguishing features from similar conditions');
      areas.push('Diagnostic criteria and key differences');
      break;
    case 'application':
      areas.push('Clinical presentation patterns');
      areas.push('Real-world application of knowledge');
      break;
    case 'conceptual':
    default:
      areas.push('Core concept understanding');
      if (entityData.description) areas.push('Fundamental disease characteristics');
      break;
  }

  return areas;
}

function generatePersonalizedQuestionPrompt(request: PersonalizedQuestionRequest, entityData: any, userFocusArea?: string): string {
  const focusArea = userFocusArea || request.gapAnalysis.suggestedFocus[0] || 'general understanding';
  
  return `You are Dr. Jennifer Walsh, MD, a dermatology educator specializing in personalized medical education and remediation. You have 15 years of experience creating targeted questions for learners with specific knowledge gaps.

Your task is to create a highly personalized dermatology MCQ that addresses a specific knowledge gap identified through learning analytics.

LEARNER PROFILE:
- Has demonstrated difficulty with: ${request.targetTopic}
- Primary knowledge gap: ${request.gapAnalysis.gapType}
- Gap severity: ${request.gapAnalysis.severity}
- Identified error patterns: ${request.gapAnalysis.evidence.consistentErrors.join(', ')}
- Missed ${request.gapAnalysis.evidence.missedQuestions} questions on this topic
- Focus area requested: ${focusArea}

KNOWLEDGE BASE DATA FOR ${request.targetTopic}:
\`\`\`json
${JSON.stringify(entityData, null, 2)}
\`\`\`

PERSONALIZATION REQUIREMENTS:
1. **Address the Gap**: Directly target the identified ${request.gapAnalysis.gapType} knowledge gap
2. **Scaffolded Learning**: Provide clear reasoning path in explanation 
3. **Error Prevention**: Design distractors that specifically avoid the learner's typical error patterns
4. **Focused Learning**: Emphasize the requested focus area: ${focusArea}
5. **Confidence Building**: Include confidence-boosting elements while maintaining rigor

DIFFICULTY ADJUSTMENT: ${request.difficultyAdjustment > 0 ? 'Slightly more challenging' : request.difficultyAdjustment < 0 ? 'Slightly easier' : 'Appropriate level'} than standard questions

PROVIDE YOUR RESPONSE IN THIS EXACT JSON FORMAT:
{
  "personalized_vignette": "A detailed clinical scenario that specifically targets the identified knowledge gap",
  "targeted_question": "A question stem that directly addresses the gap type and focus area",
  "strategic_options": [
    {"text": "Correct answer with clear reasoning path", "is_correct": true, "reasoning": "Why this is correct"},
    {"text": "Distractor designed to avoid common error patterns", "is_correct": false, "trap_avoided": "How this avoids learner's typical mistakes"},
    {"text": "Educational distractor for differential understanding", "is_correct": false, "learning_value": "What this teaches about similar conditions"},
    {"text": "Plausible but incorrect option", "is_correct": false, "why_wrong": "Clear reason why this is incorrect"}
  ],
  "remediation_explanation": {
    "gap_addressed": "How this question specifically addresses the identified knowledge gap",
    "correct_reasoning": "Step-by-step explanation of why the correct answer is right",
    "error_prevention": "How the question design helps prevent typical mistakes",
    "learning_reinforcement": "Key concepts reinforced for long-term retention",
    "next_steps": "Suggested areas for continued study"
  },
  "difficulty_calibration": 0.35,
  "personalization_features": [
    "List of specific features that make this question personalized to the learner"
  ],
  "gap_closure_metrics": {
    "addresses_gap_type": true,
    "error_pattern_consideration": true,
    "confidence_building": true,
    "knowledge_reinforcement": true
  }
}

Create a question that will help this learner overcome their specific challenges while building confidence and understanding in ${request.targetTopic}.`;
}

async function generatePersonalizedQuestion(request: PersonalizedQuestionRequest, userFocusArea?: string): Promise<any> {
  const entityData = adaptiveKnowledgeBase[request.targetTopic];
  
  if (!entityData) {
    throw new Error(`No knowledge base data found for topic: ${request.targetTopic}`);
  }

  try {
    const prompt = generatePersonalizedQuestionPrompt(request, entityData, userFocusArea);
    const geminiResponse = await callGeminiAPI(prompt);
    const questionData = JSON.parse(geminiResponse);
    
    // Format for storage
    const correctIndex = questionData.strategic_options.findIndex((opt: any) => opt.is_correct);
    const options = questionData.strategic_options.map((opt: any) => ({ text: opt.text }));
    
    const personalizedQuestion = {
      type: 'A',
      topicIds: [request.targetTopic],
      stem: questionData.personalized_vignette,
      leadIn: questionData.targeted_question,
      options,
      keyIndex: correctIndex,
      explanation: formatPersonalizedExplanation(questionData.remediation_explanation),
      citations: [{ source: `KB:${request.targetTopic}`, type: 'adaptive_generation' }],
      difficulty: questionData.difficulty_calibration || 0.5,
      personalizedFor: request.userId,
      gapTargeted: request.gapAnalysis,
      focusArea: userFocusArea || request.gapAnalysis.suggestedFocus[0],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending_review',
      source: 'adaptive_generation',
      qualityScore: 85, // Start with good score for personalized questions
      personalizationFeatures: questionData.personalization_features || [],
      gapClosureMetrics: questionData.gap_closure_metrics || {}
    };

    return personalizedQuestion;
    
  } catch (error: any) {
    logError('adaptive.generation_failed', {
      userId: request.userId,
      targetTopic: request.targetTopic,
      error: error.message
    });
    throw new Error(`Failed to generate personalized question: ${error.message}`);
  }
}

function formatPersonalizedExplanation(remediation: any): string {
  return `## Personalized Learning Explanation

**How this addresses your knowledge gap:** ${remediation.gap_addressed}

**Correct Answer Reasoning:**
${remediation.correct_reasoning}

**Avoiding Common Mistakes:**
${remediation.error_prevention}

**Key Learning Points:**
${remediation.learning_reinforcement}

**Next Steps for Mastery:**
${remediation.next_steps}

*This question was specifically designed based on your learning patterns to help you master this topic.*`;
}

// Main function: Trigger personalized question generation after a missed question
export const triggerAdaptiveGeneration = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { missedQuestionId, userSpecifiedFocus } = data || {};
    
    if (!missedQuestionId) {
      throw new Error('Missing required parameter: missedQuestionId');
    }
    
    const db = admin.firestore();
    const userId = context?.auth?.uid;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    // Get the missed question details
    const missedQuestionRef = db.collection('missedQuestions').doc(missedQuestionId);
    const missedQuestionDoc = await missedQuestionRef.get();
    
    if (!missedQuestionDoc.exists) {
      throw new Error('Missed question not found');
    }
    
    const missedQuestion = missedQuestionDoc.data();
    
    if (!missedQuestion) {
      throw new Error('Missed question data not found');
    }
    
    // Analyze knowledge gaps
    const knowledgeGaps = await analyzeKnowledgeGaps(userId, [missedQuestion as MissedQuestion]);
    
    // Generate personalized question
    const personalizedQuestion = await generatePersonalizedQuestion({
      userId: userId,
      targetTopic: missedQuestion.topic,
      gapAnalysis: knowledgeGaps[0],
      difficultyAdjustment: knowledgeGaps[0].severity === 'high' ? -0.2 : knowledgeGaps[0].severity === 'low' ? 0.1 : 0,
      focusArea: userSpecifiedFocus
    }, userSpecifiedFocus);
    
    if (personalizedQuestion) {
      // Store in user's personal question bank
      const personalBankRef = db.collection('userPersonalQuestions').doc(userId);
      await personalBankRef.set({
        questions: admin.firestore.FieldValue.arrayUnion(personalizedQuestion)
      }, { merge: true });
      
      return {
        success: true,
        personalizedQuestion,
        knowledgeGaps,
        message: 'Personalized question generated and added to your question bank'
      };
    } else {
      throw new Error('Failed to generate personalized question');
    }
    
  } catch (error: any) {
    console.error('Error triggering adaptive generation:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Function to get personalized questions for inclusion in next quiz
export const getPersonalizedQuestions = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { limit = 2 } = data || {};
    
    const db = admin.firestore();
    const userId = context?.auth?.uid;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    // Get user's personal questions
    const personalBankRef = db.collection('userPersonalQuestions').doc(userId);
    const personalBankDoc = await personalBankRef.get();
    
    if (!personalBankDoc.exists) {
      return {
        success: true,
        questions: [],
        count: 0
      };
    }
    
    const personalBank = personalBankDoc.data();
    if (!personalBank) {
      return {
        success: true,
        questions: [],
        count: 0
      };
    }
    
    const questions = personalBank.questions || [];
    
    // Return limited number of questions
    const limitedQuestions = questions.slice(0, limit);
    
    return {
      success: true,
      questions: limitedQuestions,
      count: limitedQuestions.length,
      totalAvailable: questions.length
    };
    
  } catch (error: any) {
    console.error('Error getting personal questions:', error);
    return {
      success: false,
      error: error.message
    };
  }
}); 