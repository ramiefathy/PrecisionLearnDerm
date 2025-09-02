/**
 * Comprehensive Pipeline Evaluation Framework
 * Systematically tests and compares all MCQ generation pipelines
 * Measures quality, speed, reliability, and cost metrics
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { generateBoardStyleMCQ } from '../ai/boardStyleGeneration';
import { generateQuestionsOptimized } from '../ai/optimizedOrchestrator';
import { orchestrateQuestionGeneration } from '../ai/adaptedOrchestrator';
import { routeHybridGeneration } from '../ai/hybridPipelineRouter';
import * as logger from 'firebase-functions/logger';

// Evaluation test cases covering different scenarios
const TEST_CASES = [
  // Common conditions - should be fast and reliable
  {
    category: 'common',
    topic: 'Acne vulgaris',
    expectedComplexity: 'low',
    expectedLatency: { min: 5000, max: 15000 }
  },
  {
    category: 'common',
    topic: 'Atopic dermatitis',
    expectedComplexity: 'low',
    expectedLatency: { min: 5000, max: 15000 }
  },
  {
    category: 'common',
    topic: 'Psoriasis',
    expectedComplexity: 'medium',
    expectedLatency: { min: 8000, max: 20000 }
  },
  
  // Complex differential diagnosis - needs deeper reasoning
  {
    category: 'complex',
    topic: 'Vesiculobullous diseases differential diagnosis',
    expectedComplexity: 'high',
    expectedLatency: { min: 15000, max: 35000 }
  },
  {
    category: 'complex',
    topic: 'Cutaneous lymphomas',
    expectedComplexity: 'high',
    expectedLatency: { min: 15000, max: 35000 }
  },
  
  // Rare conditions - tests knowledge depth
  {
    category: 'rare',
    topic: 'Langerhans cell histiocytosis',
    expectedComplexity: 'high',
    expectedLatency: { min: 20000, max: 40000 }
  },
  {
    category: 'rare',
    topic: 'Erythropoietic protoporphyria',
    expectedComplexity: 'high',
    expectedLatency: { min: 20000, max: 40000 }
  },
  
  // Management scenarios - tests clinical reasoning
  {
    category: 'management',
    topic: 'Biologics for psoriasis',
    expectedComplexity: 'medium',
    expectedLatency: { min: 10000, max: 25000 }
  },
  {
    category: 'management',
    topic: 'Melanoma staging and treatment',
    expectedComplexity: 'high',
    expectedLatency: { min: 15000, max: 30000 }
  },
  
  // Procedural/surgical - tests practical knowledge
  {
    category: 'procedural',
    topic: 'Mohs micrographic surgery',
    expectedComplexity: 'medium',
    expectedLatency: { min: 10000, max: 25000 }
  }
];

// Quality metrics to evaluate
interface QualityMetrics {
  // Content quality
  stemLength: number;
  stemClinicalDetail: number; // 0-10 scale
  optionsHomogeneity: number; // 0-10 scale
  distractorPlausibility: number; // 0-10 scale
  explanationCompleteness: number; // 0-10 scale
  
  // Medical accuracy
  medicallyAccurate: boolean;
  followsABDGuidelines: boolean;
  appropriateDifficulty: boolean;
  
  // Educational value
  teachingValue: number; // 0-10 scale
  clinicalRelevance: number; // 0-10 scale
  
  // Technical quality
  parseSuccess: boolean;
  formatCorrect: boolean;
  noTruncation: boolean;
}

// Performance metrics
interface PerformanceMetrics {
  latency: number;
  success: boolean;
  errorType?: string;
  memoryUsage?: number;
  apiCalls?: number;
  cacheHit?: boolean;
}

// Pipeline test result
interface PipelineResult {
  pipeline: string;
  testCase: typeof TEST_CASES[0];
  performance: PerformanceMetrics;
  quality?: QualityMetrics;
  output?: any;
  timestamp: string;
}

/**
 * Evaluate content quality of generated MCQ
 */
function evaluateQuality(mcq: any): QualityMetrics {
  const metrics: QualityMetrics = {
    stemLength: 0,
    stemClinicalDetail: 0,
    optionsHomogeneity: 0,
    distractorPlausibility: 0,
    explanationCompleteness: 0,
    medicallyAccurate: true, // Default true, would need expert review
    followsABDGuidelines: true,
    appropriateDifficulty: true,
    teachingValue: 0,
    clinicalRelevance: 0,
    parseSuccess: true,
    formatCorrect: true,
    noTruncation: true
  };
  
  try {
    // Stem analysis
    const stem = mcq.stem || mcq.clinicalVignette || '';
    metrics.stemLength = stem.length;
    
    // Clinical detail scoring (basic heuristic)
    const clinicalMarkers = [
      'year-old', 'presents', 'examination', 'history',
      'symptoms', 'duration', 'location', 'treatment'
    ];
    const detailScore = clinicalMarkers.filter(marker => 
      stem.toLowerCase().includes(marker)
    ).length;
    metrics.stemClinicalDetail = Math.min(10, detailScore * 1.25);
    
    // Options analysis
    const options = mcq.options || [];
    if (Array.isArray(options)) {
      // Check homogeneity (similar length)
      const lengths = options.map((opt: any) => 
        typeof opt === 'string' ? opt.length : opt.text?.length || 0
      );
      const avgLength = lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum: number, len: number) => 
        sum + Math.abs(len - avgLength), 0
      ) / lengths.length;
      metrics.optionsHomogeneity = Math.max(0, 10 - (variance / avgLength * 10));
      
      // All options present
      metrics.formatCorrect = options.length >= 4;
    } else if (typeof options === 'object') {
      // Object format (A, B, C, D, E)
      const keys = Object.keys(options);
      metrics.formatCorrect = keys.length >= 4;
      metrics.optionsHomogeneity = 8; // Assume decent if structured
    }
    
    // Explanation analysis
    const explanation = mcq.explanation || '';
    metrics.explanationCompleteness = Math.min(10, explanation.length / 50);
    
    // Check for truncation
    metrics.noTruncation = !explanation.includes('...');
    
    // Educational value (heuristic based on content depth)
    metrics.teachingValue = (metrics.stemClinicalDetail + metrics.explanationCompleteness) / 2;
    metrics.clinicalRelevance = metrics.stemClinicalDetail;
    
    // Distractor plausibility (would need domain expertise for real evaluation)
    metrics.distractorPlausibility = metrics.optionsHomogeneity * 0.8;
    
    // ABD guidelines check
    metrics.followsABDGuidelines = 
      metrics.stemLength >= 100 &&
      metrics.formatCorrect &&
      metrics.explanationCompleteness >= 5;
    
  } catch (error) {
    metrics.parseSuccess = false;
    logger.error('Quality evaluation failed', { error });
  }
  
  return metrics;
}

/**
 * Test a single pipeline with a test case
 */
async function testPipeline(
  pipelineName: string,
  testCase: typeof TEST_CASES[0],
  pipelineFunc: Function
): Promise<PipelineResult> {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  
  const result: PipelineResult = {
    pipeline: pipelineName,
    testCase,
    performance: {
      latency: 0,
      success: false
    },
    timestamp: new Date().toISOString()
  };
  
  try {
    // Execute pipeline
    let output: any;
    
    switch (pipelineName) {
      case 'boardStyle':
        output = await generateBoardStyleMCQ(
          testCase.topic,
          'medium',
          undefined
        );
        break;
        
      case 'optimizedOrchestrator':
        output = await generateQuestionsOptimized(
          testCase.topic,
          ['Basic', 'Advanced'],
          true, // useCache
          false, // no streaming for testing
          'test-user'
        );
        break;
        
      case 'adaptedOrchestrator':
        output = await orchestrateQuestionGeneration(
          testCase.topic,
          ['Basic', 'Advanced'],
          true, // useCache
          false, // no streaming
          'test-user'
        );
        break;
        
      case 'hybridRouter':
        output = await routeHybridGeneration({
          topic: testCase.topic,
          difficulties: ['Basic', 'Advanced'],
          urgency: 'normal',
          quality: 'standard',
          features: {},
          userId: 'test-user'
        });
        break;
        
      default:
        throw new Error(`Unknown pipeline: ${pipelineName}`);
    }
    
    // Record success
    result.performance.success = true;
    result.output = output;
    
    // Evaluate quality
    if (output) {
      // Extract first question for evaluation
      let mcqToEvaluate: any;
      
      if (output.questions) {
        // Multi-difficulty format
        const firstKey = Object.keys(output.questions)[0];
        mcqToEvaluate = output.questions[firstKey];
      } else {
        // Single question format
        mcqToEvaluate = output;
      }
      
      if (mcqToEvaluate) {
        result.quality = evaluateQuality(mcqToEvaluate);
      }
    }
    
  } catch (error: any) {
    result.performance.success = false;
    result.performance.errorType = error.message || 'Unknown error';
    logger.error(`Pipeline ${pipelineName} failed`, { error, testCase });
  }
  
  // Record performance metrics
  result.performance.latency = Date.now() - startTime;
  result.performance.memoryUsage = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024; // MB
  
  return result;
}

/**
 * Run comprehensive evaluation suite
 */
export async function runComprehensiveEvaluation(): Promise<{
  results: PipelineResult[];
  summary: any;
}> {
  logger.info('Starting comprehensive pipeline evaluation');
  
  const results: PipelineResult[] = [];
  const pipelines = [
    'boardStyle',
    'optimizedOrchestrator',
    'adaptedOrchestrator',
    'hybridRouter'
  ];
  
  // Test each pipeline with each test case
  for (const pipeline of pipelines) {
    logger.info(`Testing pipeline: ${pipeline}`);
    
    for (const testCase of TEST_CASES) {
      logger.info(`Testing ${pipeline} with ${testCase.topic}`);
      
      try {
        const result = await testPipeline(pipeline, testCase, null);
        results.push(result);
        
        // Brief delay between tests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        logger.error(`Test failed for ${pipeline} - ${testCase.topic}`, { error });
      }
    }
  }
  
  // Generate summary statistics
  const summary = generateSummary(results);
  
  // Save results to Firestore
  await saveResults(results, summary);
  
  return { results, summary };
}

/**
 * Generate summary statistics from results
 */
function generateSummary(results: PipelineResult[]): any {
  const summary: any = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    byPipeline: {},
    byCategory: {},
    overall: {
      successRate: 0,
      avgLatency: 0,
      avgQuality: 0
    }
  };
  
  // Group by pipeline
  const pipelineGroups = results.reduce((acc: any, result) => {
    if (!acc[result.pipeline]) {
      acc[result.pipeline] = [];
    }
    acc[result.pipeline].push(result);
    return acc;
  }, {});
  
  // Calculate pipeline statistics
  for (const [pipeline, pipelineResults] of Object.entries(pipelineGroups)) {
    const pResults = pipelineResults as PipelineResult[];
    
    const successful = pResults.filter(r => r.performance.success);
    const avgLatency = successful.length > 0 
      ? successful.reduce((sum, r) => sum + r.performance.latency, 0) / successful.length
      : 0;
    
    const qualityScores = successful
      .filter(r => r.quality)
      .map(r => {
        const q = r.quality!;
        return (
          q.stemClinicalDetail + 
          q.optionsHomogeneity + 
          q.explanationCompleteness + 
          q.teachingValue
        ) / 4;
      });
    
    const avgQuality = qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : 0;
    
    summary.byPipeline[pipeline] = {
      totalTests: pResults.length,
      successCount: successful.length,
      successRate: successful.length / pResults.length,
      avgLatency: Math.round(avgLatency),
      avgQuality: avgQuality.toFixed(2),
      failures: pResults.filter(r => !r.performance.success).map(r => ({
        testCase: r.testCase.topic,
        error: r.performance.errorType
      }))
    };
  }
  
  // Group by category
  const categoryGroups = results.reduce((acc: any, result) => {
    const category = result.testCase.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(result);
    return acc;
  }, {});
  
  // Calculate category statistics
  for (const [category, categoryResults] of Object.entries(categoryGroups)) {
    const cResults = categoryResults as PipelineResult[];
    const successful = cResults.filter(r => r.performance.success);
    
    summary.byCategory[category] = {
      totalTests: cResults.length,
      successRate: successful.length / cResults.length,
      avgLatency: successful.length > 0
        ? Math.round(successful.reduce((sum, r) => sum + r.performance.latency, 0) / successful.length)
        : 0,
      bestPipeline: findBestPipeline(cResults)
    };
  }
  
  // Overall statistics
  const allSuccessful = results.filter(r => r.performance.success);
  summary.overall.successRate = allSuccessful.length / results.length;
  summary.overall.avgLatency = Math.round(
    allSuccessful.reduce((sum, r) => sum + r.performance.latency, 0) / allSuccessful.length
  );
  
  return summary;
}

/**
 * Find best pipeline for a set of results
 */
function findBestPipeline(results: PipelineResult[]): string {
  const pipelineScores: { [key: string]: number } = {};
  
  for (const result of results) {
    if (!pipelineScores[result.pipeline]) {
      pipelineScores[result.pipeline] = 0;
    }
    
    // Score based on success and speed
    if (result.performance.success) {
      const speedScore = Math.max(0, 50000 - result.performance.latency) / 50000 * 10;
      const qualityScore = result.quality 
        ? (result.quality.stemClinicalDetail + result.quality.explanationCompleteness) / 2
        : 5;
      
      pipelineScores[result.pipeline] += speedScore + qualityScore;
    }
  }
  
  // Return pipeline with highest score
  return Object.entries(pipelineScores)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown';
}

/**
 * Save evaluation results to Firestore
 */
async function saveResults(results: PipelineResult[], summary: any): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();
  
  // Save summary
  const summaryRef = db.collection('pipelineEvaluations').doc();
  batch.set(summaryRef, {
    ...summary,
    resultCount: results.length,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Save individual results
  for (const result of results) {
    const resultRef = db.collection('pipelineEvaluations')
      .doc(summaryRef.id)
      .collection('results')
      .doc();
    
    batch.set(resultRef, {
      ...result,
      summaryId: summaryRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  
  await batch.commit();
  logger.info(`Saved evaluation results to Firestore: ${summaryRef.id}`);
}

/**
 * Firebase Cloud Function for running evaluation
 */
export const runPipelineEvaluation = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes
    memory: '4GB' // Need more memory for comprehensive testing
  })
  .https.onCall(async (data, context) => {
    // Admin only
    if (!context.auth || context.auth.uid !== 'admin-user-id') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can run pipeline evaluation'
      );
    }
    
    try {
      const results = await runComprehensiveEvaluation();
      
      return {
        success: true,
        summary: results.summary,
        resultCount: results.results.length,
        message: 'Evaluation complete. Results saved to Firestore.'
      };
      
    } catch (error: any) {
      logger.error('Pipeline evaluation failed', { error });
      throw new functions.https.HttpsError(
        'internal',
        `Evaluation failed: ${error.message}`
      );
    }
  });