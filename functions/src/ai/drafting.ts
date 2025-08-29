import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { getRobustGeminiClient } from '../util/robustGeminiClient';
import { validateInput, GenerateMCQSchema } from '../util/validation';
import { getGeminiApiKey, GEMINI_API_KEY } from '../util/config';
// KB imports removed - no longer using knowledge base

const db = admin.firestore();

// Using centralized robust Gemini client for consistency

// KB loading removed - using web search context instead

/**
 * Use robust Gemini client with consistent safety settings and retry logic
 * Note: Uses structured text format instead of JSON to prevent truncation
 */
async function callGeminiAPI(prompt: string): Promise<string> {
  const client = getRobustGeminiClient({
    maxRetries: 3,
    fallbackToFlash: true,
    timeout: 120000 // 2 minutes for drafting operations
  });

  const result = await client.generateText({
    prompt,
    operation: 'draft_mcq_structured', // Uses structured text, not JSON
    preferredModel: 'gemini-2.5-pro',
    temperature: 0.7 // Higher creativity for question generation
  });

  if (result.success && result.text) {
    return result.text;
  }

  throw new Error(result.error || 'Drafting API call failed');
}

// KB search removed - using web search context instead

function generateEnhancedMCQPrompt(topic: string, context: string, difficultyTarget?: number): string {
  const targetDifficulty = difficultyTarget || 0.3; // Default moderate difficulty
  
  return `You are Dr. Lisa Thompson, MD, a board-certified dermatologist and expert medical question writer with 12 years of experience creating high-quality board examination questions for the American Board of Dermatology (ABD).

Your task is to create a premium-quality Type A (One-Best-Answer) multiple-choice question about "${topic}" for dermatology board preparation that meets ABD standards.

CURRENT MEDICAL LITERATURE CONTEXT (from PubMed and Academic Sources):
${context}

CRITICAL REQUIREMENTS (ABD Guidelines):

1. **QUESTION TYPE**: Create a Type A (One-Best-Answer) item with a clinical vignette stem, clear lead-in question, and 5 homogeneous options.

2. **COGNITIVE LEVEL**: Focus on APPLICATION OF KNOWLEDGE, not mere recall of isolated facts. The question should require examinees to interpret, analyze, and apply information in a clinical context.

3. **STRUCTURE**: Use BOTTOM-UP approach - present clinical findings and ask examinee to deduce the underlying condition or appropriate management. This reflects real clinical scenarios where patients present with symptoms, not diagnoses.

4. **DIFFICULTY TARGET**: Aim for 70-80% of examinees to answer correctly (difficulty level: ${targetDifficulty}). This effectively differentiates between those who have mastered the material and those who have not.

5. **CLINICAL VIGNETTE REQUIREMENTS**:
   - Patient demographics (age, gender)
   - Presenting symptoms and duration
   - Physical examination findings
   - Relevant laboratory or diagnostic test results (if applicable)
   - Pertinent medical history (if relevant)
   - ALL necessary information must be in the stem so examinee can answer without seeing options

6. **STEM CONSTRUCTION**:
   - Self-contained: Provide all necessary information within the stem
   - End with a direct, specific question
   - Use phrases like "most likely," "best initial," or "most appropriate" to clarify one option is superior
   - Avoid negative phrasing (no "except" or "not")
   - Keep language precise and avoid undefined abbreviations

7. **LEAD-IN QUESTION**:
   - Must be clear and specific
   - Should test application of knowledge, not just recall
   - Examples: "What is the most likely diagnosis?" "What is the best next step?" "Which of the following is most appropriate?"

8. **ANSWER OPTIONS (5 total)**:
   - One clearly correct answer (the key)
   - Four plausible distractors that are factually incorrect or less appropriate
   - All options must be HOMOGENEOUS (same category, e.g., all diagnoses or all treatments)
   - Options should be grammatically consistent and similar in length
   - Avoid technical flaws: no grammatical cues, word repeats, or length differences that hint at the answer

9. **COVER-THE-OPTIONS RULE**: An informed examinee should be able to answer the question correctly without seeing the options.

10. **EXPLANATION REQUIREMENTS**:
    - Comprehensive rationale for the correct answer
    - Specific explanations for why each distractor is incorrect
    - Educational pearls that reinforce key learning points
    - Use PLAIN TEXT format (no markdown, headers, or formatting)

11. **QUALITY STANDARDS**:
    - Focus on clinically significant concepts commonly encountered in practice
    - Avoid obscure or trivial content
    - Ensure face validity (reflects real-life clinical problem-solving)
    - Eliminate any cues or patterns that could hint at the correct answer

PROVIDE YOUR RESPONSE IN THIS EXACT STRUCTURED FORMAT:

CLINICAL_VIGNETTE:
A [AGE]-year-old [GENDER] presents to the dermatology clinic with [DURATION] history of [SYMPTOMS]. Physical examination reveals [FINDINGS]. [ADDITIONAL RELEVANT INFORMATION]. [RELEVANT HISTORY IF APPLICABLE].

LEAD_IN:
What is the most likely diagnosis?

OPTION_A:
[CORRECT ANSWER - specific diagnosis/treatment]

OPTION_B:
[PLAUSIBLE DISTRACTOR 1 - same category]

OPTION_C:
[PLAUSIBLE DISTRACTOR 2 - same category]

OPTION_D:
[PLAUSIBLE DISTRACTOR 3 - same category]

OPTION_E:
[PLAUSIBLE DISTRACTOR 4 - same category]

CORRECT_ANSWER:
A

CORRECT_ANSWER_RATIONALE:
Detailed explanation of why this is the correct answer, citing specific elements from the clinical vignette and explaining the underlying pathophysiology or clinical reasoning.

DISTRACTOR_1_EXPLANATION:
Specific explanation of why option B is incorrect, including what clinical features would be expected if this were the correct diagnosis.

DISTRACTOR_2_EXPLANATION:
Specific explanation of why option C is incorrect, including what clinical features would be expected if this were the correct diagnosis.

DISTRACTOR_3_EXPLANATION:
Specific explanation of why option D is incorrect, including what clinical features would be expected if this were the correct diagnosis.

DISTRACTOR_4_EXPLANATION:
Specific explanation of why option E is incorrect, including what clinical features would be expected if this were the correct diagnosis.

EDUCATIONAL_PEARLS:
1. Key learning point: [Specific clinical pearl or diagnostic tip]
2. Key learning point: [Differential diagnosis consideration]
3. Key learning point: [Management principle or clinical decision-making insight]

QUALITY_VALIDATION:
- Covers options test: [YES/NO]
- Cognitive level: [YES/NO]
- Clinical realism: [YES/NO]
- Homogeneous options: [YES/NO]
- Difficulty appropriate: [YES/NO]

IMPORTANT: Ensure your question follows ALL ABD guidelines above. The question must be answerable without options, test application of knowledge, use bottom-up clinical reasoning, and maintain the highest standards of medical education quality.`;
}

// Helper function to parse structured text response
function parseStructuredMCQResponse(text: string): any {
  try {
    const cleanedText = text.trim();
    
    // Extract sections using regex patterns
    const extractSection = (sectionName: string, nextSection?: string): string => {
      const pattern = nextSection 
        ? new RegExp(`${sectionName}:\s*([\s\S]*?)(?=\n\s*${nextSection}:|$)`, 'i')
        : new RegExp(`${sectionName}:\s*([\s\S]*?)$`, 'i');
      const match = cleanedText.match(pattern);
      return match ? match[1].trim() : '';
    };
    
    // Extract all sections
    const clinicalVignette = extractSection('CLINICAL_VIGNETTE', 'LEAD_IN');
    const leadIn = extractSection('LEAD_IN', 'OPTION_A');
    
    // Extract options
    const optionA = extractSection('OPTION_A', 'OPTION_B');
    const optionB = extractSection('OPTION_B', 'OPTION_C');
    const optionC = extractSection('OPTION_C', 'OPTION_D');
    const optionD = extractSection('OPTION_D', 'OPTION_E');
    const optionE = extractSection('OPTION_E', 'CORRECT_ANSWER');
    
    // Extract correct answer letter
    const correctAnswerMatch = cleanedText.match(/CORRECT_ANSWER:\s*([A-E])/i);
    const correctAnswer = correctAnswerMatch ? correctAnswerMatch[1].toUpperCase() : 'A';
    
    // Extract explanations
    const correctRationale = extractSection('CORRECT_ANSWER_RATIONALE', 'DISTRACTOR_1_EXPLANATION');
    const distractor1Exp = extractSection('DISTRACTOR_1_EXPLANATION', 'DISTRACTOR_2_EXPLANATION');
    const distractor2Exp = extractSection('DISTRACTOR_2_EXPLANATION', 'DISTRACTOR_3_EXPLANATION');
    const distractor3Exp = extractSection('DISTRACTOR_3_EXPLANATION', 'DISTRACTOR_4_EXPLANATION');
    const distractor4Exp = extractSection('DISTRACTOR_4_EXPLANATION', 'EDUCATIONAL_PEARLS');
    
    // Extract educational pearls
    const pearlsSection = extractSection('EDUCATIONAL_PEARLS', 'QUALITY_VALIDATION');
    const pearls = pearlsSection.split('\n').filter(line => line.trim()).map(line => 
      line.replace(/^\d+\.\s*/, '').replace(/^Key learning point:\s*/i, '')
    );
    
    // Extract quality validation
    const validationSection = extractSection('QUALITY_VALIDATION');
    const validationLines = validationSection.split('\n').filter(line => line.trim());
    const qualityValidation: any = {};
    
    validationLines.forEach(line => {
      if (line.includes('Covers options test:')) {
        qualityValidation.covers_options_test = line.includes('YES') ? 'YES' : 'NO';
      } else if (line.includes('Cognitive level:')) {
        qualityValidation.cognitive_level = line.includes('YES') ? 'YES' : 'NO';
      } else if (line.includes('Clinical realism:')) {
        qualityValidation.clinical_realism = line.includes('YES') ? 'YES' : 'NO';
      } else if (line.includes('Homogeneous options:')) {
        qualityValidation.homogeneous_options = line.includes('YES') ? 'YES' : 'NO';
      } else if (line.includes('Difficulty appropriate:')) {
        qualityValidation.difficulty_appropriate = line.includes('YES') ? 'YES' : 'NO';
      }
    });
    
    // Map correct answer letter to index
    const correctIndex = correctAnswer.charCodeAt(0) - 'A'.charCodeAt(0);
    
    // Build the structured data object
    return {
      clinical_vignette: clinicalVignette,
      lead_in: leadIn,
      answer_options: [
        { text: optionA, is_correct: correctAnswer === 'A' },
        { text: optionB, is_correct: correctAnswer === 'B' },
        { text: optionC, is_correct: correctAnswer === 'C' },
        { text: optionD, is_correct: correctAnswer === 'D' },
        { text: optionE, is_correct: correctAnswer === 'E' }
      ],
      comprehensive_explanation: {
        correct_answer_rationale: correctRationale,
        distractor_explanations: {
          distractor_1: distractor1Exp,
          distractor_2: distractor2Exp,
          distractor_3: distractor3Exp,
          distractor_4: distractor4Exp
        },
        educational_pearls: pearls
      },
      quality_validation: qualityValidation
    };
    
  } catch (error) {
    // CRITICAL: Log raw text input for debugging parsing failures
    logError('structured_mcq_parsing_failed', {
      error: error instanceof Error ? error.message : String(error),
      rawTextInput: text.substring(0, 1000), // Log first 1000 chars to avoid log size issues
      textLength: text.length,
      timestamp: new Date().toISOString()
    });
    console.error('Failed to parse structured MCQ response:', error);
    throw new Error(`Structured text parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function generateEnhancedMCQ(topic: string, context: string, difficultyTarget?: number): Promise<any> {
  try {
    const prompt = generateEnhancedMCQPrompt(topic, context, difficultyTarget);
    const geminiResponse = await callGeminiAPI(prompt);
    
    // Parse the structured text response instead of JSON
    const mcqData = parseStructuredMCQResponse(geminiResponse);
    
    // CRITICAL: Post-parsing content validation - ensure semantic content exists
    if (!mcqData.clinical_vignette || mcqData.answer_options.length === 0 || !mcqData.comprehensive_explanation?.correct_answer_rationale) {
      logError('ai_generation_semantically_empty', { 
        topic, 
        mcqData,
        hasVignette: !!mcqData.clinical_vignette,
        hasOptions: mcqData.answer_options.length > 0,
        hasRationale: !!mcqData.comprehensive_explanation?.correct_answer_rationale,
        timestamp: new Date().toISOString()
      });
      throw new Error('AI generation produced an empty or incomplete question structure after parsing.');
    }
    
    // Extract correct answer index
    const correctIndex = mcqData.answer_options.findIndex((opt: any) => opt.is_correct);
    
    // Format options for consistency
    const options = mcqData.answer_options.map((opt: any) => ({ text: opt.text }));
    
    // Combine explanations into a comprehensive explanation in PLAIN TEXT format
    const explanation = `${topic}

Correct Answer: ${mcqData.answer_options[correctIndex].text}

${mcqData.comprehensive_explanation.correct_answer_rationale}

Why other options are incorrect:

${Object.entries(mcqData.comprehensive_explanation.distractor_explanations || {}).map(([key, explanation]) => 
  `${mcqData.answer_options.find((opt: any) => opt.text.toLowerCase().includes(key.replace('_', ' ')))?.text || key}: ${explanation}`
).join('\n\n')}

Educational Pearls:
${(mcqData.comprehensive_explanation.educational_pearls || []).map((pearl: string) => `${pearl}`).join('\n')}

This explanation is based on current dermatological knowledge and evidence-based practice.`;

    // Extract quality validation data if available
    const qualityValidation = mcqData.quality_validation || {};
    
    // Calculate enhanced quality score based on validation (start from base 75 without KB)
    let enhancedQualityScore = 75;
    if (qualityValidation.covers_options_test === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.cognitive_level === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.clinical_realism === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.homogeneous_options === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.difficulty_appropriate === 'YES') enhancedQualityScore += 5;
    
    return {
      type: 'A',
      topicIds: [topic.toLowerCase().replace(/\s+/g, '.')],
      stem: mcqData.clinical_vignette,
      leadIn: mcqData.lead_in,
      options,
      keyIndex: correctIndex,
      explanation,
      citations: [{ source: `Research:${topic.toLowerCase().replace(/\s+/g, '_')}` }],
      difficulty: mcqData.estimated_difficulty || difficultyTarget || 0.3,
      qualityScore: Math.min(95, enhancedQualityScore),
      status: 'draft',
      aiGenerated: true,
      learningObjectives: mcqData.learning_objectives || [],
      boardRelevance: mcqData.board_relevance || 'Standard',
      qualityValidation: qualityValidation,
      abdCompliance: {
        coversOptionsTest: qualityValidation.covers_options_test === 'YES',
        cognitiveLevel: qualityValidation.cognitive_level === 'YES',
        clinicalRealism: qualityValidation.clinical_realism === 'YES',
        homogeneousOptions: qualityValidation.homogeneous_options === 'YES',
        difficultyAppropriate: qualityValidation.difficulty_appropriate === 'YES'
      },
      createdBy: { type: 'agent', model: 'ai-enhanced-drafting-abd', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
  } catch (error: any) {
    // No fallback - throw error to properly fail the operation
    logError('ai_generation_failed', { error: error instanceof Error ? error.message : String(error), topic });
    throw new Error(`AI generation failed for ${topic}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Export the simplified MCQ generation function
export { generateEnhancedMCQ };

// Export for internal use by other modules
export async function generateMCQInternal(topic: string, context: string, difficulty?: number): Promise<any> {
  return generateEnhancedMCQ(topic, context, difficulty);
}

export const generateMcq = functions
  .runWith({
    timeoutSeconds: 300, // 5 minutes for question drafting
    memory: '1GB',
    secrets: [GEMINI_API_KEY]
  })
  .https.onCall(async (data: any, callContext) => {
  try {
    requireAuth(callContext);
    // Validate input
    const validatedData = validateInput(GenerateMCQSchema, data);
    const { topicIds, difficulty: difficultyTarget = 0.3, useAI = true } = validatedData;
    
    if (!topicIds || topicIds.length === 0) {
      throw new Error('topicIds array is required');
    }
    
    // Use the first topic as the main topic
    const mainTopic = topicIds[0];
    
    // Generate context for the question
    const context = `Generate a dermatology board exam question about ${mainTopic}. Use your medical knowledge to create clinically accurate, educational questions that test understanding of diagnosis, treatment, and pathophysiology.`;
    
    // Generate question using AI
    let question;
    if (useAI && getGeminiApiKey()) {
      question = await generateEnhancedMCQ(mainTopic, context, difficultyTarget);
    } else {
      throw new Error('AI generation is required but API key is not available.');
    }
    
    // Add metadata
    question.generatedForTopics = topicIds;
    question.generationMethod = 'ai-enhanced';
    question.topicSource = mainTopic;
    
    return {
      success: true,
      question,
      metadata: {
        topic: mainTopic,
        topicsMatched: topicIds,
        generationMethod: question.generationMethod
      }
    };
    
  } catch (error: any) {
    console.error('Error generating MCQ:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error.stack
    };
  }
});

