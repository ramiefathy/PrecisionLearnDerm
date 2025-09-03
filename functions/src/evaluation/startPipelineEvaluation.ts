/**
 * Start Pipeline Evaluation Function
 * Initiates async evaluation job and triggers background processing
 */

import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';
import { requireAdmin } from '../util/auth';
import { createEvaluationJob } from './evaluationJobManager';

/**
 * Firebase Function to start pipeline evaluation
 * Returns immediately with jobId while processing continues async
 */
export const startPipelineEvaluation = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '512MB',
    secrets: ['GEMINI_API_KEY']
  })
  .https.onCall(async (data, context) => {
    try {
      // Require admin to start evaluation jobs
      requireAdmin(context);
      const userId = context.auth!.uid;
      
      // Validate input
      const {
        basicCount = 1,
        advancedCount = 1,
        veryDifficultCount = 1,
        pipelines = ['boardStyle', 'optimizedOrchestrator', 'hybridRouter'],
        topics = []
      } = data;
      
      // Validate counts
      if (basicCount < 0 || basicCount > 10) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Basic count must be between 0 and 10'
        );
      }
      if (advancedCount < 0 || advancedCount > 10) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Advanced count must be between 0 and 10'
        );
      }
      if (veryDifficultCount < 0 || veryDifficultCount > 10) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Very Difficult count must be between 0 and 10'
        );
      }
      
      // Validate pipelines
      const validPipelines = ['boardStyle', 'optimizedOrchestrator', 'hybridRouter'];
      const invalidPipelines = pipelines.filter((p: string) => !validPipelines.includes(p));
      if (invalidPipelines.length > 0) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Invalid pipelines: ${invalidPipelines.join(', ')}`
        );
      }
      
      // Use default topics if none provided
      const evaluationTopics = topics.length > 0 ? topics : [
        'Psoriasis',
        'Melanoma diagnosis',
        'Atopic dermatitis',
        'Drug eruptions',
        'Pemphigus vulgaris'
      ];
      
      // Create evaluation job
      const jobId = await createEvaluationJob(userId, {
        basicCount,
        advancedCount,
        veryDifficultCount,
        pipelines,
        topics: evaluationTopics
      });
      
      logger.info('[START_EVAL] Created evaluation job', {
        jobId,
        userId,
        config: {
          basicCount,
          advancedCount,
          veryDifficultCount,
          pipelines,
          topics: evaluationTopics
        }
      });
      
      // Trigger complete evaluation processing using single-function approach
      // Use setImmediate to break out of current function context and avoid timeout cascade
      setImmediate(async () => {
        try {
          logger.info('[START_EVAL] Starting complete evaluation processing via single function', {
            jobId,
            method: 'processBatchTestsLogic_with_processAllRemaining_true'
          });
          
          // Import and call with processAllRemaining=true to process everything in one function
          const { processBatchTestsLogic } = await import('./evaluationProcessor');
          await processBatchTestsLogic(jobId, 0, 1, true);
          
          logger.info('[START_EVAL] Complete evaluation processing finished successfully', {
            jobId
          });
          
        } catch (err) {
          logger.error('[START_EVAL] Complete evaluation processing failed', {
            jobId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      });
      
      logger.info('[START_EVAL] Started background batch processing', {
        jobId
      });
      
      // Return immediately with job ID
      return {
        success: true,
        jobId,
        message: 'Evaluation job started successfully',
        estimatedDuration: calculateEstimatedDuration({
          basicCount,
          advancedCount,
          veryDifficultCount,
          pipelines,
          topics: evaluationTopics
        })
      };
      
    } catch (error) {
      logger.error('[START_EVAL] Failed to start evaluation', { error });
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to start evaluation'
      );
    }
  });

/**
 * Calculate estimated duration based on configuration
 */
function calculateEstimatedDuration(config: {
  basicCount: number;
  advancedCount: number;
  veryDifficultCount: number;
  pipelines: string[];
  topics: string[];
}): number {
  // Average latencies per pipeline (in ms)
  const pipelineLatencies: Record<string, number> = {
    boardStyle: 8500,
    optimizedOrchestrator: 24000,
    hybridRouter: 15000
  };
  
  const totalQuestions = 
    (config.basicCount + config.advancedCount + config.veryDifficultCount) * 
    config.topics.length;
  
  let totalTime = 0;
  
  for (const pipeline of config.pipelines) {
    const latency = pipelineLatencies[pipeline] || 20000; // Default 20s
    totalTime += totalQuestions * latency;
  }
  
  // Add overhead for processing and compilation
  totalTime += 10000; // 10 seconds overhead
  
  return Math.ceil(totalTime / 1000); // Return in seconds
}
