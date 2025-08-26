/**
 * Shared TypeScript type definitions for PrecisionLearnDerm
 * Centralizes common interfaces to prevent duplication and ensure consistency
 */

import { CallableContext } from 'firebase-functions/v1/https';

// =======================
// AUTH & CONTEXT TYPES
// =======================

// Use a custom interface instead of extending CallableContext to avoid conflicts
export interface FunctionContext {
  auth?: {
    uid?: string;
    token?: {
      admin?: boolean;
      email?: string;
      aud?: string;
      auth_time?: number;
      exp?: number;
      firebase?: any;
      iat?: number;
      iss?: string;
      sub?: string;
      [key: string]: any;
    };
  };
  [key: string]: any;
}

// Mock context for testing
export interface MockCallableContext {
  auth?: {
    uid?: string;
    token?: {
      admin?: boolean;
      email?: string;
      aud?: string;
      auth_time?: number;
      exp?: number;
      firebase?: any;
      iat?: number;
      iss?: string;
      sub?: string;
      [key: string]: any;
    };
  };
  [key: string]: any;
}

// =======================
// AI PIPELINE TYPES
// =======================

export interface QuestionRequest {
  topic: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  learningObjectives?: string[];
  constraints?: string[];
  boardStyle?: 'usmle_step1' | 'usmle_step2' | 'comlex' | 'abim' | 'abfm';
  count?: number;
}

export interface QuestionResult {
  id?: string;
  question?: Question;
  qualityMetrics?: QualityMetrics;
  processingDetails?: ProcessingDetails;
  success: boolean;
  error?: string;
  quotaStatus?: QuotaStatus;
}

export interface QualityMetrics {
  accuracy: number;
  clarity: number;
  difficulty: number;
  relevance: number;
  overallScore: number;
  medicalAccuracy?: number;
  explanation?: number;
  abdCompliance?: number;
  structure?: number;
  clinicalRealism?: number;
}

export interface ProcessingDetails {
  processingTime: number;
  model: string;
  temperature: number;
  tokens: number;
  retryCount?: number;
  cacheHit?: boolean;
}

export interface QuotaStatus {
  remainingQuota: number;
  dailyUsage: number;
  rateLimited: boolean;
}

// =======================
// QUESTION TYPES
// =======================

export interface Question {
  id?: string;
  question: string;
  choices: string[];
  correct: number;
  explanation: string;
  topic?: string;
  topicIds?: string[];
  difficulty?: number;
  metadata?: QuestionMetadata;
  status?: 'draft' | 'active' | 'retired';
  quality?: QualityMetrics;
}

export interface QuestionMetadata {
  source?: string;
  board_style?: string;
  created_at?: Date;
  updated_at?: Date;
  author?: string;
  reviewedBy?: string;
  version?: number;
}

// =======================
// QUALITY ORCHESTRATOR TYPES
// =======================

export interface QualityDeficiency {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}

export interface QualityAssessment {
  overallScore: number;
  deficiencies: QualityDeficiency[];
  recommendations: string[];
  passesThreshold: boolean;
}

// Index signature interfaces for quality orchestrator
export interface QualityFixes {
  [key: string]: string;
  explanation: string;
  medicalAccuracy: string;
  structure: string;
  abdCompliance: string;
  clinicalRealism: string;
}

export interface QualityWeights {
  [key: string]: number;
  medicalAccuracy: number;
  explanation: number;
  abdCompliance: number;
  structure: number;
  clinicalRealism: number;
}

export interface EnhancementMapping {
  [key: string]: string;
  explanation: string;
  medicalAccuracy: string;
  structure: string;
  abdCompliance: string;
  clinicalRealism: string;
}

export interface PromptTemplates {
  [key: string]: string;
  explanation: string;
  medicalAccuracy: string;
  structure: string;
  abdCompliance: string;
  clinicalRealism: string;
}

export interface EnhancementTypes {
  [key: string]: any;
  explanation_enhance: any;
  medical_review: any;
  structure_fix: any;
  abd_enhance: any;
  realism_improve: any;
}

export interface EnhancementWeights {
  [key: string]: number;
  explanation_enhance: number;
  medical_review: number;
  structure_fix: number;
  abd_enhance: number;
  realism_improve: number;
}

// =======================
// PERSONALIZATION ENGINE TYPES
// =======================

export interface AbilityEstimate {
  theta: number;
  confidence: number;
  lastUpdated: Date;
  responseCount: number;
}

export interface SRSState {
  interval: number;
  easeFactor: number;
  nextReview: Date;
  reviewCount: number;
  lastAccuracy: number;
}

export interface UserStats {
  totalAttempts: number;
  correctAnswers: number;
  accuracy: number;
  streakDays: number;
  lastActivity: Date;
}

export interface UserPreferences {
  studyDuration: number;
  difficulty: 'adaptive' | 'easy' | 'medium' | 'hard';
  focusAreas: string[];
  notifications: boolean;
  dailyGoal: number;
}

// =======================
// ITEM MANAGEMENT TYPES
// =======================

export interface ItemProposal {
  question: Question;
  source: string;
  priority: number;
  metadata: any;
}

export interface ItemRevision {
  itemId: string;
  changes: Partial<Question>;
  reason: string;
  reviewerId?: string;
}

// =======================
// API RESPONSE TYPES
// =======================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId: string;
    timestamp: Date;
    processingTime: number;
  };
}

// =======================
// VALIDATION TYPES
// =======================

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationSchema {
  [key: string]: {
    required?: boolean;
    type?: string;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  };
}

// =======================
// MONITORING TYPES
// =======================

export interface MetricEvent {
  event: string;
  timestamp: Date;
  userId?: string;
  metadata?: any;
  duration?: number;
}

export interface PerformanceMetrics {
  responseTime: number;
  memoryUsage: number;
  cpuUsage: number;
  errorRate: number;
}

// =======================
// USER ACTIVITY TRACKING TYPES
// =======================

export interface UserActivity {
  id?: string;
  userId: string;
  type: 'quiz_completion' | 'flashcard_session' | 'mock_exam_attempt' | 'study_session' | 'question_answered';
  timestamp: Date;
  data: {
    title: string;
    score?: number;
    totalQuestions?: number;
    correctAnswers?: number;
    timeSpent?: number; // in seconds
    difficulty?: string;
    topicIds?: string[];
    details?: any;
  };
  metadata?: {
    sessionId?: string;
    deviceType?: string;
    platform?: string;
  };
}

export interface ActivitySummary {
  totalActivities: number;
  recentActivities: UserActivity[];
  streakDays: number;
  lastActivity?: Date;
  activityByType: Record<string, number>;
}

// =======================
// CACHE TYPES
// =======================

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: Date;
  ttl: number;
}

export interface CacheOptions {
  ttl?: number;
  namespace?: string;
  compression?: boolean;
}

// =======================
// PIPELINE OUTPUT TYPES
// =======================

export interface PipelineOutputs {
  generation: {
    method: 'orchestrated' | 'board-style' | 'simplified';
    model: string;
    prompt: string;
    rawOutput: string;
    parsedSuccess: boolean;
    entityUsed?: string;
    completenessScore?: number;
    timestamp: string;
    duration: number;
  };
  
  webSearch?: {
    performed: boolean;
    query: string;
    timestamp: string;
    duration: number;
    ncbi: {
      searched: boolean;
      resultCount: number;
      topResults: Array<{
        title: string;
        abstract?: string;
        pmid?: string;
        relevanceScore?: number;
      }>;
      error?: string;
      duration: number;
    };
    openAlex: {
      searched: boolean;
      resultCount: number;
      topResults: Array<{
        title: string;
        abstract?: string;
        doi?: string;
        relevanceScore?: number;
      }>;
      error?: string;
      duration: number;
    };
    cachedResult: boolean;
  };
  
  review?: {
    performed: boolean;
    timestamp: string;
    duration: number;
    feedback: string[];
    suggestions: string[];
    qualityIssues: string[];
    overallAssessment: 'excellent' | 'good' | 'needs-improvement' | 'poor';
  };
  
  scoring?: {
    performed: boolean;
    timestamp: string;
    duration: number;
    rubric: {
      clinicalRelevance: number;
      clarity: number;
      singleBestAnswer: number;
      difficulty: number;
      educationalValue: number;
    };
    totalScore: number;
    maxScore: number;
    percentage: number;
    passed: boolean;
    threshold: number;
  };
  
  refinements?: Array<{
    iteration: number;
    timestamp: string;
    duration: number;
    trigger: 'low-score' | 'review-feedback' | 'quality-issue';
    previousScore: number;
    changes: string[];
    newScore: number;
    improved: boolean;
  }>;
  
  performance: {
    totalDuration: number;
    apiCalls: number;
    cacheHits: number;
    retries: number;
    errors: string[];
    modelUsage: {
      'gemini-2.5-pro': number;
      'gemini-2.5-flash': number;
    };
  };
}

export interface DetailedOrchestrationResult {
  questions: { [key: string]: any };
  pipelineData: {
    sessionId: string;
    startTime: string;
    endTime: string;
    totalDuration: number;
    pipelineType: 'orchestrated' | 'simplified';
    stages: {
      contextGathering?: {
        performed: boolean;
        startTime: string;
        duration: number;
        kbEntity?: string;
        completenessScore?: number;
        cachedHit: boolean;
        error?: string;
      };
      webSearch?: {
        performed: boolean;
        startTime: string;
        duration: number;
        query: string;
        ncbi: {
          searched: boolean;
          resultCount: number;
          topResults: Array<{
            title: string;
            abstract?: string;
            pmid?: string;
          }>;
          duration: number;
          error?: string;
        };
        openAlex: {
          searched: boolean;
          resultCount: number;
          topResults: Array<{
            title: string;
            doi?: string;
          }>;
          duration: number;
          error?: string;
        };
        cachedResult: boolean;
      };
      drafting: {
        performed: boolean;
        startTime: string;
        duration: number;
        model: string;
        prompt: string;
        rawResponse: string;
        parsedSuccess: boolean;
        error?: string;
      };
      review?: {
        performed: boolean;
        startTime: string;
        duration: number;
        feedback: string[];
        suggestions: string[];
        qualityIssues: string[];
        overallAssessment: string;
        error?: string;
      };
      scoring?: {
        performed: boolean;
        startTime: string;
        duration: number;
        rubric: {
          clinicalRelevance: number;
          clarity: number;
          singleBestAnswer: number;
          difficulty: number;
          educationalValue: number;
        };
        totalScore: number;
        passed: boolean;
        error?: string;
      };
      refinements?: Array<{
        iteration: number;
        trigger: string;
        previousScore: number;
        changes: string[];
        newScore: number;
        duration: number;
      }>;
    };
    performance: {
      totalDuration: number;
      apiCalls: number;
      cacheHits: number;
      modelTokensUsed: number;
      errors: string[];
    };
  };
}