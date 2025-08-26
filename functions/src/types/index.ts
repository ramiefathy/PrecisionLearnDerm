import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Use Firebase Functions' native CallableContext type
export type CallableContext = functions.https.CallableContext;

export interface AuthenticatedContext extends CallableContext {
  auth: {
    uid: string;
    token: admin.auth.DecodedIdToken & {
      admin?: boolean;
      email?: string;
      [key: string]: any;
    };
  };
}

export interface AdminContext extends CallableContext {
  auth: {
    uid: string;
    token: admin.auth.DecodedIdToken & {
      admin: true;
      email?: string;
      [key: string]: any;
    };
  };
}

// Question types
export interface MCQOption {
  text: string;
  is_correct?: boolean;
}

export interface MCQData {
  question: string;
  answer_options: MCQOption[];
  explanation?: string;
  topic?: string;
  difficulty?: number;
  tags?: string[];
}

export interface QuestionItem {
  id?: string;
  question: string;
  options: Array<{ text: string }>;
  correctIndex: number;
  explanation: string;
  topic: string;
  subtopic?: string;
  difficulty: number;
  tags: string[];
  metadata?: {
    source?: string;
    created?: admin.firestore.Timestamp;
    updated?: admin.firestore.Timestamp;
    author?: string;
    version?: number;
    enhancementApplied?: admin.firestore.Timestamp;
    consensusScore?: number;
    improvementsApplied?: string[];
    [key: string]: any;
  };
  qualityMetrics?: QualityMetrics;
  status?: 'draft' | 'review' | 'approved' | 'rejected' | 'retired';
}

export interface QualityMetrics {
  overallScore: number;
  clinicalRelevance: number;
  diagnosticDifficulty: number;
  educationalValue: number;
  technicalQuality: number;
  contentAccuracy: number;
  clarityScore: number;
  distractorQuality: number;
  explanationQuality: number;
  abdCompliance?: number;
  boardStyleAlignment?: number;
  [key: string]: number | undefined;
}

// Review and scoring types
export interface ReviewResult {
  reviewId: string;
  correctedItem: QuestionItem;
  changes: Array<{
    field: string;
    originalValue: any;
    correctedValue: any;
    reason: string;
  }>;
  overallAssessment: string;
  qualityScore: number;
  improvementSuggestions: string[];
  reviewedAt: admin.firestore.Timestamp;
  status: 'approved' | 'needs_revision' | 'rejected';
}

export interface ScoringResult {
  scoringId: string;
  rubric: Record<string, number>;
  overallScore: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  scoredAt: admin.firestore.Timestamp;
  scorerId?: string;
}

// Knowledge Base types
export interface KBEntity {
  [key: string]: any;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface KBSearchResult {
  key: string;
  entity: KBEntity;
  score: number;
  relevance?: number;
}

export interface KBSearchResponse {
  results: KBSearchResult[];
  totalResults: number;
  query: string;
  processingTime: number;
}

// Queue and processing types
export interface QueueItem {
  id: string;
  entityName: string;
  entity: KBEntity;
  status: 'pending' | 'processing' | 'review' | 'completed' | 'failed';
  draftItem?: QuestionItem;
  reviewResult?: ReviewResult;
  scoringResult?: ScoringResult;
  priority: number;
  createdAt: admin.firestore.Timestamp;
  reviewedAt?: admin.firestore.Timestamp;
  processingStartedAt?: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  attempts: number;
  lastError?: string;
}

// Taxonomy types
export interface TopicHierarchy {
  domain: string;
  topic: string;
  subtopic?: string;
  keywords?: string[];
  difficulty?: number;
  [key: string]: any;
}

// User types
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  isAdmin?: boolean;
  preferences?: {
    difficulty?: number;
    topics?: string[];
    studyMode?: 'adaptive' | 'fixed' | 'random';
  };
  stats?: {
    totalQuestions: number;
    correctAnswers: number;
    accuracy: number;
    averageTime: number;
    streak: number;
    lastActive: admin.firestore.Timestamp;
  };
}

// SRS (Spaced Repetition System) types
export interface SRSItem {
  itemId: string;
  userId: string;
  interval: number;
  repetitions: number;
  easeFactor: number;
  dueDate: admin.firestore.Timestamp;
  lastReviewed: admin.firestore.Timestamp;
  quality: number; // 0-5 scale
}

// API Request/Response types
export interface QuestionGenerationRequest {
  entityName?: string;
  entity?: KBEntity;
  topic?: string;
  difficulty?: number;
  count?: number;
  constraints?: any[];
  options?: {
    abdCompliant?: boolean;
    boardStyle?: boolean;
    maxIterations?: number;
    qualityThreshold?: number;
  };
}

export interface QuestionGenerationResponse {
  success: boolean;
  question?: QuestionItem;
  qualityMetrics?: QualityMetrics;
  processingDetails?: {
    method: string;
    iterations: number;
    agentsUsed: string[];
    processingTime: number;
  };
  error?: string;
  quotaStatus?: {
    remaining: number;
    resetTime: number;
    exhausted: boolean;
  };
}

// Testing and validation types
export interface ValidationRule {
  name: string;
  description: string;
  validator: (question: QuestionItem) => boolean;
  weight: number;
}

export interface ValidationResult {
  isValid: boolean;
  score: number;
  issues: string[];
  passedRules: string[];
  failedRules: string[];
}

// Performance and analytics types
export interface PerformanceMetrics {
  accuracy: number;
  averageTime: number;
  difficulty: number;
  topicMastery: Record<string, number>;
  streakData: {
    current: number;
    longest: number;
    recent: number[];
  };
  sessionStats: {
    questionsAnswered: number;
    timeSpent: number;
    date: admin.firestore.Timestamp;
  }[];
}

// Error types
export interface APIError extends Error {
  code: string;
  status: number;
  details?: any;
}

// Configuration types
export interface AppConfig {
  ai: {
    geminiApiKey?: string;
    openaiApiKey?: string;
    quotaLimits: {
      daily: number;
      hourly: number;
      perRequest: number;
    };
  };
  features: {
    enableAI: boolean;
    enableSRS: boolean;
    enableAnalytics: boolean;
    maxQuestionRetries: number;
  };
  quality: {
    minimumScore: number;
    requireReview: boolean;
    autoApprovalThreshold: number;
  };
}

// Utility types
export type Timestamp = admin.firestore.Timestamp;
export type DocumentSnapshot = admin.firestore.DocumentSnapshot;
export type QuerySnapshot = admin.firestore.QuerySnapshot;
export type FieldValue = admin.firestore.FieldValue;

// Type guards for authentication
export function isAuthenticated(context: CallableContext): context is AuthenticatedContext {
  return !!(context?.auth?.uid);
}

export function isAdmin(context: CallableContext): context is AdminContext {
  return !!(context?.auth?.uid && context?.auth?.token?.admin === true);
}

// Authentication utilities (moved to util/auth.ts for consistency)
// These are kept here for backward compatibility but will be deprecated
/**
 * @deprecated Use functions from util/auth.ts instead
 */
export function requireAuthentication(context: CallableContext): AuthenticatedContext {
  if (!isAuthenticated(context)) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  return context;
}

/**
 * @deprecated Use functions from util/auth.ts instead
 */
export function requireAdmin(context: CallableContext): AdminContext {
  if (!isAdmin(context)) {
    if (!isAuthenticated(context)) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    throw new functions.https.HttpsError('permission-denied', 'Admin role required');
  }
  return context;
}

// Type guards
export function isQuestionItem(obj: any): obj is QuestionItem {
  return obj && 
    typeof obj.question === 'string' &&
    Array.isArray(obj.options) &&
    typeof obj.correctIndex === 'number' &&
    typeof obj.explanation === 'string';
}

export function isValidMCQData(obj: any): obj is MCQData {
  return obj &&
    typeof obj.question === 'string' &&
    Array.isArray(obj.answer_options) &&
    obj.answer_options.every((opt: any) => typeof opt.text === 'string');
}

// Constants
export const DIFFICULTY_LEVELS = {
  BEGINNER: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  EXPERT: 4
} as const;

export const QUESTION_STATUS = {
  DRAFT: 'draft',
  REVIEW: 'review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETIRED: 'retired'
} as const;

export const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  REVIEW: 'review',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const;

export type DifficultyLevel = typeof DIFFICULTY_LEVELS[keyof typeof DIFFICULTY_LEVELS];
export type QuestionStatus = typeof QUESTION_STATUS[keyof typeof QUESTION_STATUS];
export type QueueStatus = typeof QUEUE_STATUS[keyof typeof QUEUE_STATUS];