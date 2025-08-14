import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { URL } from 'url';

const db = admin.firestore();

// Gemini AI configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-pro'; // Using Gemini 2.5 Pro - Google's most intelligent AI model

// Load knowledge base for question generation
let draftingKnowledgeBase: Record<string, any> = {};
let draftingHighQualityEntries: Array<{ key: string; entity: any }> = [];

try {
  const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
  const kbData = fs.readFileSync(kbPath, 'utf8');
  draftingKnowledgeBase = JSON.parse(kbData);
  
  // Filter entities with completeness score > 65
  draftingHighQualityEntries = Object.entries(draftingKnowledgeBase)
    .filter(([key, entity]) => entity.completeness_score > 65)
    .map(([key, entity]) => ({ key, entity }));
    
  console.log(`Drafting agent loaded ${draftingHighQualityEntries.length} high-quality KB entries`);
} catch (error) {
  console.error('Failed to load KB for drafting agent:', error);
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
      temperature: 0.7, // Higher creativity for question generation
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

function findRelevantKBEntries(topicIds: string[], maxEntries: number = 5): Array<{ key: string; entity: any }> {
  const relevantEntries: Array<{ key: string; entity: any; score: number }> = [];
  
  for (const { key, entity } of draftingHighQualityEntries) {
    let relevanceScore = 0;
    
    // Direct name matching
    for (const topicId of topicIds) {
      const normalizedTopic = topicId.toLowerCase().replace(/[_.-]/g, ' ');
      const normalizedKey = key.toLowerCase().replace(/[_.-]/g, ' ');
      
      if (normalizedKey.includes(normalizedTopic) || normalizedTopic.includes(normalizedKey)) {
        relevanceScore += 10;
      }
    }
    
    // Content matching in description/symptoms
    const searchText = (entity.description + ' ' + entity.symptoms + ' ' + entity.treatment).toLowerCase();
    for (const topicId of topicIds) {
      const normalizedTopic = topicId.toLowerCase().replace(/[_.-]/g, ' ');
      if (searchText.includes(normalizedTopic)) {
        relevanceScore += 3;
      }
    }
    
    // Boost for higher completeness scores
    relevanceScore += entity.completeness_score / 10;
    
    if (relevanceScore > 0) {
      relevantEntries.push({ key, entity, score: relevanceScore });
    }
  }
  
  // Sort by relevance score and return top entries
  relevantEntries.sort((a, b) => b.score - a.score);
  
  // If no specific matches, return random high-quality entries
  if (relevantEntries.length === 0) {
    const randomEntries = draftingHighQualityEntries
      .sort(() => 0.5 - Math.random())
      .slice(0, maxEntries);
    return randomEntries;
  }

  return relevantEntries.slice(0, maxEntries);
}

function generateEnhancedMCQPrompt(entity: any, entityName: string, difficultyTarget?: number): string {
  const targetDifficulty = difficultyTarget || 0.3; // Default moderate difficulty
  
  return `You are Dr. Lisa Thompson, MD, a board-certified dermatologist and expert medical question writer with 12 years of experience creating high-quality board examination questions for the American Board of Dermatology (ABD).

Your task is to create a premium-quality Type A (One-Best-Answer) multiple-choice question about "${entityName}" for dermatology board preparation that meets ABD standards.

KNOWLEDGE BASE ENTITY DATA:
\`\`\`json
${JSON.stringify(entity, null, 2)}
\`\`\`

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
  },
  "quality_validation": {
    "covers_options_test": "Question can be answered without seeing options: [YES/NO]",
    "cognitive_level": "Application of knowledge: [YES/NO]",
    "clinical_realism": "Reflects real clinical scenario: [YES/NO]",
    "homogeneous_options": "All options are same category: [YES/NO]",
    "difficulty_appropriate": "Targets 70-80% success rate: [YES/NO]"
  }
}

IMPORTANT: Ensure your question follows ALL ABD guidelines above. The question must be answerable without options, test application of knowledge, use bottom-up clinical reasoning, and maintain the highest standards of medical education quality.`;
}

async function generateEnhancedMCQ(entity: any, entityName: string, difficultyTarget?: number): Promise<any> {
  try {
    const prompt = generateEnhancedMCQPrompt(entity, entityName, difficultyTarget);
    const geminiResponse = await callGeminiAPI(prompt);
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

    // Extract quality validation data if available
    const qualityValidation = mcqData.quality_validation || {};
    
    // Calculate enhanced quality score based on validation
    let enhancedQualityScore = Math.min(95, 75 + (entity.completeness_score - 65) * 0.5);
    if (qualityValidation.covers_options_test === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.cognitive_level === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.clinical_realism === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.homogeneous_options === 'YES') enhancedQualityScore += 5;
    if (qualityValidation.difficulty_appropriate === 'YES') enhancedQualityScore += 5;
    
    return {
      type: 'A',
      topicIds: [entityName.toLowerCase().replace(/\s+/g, '.')],
      stem: mcqData.clinical_vignette,
      leadIn: mcqData.lead_in,
      options,
      keyIndex: correctIndex,
      explanation,
      citations: [{ source: `KB:${entityName.toLowerCase().replace(/\s+/g, '_')}` }],
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
    // Fallback to KB-only generation if AI fails
    return generateFallbackMCQ(entity, entityName, difficultyTarget);
  }
}

function generateFallbackMCQ(entity: any, entityName: string, difficultyTarget?: number): any {
  // Enhanced fallback generation logic
  const demographics = [
    'A 28-year-old woman',
    'A 45-year-old man', 
    'A 35-year-old patient',
    'A 32-year-old female',
    'A 52-year-old male'
  ];
  
  const demographic = demographics[Math.floor(Math.random() * demographics.length)];
  
  // More sophisticated stem generation
  let symptoms = entity.symptoms || entity.description || '';
  if (symptoms.length > 200) {
    symptoms = symptoms.split(';')[0] || symptoms.substring(0, 200);
  }
  
  const stem = `${demographic} presents to the dermatology clinic with ${symptoms.toLowerCase().trim()}. Physical examination reveals findings consistent with this condition.`;
  
  // Generate contextual lead-in
  let leadIn = 'What is the most likely diagnosis?';
  if (entity.treatment && entity.treatment.trim()) {
    const treatments = entity.treatment.split(',').map((t: string) => t.trim());
    if (treatments.length > 1) {
      leadIn = 'What is the most appropriate initial treatment?';
    }
  }
  
  // Enhanced distractor generation
  const distractors = Object.keys(draftingKnowledgeBase)
    .filter(name => 
      name !== entityName && 
      draftingKnowledgeBase[name].completeness_score > 65 &&
      // Try to find related conditions
      (draftingKnowledgeBase[name].description?.toLowerCase().includes(entity.description?.split(' ')[0]?.toLowerCase()) ||
       Math.random() < 0.3) // Some random distractors
    )
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);
  
  const options = [
    { text: entityName },
    ...distractors.map(name => ({ text: name }))
  ].sort(() => 0.5 - Math.random());
  
  const keyIndex = options.findIndex(opt => opt.text === entityName);
  
  // Enhanced explanation in plain text format
  let explanation = `${entityName}

Correct Answer: ${entityName}

`;
  if (entity.description) {
    explanation += `${entity.description.trim()}

`;
  }
  if (entity.symptoms) {
    explanation += `Clinical Features: ${entity.symptoms}

`;
  }
  if (entity.treatment) {
    explanation += `Treatment: ${entity.treatment.substring(0, 400)}${entity.treatment.length > 400 ? '...' : ''}

`;
  }
  if (entity.diagnosis) {
    explanation += `Diagnosis: ${entity.diagnosis}

`;
  }
  explanation += `This explanation is based on current dermatological knowledge for educational purposes.`;
  
  return {
    type: 'A',
    topicIds: [entityName.toLowerCase().replace(/\s+/g, '.')],
    stem,
    leadIn,
    options,
    keyIndex,
    explanation,
    citations: [{ source: `KB:${entityName.toLowerCase().replace(/\s+/g, '_')}` }],
    difficulty: difficultyTarget || 0.3,
    qualityScore: Math.min(85, 65 + (entity.completeness_score - 65) * 0.3),
    status: 'draft',
    aiGenerated: false,
    createdBy: { type: 'agent', model: 'kb-fallback-generator', at: admin.firestore.FieldValue.serverTimestamp() },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

export { generateEnhancedMCQ, generateFallbackMCQ };

export const generateMcq = functions.https.onCall(async (data: any, context) => {
  try {
    const { topicIds, itemType, difficultyTarget, constraints, useAI = true } = data || {};
    
    if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
      throw new Error('topicIds array is required');
    }
    
    // Load knowledge base if not already loaded
    if (!draftingKnowledgeBase || Object.keys(draftingKnowledgeBase).length === 0) {
      try {
        const kbPath = path.join(__dirname, '..', 'kb', 'knowledgeBase.json');
        const kbContent = fs.readFileSync(kbPath, 'utf8');
        draftingKnowledgeBase = JSON.parse(kbContent);
        console.log(`Loaded ${Object.keys(draftingKnowledgeBase).length} entities for drafting`);
      } catch (error) {
        console.error('Failed to load knowledge base:', error);
        throw new Error('Knowledge base not available');
      }
    }
    
    // Find relevant entities based on topic IDs
    const relevantEntities = Object.entries(draftingKnowledgeBase)
      .filter(([name, entity]: [string, any]) => {
        // Check if entity matches any of the requested topic IDs
        return topicIds.some(topicId => {
          const topicLower = topicId.toLowerCase();
          const entityNameLower = name.toLowerCase();
          const entityDescLower = (entity.description || '').toLowerCase();
          const entityTopicLower = (entity.topic || '').toLowerCase();
          
          return entityNameLower.includes(topicLower) ||
                 entityDescLower.includes(topicLower) ||
                 entityTopicLower.includes(topicLower);
        });
      })
      .filter(([_, entity]: [string, any]) => entity.completeness_score > 65)
      .sort(([_, a]: [string, any], [__, b]: [string, any]) => b.completeness_score - a.completeness_score);
    
    if (relevantEntities.length === 0) {
      throw new Error(`No relevant entities found for topics: ${topicIds.join(', ')}`);
    }
    
    // Select entity based on constraints and difficulty
    let selectedEntity: [string, any] | null = null;
    
    if (constraints && constraints.length > 0) {
      // Apply constraints if specified
      const constrainedEntities = relevantEntities.filter(([name, entity]: [string, any]) => {
        return constraints.every((constraint: any) => {
          if (constraint.type === 'difficulty_range') {
            const entityDifficulty = entity.difficulty || 0.5;
            return entityDifficulty >= constraint.min && entityDifficulty <= constraint.max;
          }
          if (constraint.type === 'completeness_min') {
            return entity.completeness_score >= constraint.value;
          }
          return true;
        });
      });
      
      if (constrainedEntities.length > 0) {
        selectedEntity = constrainedEntities[0];
      }
    }
    
    if (!selectedEntity) {
      // Default selection: highest completeness score
      selectedEntity = relevantEntities[0];
    }
    
    const [entityName, entity] = selectedEntity;
    
    // Generate question using AI or fallback
    let question;
    if (useAI && process.env.GEMINI_API_KEY) {
      try {
        question = await generateEnhancedMCQ(entity, entityName, difficultyTarget);
      } catch (aiError) {
        console.log(`AI generation failed for ${entityName}, falling back to KB generation:`, aiError);
        question = generateFallbackMCQ(entity, entityName, difficultyTarget);
      }
    } else {
      question = generateFallbackMCQ(entity, entityName, difficultyTarget);
    }
    
    // Add metadata
    question.generatedForTopics = topicIds;
    question.generationMethod = useAI ? 'ai-enhanced' : 'kb-fallback';
    question.entitySource = entityName;
    question.entityCompletenessScore = entity.completeness_score;
    
    return {
      success: true,
      question,
      metadata: {
        entityName,
        entityCompletenessScore: entity.completeness_score,
        topicsMatched: topicIds,
        generationMethod: question.generationMethod
      }
    };
    
  } catch (error: any) {
    console.error('Error generating MCQ:', error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
});

