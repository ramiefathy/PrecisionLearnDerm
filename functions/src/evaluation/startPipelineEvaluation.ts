/**
 * Start Pipeline Evaluation Function
 * Initiates async evaluation job and triggers background processing
 */

import * as functions from 'firebase-functions';
import { getFunctions } from 'firebase-admin/functions';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import * as crypto from 'node:crypto';
import { requireAdmin } from '../util/auth';
import { createEvaluationJob, failJob } from './evaluationJobManager';
import type { EvaluationRequest } from '../types/evaluation';

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
      
      // Validate input (support both legacy fields and new EvaluationRequest)
      const req: EvaluationRequest = {
        pipelines: Array.isArray(data?.pipelines) && data.pipelines.length > 0
          ? data.pipelines
          : ['boardStyle', 'optimizedOrchestrator', 'hybridRouter'],
        difficulty: data?.difficulty,
        count: typeof data?.count === 'number' ? data.count : undefined,
        topics: Array.isArray(data?.topics) ? data.topics : undefined,
        tags: Array.isArray(data?.tags) ? data.tags : undefined,
        seed: typeof data?.seed === 'number' ? data.seed : undefined,
        diversity: data?.diversity,
        counts: (data?.counts && typeof data.counts === 'object') ? {
          Basic: Number(data.counts.Basic ?? 0),
          Intermediate: Number(data.counts.Intermediate ?? 0),
          Advanced: Number(data.counts.Advanced ?? 0)
        } : undefined,
        taxonomySelection: (data?.taxonomySelection && typeof data.taxonomySelection === 'object') ? {
          categories: Array.isArray(data.taxonomySelection.categories) ? data.taxonomySelection.categories : [],
          subcategories: Array.isArray(data.taxonomySelection.subcategories) ? data.taxonomySelection.subcategories : [],
          topics: Array.isArray(data.taxonomySelection.topics) ? data.taxonomySelection.topics : []
        } : undefined
      };

      const mappedCounts = (() => {
        // Preferred: new counts object
        if (req.counts) {
          return {
            basic: req.counts.Basic,
            adv: req.counts.Intermediate,
            very: req.counts.Advanced
          };
        }
        // Legacy numeric fields (basicCount/advancedCount/veryDifficultCount)
        if (typeof data?.basicCount === 'number' || typeof data?.advancedCount === 'number' || typeof data?.veryDifficultCount === 'number') {
          return {
            basic: typeof data?.basicCount === 'number' ? data.basicCount : 0,
            adv: typeof data?.advancedCount === 'number' ? data.advancedCount : 0,
            very: typeof data?.veryDifficultCount === 'number' ? data.veryDifficultCount : 0
          };
        }
        // Map legacy single difficulty + count
        const c = typeof req.count === 'number' ? req.count : undefined;
        const d = req.difficulty;
        if (!c || !d) {
          return { basic: 1, adv: 1, very: 1 };
        }
        if (d === 'Basic') return { basic: c, adv: 0, very: 0 };
        if (d === 'Intermediate') return { basic: 0, adv: c, very: 0 };
        return { basic: 0, adv: 0, very: c };
      })();

      const basicCount = mappedCounts.basic;
      const advancedCount = mappedCounts.adv;
      const veryDifficultCount = mappedCounts.very;
      const pipelines = req.pipelines;
      // Topics resolution: prefer explicit topics, then taxonomySelection.topics, else defaults
      const resolvedTopics: string[] = Array.isArray(req.topics) && req.topics.length > 0
        ? req.topics
        : (Array.isArray(req.taxonomySelection?.topics) && req.taxonomySelection!.topics.length > 0
            ? req.taxonomySelection!.topics
            : []);
      
      // Validate counts
      const eachInRange = (n: number) => n >= 0 && n <= 50;
      if (!eachInRange(basicCount) || !eachInRange(advancedCount) || !eachInRange(veryDifficultCount)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Each count must be between 0 and 50'
        );
      }
      const total = basicCount + advancedCount + veryDifficultCount;
      if (total > 50) {
        throw new functions.https.HttpsError('invalid-argument', 'Total of counts must be ≤ 50');
      }
      if (total === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'At least one difficulty count must be > 0');
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
      const evaluationTopics = resolvedTopics.length > 0 ? resolvedTopics : [
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
      
      const cleanReq = JSON.parse(JSON.stringify(req));

      logger.info('[START_EVAL] Created evaluation job', {
        jobId,
        userId,
        config: {
          basicCount,
          advancedCount,
          veryDifficultCount,
          pipelines,
          topics: evaluationTopics
        },
        request: cleanReq
      });
      
      // Queue the first batch using Cloud Tasks (skip in emulator to avoid external SA token fetch)
      try {
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIREBASE_EMULATOR_HUB || !!process.env.FIRESTORE_EMULATOR_HOST;
        if (isEmulator) {
          await admin.firestore().collection('evaluationJobs').doc(jobId).set({
            status: 'queued',
            taskIds: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            request: cleanReq
          }, { merge: true });

          return {
            success: true,
            jobId,
            message: 'Evaluation job started successfully (emulator mode: tasks not enqueued)',
            estimatedDuration: calculateEstimatedDuration({
              basicCount,
              advancedCount,
              veryDifficultCount,
              pipelines,
              topics: evaluationTopics
            })
          };
        }
        const taskQueue = getFunctions().taskQueue('processEvaluationBatch');
        const taskId = crypto.randomUUID();
        await taskQueue.enqueue({
          jobId,
          taskId,
          startIndex: 0,
          batchSize: 3
        }, {
          id: taskId,
          scheduleDelaySeconds: 1,
          dispatchDeadlineSeconds: 1800
        });

        await admin.firestore().collection('evaluationJobs').doc(jobId).set({
          status: 'queued',
          taskIds: admin.firestore.FieldValue.arrayUnion(taskId),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          request: cleanReq
        }, { merge: true });
      } catch (queueError) {
        const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
        await failJob(jobId, errorMessage);
        throw new functions.https.HttpsError('internal', `Failed to queue batch processing: ${errorMessage}`);
      }
      
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
