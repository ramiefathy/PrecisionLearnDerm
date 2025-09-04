/**
 * Evaluation Job Manager
 * Manages async pipeline evaluation jobs with comprehensive tracking
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// Initialize Firestore if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Interfaces
export interface EvaluationJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: {
    basicCount: number;
    advancedCount: number;
    veryDifficultCount: number;
    pipelines: string[];
    topics: string[];
  };
  testCases?: Array<{
    pipeline: string;
    topic: string;
    difficulty: string;
    category: string;
  }>;
  progress: {
    totalTests: number;
    completedTests: number;
    currentPipeline?: string;
    currentTopic?: string;
    currentDifficulty?: string;
    lastProcessedIndex?: number;
  };
  // Cancellation support
  cancelRequested?: boolean;
  cancellationReason?: string;
  results?: {
    byPipeline: Record<string, PipelineResult>;
    byCategory: Record<string, CategoryResult>;
    overall: OverallMetrics;
    errors: ErrorEntry[];
  };
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  userId: string;
}

export interface PipelineResult {
  pipeline: string;
  successRate: number;
  avgLatency: number;
  avgQuality: number;
  totalTests: number;
  successCount: number;
  failures: ErrorEntry[];
}

export interface CategoryResult {
  category: string;
  successRate: number;
  avgLatency: number;
  avgQuality: number;
  testCount: number;
}

export interface OverallMetrics {
  totalTests: number;
  totalSuccesses: number;
  overallSuccessRate: number;
  avgLatency: number;
  avgQuality: number;
  totalDuration: number;
}

export interface ErrorEntry {
  timestamp: string;
  pipeline: string;
  topic: string;
  difficulty: string;
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
  context: {
    attemptNumber: number;
    partialResult?: any;
    apiResponses?: string[];
  };
}

export interface TestCase {
  topic: string;
  difficulty: 'Basic' | 'Advanced' | 'Very Difficult';
  category: string;
}

// Job Management Functions

/**
 * Create a new evaluation job
 */
export async function createEvaluationJob(
  userId: string,
  config: EvaluationJob['config']
): Promise<string> {
  try {
    // Generate all test cases upfront for each pipeline
    const allTestCases: EvaluationJob['testCases'] = [];
    
    for (const pipeline of config.pipelines) {
      const pipelineTestCases = generateTestCases(config);
      pipelineTestCases.forEach(testCase => {
        allTestCases?.push({
          pipeline,
          topic: testCase.topic,
          difficulty: testCase.difficulty,
          category: testCase.category
        });
      });
    }
    
    const totalTests = allTestCases?.length || 0;

    const job: Omit<EvaluationJob, 'id'> = {
      status: 'pending',
      config,
      testCases: allTestCases,
      progress: {
        totalTests,
        completedTests: 0
      },
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      userId
    };

    const docRef = await db.collection('evaluationJobs').add(job);
    
    logger.info('[EVAL_MANAGER] Created evaluation job', {
      jobId: docRef.id,
      config,
      totalTests,
      testCasesCount: allTestCases?.length
    });

    return docRef.id;
  } catch (error) {
    logger.error('[EVAL_MANAGER] Failed to create job', { error });
    throw error;
  }
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: Partial<EvaluationJob['progress']>,
  status?: EvaluationJob['status']
): Promise<void> {
  try {
    const updates: any = {
      updatedAt: admin.firestore.Timestamp.now()
    };

    if (progress) {
      // Update individual progress fields, avoiding overwrite of atomic completedTests
      Object.keys(progress).forEach(key => {
        if (key !== 'completedTests') {
          updates[`progress.${key}`] = (progress as any)[key];
        }
      });
    }

    if (status) {
      updates['status'] = status;
      if (status === 'completed' || status === 'failed') {
        updates['completedAt'] = admin.firestore.Timestamp.now();
      }
    }

    await db.collection('evaluationJobs').doc(jobId).update(updates);

    logger.info('[EVAL_MANAGER] Updated job progress', {
      jobId,
      progress,
      status
    });
  } catch (error) {
    logger.error('[EVAL_MANAGER] Failed to update job progress', { jobId, error });
    throw error;
  }
}

/**
 * Add error to job
 */
export async function addErrorToJob(
  jobId: string,
  error: ErrorEntry
): Promise<void> {
  try {
    await db.collection('evaluationJobs').doc(jobId).update({
      'results.errors': admin.firestore.FieldValue.arrayUnion(error),
      updatedAt: admin.firestore.Timestamp.now()
    });

    logger.error('[EVAL_MANAGER] Added error to job', {
      jobId,
      error: error.error.message,
      context: error.context
    });
  } catch (error) {
    logger.error('[EVAL_MANAGER] Failed to add error to job', { jobId, error });
  }
}

/**
 * Update job results
 */
export async function updateJobResults(
  jobId: string,
  results: Partial<EvaluationJob['results']>
): Promise<void> {
  try {
    const updates: any = {
      updatedAt: admin.firestore.Timestamp.now()
    };

    // Merge results
    if (results) {
      Object.keys(results).forEach(key => {
        updates[`results.${key}`] = results[key as keyof typeof results];
      });
    }

    await db.collection('evaluationJobs').doc(jobId).update(updates);

    logger.info('[EVAL_MANAGER] Updated job results', {
      jobId,
      resultKeys: results ? Object.keys(results) : []
    });
  } catch (error) {
    logger.error('[EVAL_MANAGER] Failed to update job results', { jobId, error });
    throw error;
  }
}

/**
 * Complete a job with final results
 */
export async function completeJob(
  jobId: string,
  results: EvaluationJob['results']
): Promise<void> {
  try {
    await db.collection('evaluationJobs').doc(jobId).update({
      status: 'completed',
      results,
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    logger.info('[EVAL_MANAGER] Completed job', {
      jobId,
      overall: results?.overall
    });
  } catch (error) {
    logger.error('[EVAL_MANAGER] Failed to complete job', { jobId, error });
    throw error;
  }
}

/**
 * Fail a job with error
 */
export async function failJob(
  jobId: string,
  error: string
): Promise<void> {
  try {
    await db.collection('evaluationJobs').doc(jobId).update({
      status: 'failed',
      'results.errors': admin.firestore.FieldValue.arrayUnion({
        timestamp: new Date().toISOString(),
        error: { message: error },
        context: { fatal: true }
      }),
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    logger.error('[EVAL_MANAGER] Failed job', { jobId, error });
  } catch (error) {
    logger.error('[EVAL_MANAGER] Failed to mark job as failed', { jobId, error });
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<EvaluationJob | null> {
  try {
    const doc = await db.collection('evaluationJobs').doc(jobId).get();
    
    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data()
    } as EvaluationJob;
  } catch (error) {
    logger.error('[EVAL_MANAGER] Failed to get job', { jobId, error });
    throw error;
  }
}

/**
 * Generate test cases based on config
 */
export function generateTestCases(config: EvaluationJob['config']): TestCase[] {
  const testCases: TestCase[] = [];
  const categories = {
    'Psoriasis': 'inflammatory',
    'Melanoma diagnosis': 'neoplastic',
    'Atopic dermatitis': 'inflammatory',
    'Drug eruptions': 'reactive',
    'Pemphigus vulgaris': 'vesiculobullous',
    'Acne vulgaris': 'inflammatory',
    'Basal cell carcinoma': 'neoplastic',
    'Contact dermatitis': 'reactive',
    'Vitiligo': 'pigmentary',
    'Alopecia areata': 'hair'
  };

  // Use provided topics or defaults
  const topics = config.topics.length > 0 ? 
    config.topics : 
    Object.keys(categories).slice(0, 5);

  for (const topic of topics) {
    const category = categories[topic as keyof typeof categories] || 'general';
    
    // Generate Basic questions
    for (let i = 0; i < config.basicCount; i++) {
      testCases.push({ topic, difficulty: 'Basic', category });
    }
    
    // Generate Advanced questions
    for (let i = 0; i < config.advancedCount; i++) {
      testCases.push({ topic, difficulty: 'Advanced', category });
    }
    
    // Generate Very Difficult questions
    for (let i = 0; i < config.veryDifficultCount; i++) {
      testCases.push({ topic, difficulty: 'Very Difficult', category });
    }
  }

  return testCases;
}

/**
 * Calculate quality score based on MCQ properties
 * Returns a percentage score (0-100)
 */
export function calculateQualityScore(mcq: any): number {
  let score = 0;
  const maxScore = 10;
  
  // Check for required fields (4 points)
  if (mcq.stem && mcq.stem.length > 50) score += 1;
  if (mcq.options && (mcq.options.length === 5 || Object.keys(mcq.options).length === 5)) score += 1;
  // Treat 0 as a valid correct answer index
  if (mcq.correctAnswer !== undefined && mcq.correctAnswer !== null && mcq.correctAnswer !== '') score += 1;
  if (mcq.explanation && mcq.explanation.length > 100) score += 1;
  
  // Check for clinical relevance (2 points)
  const clinicalKeywords = ['patient', 'diagnosis', 'treatment', 'presents', 'examination'];
  const hasClinicalContext = clinicalKeywords.some(keyword => 
    mcq.stem?.toLowerCase().includes(keyword)
  );
  if (hasClinicalContext) score += 2;
  
  // Check for proper distractor quality (2 points)
  if (mcq.options && (mcq.options.length === 5 || Object.keys(mcq.options).length === 5)) {
    const optionsArray = Array.isArray(mcq.options) ? mcq.options : Object.values(mcq.options);
    const hasReasonableLength = optionsArray.every((opt: any) => 
      opt && typeof opt === 'string' && opt.length > 5 && opt.length < 200
    );
    if (hasReasonableLength) score += 1;
    
    const hasVariedOptions = new Set(optionsArray).size === 5;
    if (hasVariedOptions) score += 1;
  }
  
  // Check for explanation quality (2 points)
  if (mcq.explanation) {
    if (mcq.explanation.length > 200) score += 1;
    const hasReferences = mcq.explanation.includes('according to') || 
                          mcq.explanation.includes('studies') ||
                          mcq.explanation.includes('guidelines');
    if (hasReferences) score += 1;
  }
  
  // Return percentage (0-100) instead of 0-10
  return (score / maxScore) * 100;
}
