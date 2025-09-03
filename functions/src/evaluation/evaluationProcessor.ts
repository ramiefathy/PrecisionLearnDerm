/**
 * Evaluation Processor - Handles individual test processing with live logging
 * Designed to avoid timeout issues by processing tests individually
 */

import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { 
  getJob,
  updateJobProgress,
  updateJobResults,
  completeJob,
  failJob,
  addErrorToJob,
  calculateQualityScore,
  type EvaluationJob,
  type ErrorEntry
} from './evaluationJobManager';
import { calculateDetailedQualityScore, type DetailedQualityScore } from './questionScorer';
import { evaluateQuestionWithAI, type BoardStyleQualityScore } from './aiQuestionScorer';
import { systemLoadService } from '../services/systemLoadService';
import { requireAuth, isAdmin } from '../util/auth';
// Lazy import taxonomyComplexityService to avoid initialization timeout
// import { taxonomyComplexityService } from '../services/taxonomyComplexityService';

// Import pipeline functions
import { generateBoardStyleMCQ } from '../ai/boardStyleGeneration';
import { generateQuestionsOptimized } from '../ai/optimizedOrchestrator';
import { routeHybridGeneration } from '../ai/hybridPipelineRouter';
import { config } from '../util/config';

// Batch size configuration constants
const MAX_SAFE_BATCH_SIZE = 3;   // Maximum allowed batch size
const DEFAULT_BATCH_SIZE = 1;    // Conservative default
const MIN_BATCH_SIZE = 1;        // Minimum (never go below this)
const MAX_RECURSION_DEPTH = 25;  // Maximum recursion depth for safety

const db = admin.firestore();

/**
 * Determine optimal batch size based on test complexity and taxonomy
 */
async function getOptimalBatchSizeForComplexity(testCases: any[]): Promise<number> {
  if (!testCases || testCases.length === 0) return DEFAULT_BATCH_SIZE;
  
  // First check if we have taxonomy information
  const hasValidTaxonomy = testCases.some(tc => 
    tc.category || tc.taxonomyCategory || tc.topic
  );

  if (hasValidTaxonomy) {
    // Use taxonomy-based complexity calculation
    const taxonomyTestCases = testCases.map(tc => ({
      category: tc.category || tc.taxonomyCategory || 'Medical Dermatology',
      subcategory: tc.subcategory || tc.taxonomySubcategory,
      difficulty: tc.difficulty
    }));

    // Lazy-load taxonomyComplexityService to avoid deployment timeout
    const { taxonomyComplexityService } = await import('../services/taxonomyComplexityService');
    const taxonomyBasedSize = taxonomyComplexityService.calculateOptimalBatchSize(
      taxonomyTestCases,
      MAX_SAFE_BATCH_SIZE
    );

    logger.info('[EVAL_PROCESSOR] Using taxonomy-based batch sizing', {
      testCasesCount: testCases.length,
      taxonomyBatchSize: taxonomyBasedSize,
      firstTestCategory: taxonomyTestCases[0]?.category,
      firstTestSubcategory: taxonomyTestCases[0]?.subcategory
    });

    return taxonomyBasedSize;
  }

  // Fallback to difficulty-based analysis (legacy approach)
  const difficulties = testCases.map(tc => tc.difficulty);
  const basicCount = difficulties.filter(d => d === 'Basic').length;
  const advancedCount = difficulties.filter(d => d === 'Advanced').length;
  const veryDifficultCount = difficulties.filter(d => d === 'Very Difficult').length;
  
  logger.info('[EVAL_PROCESSOR] Using difficulty-based batch sizing', {
    basicCount,
    advancedCount,
    veryDifficultCount
  });
  
  // If all tests are Very Difficult, use batch size 1
  if (veryDifficultCount === testCases.length) return 1;
  
  // If mix includes Very Difficult, use batch size 2
  if (veryDifficultCount > 0) return 2;
  
  // If all Advanced or mix of Basic/Advanced, use batch size 3
  return 3;
}

/**
 * Check current system load using real metrics
 */
async function getCurrentSystemLoad(): Promise<number> {
  try {
    // Use the SystemLoadService for real metrics
    const systemLoad = await systemLoadService.getCurrentSystemLoad();
    
    logger.info('[EVAL_PROCESSOR] Current system load', { 
      systemLoad: Math.round(systemLoad * 100) + '%' 
    });
    
    return systemLoad;
  } catch (error) {
    logger.warn('[EVAL_PROCESSOR] Could not determine system load, assuming high load', { error });
    return 0.9; // Assume high load on error
  }
}

/**
 * Adjust batch size based on system load
 */
function adjustBatchSizeForLoad(baseBatchSize: number, loadFactor: number): number {
  if (loadFactor > 0.8) return MIN_BATCH_SIZE;           // High load: single test
  if (loadFactor > 0.6) return Math.min(2, baseBatchSize); // Medium-high load: max 2
  if (loadFactor > 0.4) return Math.min(3, baseBatchSize); // Medium load: max 3
  return baseBatchSize;                                     // Low load: use full batch
}

/**
 * Calculate intelligent batch size combining all factors
 */
async function calculateIntelligentBatchSize(
  requestedBatchSize: number,
  testCases: any[]
): Promise<number> {
  // Start with user request or default
  let batchSize = requestedBatchSize || DEFAULT_BATCH_SIZE;
  
  // Apply safety limits
  batchSize = Math.max(MIN_BATCH_SIZE, Math.min(batchSize, MAX_SAFE_BATCH_SIZE));
  
  // Adjust based on test complexity
  const complexityBasedSize = await getOptimalBatchSizeForComplexity(testCases);
  batchSize = Math.min(batchSize, complexityBasedSize);
  
  // Adjust based on system load
  const systemLoad = await getCurrentSystemLoad();
  batchSize = adjustBatchSizeForLoad(batchSize, systemLoad);
  
  return Math.max(MIN_BATCH_SIZE, batchSize);
}

/**
 * Process a batch of tests in parallel and queue the next batch
 */
export const processBatchTests = functions
  .runWith({
    timeoutSeconds: 300, // 5 minutes per batch
    memory: '2GB',
    secrets: ['GEMINI_API_KEY']
  })
  .https.onCall(async (data, context) => {
    const { jobId, startIndex, batchSize = 1, processAllRemaining = false } = data;
    
    if (!jobId || startIndex === undefined) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Job ID and start index are required'
      );
    }
    
    return processBatchTestsLogic(jobId, startIndex, batchSize, processAllRemaining);
  });

// processCompleteEvaluation removed to avoid circular dependencies
// Use processBatchTests with processAllRemaining=true instead

// Keep the old function name for compatibility during transition
export const processSingleTest = processBatchTests;

/**
 * Compatibility wrapper for single test processing
 * Converts single test calls to batch calls
 */
export async function processSingleTestLogic(
  jobId: string, 
  testIndex: number
): Promise<any> {
  // Process as a batch of size 1 starting at testIndex
  return processBatchTestsLogic(jobId, testIndex, 1, false);
}

// processAllRemainingTests removed to avoid potential circular dependencies
// Use processBatchTestsLogic(jobId, startIndex, batchSize, true) instead

/**
 * Core logic for processing a batch of tests in parallel
 * Can be called directly or via the Cloud Function
 */
export async function processBatchTestsLogic(
  jobId: string, 
  startIndex: number,
  batchSize: number = DEFAULT_BATCH_SIZE,
  processAllRemaining: boolean = false
): Promise<any> {
    logger.info('[EVAL_PROCESSOR] 🧠 SINGLE-FUNCTION PROCESSING - Starting batch processing', { 
      jobId, 
      startIndex,
      requestedBatchSize: batchSize,
      processAllRemaining,
      systemVersion: 'v4-single-function-processing'
    });
    
    // Single-function processing - no recursion depth limits needed
    logger.info('[EVAL_PROCESSOR] Using single-function batch processing (no recursion)', {
      jobId,
      startIndex,
      processAllRemaining
    });
    
    try {
      // Get job details
      const job = await getJob(jobId);
      
      if (!job) {
        throw new Error('Job not found');
      }
      
      if (job.status === 'failed' || job.status === 'completed') {
        logger.info('[EVAL_PROCESSOR] Job already finished', { 
          jobId, 
          status: job.status 
        });
        return { success: true, finished: true };
      }
      
      // Cancellation check before starting work
      if ((job as any).cancelRequested) {
        await addLiveLog(jobId, {
          type: 'evaluation_cancelled',
          timestamp: new Date().toISOString(),
          message: '🛑 Evaluation cancelled by user before starting batch'
        });
        await failJob(jobId, 'Cancelled by user');
        return { success: true, finished: true };
      }
      
      // Get test cases from job
      const testCases = job.testCases || [];
      
      if (startIndex >= testCases.length) {
        // All tests completed
        await finalizeEvaluation(jobId, job);
        return { success: true, finished: true };
      }
      
      // Update job status to running if it's still pending (first batch)
      if (job.status === 'pending' && startIndex === 0) {
        logger.info('[EVAL_PROCESSOR] Updating job status to running', { jobId });
        await updateJobProgress(jobId, {}, 'running');
      }
      
      // Calculate intelligent batch size based on available tests
      const remainingTests = testCases.slice(startIndex);
      const intelligentBatchSize = await calculateIntelligentBatchSize(batchSize, remainingTests);
      
      // Get the batch of tests to process
      const endIndex = Math.min(startIndex + intelligentBatchSize, testCases.length);
      const batchTests = testCases.slice(startIndex, endIndex);
      
      logger.info('[EVAL_PROCESSOR] Calculated intelligent batch size', {
        jobId,
        startIndex,
        requestedBatchSize: batchSize,
        calculatedBatchSize: intelligentBatchSize,
        actualBatchSize: batchTests.length,
        testComplexities: batchTests.map(t => ({ topic: t.topic, difficulty: t.difficulty }))
      });
      
      logger.info('[EVAL_PROCESSOR] Processing batch', {
        jobId,
        startIndex,
        endIndex,
        batchSize: batchTests.length,
        totalTests: testCases.length
      });
      
      // Add live log for batch start
      await addLiveLog(jobId, {
        type: 'test_start',
        timestamp: new Date().toISOString(),
        testIndex: startIndex,
        message: `🚀 Starting batch of ${batchTests.length} tests (${startIndex + 1}-${endIndex}/${testCases.length})`
      });
      
      // Process all tests in the batch in parallel
      const batchResults = await Promise.allSettled(
        batchTests.map(async (testCase, batchIndex) => {
          const testIndex = startIndex + batchIndex;
          const testStartTime = Date.now();
          
          try {
            // Add individual test start log
            await addLiveLog(jobId, {
              type: 'test_start',
              timestamp: new Date().toISOString(),
              testIndex,
              pipeline: testCase.pipeline,
              topic: testCase.topic,
              difficulty: testCase.difficulty,
              message: `Starting test ${testIndex + 1}/${testCases.length}: ${testCase.pipeline} - ${testCase.topic} (${testCase.difficulty})`
            });
            
            // Execute test with live logging
            const result = await executePipelineTestWithLogging(
              jobId,
              testCase.pipeline,
              testCase.topic,
              testCase.difficulty
            );
            
            const latency = Date.now() - testStartTime;
            const quality = calculateQualityScore(result);
            
            // Calculate detailed quality scores (rule-based)
            const detailedScores = calculateDetailedQualityScore(result);
            
            // Get AI-powered board-style evaluation
            let aiScores: BoardStyleQualityScore | null = null;
            try {
              aiScores = await evaluateQuestionWithAI(
                result,
                testCase.pipeline,
                testCase.topic,
                testCase.difficulty
              );
            } catch (error) {
              logger.warn('[EVAL_PROCESSOR] AI scoring failed, using rule-based only', { error });
            }
            
            // Store test result with all scores
            await storeTestResult(jobId, testIndex, {
              success: true,
              testCase,
              result,
              latency,
              quality,
              detailedScores,
              aiScores
            });

            // Record taxonomy complexity performance for machine learning
            if (testCase.category) {
              try {
                // Lazy-load taxonomyComplexityService to avoid deployment timeout
                const { taxonomyComplexityService } = await import('../services/taxonomyComplexityService');
                taxonomyComplexityService.recordPerformanceData(
                  testCase.category,
                  'General', // Default subcategory since not in current TestCase interface
                  latency / 1000, // Convert to seconds
                  true, // success
                  aiScores?.overall || quality * 10 // Use AI score if available, else scaled quality
                );
              } catch (error) {
                logger.warn('[EVAL_PROCESSOR] Failed to record taxonomy performance data', { error });
              }
            }
            
            // Update progress atomically immediately after storing result
            // Use merge to handle cases where nested field doesn't exist yet
            await db.collection('evaluationJobs').doc(jobId).set({
              progress: {
                completedTests: admin.firestore.FieldValue.increment(1)
              }
            }, { merge: true });
            
            // Add success log with AI scores if available
            const scoreMessage = aiScores 
              ? `✅ Test ${testIndex + 1} | Time: ${(latency/1000).toFixed(1)}s | AI Score: ${aiScores.overall}% | Board-Ready: ${aiScores.metadata.boardReadiness} | Clinical: ${aiScores.coreQuality.clinicalRealism}% | Accuracy: ${aiScores.coreQuality.medicalAccuracy}%`
              : `✅ Test ${testIndex + 1} | Time: ${(latency/1000).toFixed(1)}s | Rule Score: ${detailedScores.overall}/10 | Board-Style: ${detailedScores.dimensions.boardStyleSimilarity}/10`;
            
            await addLiveLog(jobId, {
              type: 'test_complete',
              timestamp: new Date().toISOString(),
              testIndex,
              success: true,
              latency,
              quality,
              detailedScores: detailedScores ? {
                overall: detailedScores.overall,
                boardStyle: detailedScores.dimensions.boardStyleSimilarity,
                accuracy: detailedScores.dimensions.medicalAccuracy,
                detail: detailedScores.dimensions.clinicalDetail,
                distractors: detailedScores.dimensions.distractorQuality,
                boardNotes: detailedScores.feedback.boardStyleNotes
              } : null,
              aiScores: aiScores ? {
                overall: aiScores.overall,
                boardReady: aiScores.metadata.boardReadiness,
                clinicalRealism: aiScores.coreQuality.clinicalRealism,
                medicalAccuracy: aiScores.coreQuality.medicalAccuracy,
                distractorQuality: aiScores.technicalQuality.distractorQuality,
                cueingAbsence: aiScores.technicalQuality.cueingAbsence,
                strengths: aiScores.detailedFeedback.strengths,
                weaknesses: aiScores.detailedFeedback.weaknesses
              } : null,
              message: scoreMessage
            });
            
            logger.info('[EVAL_PROCESSOR] Test succeeded', {
              jobId,
              testIndex,
              pipeline: testCase.pipeline,
              topic: testCase.topic,
              latency,
              quality
            });
            
            return { success: true, testIndex, latency, quality };
            
          } catch (error) {
            const latency = Date.now() - testStartTime;
            
            // Store error
            const errorEntry: ErrorEntry = {
              timestamp: new Date().toISOString(),
              pipeline: testCase.pipeline,
              topic: testCase.topic,
              difficulty: testCase.difficulty,
              error: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                code: (error as any)?.code
              },
              context: {
                attemptNumber: 1,
                partialResult: { testIndex }
              }
            };
            
            await addErrorToJob(jobId, errorEntry);
            
            // Add error log
            await addLiveLog(jobId, {
              type: 'test_error',
              timestamp: new Date().toISOString(),
              testIndex,
              success: false,
              error: errorEntry.error.message,
              message: `❌ Test ${testIndex + 1} failed: ${errorEntry.error.message}`
            });
            
            logger.error('[EVAL_PROCESSOR] Test failed', {
              jobId,
              testIndex,
              error: errorEntry.error.message
            });
            
            return { success: false, testIndex, error: errorEntry };
          }
        })
      );
      
      // Count successes in this batch
      const batchSuccesses = batchResults.filter(r => 
        r.status === 'fulfilled' && r.value.success
      ).length;
      
      // Update progress (excluding completedTests which is handled atomically)
      await updateJobProgress(jobId, {
        totalTests: testCases.length,
        currentPipeline: 'batch processing',
        currentTopic: `Batch ${Math.floor(startIndex / batchSize) + 1}`,
        currentDifficulty: `${batchSuccesses}/${batchTests.length} succeeded`
      });
      
      // Log batch completion
      await addLiveLog(jobId, {
        type: 'generation_progress',
        timestamp: new Date().toISOString(),
        stage: 'batch_complete',
        details: {
          startIndex,
          endIndex,
          successes: batchSuccesses,
          failures: batchTests.length - batchSuccesses
        },
        message: `📊 Batch complete: ${batchSuccesses}/${batchTests.length} tests succeeded`
      });
      
      // Cancellation check after batch completes
      try {
        const currentJob = await getJob(jobId);
        if ((currentJob as any)?.cancelRequested) {
          await addLiveLog(jobId, {
            type: 'evaluation_cancelled',
            timestamp: new Date().toISOString(),
            message: '🛑 Evaluation cancelled by user during batch processing'
          });
          await failJob(jobId, 'Cancelled by user');
          return { success: true, finished: true };
        }
      } catch (e) {
        logger.warn('[EVAL_PROCESSOR] Failed to check cancellation status after batch', { jobId, error: e });
      }
      
      // Handle next batch or completion
      const nextStartIndex = endIndex;
      if (processAllRemaining && nextStartIndex < testCases.length) {
        // Continue processing remaining batches in this same function call
        logger.info('[EVAL_PROCESSOR] Continuing with next batch in same function', {
          jobId,
          nextStartIndex,
          remainingTests: testCases.length - nextStartIndex
        });
        
        // Add a log entry for batch transition
        await addLiveLog(jobId, {
          type: 'batch_transition',
          timestamp: new Date().toISOString(),
          message: `📦 Processing next batch starting at test ${nextStartIndex + 1} (same function)`,
          nextBatch: {
            startIndex: nextStartIndex,
            batchSize: Math.min(intelligentBatchSize, testCases.length - nextStartIndex)
          }
        });
        
        // Recursively call ourselves to process the next batch, but within the same function execution
        // This avoids function-to-function authentication issues
        const nextBatchResult = await processBatchTestsLogic(jobId, nextStartIndex, intelligentBatchSize, true);
        return nextBatchResult;
        
      } else if (nextStartIndex >= testCases.length || processAllRemaining) {
        // All tests completed
        logger.info('[EVAL_PROCESSOR] All tests completed, finalizing evaluation', {
          jobId,
          totalProcessed: nextStartIndex,
          totalTests: testCases.length
        });
        await finalizeEvaluation(jobId, job);
      } else {
        // Single batch processing - don't continue automatically
        logger.info('[EVAL_PROCESSOR] Single batch completed, not processing remaining batches', {
          jobId,
          processedUpTo: nextStartIndex,
          totalTests: testCases.length
        });
      }
      
      return { 
        success: true, 
        finished: nextStartIndex >= testCases.length,
        nextStartIndex,
        batchSuccesses,
        batchSize: batchTests.length
      };
      
    } catch (error) {
      logger.error('[EVAL_PROCESSOR] Fatal error processing batch', {
        jobId,
        startIndex,
        batchSize,
        error
      });
      
      await failJob(
        jobId,
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      throw new functions.https.HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Processing failed'
      );
    }
  }

/**
 * Execute a single pipeline test with live logging
 */
async function executePipelineTestWithLogging(
  jobId: string,
  pipeline: string,
  topic: string,
  difficulty: string
): Promise<any> {
  
  // Create a wrapper that captures generation logs
  const captureLog = async (stage: string, details: any) => {
    await addLiveLog(jobId, {
      type: 'generation_progress',
      timestamp: new Date().toISOString(),
      pipeline,
      stage,
      details,
      message: `[${pipeline}] ${stage}: ${JSON.stringify(details).substring(0, 200)}...`
    });
  };
  
  await captureLog('initialization', { topic, difficulty });
  
  switch (pipeline) {
    case 'boardStyle':
      await captureLog('mapping_difficulty', { 
        original: difficulty,
        mapped: difficulty === 'Basic' ? 'easy' : difficulty === 'Advanced' ? 'medium' : 'hard'
      });
      
      const boardDifficulty = difficulty === 'Basic' ? 'easy' : 
                              difficulty === 'Advanced' ? 'medium' : 'hard';
      
      await captureLog('calling_gemini', { model: 'gemini-2.5-pro', operation: 'board_style_generation' });
      
      const boardResult = await generateBoardStyleMCQ(
        topic,
        boardDifficulty as any,
        undefined
      );
      
      // Ensure options is an array for scoring compatibility
      if (boardResult && boardResult.options && !Array.isArray(boardResult.options)) {
        // Convert object-based options to array
        const optionsObj = boardResult.options;
        boardResult.options = ['A', 'B', 'C', 'D', 'E']
          .map(key => optionsObj[key])
          .filter(opt => opt !== undefined && opt !== '');
          
        // Also convert correctAnswer from letter to index if needed
        if (typeof boardResult.correctAnswer === 'string' && boardResult.correctAnswer.match(/^[A-E]$/)) {
          boardResult.correctAnswer = boardResult.correctAnswer.charCodeAt(0) - 65;
        }
      }
      
      await captureLog('generation_complete', { 
        hasResult: !!boardResult,
        stemLength: boardResult?.stem?.length,
        optionsCount: boardResult?.options?.length,
        optionsIsArray: Array.isArray(boardResult?.options)
      });
      if (config.logs.enableStreaming && boardResult) {
        const streamChunk = (text?: string) => (text ? text.substring(0, 800) : '');
        await addLiveLog(jobId, { type: 'stream', stage: 'draft_stem', message: streamChunk(boardResult.stem) });
        const opts = Array.isArray(boardResult.options) ? boardResult.options : Object.values(boardResult.options || {});
        await addLiveLog(jobId, { type: 'stream', stage: 'draft_options', message: opts.slice(0,5).join(' | ').substring(0, 800) });
        await addLiveLog(jobId, { type: 'stream', stage: 'draft_explanation', message: streamChunk(boardResult.explanation) });
      }
      
      // DEBUG: Log the leadIn value
      await captureLog('board_result_leadIn', {
        hasLeadIn: !!boardResult?.leadIn,
        leadInValue: boardResult?.leadIn || 'EMPTY',
        leadInLength: boardResult?.leadIn?.length || 0,
        allKeys: boardResult ? Object.keys(boardResult) : []
      });
      
      return boardResult;
      
    case 'optimizedOrchestrator':
      await captureLog('initializing_orchestrator', { 
        topic, 
        difficulties: [difficulty],
        useCache: true 
      });
      
      const orchestratorResult = await generateQuestionsOptimized(
        topic,
        [difficulty] as any,
        true,
        false,
        'evaluation-test'
      );
      
      const difficultyKey = difficulty as 'Basic' | 'Advanced' | 'Very Difficult';
      
      await captureLog('orchestrator_complete', { 
        hasResult: !!orchestratorResult,
        hasDifficulty: !!orchestratorResult?.[difficultyKey]
      });
      if (config.logs.enableStreaming && orchestratorResult?.agentOutputs) {
        for (const agent of (orchestratorResult.agentOutputs as any[])) {
          await addLiveLog(jobId, {
            type: 'stream',
            stage: `agent:${agent.name || 'unknown'}`,
            message: JSON.stringify({ status: agent.status, duration: agent.duration, fields: { input: agent.input ? Object.keys(agent.input) : [], result: agent.result ? Object.keys(agent.result) : [] } }).substring(0, 800)
          });
        }
      }
      
      if (orchestratorResult && orchestratorResult[difficultyKey]) {
        return orchestratorResult[difficultyKey];
      }
      
      throw new Error(`No question generated for difficulty: ${difficulty}`);
      
    case 'hybridRouter':
      await captureLog('routing_request', { 
        topic,
        difficulty,
        urgency: 'normal',
        quality: 'standard'
      });
      
      const hybridResult = await routeHybridGeneration({
        topic,
        difficulties: [difficulty],
        urgency: 'normal',
        quality: 'standard',
        features: {},
        userId: 'evaluation-test'
      });
      
      await captureLog('routing_complete', { 
        hasResult: !!hybridResult,
        hasQuestions: !!hybridResult?.questions
      });
      if (hybridResult?.routing) {
        await captureLog('routing_metadata', {
          decision: hybridResult.routing.decision,
          reason: hybridResult.routing.reason,
          routeLatency: hybridResult.routing.totalLatency
        });
      }
      
      if (hybridResult && hybridResult.questions && hybridResult.questions[difficulty]) {
        return hybridResult.questions[difficulty];
      }
      
      throw new Error(`No question generated for difficulty: ${difficulty}`);
      
    default:
      throw new Error(`Unknown pipeline: ${pipeline}`);
  }
}

/**
 * Add a live log entry to the evaluation job
 */
async function addLiveLog(jobId: string, logEntry: any): Promise<void> {
  try {
    await db.collection('evaluationJobs').doc(jobId)
      .collection('liveLogs').add({
        ...logEntry,
        createdAt: admin.firestore.Timestamp.now()
      });
  } catch (error) {
    logger.error('[EVAL_PROCESSOR] Failed to add live log', { jobId, error });
  }
}

/**
 * Store test result in job document
 */
async function storeTestResult(
  jobId: string, 
  testIndex: number,
  result: any
): Promise<void> {
  try {
    // Build normalized fields for UI consumers
    const mcq = result?.result || {};
    const rawOptions = mcq?.options;
    const optionsArray = Array.isArray(rawOptions)
      ? rawOptions
      : rawOptions && typeof rawOptions === 'object'
        ? ['A','B','C','D','E'].map(k => rawOptions[k]).filter((v: any) => typeof v === 'string' && v.length > 0)
        : [];
    const ca = mcq?.correctAnswer;
    const correctAnswerIndex = typeof ca === 'number' ? ca : (typeof ca === 'string' ? (ca.toUpperCase().charCodeAt(0) - 65) : null);
    const correctAnswerLetter = typeof ca === 'string' ? ca.toUpperCase() : (typeof correctAnswerIndex === 'number' ? String.fromCharCode(65 + correctAnswerIndex) : null);

    const ai = result?.aiScores || {};
    const aiScoresFlat = {
      overall: ai?.overall ?? null,
      boardReadiness: ai?.metadata?.boardReadiness ?? ai?.boardReadiness ?? null,
      clinicalRealism: ai?.coreQuality?.clinicalRealism ?? ai?.clinicalRealism ?? null,
      medicalAccuracy: ai?.coreQuality?.medicalAccuracy ?? ai?.medicalAccuracy ?? null,
      distractorQuality: ai?.technicalQuality?.distractorQuality ?? ai?.distractorQuality ?? null,
      cueingAbsence: ai?.technicalQuality?.cueingAbsence ?? ai?.cueingAbsence ?? null
    };

    // Concise trace for insight (no streaming required)
    const trace = {
      draftModel: config.generation.useFlashForDraft ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
      reviewModel: config.generation.useFlashForReview ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
      finalEvalModel: config.scoring.useProForFinal ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
      latencyMs: result?.latency ?? undefined,
      aiOverall: aiScoresFlat.overall,
      boardReadiness: aiScoresFlat.boardReadiness
    };

    await db.collection('evaluationJobs').doc(jobId)
      .collection('testResults').doc(`test_${testIndex}`).set({
        ...result,
        normalized: {
          optionsArray,
          correctAnswerIndex,
          correctAnswerLetter
        },
        aiScoresFlat,
        trace,
        createdAt: admin.firestore.Timestamp.now()
      });

    // If this question has AI scoring feedback and should be added to review queue, do it now
    if (result.aiScores && result.result && shouldAddToReviewQueue(result)) {
      await addQuestionToReviewQueue(result);
    }
  } catch (error) {
    logger.error('[EVAL_PROCESSOR] Failed to store test result', { 
      jobId, 
      testIndex, 
      error 
    });
  }
}

/**
 * Callable to request cancellation of an evaluation job
 */
export const cancelEvaluationJob = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const { jobId, reason = 'User requested cancellation' } = data || {};
    if (!jobId) {
      throw new functions.https.HttpsError('invalid-argument', 'Job ID is required');
    }

    try {
      // Only the job owner or an admin may cancel
      const jobSnap = await db.collection('evaluationJobs').doc(jobId).get();
      const job = jobSnap.exists ? jobSnap.data() as any : null;
      const isOwner = job?.userId === uid;
      const userIsAdmin = isAdmin(context);
      if (!isOwner && !userIsAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Only the job owner or an admin can cancel this evaluation');
      }

      await db.collection('evaluationJobs').doc(jobId).set({
        cancelRequested: true,
        cancellationReason: reason,
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });

      await addLiveLog(jobId, {
        type: 'evaluation_cancel_request',
        timestamp: new Date().toISOString(),
        message: `⏹️ Cancellation requested by user ${uid}`,
        reason
      });

      return { success: true };
    } catch (error: any) {
      logger.error('[EVAL_PROCESSOR] Failed to request cancellation', { error });
      throw new functions.https.HttpsError('internal', error?.message || 'Failed to cancel');
    }
  });

/**
 * Determine if a question should be added to the admin review queue
 */
function shouldAddToReviewQueue(result: any): boolean {
  // Only add questions that meet certain quality thresholds or need admin review
  if (!result.aiScores) return false;
  
  // Add questions that score below 70% overall or have specific issues
  const needsReview = result.aiScores.overall < 70 ||
                     result.aiScores.metadata.boardReadiness === 'major_revision' ||
                     result.aiScores.metadata.boardReadiness === 'reject' ||
                     result.aiScores.coreQuality.medicalAccuracy < 80;
  
  return needsReview;
}

/**
 * Add a question with AI scoring feedback to the admin review queue
 */
async function addQuestionToReviewQueue(testResult: any): Promise<void> {
  try {
    const { result: mcq, aiScores, testCase } = testResult;
    
    // Create question queue entry
    const queueRef = db.collection('questionQueue').doc();
    
    const queuedQuestion = {
      id: queueRef.id,
      draftItem: {
        stem: mcq.stem,
        options: mcq.options || [],
        correctAnswer: mcq.correctAnswer,
        explanation: mcq.explanation,
        topic: testCase.topic,
        difficulty: testCase.difficulty,
        generatedAt: new Date().toISOString(),
        pipeline: testCase.pipeline,
        source: 'evaluation_pipeline'
      },
      status: 'pending' as const,
      topicHierarchy: {
        category: testCase.category || 'general',
        topic: testCase.topic,
        subtopic: testCase.topic,
        fullTopicId: `${testCase.category || 'general'}_${testCase.topic}`,
        taxonomyEntity: testCase.topic
      },
      kbSource: {
        entity: testCase.topic,
        completenessScore: 0,
        source: 'evaluation_pipeline'
      },
      // Store AI scoring feedback for admin review (streamlined structure)
      aiAssessment: {
        overall: aiScores.overall,
        boardReadiness: aiScores.metadata.boardReadiness,
        
        // Core quality metrics
        coreQuality: {
          medicalAccuracy: aiScores.coreQuality.medicalAccuracy,
          clinicalRealism: aiScores.coreQuality.clinicalRealism,
          stemCompleteness: aiScores.coreQuality.stemCompleteness,
          difficultyCalibration: aiScores.coreQuality.difficultyCalibration
        },
        
        // Technical quality metrics
        technicalQuality: {
          distractorQuality: aiScores.technicalQuality.distractorQuality,
          cueingAbsence: aiScores.technicalQuality.cueingAbsence,
          clarity: aiScores.technicalQuality.clarity
        },
        
        // Educational value metrics
        educationalValue: {
          clinicalRelevance: aiScores.educationalValue.clinicalRelevance,
          educationalValue: aiScores.educationalValue.educationalValue
        },
        
        // Detailed feedback for admins
        feedback: {
          strengths: aiScores.detailedFeedback.strengths,
          weaknesses: aiScores.detailedFeedback.weaknesses,
          improvementSuggestions: aiScores.detailedFeedback.improvementSuggestions
        },
        
        evaluatedAt: new Date().toISOString(),
        evaluationSource: 'gemini-2.5-pro-streamlined'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      priority: 100 - aiScores.overall, // Higher priority for lower scoring questions
      needsReview: true,
      reviewReason: `AI assessment: ${aiScores.overall}% overall, ${aiScores.metadata.boardReadiness} readiness`
    };
    
    await queueRef.set(queuedQuestion);
    
    logger.info('[EVAL_PROCESSOR] Added question to review queue with AI feedback', {
      queueId: queueRef.id,
      topic: testCase.topic,
      overall: aiScores.overall,
      boardReadiness: aiScores.metadata.boardReadiness,
      priority: queuedQuestion.priority
    });
    
  } catch (error) {
    logger.error('[EVAL_PROCESSOR] Failed to add question to review queue', { 
      error,
      testCase: testResult.testCase 
    });
  }
}

/**
 * Admin function to retrospectively add AI-scored questions from completed evaluations to review queue
 */
export const addEvaluatedQuestionsToQueue = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '1GB'
  })
  .https.onCall(async (data, context) => {
    // Require admin authentication
    if (!context.auth?.token?.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { jobId, scoreThreshold = 70, onlyFailingQuestions = false } = data;

    if (!jobId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Job ID is required'
      );
    }

    try {
      // Get all test results from the evaluation job
      const resultsSnapshot = await db.collection('evaluationJobs')
        .doc(jobId)
        .collection('testResults')
        .get();

      if (resultsSnapshot.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'No test results found for this job'
        );
      }

      let addedCount = 0;
      const results = resultsSnapshot.docs.map(doc => doc.data());

      for (const result of results) {
        if (!result.aiScores || !result.result) continue;

        // Apply filters based on admin preferences
        let shouldAdd = false;
        
        if (onlyFailingQuestions) {
          // Only add questions that clearly need review
          shouldAdd = result.aiScores.overall < scoreThreshold ||
                     result.aiScores.metadata.boardReadiness === 'major_revision' ||
                     result.aiScores.metadata.boardReadiness === 'reject';
        } else {
          // Add all questions with AI scores for comprehensive review
          shouldAdd = true;
        }

        if (shouldAdd) {
          await addQuestionToReviewQueue(result);
          addedCount++;
        }
      }

      logger.info('[EVAL_PROCESSOR] Retrospectively added questions to review queue', {
        jobId,
        addedCount,
        totalResults: results.length,
        scoreThreshold,
        onlyFailingQuestions
      });

      return {
        success: true,
        message: `Added ${addedCount} questions to the review queue`,
        addedCount,
        totalResults: results.length
      };

    } catch (error) {
      logger.error('[EVAL_PROCESSOR] Failed to add evaluated questions to queue', {
        jobId,
        error
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to add questions to review queue'
      );
    }
  });

/**
 * Finalize evaluation and calculate overall metrics
 */
async function finalizeEvaluation(
  jobId: string,
  job: EvaluationJob
): Promise<void> {
  try {
    logger.info('[EVAL_PROCESSOR] Finalizing evaluation', { jobId });
    
    // Get all test results
    const resultsSnapshot = await db.collection('evaluationJobs')
      .doc(jobId)
      .collection('testResults')
      .get();
    
    const results = resultsSnapshot.docs.map(doc => doc.data());
    
    // Calculate metrics
    const successfulTests = results.filter(r => r.success);
    const totalTests = results.length;
    const totalSuccesses = successfulTests.length;
    
    const avgLatency = successfulTests.length > 0 
      ? successfulTests.reduce((sum, r) => sum + r.latency, 0) / successfulTests.length
      : 0;
      
    const avgQuality = successfulTests.length > 0
      ? successfulTests.reduce((sum, r) => sum + r.quality, 0) / successfulTests.length
      : 0;
    
    // Build pipeline and category results
    const byPipeline: any = {};
    const byCategory: any = {};
    
    for (const result of results) {
      const pipeline = result.testCase.pipeline;
      const category = result.testCase.category;
      
      if (!byPipeline[pipeline]) {
        byPipeline[pipeline] = {
          pipeline,
          successRate: 0,
          avgLatency: 0,
          avgQuality: 0,
          totalTests: 0,
          successCount: 0,
          failures: []
        };
      }
      
      byPipeline[pipeline].totalTests++;
      if (result.success) {
        byPipeline[pipeline].successCount++;
      }
      
      if (!byCategory[category]) {
        byCategory[category] = {
          category,
          successRate: 0,
          avgLatency: 0,
          avgQuality: 0,
          testCount: 0
        };
      }
      
      byCategory[category].testCount++;
    }
    
    // Calculate pipeline metrics
    for (const pipeline of Object.values(byPipeline) as any[]) {
      pipeline.successRate = pipeline.totalTests > 0 
        ? pipeline.successCount / pipeline.totalTests : 0;
        
      const pipelineSuccesses = successfulTests.filter(r => r.testCase.pipeline === pipeline.pipeline);
      pipeline.avgLatency = pipelineSuccesses.length > 0
        ? pipelineSuccesses.reduce((sum, r) => sum + r.latency, 0) / pipelineSuccesses.length
        : 0;
      pipeline.avgQuality = pipelineSuccesses.length > 0
        ? pipelineSuccesses.reduce((sum, r) => sum + r.quality, 0) / pipelineSuccesses.length
        : 0;
    }
    
    const finalResults = {
      byPipeline,
      byCategory,
      overall: {
        totalTests,
        totalSuccesses,
        overallSuccessRate: totalTests > 0 ? totalSuccesses / totalTests : 0,
        avgLatency,
        avgQuality,
        totalDuration: Date.now() - (job.createdAt as any).toDate().getTime()
      },
      errors: []
    };
    
    await completeJob(jobId, finalResults);

    // Write evaluation summary document for history/analytics
    try {
      const summaryRef = db.collection('evaluationSummaries').doc(jobId);
      // Build per-pipeline aggregates including readiness counts and basic percentiles
      const byPipelineAgg: any = {};
      const aiByPipeline: Record<string, number[]> = {};
      const latByPipeline: Record<string, number[]> = {};
      const readinessByPipeline: Record<string, {ready:number; minor:number; major:number; reject:number}> = {};
      results.forEach((r: any) => {
        const p = r.testCase?.pipeline || 'unknown';
        if (!aiByPipeline[p]) { aiByPipeline[p]=[]; latByPipeline[p]=[]; readinessByPipeline[p]={ ready:0, minor:0, major:0, reject:0 }; }
        if (r.success) {
          const ai = (r.aiScoresFlat?.overall ?? r.aiScores?.overall ?? r.quality ?? 0) as number;
          aiByPipeline[p].push(ai);
          latByPipeline[p].push(r.latency || 0);
          const br = r.aiScoresFlat?.boardReadiness ?? r.aiScores?.boardReadiness ?? r.aiScores?.metadata?.boardReadiness;
          if (br === 'ready') readinessByPipeline[p].ready++;
          else if (br === 'minor_revision') readinessByPipeline[p].minor++;
          else if (br === 'major_revision') readinessByPipeline[p].major++;
          else if (br === 'reject') readinessByPipeline[p].reject++;
        }
      });
      const quant = (arr: number[], q:number) => {
        if (!arr || arr.length===0) return 0;
        const s = [...arr].sort((a,b)=>a-b);
        const pos = (s.length-1)*q; const base = Math.floor(pos); const rest = pos-base;
        return s[base+1]!==undefined ? s[base]+rest*(s[base+1]-s[base]) : s[base];
      };
      Object.keys(aiByPipeline).forEach(p => {
        const aiArr = aiByPipeline[p];
        const latArr = latByPipeline[p];
        const agg = {
          pipeline: p,
          testCount: aiArr.length,
          avgAI: aiArr.length? aiArr.reduce((a,b)=>a+b,0)/aiArr.length : 0,
          p50AI: quant(aiArr, 0.5),
          p90AI: quant(aiArr, 0.9),
          avgLatency: latArr.length? latArr.reduce((a,b)=>a+b,0)/latArr.length : 0,
          p50Latency: quant(latArr, 0.5),
          p90Latency: quant(latArr, 0.9),
          readiness: readinessByPipeline[p]
        };
        byPipelineAgg[p] = agg;
      });

      // Topic×Difficulty cells
      const topicDiffMap: Record<string, { sumAI:number; sumLat:number; count:number; success:number }> = {};
      results.forEach((r:any) => {
        const topic = r.testCase?.topic || 'Unknown';
        const diff = r.testCase?.difficulty || 'Unknown';
        const key = `${topic}||${diff}`;
        if (!topicDiffMap[key]) topicDiffMap[key] = { sumAI:0, sumLat:0, count:0, success:0 };
        const ai = (r.aiScoresFlat?.overall ?? r.aiScores?.overall ?? r.quality ?? 0) as number;
        topicDiffMap[key].sumAI += ai; topicDiffMap[key].sumLat += (r.latency||0); topicDiffMap[key].count += 1;
        const br = r.aiScoresFlat?.boardReadiness ?? r.aiScores?.boardReadiness ?? r.aiScores?.metadata?.boardReadiness;
        if (br === 'ready' || br === 'minor_revision') topicDiffMap[key].success += 1;
      });
      const byTopicDifficulty = Object.entries(topicDiffMap).map(([k,v])=>{
        const [topic, difficulty] = k.split('||');
        return { topic, difficulty, successRate: v.count? v.success/v.count:0, ai: v.count? v.sumAI/v.count:0, latency: v.count? v.sumLat/v.count:0, count: v.count };
      });

      await summaryRef.set({
        jobId,
        overall: finalResults.overall,
        byPipeline: byPipelineAgg,
        byTopicDifficulty,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      logger.warn('[EVAL_PROCESSOR] Failed to write evaluation summary', { jobId, error: e instanceof Error? e.message: String(e) });
    }
    
    // Add completion log
    await addLiveLog(jobId, {
      type: 'evaluation_complete',
      timestamp: new Date().toISOString(),
      overall: finalResults.overall,
      message: `🎉 Evaluation completed! Success rate: ${(finalResults.overall.overallSuccessRate * 100).toFixed(1)}%, Avg quality: ${avgQuality.toFixed(1)}/10`
    });
    
    logger.info('[EVAL_PROCESSOR] Evaluation completed successfully', {
      jobId,
      overall: finalResults.overall
    });
    
  } catch (error) {
    logger.error('[EVAL_PROCESSOR] Failed to finalize evaluation', { 
      jobId, 
      error 
    });
    
    await failJob(
      jobId,
      error instanceof Error ? error.message : 'Failed to finalize evaluation'
    );
  }
}
