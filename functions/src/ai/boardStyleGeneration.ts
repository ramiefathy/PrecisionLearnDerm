/**
 * Board-Style Question Generation Module
 * Uses knowledge base as context, not as direct content
 * Follows ABD guidelines for high-quality MCQ creation
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { getRobustGeminiClient } from '../util/robustGeminiClient';
import * as fs from 'fs';
import * as path from 'path';
import { getSharedKB } from '../util/sharedCache';
import { config } from '../util/config';

const GEMINI_MODEL = config.gemini.model;

// Knowledge base loaded via shared cache for contextual information
let knowledgeBase: Record<string, any> = {};

// Initialize knowledge base asynchronously
async function initializeKB() {
  try {
    knowledgeBase = await getSharedKB();
    console.log(`Loaded ${Object.keys(knowledgeBase).length} KB entries for context`);
  } catch (error) {
    console.error('Failed to load knowledge base via shared cache:', error);
  }
}

// Lazy initialization - will be called on first use
let initialized = false;

// High-quality example questions from manual evaluation
const EXAMPLE_QUESTIONS = [
  {
    stem: "A 25-year-old African American man presents to the dermatology clinic with a 2-year history of progressively enlarging, firm, flesh-colored papules on the posterior neck and occipital scalp. He reports that the lesions started as small, inflamed bumps after close haircuts and have gradually become larger and firmer. Physical examination reveals multiple 2-4 mm firm, smooth papules and several larger confluent plaques up to 2 cm in diameter on the occipital scalp and posterior neck. Some lesions appear to have hair follicles at their center. The patient denies systemic symptoms.",
    leadIn: "What is the most likely diagnosis?",
    options: [
      "Folliculitis decalvans",
      "Dissecting cellulitis of the scalp",
      "Seborrheic dermatitis",
      "Acne keloidalis nuchae",
      "Keloid formation"
    ],
    correctAnswer: 3,
    explanation: "Acne keloidalis nuchae is a chronic inflammatory condition affecting the posterior neck and occipital scalp, most commonly in African American men. The characteristic presentation includes firm papules and plaques that develop after trauma from haircuts. Folliculitis decalvans typically presents with scarring alopecia and pustules. Dissecting cellulitis shows fluctuant nodules with sinus tracts. Seborrheic dermatitis presents with greasy scales. Keloid formation would not show follicular involvement."
  },
  {
    stem: "A 45-year-old woman presents with a 1-year history of persistent facial erythema, particularly affecting her cheeks, nose, and chin. She reports that the redness worsens with sun exposure, spicy foods, and alcohol consumption. Physical examination reveals persistent erythema, papules, and pustules on the central face, with prominent telangiectasias. The periorbital area is spared.",
    leadIn: "What is the most likely diagnosis?",
    options: [
      "Rosacea",
      "Seborrheic dermatitis",
      "Systemic lupus erythematosus",
      "Acne vulgaris",
      "Contact dermatitis"
    ],
    correctAnswer: 0,
    explanation: "Rosacea is characterized by central facial erythema, papulopustular lesions, and telangiectasias with characteristic sparing of the periorbital area. Common triggers include sun, spicy foods, and alcohol. Seborrheic dermatitis shows greasy scales. SLE would show malar rash sparing nasolabial folds. Acne vulgaris has comedones. Contact dermatitis would have clear exposure history."
  },
  {
    stem: "A 30-year-old woman presents to the emergency department with a 2-day history of fever, malaise, and a painful rash that started on her face and trunk and is now spreading. She recently started taking allopurinol for gout 10 days ago. Physical examination reveals target-like lesions with central necrosis affecting <10% of her body surface area, along with painful erosions in her mouth and conjunctivae.",
    leadIn: "What is the most likely diagnosis?",
    options: [
      "Toxic epidermal necrolysis",
      "Stevens-Johnson syndrome",
      "Erythema multiforme",
      "Drug-induced hypersensitivity syndrome",
      "Staphylococcal scalded skin syndrome"
    ],
    correctAnswer: 1,
    explanation: "Stevens-Johnson syndrome presents with <10% BSA involvement, target lesions with central necrosis, and mucosal involvement, typically triggered by medications like allopurinol. TEN involves >30% BSA. Erythema multiforme has typical target lesions without necrosis. DIHS has different timing and systemic features. SSSS occurs in children with different morphology."
  }
];

// ABD Guidelines for board-style questions
const ABD_GUIDELINES = `
ABD BOARD EXAM QUESTION WRITING STANDARDS:

1. QUESTION PURPOSE & COGNITIVE LEVEL
   - Test clinical reasoning and application, NOT simple recall
   - Require synthesis of information and clinical decision-making
   - Focus on common conditions and important clinical scenarios

2. QUESTION STRUCTURE (Type A Format)
   - Clinical vignette stem with complete patient scenario
   - Clear, direct lead-in question
   - 5 homogeneous options (1 correct + 4 plausible distractors)

3. CLINICAL VIGNETTE REQUIREMENTS
   - Patient demographics (age, gender, race when relevant)
   - Chief complaint with duration
   - Relevant history (medical, family, social, medications)
   - Complete physical examination findings
   - Laboratory/diagnostic results when appropriate
   - Pertinent negatives to rule out differentials

4. BOTTOM-UP APPROACH
   - Present clinical findings first
   - Require deduction of diagnosis or management
   - Mirror real clinical encounters

5. COVER-THE-OPTIONS RULE
   - Question must be answerable without seeing options
   - Stem contains all necessary information

6. OPTION QUALITY STANDARDS
   - All options from same category (all diagnoses or all treatments)
   - Similar length and grammatical structure
   - No absolute terms (always, never, all, none)
   - Plausible distractors that could be considered
   - No grammatical or length cues

7. DIFFICULTY TARGETING
   - Aim for 70-80% correct response rate
   - Not too easy (>90%) or too hard (<60%)

8. MEDICAL ACCURACY
   - Evidence-based, current medical knowledge
   - Clinically relevant and important

9. EDUCATIONAL VALUE
   - Each question teaches a concept or pattern
   - Explanation reinforces learning points
`;

/**
 * Call Gemini API with robust error handling and JSON mode
 */
async function callGeminiAPI(prompt: string): Promise<string> {
  const client = getRobustGeminiClient({
    maxRetries: 3,
    fallbackToFlash: true, // Fallback to Flash model if Pro fails
    timeout: 120000 // 2 minutes
  });

  const result = await client.generateText({
    prompt,
    operation: 'board_style_generation_json', // Includes 'json' to enable JSON mode
    preferredModel: 'gemini-2.5-pro' // Use 2.5 pro as requested
  });

  if (result.success && result.text) {
    return result.text;
  }

  throw new Error(result.error || 'Failed to generate question');
}

function getKnowledgeContext(topic: string): string {
  // Normalize topic for lookup
  const normalizedTopic = topic.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  // Try exact match
  let kbEntry = knowledgeBase[normalizedTopic];
  
  // Try partial matches if no exact match
  if (!kbEntry) {
    const possibleKeys = Object.keys(knowledgeBase).filter(key => 
      key.includes(normalizedTopic) || normalizedTopic.includes(key) ||
      key.split('_').some(part => normalizedTopic.includes(part))
    );
    
    if (possibleKeys.length > 0) {
      // Sort by completeness score and take best match
      possibleKeys.sort((a, b) => 
        (knowledgeBase[b].completeness_score || 0) - (knowledgeBase[a].completeness_score || 0)
      );
      kbEntry = knowledgeBase[possibleKeys[0]];
    }
  }
  
  // Build context from KB entry if available and high quality
  if (kbEntry && kbEntry.completeness_score > 65) {
    const contextParts = [];
    
    if (kbEntry.description) {
      contextParts.push(`Clinical Overview: ${kbEntry.description}`);
    }
    
    if (kbEntry.epidemiology) {
      contextParts.push(`Epidemiology: ${kbEntry.epidemiology}`);
    }
    
    if (kbEntry.symptoms || kbEntry.clinical_presentation) {
      contextParts.push(`Clinical Features: ${kbEntry.symptoms || kbEntry.clinical_presentation}`);
    }
    
    if (kbEntry.diagnosis) {
      contextParts.push(`Diagnostic Approach: ${kbEntry.diagnosis}`);
    }
    
    if (kbEntry.treatment) {
      contextParts.push(`Management: ${kbEntry.treatment}`);
    }
    
    if (kbEntry.differential_diagnosis) {
      contextParts.push(`Differential Diagnosis: ${kbEntry.differential_diagnosis}`);
    }
    
    if (contextParts.length > 0) {
      return `
KNOWLEDGE BASE CONTEXT for ${topic}:
${contextParts.join('\n')}

Use this information as background context to create a clinically accurate question, but DO NOT copy directly from it. Create original clinical scenarios.`;
    }
  }
  
  // If no good KB entry, just provide the topic
  return `TOPIC: ${topic}

Create a board-style question about this dermatological condition. If you're familiar with this condition, use your medical knowledge to create an accurate clinical scenario.`;
}

export async function generateBoardStyleMCQ(
  topic: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  focusArea?: string
): Promise<any> {
  try {
    // Initialize knowledge base if not already done
    if (!initialized) {
      await initializeKB();
      initialized = true;
    }
    
    // Get knowledge base context
    const kbContext = getKnowledgeContext(topic);
    
    // Select examples based on difficulty
    const examples = difficulty === 'hard' ? 
      EXAMPLE_QUESTIONS : 
      EXAMPLE_QUESTIONS.slice(0, 2);
    
    // Build comprehensive prompt
    const prompt = `
# ROLE: Expert Dermatology Board Exam Question Writer

You are an experienced dermatologist and medical educator specializing in creating high-quality board examination questions that meet American Board of Dermatology (ABD) standards.

${ABD_GUIDELINES}

# HIGH-QUALITY EXAMPLE QUESTIONS:

${examples.map((ex, i) => `
EXAMPLE ${i + 1}:
Stem: ${ex.stem}
Lead-in: ${ex.leadIn}
Options:
A. ${ex.options[0]}
B. ${ex.options[1]}
C. ${ex.options[2]}
D. ${ex.options[3]}
E. ${ex.options[4]}
Correct Answer: ${String.fromCharCode(65 + ex.correctAnswer)}
Explanation: ${ex.explanation}
`).join('\n')}

# CONTEXT FOR YOUR QUESTION:

${kbContext}

${focusArea ? `Focus Area: ${focusArea} (e.g., diagnosis, treatment, pathophysiology)` : ''}

Difficulty Level: ${difficulty.toUpperCase()}
- EASY: Common conditions, typical presentations, straightforward management
- MEDIUM: Less common conditions or atypical presentations, requires clinical reasoning
- HARD: Rare conditions, subtle findings, complex decision-making, or complications

# YOUR TASK:

Create a NEW, ORIGINAL dermatology board-style multiple-choice question about "${topic}".

CRITICAL REQUIREMENTS:
1. Create a REALISTIC clinical vignette with ALL required elements
2. Use ORIGINAL patient scenarios - do NOT copy from examples or KB
3. Include specific, measurable findings (sizes, durations, locations)
4. Write a clear, direct lead-in question
5. Provide 5 homogeneous options (1 correct, 4 plausible distractors)
6. Ensure the question is answerable WITHOUT seeing options
7. Include comprehensive explanation for learning

Output your response in this EXACT JSON format:
{
  "stem": "Complete clinical vignette with all required elements",
  "leadIn": "Direct question (What is the most likely diagnosis?)",
  "options": [
    "Correct answer",
    "Plausible distractor 1",
    "Plausible distractor 2",
    "Plausible distractor 3",
    "Plausible distractor 4"
  ],
  "correctAnswer": 0,
  "explanation": "Comprehensive explanation including why correct answer is right and why each distractor is wrong",
  "keyConcept": "Main learning point from this question",
  "clinicalPearls": [
    "Important clinical pearl 1",
    "Important clinical pearl 2"
  ],
  "difficulty": "${difficulty}",
  "topic": "${topic}"
}

Remember: Create an ORIGINAL clinical scenario. Use the KB context for accuracy but do NOT copy from it directly.`;

    // Call Gemini API with error handling
    let response: string;
    try {
      response = await callGeminiAPI(prompt);
    } catch (apiError: any) {
      logError('board_style_api_call_failed', {
        topic,
        difficulty,
        error: apiError.message || String(apiError),
        timestamp: new Date().toISOString()
      });
      throw new Error(`Gemini API call failed: ${apiError.message || 'Unknown API error'}`);
    }
    
    // Parse JSON response with error handling
    let question: any;
    try {
      question = JSON.parse(response);
    } catch (parseError: any) {
      logError('board_style_json_parse_failed', {
        topic,
        difficulty,
        rawResponse: response.substring(0, 500), // Log first 500 chars
        parseError: parseError.message || String(parseError),
        timestamp: new Date().toISOString()
      });
      throw new Error(`Failed to parse JSON response: ${parseError.message || 'Invalid JSON'}`);
    }
    
    // Validate generated question structure
    if (!question.stem || !question.leadIn || !question.options || 
        question.options.length !== 5 || question.correctAnswer === undefined ||
        question.correctAnswer < 0 || question.correctAnswer > 4) {
      throw new Error('Generated question does not meet structural requirements');
    }
    
    // Ensure stem is substantial (at least 100 characters)
    if (question.stem.length < 100) {
      throw new Error('Clinical vignette is too brief');
    }
    
    // Ensure options are substantial (each at least 3 characters)
    if (question.options.some((opt: string) => opt.length < 3)) {
      throw new Error('Options are too brief');
    }
    
    return {
      ...question,
      generatedAt: new Date().toISOString(),
      generationMethod: 'board-style-context-based',
      kbContextUsed: !!knowledgeBase[topic.toLowerCase().replace(/[^a-z0-9]/g, '_')]
    };
    
  } catch (error) {
    console.error('Error generating board-style MCQ:', error);
    throw error;
  }
}

// Export as Firebase Cloud Function
export const generateBoardStyleMcq = functions
  .runWith({
    timeoutSeconds: 300, // 5 minutes for board-style generation
    memory: '1GB'
  })
  .https.onCall(async (data, context) => {
  try {
    // Require authentication
    requireAuth(context);
    
    // Validate input
    const { topic, difficulty = 'medium', focusArea } = data;
    
    if (!topic || typeof topic !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Topic is required and must be a string'
      );
    }
    
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Difficulty must be easy, medium, or hard'
      );
    }
    
    // Check API key
    if (!config.gemini.hasApiKey()) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Gemini API key not configured'
      );
    }
    
    // Generate the question
    const question = await generateBoardStyleMCQ(topic, difficulty, focusArea);
    
    // Log success
    await logInfo('Board-style MCQ generated successfully', {
      topic,
      difficulty,
      focusArea,
      userId: context.auth?.uid
    });
    
    return {
      success: true,
      question
    };
    
  } catch (error: any) {
    await logError('Failed to generate board-style MCQ', { error, data });
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Failed to generate question',
      error instanceof Error ? error.message : String(error)
    );
  }
});
