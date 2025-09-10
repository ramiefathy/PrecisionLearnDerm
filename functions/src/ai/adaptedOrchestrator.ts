/**
 * Adapted Orchestrator - Compatibility Layer
 * Provides exact same API as orchestratorAgent.ts but uses optimized implementation
 * This ensures zero breaking changes during migration
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { generateQuestionsOptimized } from './optimizedOrchestrator';
import { GEMINI_API_KEY } from '../util/config';
import * as logger from 'firebase-functions/logger';
import { sanitizeOrchestratorInput, sanitizeTopic } from '../util/inputSanitizer';

const db = admin.firestore();

// Types from original orchestratorAgent.ts
interface MCQ {
  stem: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation: string;
}

type Difficulty = 'Basic' | 'Advanced' | 'Very Difficult';

interface QuestionItem {
  question: string;
  options: Array<{text: string}>;
  correctIndex: number;
  explanation: string;
  topic: string;
  difficulty: number;
  tags: string[];
  status: string;
  metadata: any;
}

/**
 * ADAPTER FUNCTION: Maintains exact API compatibility with orchestratorAgent.ts
 * Uses optimized implementation internally but returns same format
 */
export async function orchestrateQuestionGeneration(
  topic: string,
  difficulties: Difficulty[] = ['Basic', 'Advanced', 'Very Difficult'],
  useCache: boolean = true,
  useStreaming: boolean = true, // ENABLE STREAMING to avoid timeouts
  userId?: string,
  enableProgress?: boolean
): Promise<{
  questions: { [key in Difficulty]?: MCQ };
  savedIds: { [key in Difficulty]?: string };
  topic: string;
  saveError?: string;
  sessionId?: string;
  agentOutputs?: any[];
}> {
  try {
    // Sanitize inputs to prevent injection attacks
    const sanitizationResult = sanitizeOrchestratorInput({
      topic,
      difficulties,
      enableCaching: useCache,
      useStreaming,
      userId,
      enableProgress
    });
    
    if (!sanitizationResult.success) {
      throw new Error(`Input validation failed: ${sanitizationResult.errors.join(', ')}`);
    }
    
    // Use sanitized inputs
    const sanitizedInput = sanitizationResult.sanitized!;
    const sanitizedTopic = sanitizedInput.topic;
    const processedDifficulties = sanitizedInput.difficulties || ['Basic', 'Advanced', 'Very Difficult'];
    
    // Log sanitization warnings if any
    if (sanitizationResult.warnings.length > 0) {
      logger.warn(`[ADAPTED] Input sanitization warnings:`, sanitizationResult.warnings);
    }
    
    logger.info(`[ADAPTED] Starting optimized question generation for topic: ${sanitizedTopic}`);
    logger.info(`[ADAPTED] Sanitized difficulties: ${JSON.stringify(processedDifficulties)}`);
    logger.info(`[ADAPTED] Parameters - useCache: ${useCache}, useStreaming: ${useStreaming}, userId: ${userId}`);
    
    // Call the optimized implementation with sanitized inputs
    const optimizedResults = await generateQuestionsOptimized(
      sanitizedTopic, 
      processedDifficulties, 
      useCache, 
      useStreaming,
      userId,
      enableProgress
    );
    
    // Log the raw optimized results structure
    logger.info(`[ADAPTED] Optimized results keys:`, Object.keys(optimizedResults));
    
    // Convert results to original format, excluding metadata fields
    const questions: { [key in Difficulty]?: MCQ } = {};
    const validDifficultyKeys = ['Basic', 'Advanced', 'Very Difficult'];
    
    for (const [key, value] of Object.entries(optimizedResults)) {
      if (validDifficultyKeys.includes(key) && value) {
        const mcq = value as MCQ;
        questions[key as Difficulty] = mcq;
        logger.info(`[ADAPTED] Added ${key} question with structure:`, {
          hasStem: !!mcq.stem,
          hasOptions: !!mcq.options,
          hasCorrectAnswer: !!mcq.correctAnswer,
          hasExplanation: !!mcq.explanation
        });
      }
    }
    
    logger.info(`[ADAPTED] Total questions extracted: ${Object.keys(questions).length}`);
    
    // Extract metadata from optimizedResults
    const sessionId = optimizedResults.sessionId;
    const agentOutputs = optimizedResults.agentOutputs;
    
    // Save to database (maintaining original functionality)
    let savedIds: { [key in Difficulty]?: string } = {};
    let saveError: string | undefined;
    
    try {
      savedIds = await saveQuestionsToDatabase(questions, topic);
      logger.info(`[ADAPTED] Successfully saved ${Object.keys(savedIds).length} questions to database`);
    } catch (error) {
      logger.error('[ADAPTED] Failed to save questions to database:', error);
      saveError = error instanceof Error ? error.message : String(error);
    }
    
    return {
      questions,
      savedIds,
      topic,
      saveError,
      sessionId,
      agentOutputs
    };
    
  } catch (error) {
    logger.error('[ADAPTED] Optimized question generation failed:', error);
    throw new Error(`[ADAPTED] Optimized question generation failed: ${error}`);
  }
}

/**
 * FIREBASE CLOUD FUNCTION: Maintains exact same signature and behavior
 */
export const orchestrateQuestionGenerationFunction = functions
  .runWith({ 
    timeoutSeconds: 540, // 9 minutes - maximum allowed
    memory: '2GB', // Increased memory for better performance
    secrets: ['GEMINI_API_KEY']
  })
  .https.onCall(async (data, context) => {
  try {
    requireAuth(context);
    
    const { 
      topic, 
      difficulties: rawDifficulties,
      userId,
      enableProgress,
      useStreaming = true
    } = data || {};
    
    if (!topic) {
      throw new functions.https.HttpsError('invalid-argument', 'Topic is required');
    }
    
    // Ensure difficulties is always an array with proper validation
    let difficulties: Difficulty[] = ['Basic', 'Advanced', 'Very Difficult']; // Default
    
    if (rawDifficulties) {
      // Handle various input formats
      if (Array.isArray(rawDifficulties)) {
        // Filter and validate each difficulty
        const filteredDifficulties = rawDifficulties.filter(d => 
          ['Basic', 'Advanced', 'Very Difficult'].includes(d)
        ) as Difficulty[];
        
        if (filteredDifficulties.length > 0) {
          difficulties = filteredDifficulties;
        } else {
          logger.warn(`[ADAPTED] Invalid difficulties provided: ${JSON.stringify(rawDifficulties)}, using defaults`);
        }
      } else if (typeof rawDifficulties === 'string') {
        // Handle single difficulty as string
        if (['Basic', 'Advanced', 'Very Difficult'].includes(rawDifficulties)) {
          difficulties = [rawDifficulties as Difficulty];
        } else {
          logger.warn(`[ADAPTED] Invalid single difficulty: ${rawDifficulties}, using defaults`);
        }
      } else {
        logger.warn(`[ADAPTED] Unexpected difficulties format: ${typeof rawDifficulties}, using defaults`);
      }
    }
    
    logger.info(`[ADAPTED] Cloud function called for optimized generation: ${topic}`);
    logger.info(`[ADAPTED] Raw difficulties input: ${JSON.stringify(rawDifficulties)}, type: ${typeof rawDifficulties}, isArray: ${Array.isArray(rawDifficulties)}`);
    logger.info(`[ADAPTED] Processed difficulties: ${JSON.stringify(difficulties)}, length: ${difficulties.length}`);
    logger.info(`[ADAPTED] Other params - userId: ${userId}, enableProgress: ${enableProgress}, useStreaming: ${useStreaming}`);
    
    const result = await orchestrateQuestionGeneration(
      topic, 
      difficulties, 
      true, // useCache
      useStreaming,
      userId,
      enableProgress
    );
    
    // Count successfully saved questions
    const savedCount = Object.keys(result.savedIds).length;
    const generatedCount = Object.keys(result.questions).length;
    
    logger.info(`[ADAPTED] Cloud function completed: Generated ${generatedCount}, Saved ${savedCount} questions`);
    
    // Log the final response structure
    const response = {
      success: true,
      questions: result.questions,
      savedIds: result.savedIds,
      topic: result.topic,
      difficulties: Object.keys(result.questions),
      stats: {
        generated: generatedCount,
        saved: savedCount,
        saveError: result.saveError
      },
      agentOutputs: result.agentOutputs
    };
    
    logger.info(`[ADAPTED] Final cloud function response:`, {
      responseKeys: Object.keys(response),
      questionKeys: Object.keys(response.questions),
      hasAgentOutputs: !!response.agentOutputs,
      agentOutputCount: response.agentOutputs?.length || 0
    });
    
    return response;
    
  } catch (error: any) {
    logger.error('[ADAPTED] Optimized question generation cloud function failed:', error);
    throw new functions.https.HttpsError(
      'internal', 
      `Failed to generate questions: ${error.message || 'Unknown error'}`
    );
  }
});

/**
 * Database saving functionality (copied from original)
 */
function convertMCQToQuestionItem(mcq: MCQ, topic: string, difficulty: Difficulty): QuestionItem {
  const optionsArray = [
    { text: mcq.options.A },
    { text: mcq.options.B },
    { text: mcq.options.C },
    { text: mcq.options.D },
    { text: mcq.options.E }
  ];
  
  const correctIndex = mcq.correctAnswer.charCodeAt(0) - 65; // 'A' = 0, 'B' = 1, etc.
  
  const difficultyNumeric = difficulty === 'Basic' ? 0.3 : 
                          difficulty === 'Advanced' ? 0.6 : 0.9;
  
  return {
    question: mcq.stem,
    options: optionsArray,
    correctIndex,
    explanation: mcq.explanation,
    topic: topic,
    difficulty: difficultyNumeric,
    tags: [topic.toLowerCase(), difficulty.toLowerCase()],
    status: 'approved',
    metadata: {
      source: 'adapted-optimized-orchestrator',
      created: admin.firestore.Timestamp.now(),
      author: 'multi-agent-system-optimized',
      version: 2,
      enhancementApplied: admin.firestore.Timestamp.now()
    }
  };
}

async function saveQuestionsToDatabase(
  questions: { [key in Difficulty]?: MCQ },
  topic: string,
  userId?: string
): Promise<{ [key in Difficulty]?: string }> {
  const savedIds: { [key in Difficulty]?: string } = {};
  
  logger.info(`[ADAPTED] Saving ${Object.keys(questions).length} generated questions to database`);
  
  for (const [difficultyKey, mcq] of Object.entries(questions)) {
    if (mcq) {
      try {
        const difficulty = difficultyKey as Difficulty;
        const questionItem = convertMCQToQuestionItem(mcq, topic, difficulty);
        
        if (userId) {
          questionItem.metadata = {
            ...questionItem.metadata,
            createdBy: userId
          };
        }
        
        // Save to reviewQueue for admin review instead of items collection
        const queueItem = {
          draftItem: {
            type: 'mcq',
            stem: questionItem.question,
            leadIn: '',
            options: questionItem.options,
            keyIndex: questionItem.correctIndex,
            explanation: questionItem.explanation,
            citations: [],
            difficulty: questionItem.difficulty,
            qualityScore: questionItem.metadata?.totalScore || 0,
            iterationHistory: [],
            scoringData: {}
          },
          status: 'pending', // Set as pending for review
          topicHierarchy: {
            category: 'Dermatology',
            topic: topic,
            subtopic: difficulty,
            fullTopicId: `dermatology/${topic.toLowerCase().replace(/\s+/g, '_')}/${difficulty.toLowerCase()}`
          },
          kbSource: {
            entity: questionItem.metadata?.kbEntity || topic,
            completenessScore: questionItem.metadata?.completenessScore || 85
          },
          pipelineOutputs: questionItem.metadata?.pipelineData ? {
            generation: {
              method: 'orchestrated',
              model: questionItem.metadata.pipelineData.stages?.drafting?.model || 'gemini-2.5-pro',
              prompt: questionItem.metadata.pipelineData.stages?.drafting?.prompt || '',
              rawOutput: questionItem.metadata.pipelineData.stages?.drafting?.rawResponse || '',
              parsedSuccess: questionItem.metadata.pipelineData.stages?.drafting?.parsedSuccess || false,
              entityUsed: questionItem.metadata.pipelineData.stages?.contextGathering?.kbEntity,
              completenessScore: questionItem.metadata.pipelineData.stages?.contextGathering?.completenessScore,
              timestamp: questionItem.metadata.pipelineData.startTime || new Date().toISOString(),
              duration: questionItem.metadata.pipelineData.stages?.drafting?.duration || 0
            },
            webSearch: questionItem.metadata.pipelineData.stages?.webSearch,
            review: questionItem.metadata.pipelineData.stages?.review,
            scoring: questionItem.metadata.pipelineData.stages?.scoring,
            refinements: questionItem.metadata.pipelineData.stages?.refinements,
            performance: questionItem.metadata.pipelineData.performance
          } : {
            generation: questionItem.metadata?.generation || {},
            validation: questionItem.metadata?.validation || {},
            review: questionItem.metadata?.review || {},
            scoring: questionItem.metadata?.scoring || {}
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          priority: difficulty === 'Basic' ? 1 : difficulty === 'Advanced' ? 2 : 3,
          source: 'orchestrated-pipeline',
          metadata: {
            ...questionItem.metadata,
            pipelineVersion: '2.0',
            sessionId: questionItem.metadata?.pipelineData?.sessionId || `gen_${Date.now()}`
          }
        };
        
        const docRef = await db.collection('reviewQueue').add(queueItem);
        savedIds[difficulty] = docRef.id;
        
        logger.info(`[ADAPTED] Successfully saved ${difficulty} question to review queue with ID: ${docRef.id}`);
      } catch (error) {
        logger.error(`[ADAPTED] Failed to save ${difficultyKey} question:`, error);
      }
    }
  }
  
  logger.info(`[ADAPTED] Database save completed. Saved ${Object.keys(savedIds).length} questions.`);
  return savedIds;
}

// Export types for compatibility
export { MCQ, Difficulty };