/**
 * Direct MCQ Generator - Single-Pass Architecture
 * Replaces multi-agent pipeline with single comprehensive API call
 * Targets: <8s response time, >95% success rate, 80% cost reduction
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { requireAuth } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { getGeminiApiKey } from '../util/config';
import { validateInput } from '../util/validation';
import * as z from 'zod';

const db = admin.firestore();

// Input validation schema
const DirectMCQSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters'),
  difficulty: z.number().min(0).max(1).default(0.3),
  useContext: z.boolean().default(true),
  skipCache: z.boolean().default(false)
});

// Response interfaces
interface ParsedMCQ {
  stem: string;
  leadIn: string;
  options: Array<{ text: string }>;
  correctIndex: number;
  explanation: string;
  pearls: string[];
  metrics: {
    medicalAccuracy: boolean;
    clinicalRealism: boolean;
    abdCompliance: boolean;
    homogeneousOptions: boolean;
    difficultyAppropriate: boolean;
  };
  citations: string[];
  qualityScore: number;
}

interface CachedMCQ extends ParsedMCQ {
  topic: string;
  expiry: number;
  created: number;
  cacheHit?: boolean;
}

interface GenerationResult {
  success: boolean;
  question?: ParsedMCQ;
  metadata: {
    generationTime: number;
    model: string;
    contextUsed: boolean;
    cacheHit?: boolean;
    fallbackUsed?: boolean;
    attempts?: number;
  };
  error?: string;
}

/**
 * Main Cloud Function - Direct MCQ Generation
 */
export const generateMCQDirect = functions
  .runWith({
    timeoutSeconds: 120,     // 2 minutes vs 9 minutes
    memory: '512MB',         // 512MB vs 2GB  
    maxInstances: 10,        // Prevent cold starts
    minInstances: 1          // Keep one warm
  })
  .https.onCall(async (data, context): Promise<GenerationResult> => {
    const startTime = Date.now();
    
    try {
      // Authentication
      requireAuth(context);
      
      // Input validation
      const validated = validateInput(DirectMCQSchema, data);
      const { topic, difficulty, useContext, skipCache } = validated;
      
      logInfo('direct_mcq_request', {
        topic,
        difficulty,
        useContext,
        userId: context.auth?.uid,
        timestamp: new Date().toISOString()
      });

      // Check cache first (unless skipped)
      if (!skipCache) {
        const cached = await checkCache(topic, difficulty);
        if (cached) {
          logInfo('cache_hit', {
            topic,
            cacheAge: Date.now() - cached.created,
            responseTime: Date.now() - startTime
          });
          
          return {
            success: true,
            question: cached,
            metadata: {
              generationTime: Date.now() - startTime,
              model: 'cached',
              contextUsed: false,
              cacheHit: true
            }
          };
        }
      }

      // Parallel operations: context search + template check
      const [contextResult, templateResult] = await Promise.allSettled([
        useContext ? getQuickContext(topic) : Promise.resolve(''),
        getTemplateQuestion(topic)
      ]);

      // Use template if context fails and template available
      if (contextResult.status === 'rejected' && 
          templateResult.status === 'fulfilled' && 
          templateResult.value) {
        logInfo('using_template_fallback', { topic, contextError: contextResult.reason });
        return formatTemplateResponse(templateResult.value, startTime);
      }

      // Generate with single API call
      const context_text = contextResult.status === 'fulfilled' ? contextResult.value : '';
      const mcq = await generateWithRetry(topic, difficulty, context_text);

      // Async cache update (don't block response)
      cacheQuestion(topic, difficulty, mcq).catch(err => 
        logError('cache_update_failed', { topic, error: err.message })
      );

      const responseTime = Date.now() - startTime;
      logInfo('question_generated_successfully', {
        topic,
        responseTime,
        hasContext: !!context_text,
        qualityScore: mcq.qualityScore
      });

      return {
        success: true,
        question: mcq,
        metadata: {
          generationTime: responseTime,
          model: 'gemini-2.5-pro',
          contextUsed: !!context_text,
          attempts: 1 // Will be updated in retry logic
        }
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      logError('direct_generation_failed', { 
        topic: data.topic, 
        error: error.message,
        responseTime,
        stack: error.stack
      });

      // Final fallback to generic template
      try {
        const fallback = await getGenericTemplate(data.topic || 'dermatology');
        if (fallback) {
          return {
            success: true,
            question: fallback,
            metadata: {
              generationTime: responseTime,
              model: 'template-fallback',
              contextUsed: false,
              fallbackUsed: true
            }
          };
        }
      } catch (fallbackError) {
        logError('fallback_failed', { fallbackError });
      }

      // Complete failure
      throw new functions.https.HttpsError('internal', 
        `Failed to generate question: ${error.message}`);
    }
  });

/**
 * Generate MCQ with retry logic and error handling
 */
async function generateWithRetry(
  topic: string,
  difficulty: number,
  context: string,
  maxAttempts = 2
): Promise<ParsedMCQ> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
    },
    safetySettings: [
      // Medical content needs minimal blocking
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE
      }
    ]
  });

  let lastError: Error = new Error('Unknown error');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logInfo('generation_attempt', {
        topic,
        attempt,
        maxAttempts,
        hasContext: !!context
      });

      const prompt = buildConsolidatedPrompt(topic, difficulty, context);
      
      // Set request timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 100000); // 100s timeout
      
      const result = await model.generateContent(prompt);
      clearTimeout(timeout);
      
      const text = result.response.text();
      
      // Parse and validate response
      const parsed = parseAndValidateResponse(text, topic, difficulty);
      
      // Quality gate - ensure medical accuracy and ABD compliance
      if (!parsed.metrics.medicalAccuracy || !parsed.metrics.abdCompliance) {
        if (attempt < maxAttempts) {
          logInfo('quality_check_failed_retrying', { 
            attempt, 
            topic,
            medicalAccuracy: parsed.metrics.medicalAccuracy,
            abdCompliance: parsed.metrics.abdCompliance
          });
          await delay(1000 * attempt); // Exponential backoff
          continue;
        }
        throw new Error(`Quality validation failed: medical accuracy=${parsed.metrics.medicalAccuracy}, ABD compliance=${parsed.metrics.abdCompliance}`);
      }

      logInfo('generation_successful', {
        topic,
        attempt,
        qualityScore: parsed.qualityScore,
        responseLength: text.length
      });

      return parsed;

    } catch (error: any) {
      lastError = error;
      
      logError('generation_attempt_failed', {
        topic,
        attempt,
        maxAttempts,
        error: error.message
      });

      if (attempt === maxAttempts) {
        break;
      }

      // Handle rate limiting with longer backoff
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        await delay(2000 * attempt);
      } else {
        await delay(1000 * attempt);
      }
    }
  }

  throw new Error(`Generation failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Build comprehensive prompt that replaces multi-agent pipeline
 */
function buildConsolidatedPrompt(topic: string, difficulty: number, context: string): string {
  const difficultyDesc = difficulty <= 0.2 ? 'challenging (20% pass rate)' :
                        difficulty <= 0.4 ? 'moderate (30-40% pass rate)' :
                        'standard (60-70% pass rate)';

  return `You are Dr. Sarah Chen, MD, board-certified dermatologist with 15 years of experience in medical education and American Board of Dermatology (ABD) question development.

TASK: Generate ONE high-quality Type A (One-Best-Answer) multiple-choice question for dermatology board examination.

${context ? `CURRENT MEDICAL EVIDENCE (PubMed/NCBI):
${context}

` : ''}TOPIC: ${topic}
DIFFICULTY TARGET: ${difficultyDesc}

CRITICAL REQUIREMENTS (ABD Standards):

1. CLINICAL VIGNETTE REQUIREMENTS:
   - Patient demographics (age, gender, ethnicity when relevant)
   - Chief complaint with clear timeline
   - Physical examination findings (describe lesions: morphology, distribution, color, size)
   - Relevant past medical/family/social history
   - Laboratory/diagnostic results if applicable
   - For visual topics, describe what would be seen in clinical photographs

2. LEAD-IN QUESTION:
   - Must follow "cover-the-options" rule (answerable without seeing choices)
   - Use "most likely," "best initial," or "most appropriate"
   - Test application of knowledge, not mere recall
   - Single, clear question ending with question mark

3. ANSWER OPTIONS:
   - EXACTLY 5 options (A through E)
   - All options must be HOMOGENEOUS (all diagnoses OR all treatments OR all tests)
   - One clearly correct answer based on clinical presentation
   - Four plausible distractors that would be chosen by someone with incomplete knowledge
   - Similar length and grammatical structure
   - No "all of the above" or "none of the above"

4. MEDICAL ACCURACY & EVIDENCE:
   - Base answer on current evidence-based practice
   - Cite specific guidelines when applicable (AAD, JAAD, etc.)
   - Ensure pathophysiology is accurate
   - Treatment recommendations must be current standard of care
   - Include relevant differential diagnoses in explanation

5. EDUCATIONAL VALUE:
   - Explanation must teach key concepts beyond just the answer
   - Explain WHY the correct answer is right (mechanism, evidence)
   - Explain WHY each distractor is wrong (what would be different)
   - Include 2-3 clinical pearls for practical application

SELF-VALIDATION CHECKLIST (You MUST verify before outputting):
- Medical accuracy: Is this medically correct according to current standards?
- Clinical realism: Would this patient presentation actually occur?
- ABD compliance: Does this meet board exam question standards?
- Homogeneous options: Are all options the same category?
- Difficulty appropriate: Does this match the ${difficultyDesc} target?
- Citations included: Are key sources referenced in explanation?

RESPONSE FORMAT (STRUCTURED TEXT - NOT JSON):
===QUESTION_START===
STEM:
[Clinical vignette here - include age, gender, timeline, symptoms, physical findings, relevant history]

LEAD_IN:
[Single clear question ending with ?]

OPTIONS:
A) [Option text]
B) [Option text]  
C) [Option text]
D) [Option text]
E) [Option text]

CORRECT_ANSWER: [A, B, C, D, or E]

EXPLANATION:
[Start with topic overview, then explain why correct answer is right based on clinical presentation. Follow with why each distractor is wrong and what clinical features would suggest each distractor instead. Include pathophysiology and current treatment guidelines.]

CLINICAL_PEARLS:
- [Practical clinical insight #1]
- [Diagnostic or management pearl #2]
- [Educational point about topic #3]

QUALITY_VERIFICATION:
Medical_Accuracy: [YES with brief rationale]
Clinical_Realism: [YES with brief rationale]
ABD_Compliance: [YES confirming all standards met]
Homogeneous_Options: [YES confirming all same category]
Difficulty_Appropriate: [YES confirming matches ${difficultyDesc}]

CITATIONS:
- [Key guideline, textbook, or high-quality medical reference used]
- [Additional source if applicable]
===QUESTION_END===

Generate the question now, ensuring all requirements above are met:`;
}

/**
 * Parse and validate the structured text response
 */
function parseAndValidateResponse(text: string, topic: string, difficulty: number): ParsedMCQ {
  // Extract content between markers
  const match = text.match(/===QUESTION_START===([\s\S]*?)===QUESTION_END===/);
  if (!match) {
    throw new Error('Invalid response format - missing question markers');
  }

  const content = match[1];

  try {
    // Parse each section
    const stem = extractSection(content, 'STEM', 'LEAD_IN');
    const leadIn = extractSection(content, 'LEAD_IN', 'OPTIONS');
    const optionsText = extractSection(content, 'OPTIONS', 'CORRECT_ANSWER');
    const correctAnswerText = extractSection(content, 'CORRECT_ANSWER', 'EXPLANATION');
    const explanation = extractSection(content, 'EXPLANATION', 'CLINICAL_PEARLS');
    const pearlsText = extractSection(content, 'CLINICAL_PEARLS', 'QUALITY_VERIFICATION');
    const verificationText = extractSection(content, 'QUALITY_VERIFICATION', 'CITATIONS');
    const citationsText = extractSection(content, 'CITATIONS');

    // Validate stem
    if (!stem || stem.length < 100) {
      throw new Error('Clinical vignette too short - must be detailed patient presentation');
    }

    // Validate lead-in
    if (!leadIn || !leadIn.includes('?') || !leadIn.toLowerCase().includes('most')) {
      throw new Error('Invalid lead-in question - must be clear question with "most"');
    }

    // Parse and validate options
    const options = parseOptions(optionsText);
    if (options.length !== 5) {
      throw new Error(`Expected exactly 5 options, got ${options.length}`);
    }

    // Validate option homogeneity
    if (!areOptionsHomogeneous(options)) {
      throw new Error('Options are not homogeneous - all must be same category');
    }

    // Parse correct answer
    const correctAnswer = correctAnswerText.trim().toUpperCase();
    if (!['A', 'B', 'C', 'D', 'E'].includes(correctAnswer)) {
      throw new Error(`Invalid correct answer: ${correctAnswer}`);
    }
    const correctIndex = correctAnswer.charCodeAt(0) - 'A'.charCodeAt(0);

    // Parse clinical pearls
    const pearls = parsePearls(pearlsText);
    if (pearls.length < 2) {
      throw new Error('Must include at least 2 clinical pearls');
    }

    // Parse quality metrics
    const metrics = parseQualityMetrics(verificationText);

    // Validate explanation length
    if (!explanation || explanation.length < 200) {
      throw new Error('Explanation too brief - must be comprehensive');
    }

    // Parse citations
    const citations = parseCitations(citationsText);

    // Calculate quality score
    const qualityScore = calculateQualityScore(metrics, stem, explanation, pearls);

    return {
      stem: stem.trim(),
      leadIn: leadIn.trim(),
      options: options.map(text => ({ text: text.trim() })),
      correctIndex,
      explanation: explanation.trim(),
      pearls,
      metrics,
      citations,
      qualityScore
    };

  } catch (error: any) {
    throw new Error(`Response parsing failed: ${error.message}`);
  }
}

/**
 * Extract section content between headers
 */
function extractSection(content: string, startHeader: string, endHeader?: string): string {
  const startPattern = new RegExp(`${startHeader}:\\s*`, 'i');
  const startMatch = content.search(startPattern);
  
  if (startMatch === -1) {
    throw new Error(`Missing section: ${startHeader}`);
  }

  const contentStart = startMatch + content.match(startPattern)![0].length;
  
  if (endHeader) {
    const endPattern = new RegExp(`\\n\\s*${endHeader}:`, 'i');
    const endMatch = content.search(endPattern);
    if (endMatch === -1) {
      return content.substring(contentStart).trim();
    }
    return content.substring(contentStart, endMatch).trim();
  }
  
  return content.substring(contentStart).trim();
}

/**
 * Parse answer options from text
 */
function parseOptions(optionsText: string): string[] {
  const lines = optionsText.split('\n').filter(line => line.trim());
  const options: string[] = [];

  for (const line of lines) {
    const match = line.match(/^([A-E])\)\s*(.+)$/i);
    if (match) {
      options.push(match[2].trim());
    }
  }

  return options;
}

/**
 * Check if options are homogeneous (same category)
 */
function areOptionsHomogeneous(options: string[]): boolean {
  // Simple heuristics for homogeneity
  const diagnosisPattern = /(syndrome|disease|condition|disorder|\w+itis|\w+oma|\w+osis)/i;
  const treatmentPattern = /(therapy|treatment|medication|drug|cream|ointment|laser|surgery)/i;
  const testPattern = /(biopsy|test|assay|culture|imaging|x-ray|ct|mri|ultrasound)/i;

  let diagnosisCount = 0;
  let treatmentCount = 0;
  let testCount = 0;

  options.forEach(option => {
    if (diagnosisPattern.test(option)) diagnosisCount++;
    if (treatmentPattern.test(option)) treatmentCount++;
    if (testPattern.test(option)) testCount++;
  });

  // At least 4 out of 5 should match the same pattern
  return diagnosisCount >= 4 || treatmentCount >= 4 || testCount >= 4;
}

/**
 * Parse clinical pearls
 */
function parsePearls(pearlsText: string): string[] {
  const lines = pearlsText.split('\n').filter(line => line.trim());
  return lines
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(pearl => pearl.length > 10);
}

/**
 * Parse quality verification metrics
 */
function parseQualityMetrics(verificationText: string) {
  return {
    medicalAccuracy: /Medical_Accuracy:\s*YES/i.test(verificationText),
    clinicalRealism: /Clinical_Realism:\s*YES/i.test(verificationText),
    abdCompliance: /ABD_Compliance:\s*YES/i.test(verificationText),
    homogeneousOptions: /Homogeneous_Options:\s*YES/i.test(verificationText),
    difficultyAppropriate: /Difficulty_Appropriate:\s*YES/i.test(verificationText)
  };
}

/**
 * Parse citations
 */
function parseCitations(citationsText: string): string[] {
  const lines = citationsText.split('\n').filter(line => line.trim());
  return lines
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(citation => citation.length > 5);
}

/**
 * Calculate overall quality score
 */
function calculateQualityScore(
  metrics: any,
  stem: string,
  explanation: string,
  pearls: string[]
): number {
  let score = 70; // Base score

  // Metrics bonuses
  if (metrics.medicalAccuracy) score += 10;
  if (metrics.clinicalRealism) score += 10;
  if (metrics.abdCompliance) score += 10;
  if (metrics.homogeneousOptions) score += 5;
  if (metrics.difficultyAppropriate) score += 5;

  // Content quality bonuses
  if (stem.length > 200) score += 5;
  if (explanation.length > 400) score += 5;
  if (pearls.length >= 3) score += 5;

  return Math.min(100, score);
}

/**
 * Quick context retrieval with caching and timeout
 */
async function getQuickContext(topic: string): Promise<string> {
  // Check cache first
  const cacheKey = `context_${topic.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = await db.collection('context_cache').doc(cacheKey).get();
  
  if (cached.exists && cached.data()?.expiry > Date.now()) {
    return cached.data()?.context || '';
  }

  try {
    // Lightweight context search with timeout
    const contextPromise = searchMedicalLiterature(topic);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Context search timeout')), 5000)
    );

    const results = await Promise.race([contextPromise, timeoutPromise]);
    const context = formatContext(results, 500); // Max 500 words

    // Cache the result
    await db.collection('context_cache').doc(cacheKey).set({
      context,
      topic,
      expiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      created: admin.firestore.FieldValue.serverTimestamp()
    });

    return context;
  } catch (error: any) {
    logInfo('context_search_failed', { topic, error: error.message });
    return ''; // Return empty context on failure
  }
}

/**
 * Placeholder for medical literature search
 */
async function searchMedicalLiterature(topic: string): Promise<any[]> {
  // TODO: Implement NCBI/PubMed API integration
  // For now, return empty array
  return [];
}

/**
 * Format search results into context
 */
function formatContext(results: any[], maxWords: number): string {
  // TODO: Implement context formatting
  return '';
}

/**
 * Check cache for existing question
 */
async function checkCache(topic: string, difficulty: number): Promise<CachedMCQ | null> {
  try {
    const cacheKey = `mcq_${topic.toLowerCase().replace(/\s+/g, '_')}_${Math.round(difficulty * 10)}`;
    const doc = await db.collection('mcq_cache').doc(cacheKey).get();
    
    if (doc.exists && doc.data()?.expiry > Date.now()) {
      const cached = doc.data() as CachedMCQ;
      cached.cacheHit = true;
      return cached;
    }
    
    return null;
  } catch (error: any) {
    logError('cache_check_failed', { topic, error: error.message });
    return null;
  }
}

/**
 * Cache successful question
 */
async function cacheQuestion(topic: string, difficulty: number, mcq: ParsedMCQ): Promise<void> {
  try {
    const cacheKey = `mcq_${topic.toLowerCase().replace(/\s+/g, '_')}_${Math.round(difficulty * 10)}`;
    const cached: CachedMCQ = {
      ...mcq,
      topic,
      expiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      created: Date.now()
    };

    await db.collection('mcq_cache').doc(cacheKey).set(cached);
  } catch (error: any) {
    logError('cache_write_failed', { topic, error: error.message });
  }
}

/**
 * Get template question as fallback
 */
async function getTemplateQuestion(topic: string): Promise<ParsedMCQ | null> {
  try {
    // Check template cache
    const templateDoc = await db.collection('question_templates')
      .where('topicKeywords', 'array-contains-any', topic.toLowerCase().split(' '))
      .limit(1)
      .get();
    
    if (!templateDoc.empty) {
      return templateDoc.docs[0].data() as ParsedMCQ;
    }
    
    return null;
  } catch (error: any) {
    logError('template_lookup_failed', { topic, error: error.message });
    return null;
  }
}

/**
 * Get generic template as final fallback
 */
async function getGenericTemplate(topic: string): Promise<ParsedMCQ | null> {
  // Return a basic template for the topic
  return {
    stem: `A 35-year-old patient presents with a dermatological condition related to ${topic}.`,
    leadIn: `What is the most appropriate initial approach?`,
    options: [
      { text: 'Observation and reassurance' },
      { text: 'Topical corticosteroids' },
      { text: 'Systemic antibiotics' },
      { text: 'Dermatology referral' },
      { text: 'Skin biopsy' }
    ],
    correctIndex: 3, // Dermatology referral
    explanation: `For complex dermatological conditions related to ${topic}, dermatology referral is often the most appropriate initial step to ensure proper diagnosis and management.`,
    pearls: [
      'Early specialist consultation improves outcomes',
      'Proper diagnosis is essential before treatment'
    ],
    metrics: {
      medicalAccuracy: true,
      clinicalRealism: true,
      abdCompliance: false,
      homogeneousOptions: true,
      difficultyAppropriate: true
    },
    citations: ['General dermatology practice guidelines'],
    qualityScore: 75
  };
}

/**
 * Format template response
 */
function formatTemplateResponse(template: ParsedMCQ, startTime: number): GenerationResult {
  return {
    success: true,
    question: template,
    metadata: {
      generationTime: Date.now() - startTime,
      model: 'template',
      contextUsed: false,
      fallbackUsed: true
    }
  };
}

/**
 * Utility delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}