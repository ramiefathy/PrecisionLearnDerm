/**
 * Process Pipeline Evaluation Function
 * Handles the actual evaluation work for a job
 */

/**
 * ⚠️ ⚠️ ⚠️ DEPRECATED - DO NOT MODIFY THIS FILE ⚠️ ⚠️ ⚠️
 * 
 * This is the LEGACY evaluation system that is currently in production.
 * 
 * 🚨 CRITICAL: This file is scheduled for deprecation!
 * 
 * For NEW development, use:
 *   - functions/src/evaluation/evaluationProcessor.ts (modern system)
 *   - functions/src/evaluation/startPipelineEvaluation.ts (entry point)
 * 
 * This legacy system has the following issues:
 *   - Monolithic architecture prone to timeout cascades
 *   - Hardcoded configuration values
 *   - Less robust error handling
 *   - Progress tracking compatibility issues
 * 
 * The modern system provides:
 *   - Sequential processing to prevent timeouts
 *   - Configurable batch sizes
 *   - Better error recovery
 *   - Atomic progress updates
 * 
 * TODO: Migrate clients to use startPipelineEvaluation instead
 * TODO: Remove this file once migration is complete
 * 
 * Last modified: Emergency batch size fix to prevent timeout cascades
 * ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️
 */

import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';
import { 
  getJob, 
  updateJobProgress, 
  updateJobResults,
  completeJob,
  failJob,
  addErrorToJob,
  generateTestCases,
  calculateQualityScore,
  type EvaluationJob,
  type PipelineResult,
  type CategoryResult,
  type OverallMetrics,
  type ErrorEntry
} from './evaluationJobManager';

// Import pipeline functions
import { generateBoardStyleMCQ } from '../ai/boardStyleGeneration';
import { generateQuestionsOptimized } from '../ai/optimizedOrchestrator';
import { routeHybridGeneration } from '../ai/hybridPipelineRouter';

/**
 * HTTP callable function to process evaluation jobs
 * Can also be called directly from startPipelineEvaluation
 */
export const processPipelineEvaluation = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes max
    memory: '2GB'
  })
  .https.onCall(async (data, context) => {
    const { jobId } = data;
    
    if (!jobId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Job ID is required'
      );
    }
    
    logger.info('[PROCESS_EVAL] Starting evaluation processing', { jobId });
    
    try {
      await processEvaluationJob(jobId);
      return { success: true, jobId };
    } catch (error) {
      logger.error('[PROCESS_EVAL] Failed to process evaluation', { 
        jobId, 
        error 
      });
      throw new functions.https.HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Processing failed'
      );
    }
  });

/**
 * Main evaluation processing logic
 */
export async function processEvaluationJob(jobId: string): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Get job details
    const job = await getJob(jobId);
    
    if (!job) {
      logger.error('[PROCESS_EVAL] Job not found', { jobId });
      return;
    }
    
    if (job.status !== 'pending') {
      logger.warn('[PROCESS_EVAL] Job not in pending state', { 
        jobId, 
        status: job.status 
      });
      return;
    }
    
    // Mark job as running
    await updateJobProgress(jobId, {}, 'running');
    
    // Generate test cases
    const testCases = generateTestCases(job.config);
    logger.info('[PROCESS_EVAL] Generated test cases', {
      jobId,
      count: testCases.length
    });
    
    // Initialize results
    const results: EvaluationJob['results'] = {
      byPipeline: {},
      byCategory: {},
      overall: {
        totalTests: 0,
        totalSuccesses: 0,
        overallSuccessRate: 0,
        avgLatency: 0,
        avgQuality: 0,
        totalDuration: 0
      },
      errors: []
    };
    
    // Test each pipeline
    for (const pipeline of job.config.pipelines) {
      logger.info('[PROCESS_EVAL] Testing pipeline', { jobId, pipeline });
      
      const pipelineResult: PipelineResult = {
        pipeline,
        successRate: 0,
        avgLatency: 0,
        avgQuality: 0,
        totalTests: 0,
        successCount: 0,
        failures: []
      };
      
      let totalLatency = 0;
      let totalQuality = 0;
      
      // Process test cases in batches to balance parallelism and rate limits
      const BATCH_SIZE = 1; // Process 1 test at a time to avoid timeout cascades
      const testBatches = [];
      for (let i = 0; i < testCases.length; i += BATCH_SIZE) {
        testBatches.push(testCases.slice(i, i + BATCH_SIZE));
      }
      
      // Process each batch
      for (const batch of testBatches) {
        const batchResults = await Promise.allSettled(
          batch.map(async (testCase) => {
            const testStartTime = Date.now();
            
            try {
              // Update progress
              await updateJobProgress(jobId, {
                completedTests: results.overall.totalTests + 1,
                currentPipeline: pipeline,
                currentTopic: testCase.topic,
                currentDifficulty: testCase.difficulty
              });
              
              // Execute test based on pipeline
              const result = await executePipelineTest(
                pipeline,
                testCase.topic,
                testCase.difficulty
              );
              
              const latency = Date.now() - testStartTime;
              
              return {
                success: true,
                testCase,
                result,
                latency
              };
            } catch (error) {
              const latency = Date.now() - testStartTime;
              return {
                success: false,
                testCase,
                error,
                latency
              };
            }
          })
        );
        
        // Process batch results
        for (const batchResult of batchResults) {
          if (batchResult.status === 'fulfilled') {
            const { success, testCase, result, error, latency } = batchResult.value;
            
            if (success && result) {
              const quality = calculateQualityScore(result);
              
              // Update metrics
              pipelineResult.successCount++;
              totalLatency += latency;
              totalQuality += quality;
              
              // Update category metrics
              if (!results.byCategory[testCase.category]) {
                results.byCategory[testCase.category] = {
                  category: testCase.category,
                  successRate: 0,
                  avgLatency: 0,
                  avgQuality: 0,
                  testCount: 0
                };
              }
              
              const categoryResult = results.byCategory[testCase.category];
              categoryResult.testCount++;
              categoryResult.avgLatency = 
                (categoryResult.avgLatency * (categoryResult.testCount - 1) + latency) / 
                categoryResult.testCount;
              categoryResult.avgQuality = 
                (categoryResult.avgQuality * (categoryResult.testCount - 1) + quality) / 
                categoryResult.testCount;
              
              logger.info('[PROCESS_EVAL] Test succeeded', {
                jobId,
                pipeline,
                topic: testCase.topic,
                difficulty: testCase.difficulty,
                latency,
                quality
              });
            } else if (!success && error) {
              // Handle test failure
              const errorEntry: ErrorEntry = {
                timestamp: new Date().toISOString(),
                pipeline,
                topic: testCase.topic,
                difficulty: testCase.difficulty,
                error: {
                  message: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  code: (error as any)?.code
                },
                context: {
                  attemptNumber: 1,
                  partialResult: (error as any)?.partialResult
                }
              };
              
              pipelineResult.failures.push(errorEntry);
              results.errors.push(errorEntry);
              
              await addErrorToJob(jobId, errorEntry);
              
              logger.error('[PROCESS_EVAL] Test failed', {
                jobId,
                pipeline,
                topic: testCase.topic,
                difficulty: testCase.difficulty,
                error: errorEntry.error.message
              });
            }
            
            pipelineResult.totalTests++;
            results.overall.totalTests++;
          }
        }
        
        // Add delay between batches to avoid rate limiting
        if (testBatches.indexOf(batch) < testBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }
      
      // Calculate pipeline metrics
      pipelineResult.successRate = 
        pipelineResult.totalTests > 0 ? 
        pipelineResult.successCount / pipelineResult.totalTests : 0;
      pipelineResult.avgLatency = 
        pipelineResult.successCount > 0 ? 
        totalLatency / pipelineResult.successCount : 0;
      pipelineResult.avgQuality = 
        pipelineResult.successCount > 0 ? 
        totalQuality / pipelineResult.successCount : 0;
      
      results.byPipeline[pipeline] = pipelineResult;
      results.overall.totalSuccesses += pipelineResult.successCount;
      
      // Update job with intermediate results
      await updateJobResults(jobId, {
        byPipeline: results.byPipeline,
        byCategory: results.byCategory
      });
    }
    
    // Calculate overall metrics
    results.overall.overallSuccessRate = 
      results.overall.totalTests > 0 ?
      results.overall.totalSuccesses / results.overall.totalTests : 0;
    
    let totalLatencySum = 0;
    let totalQualitySum = 0;
    let totalSuccessCount = 0;
    
    for (const pipelineResult of Object.values(results.byPipeline)) {
      if (pipelineResult.successCount > 0) {
        totalLatencySum += pipelineResult.avgLatency * pipelineResult.successCount;
        totalQualitySum += pipelineResult.avgQuality * pipelineResult.successCount;
        totalSuccessCount += pipelineResult.successCount;
      }
    }
    
    results.overall.avgLatency = 
      totalSuccessCount > 0 ? totalLatencySum / totalSuccessCount : 0;
    results.overall.avgQuality = 
      totalSuccessCount > 0 ? totalQualitySum / totalSuccessCount : 0;
    results.overall.totalDuration = Date.now() - startTime;
    
    // Update category success rates
    for (const categoryResult of Object.values(results.byCategory)) {
      const successCount = testCases
        .filter(tc => tc.category === categoryResult.category)
        .filter(tc => {
          // Count successes for this category
          return !results.errors.some(e => 
            e.topic === tc.topic && 
            e.difficulty === tc.difficulty
          );
        }).length;
      
      categoryResult.successRate = 
        categoryResult.testCount > 0 ? 
        successCount / categoryResult.testCount : 0;
    }
    
    // Complete the job
    await completeJob(jobId, results);
    
    logger.info('[PROCESS_EVAL] Evaluation completed successfully', {
      jobId,
      overall: results.overall,
      duration: results.overall.totalDuration
    });
    
  } catch (error) {
    logger.error('[PROCESS_EVAL] Fatal error during evaluation', {
      jobId,
      error
    });
    
    await failJob(
      jobId, 
      error instanceof Error ? error.message : 'Unknown error during evaluation'
    );
  }
}

/**
 * Execute a single pipeline test
 */
async function executePipelineTest(
  pipeline: string,
  topic: string,
  difficulty: string
): Promise<any> {
  const timeout = 120000; // 2 minute timeout per test
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Pipeline test timeout after ${timeout}ms`)), timeout);
  });
  
  const testPromise = async () => {
    switch (pipeline) {
      case 'boardStyle':
        // Board style only generates single questions
        // Map difficulty names
        let boardDifficulty: 'easy' | 'medium' | 'hard';
        if (difficulty === 'Basic') {
          boardDifficulty = 'easy';
        } else if (difficulty === 'Advanced') {
          boardDifficulty = 'medium';
        } else {
          boardDifficulty = 'hard';
        }
        
        const boardResult = await generateBoardStyleMCQ(
          topic,
          boardDifficulty,
          undefined // focusArea
        );
        return boardResult;
        
      case 'optimizedOrchestrator':
        // Orchestrator generates batch
        const orchestratorResult = await generateQuestionsOptimized(
          topic,
          [difficulty] as any,
          true, // useCache
          false, // useStreaming
          'evaluation-test'
        );
        
        // Extract the question for the requested difficulty
        // Cast to appropriate difficulty key
        const difficultyKey = difficulty as 'Basic' | 'Advanced' | 'Very Difficult';
        if (orchestratorResult && orchestratorResult[difficultyKey]) {
          return orchestratorResult[difficultyKey];
        }
        
        throw new Error(`No question generated for difficulty: ${difficulty}`);
        
      case 'hybridRouter':
        // Hybrid router intelligently routes
        const hybridResult = await routeHybridGeneration({
          topic,
          difficulties: [difficulty],
          urgency: 'normal',
          quality: 'standard',
          features: {},
          userId: 'evaluation-test'
        });
        
        // Extract the question - check actual structure
        if (hybridResult && hybridResult.questions && hybridResult.questions[difficulty]) {
          return hybridResult.questions[difficulty];
        }
        
        throw new Error(`No question generated for difficulty: ${difficulty}`);
        
      default:
        throw new Error(`Unknown pipeline: ${pipeline}`);
    }
  };
  
  // Race between test and timeout
  return Promise.race([testPromise(), timeoutPromise]);
}