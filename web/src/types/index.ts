import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

// User and Authentication types
export interface UserProfile {
  displayName: string;
  email: string;
  createdAt: Timestamp | number;
  role?: 'admin' | 'user';
  isAdmin?: boolean;
  preferences: {
    learningPace: 'slow' | 'steady' | 'medium' | 'fast' | 'accelerated';
    difficulty: number;
    topics: string[];
    studyMode: 'adaptive' | 'fixed' | 'random';
    soundEnabled: boolean;
    darkMode: boolean;
  };
  stats: {
    totalQuestions: number;
    correctAnswers: number;
    accuracy: number;
    averageTime: number;
    streak: number;
    longestStreak: number;
    xpPoints: number;
    level: number;
    weakTopics: string[];
    strongTopics: string[];
    studyStreak: number;
    lastStudied: Timestamp | number;
  };
}

// Evaluation Dashboard Extensions
export type PipelineId = 'boardStyle' | 'optimizedOrchestrator' | 'hybridRouter' | string;

export interface ScoreSample {
  ai: number | null;
  latency: number;
  ready: string | null;
  createdAt: number;
  topic: string;
  difficulty: string;
  pipeline: PipelineId;
  id?: string;
}

export interface PipelineAggregate {
  pipeline: PipelineId;
  avgAI: number;
  p50AI: number;
  p90AI: number;
  avgLatency: number;
  p50Latency: number;
  p90Latency: number;
  testCount: number;
  readiness: { ready: number; minor: number; major: number; reject: number };
}

export interface TopicDifficultyCell {
  topic: string;
  difficulty: string;
  successRate: number; // 0..1
  ai: number;          // 0..100
  latency: number;     // ms
  count: number;
}

export type Metric = 'ai' | 'latency' | 'successRate';

export interface EvaluationFilters {
  pipelines: PipelineId[];
  topics: string[];
  difficulties: string[];
  timeRange?: { from: number; to: number };
}

// Question and Quiz types
export interface QuestionOption {
  text: string;
}

export interface QuestionItem {
  id: string;
  question: string;
  options: QuestionOption[];
  correctIndex: number;
  explanation: string;
  topic: string;
  subtopic?: string;
  difficulty: number;
  tags: string[];
  status?: 'draft' | 'review' | 'approved' | 'rejected' | 'retired';
  metadata?: Record<string, unknown>;
  qualityMetrics?: {
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
  };
}

export interface QuizConfiguration {
  questionCount: number;
  topicIds: string[];
  difficulty: number;
  mode: 'tutor' | 'test' | 'flashcards' | 'mock_exam';
  timeLimit?: number;
  showExplanations: boolean;
  randomizeQuestions: boolean;
  allowReview: boolean;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  configId: string;
  questions: QuestionItem[];
  answers: (number | null)[];
  startTime: Timestamp;
  endTime?: Timestamp;
  score?: number;
  timeSpent: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  analytics?: {
    timePerQuestion: number[];
    difficultyProgression: number[];
    topicPerformance: Record<string, { correct: number; total: number }>;
  };
}

// Store types
export interface AppState {
  authUser: User | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  currentQuiz: QuizConfiguration | null;
  currentAttempt: QuizAttempt | null;
  currentIndex: number;
  isLoading: boolean;
  error: string | null;
}

export interface AppActions {
  setAuthUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setProfileLoading: (loading: boolean) => void;
  setCurrentQuiz: (quiz: QuizConfiguration | null) => void;
  setCurrentAttempt: (attempt: QuizAttempt | null) => void;
  answerQuestion: (index: number, answer: number) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// API Response types
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface QuestionGenerationResponse {
  success: boolean;
  question?: QuestionItem;
  error?: string;
  processingDetails?: {
    method: string;
    iterations: number;
    agentsUsed: string[];
    processingTime: number;
  };
}

// Personalization Engine types
export interface NextItemRequest {
  userId?: string; // Make optional for backward compatibility
  difficulty?: number;
  topicIds?: string[]; // Legacy topic filtering
  topicFilter?: string[]; // Legacy topic filtering
  taxonomyFilter?: { // New taxonomy filtering
    category?: string;
    subcategory?: string;
    subSubcategory?: string;
    entity?: string;
  };
  excludeIds?: string[];
  limit?: number; // Add optional limit field
  [key: string]: unknown; // Allow additional fields for backward compatibility
}

export interface NextItemResponse extends APIResponse {
  item?: QuestionItem;
  adaptationData?: {
    userAbility: number;
    itemDifficulty: number;
    expectedProbability: number;
  };
}

export interface RecordAnswerRequest {
  userId?: string; // Make optional for backward compatibility
  itemId: string;
  answer?: number; // Make optional
  correctAnswer?: number; // Make optional for backward compatibility
  timeSpent?: number; // Make optional
  correct?: boolean; // Add optional field for existing usage
  chosenIndex?: number; // Add missing field from existing usage
  timeToAnswer?: number; // Add alternative field name for timeSpent
  timeToAnswerSec?: number; // Add field from existing usage
  correctIndex?: number; // Add field from existing usage
  topicIds?: string[]; // Add field from existing usage
  confidence?: 'Low' | 'Medium' | 'High'; // Add missing field from existing usage
  sessionType?: 'quiz' | 'flashcard' | 'mock_exam'; // Add missing field from existing usage
  sessionData?: {
    totalQuestions?: number;
    currentQuestionIndex?: number;
    topicIds?: string[];
    sessionId?: string;
    sessionTitle?: string;
  };
  // Index signature for backward compatibility with additional fields
  [key: string]: unknown;
}

export interface SRSUpdateRequest {
  userId: string;
  itemId: string;
  correct: boolean;
  responseTime: number;
}

export interface AbilityUpdateRequest {
  userId: string;
  responses: Array<{
    itemId: string;
    correct: boolean;
    difficulty: number;
  }>;
}

// Quality Management types
export interface QualityFeedbackRequest {
  itemId: string;
  userId?: string; // Make optional for backward compatibility
  feedbackType?: 'quality' | 'difficulty' | 'content' | 'explanation'; // Make optional
  rating?: number; // Make optional
  comment?: string;
  questionQuality?: number; // Add optional field for existing usage
  explanationQuality?: number; // Add missing field from existing usage
  // Additional fields from existing usage
  difficultyRating?: number;
  clarityRating?: number;
  relevanceRating?: number;
  reportedIssues?: string[];
  feedbackText?: string;
  // Index signature for backward compatibility with additional fields
  [key: string]: unknown;
}

export interface QualityReviewItem {
  id: string;
  itemId: string;
  flagReason: string;
  reportCount: number;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Timestamp;
}

export interface QualityAnalytics {
  averageRating: number;
  totalFeedback: number;
  qualityDistribution: Record<string, number>;
  topIssues: Array<{ issue: string; count: number }>;
}

// Knowledge Base types
export interface KBSearchRequest {
  query: string;
  limit?: number;
  filterBy?: string;
  topicFilter?: string[];
}

export interface KBSearchResponse extends APIResponse {
  results?: Array<{
    id: string;
    entity: string;
    description: string;
    relevanceScore: number;
    completenessScore: number;
  }>;
  totalResults?: number;
}

// Items Management types
export interface ItemProposeRequest {
  topicIds: string[];
  priority?: number;
  requestedBy?: string;
}

export interface ItemPromoteRequest {
  draftId: string;
}

export interface ItemReviseRequest {
  itemId: string;
  instructions: string;
}

export interface ItemGetResponse extends APIResponse {
  item?: QuestionItem;
}

// Admin Management types
export interface AdminUserRequest {
  email: string;
}

export interface GrantAdminRoleRequest {
  email: string;
  setupKey: string;
}

export interface QuestionQueueResponse extends APIResponse {
  questions?: Array<{
    id: string;
    question: QuestionItem;
    status: 'pending' | 'review' | 'approved' | 'rejected';
    createdAt: Timestamp;
    reviewedBy?: string;
    reviewNotes?: string;
  }>;
  totalCount?: number;
}

export interface QuestionBankStats {
  totalQuestions: number;
  questionsByStatus: Record<string, number>;
  questionsByTopic: Record<string, number>;
  averageQuality: number;
  recentActivity: Array<{
    action: string;
    count: number;
    date: string;
  }>;
}

export interface TaxonomyItem {
  id: string;
  name: string;
  parent?: string;
  level: number;
  completeness: number;
}

// Activities Management types
export interface ActivityLogRequest {
  userId: string;
  action: string;
  context?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ActivitySummaryResponse extends APIResponse {
  summary?: {
    totalActivities: number;
    userActivities: number;
    recentActivity: Array<{
      action: string;
      timestamp: Timestamp;
      userId: string;
    }>;
  };
}

// Monitoring types
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    firestore: boolean;
    geminiApi: boolean;
    authentication: boolean;
  };
  timestamp: string;
  uptime: number;
}

export interface MetricsResponse extends APIResponse {
  metrics?: {
    performance: {
      averageResponseTime: number;
      errorRate: number;
      throughput: number;
    };
    usage: {
      totalRequests: number;
      activeUsers: number;
      peakConcurrency: number;
    };
  };
}

// Performance and Analytics types
export interface PerformanceData {
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
    date: Timestamp;
  }[];
}

export interface TopicHierarchy {
  domain: string;
  topic: string;
  subtopic?: string;
  keywords?: string[];
  difficulty?: number;
}

// Feedback and Toast types
export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
}

export interface FeedbackData {
  questionId: string;
  userId: string;
  type: 'quality' | 'content' | 'difficulty' | 'explanation';
  rating: number;
  comment?: string;
  timestamp: Timestamp;
}

// Component Props types
export interface QuestionCardProps {
  question: QuestionItem;
  selectedAnswer: number | null;
  onAnswerSelect: (answerIndex: number) => void;
  showExplanation: boolean;
  disabled?: boolean;
}

export interface NavigationButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

// Admin types
export interface AdminStats {
  totalQuestions: number;
  questionsByStatus: Record<string, number>;
  questionsByTopic: Record<string, number>;
  userStats: {
    totalUsers: number;
    activeUsers: number;
    adminUsers: number;
  };
  performanceMetrics: {
    averageAccuracy: number;
    averageTimePerQuestion: number;
    popularTopics: string[];
  };
}

export interface QueueItem {
  id: string;
  entityName: string;
  status: 'pending' | 'processing' | 'review' | 'completed' | 'failed';
  priority: number;
  createdAt: Timestamp;
  processingStartedAt?: Timestamp;
  completedAt?: Timestamp;
  attempts: number;
  lastError?: string;
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

export const QUIZ_MODES = {
  TUTOR: 'tutor',
  TEST: 'test',
  FLASHCARDS: 'flashcards',
  MOCK_EXAM: 'mock_exam'
} as const;

export type DifficultyLevel = typeof DIFFICULTY_LEVELS[keyof typeof DIFFICULTY_LEVELS];
export type QuestionStatus = typeof QUESTION_STATUS[keyof typeof QUESTION_STATUS];
export type QuizMode = typeof QUIZ_MODES[keyof typeof QUIZ_MODES];

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Advanced backward compatibility types
export type BackwardCompatible<T> = T & Record<string, unknown>;

export type FlexibleRequest<
  T,
  OptionalKeys extends keyof T = never
> = Omit<T, OptionalKeys> &
  Partial<Pick<T, OptionalKeys>> &
  Record<string, unknown>;

// Legacy-compatible versions of request types
export type LegacyQualityFeedbackRequest = FlexibleRequest<
  QualityFeedbackRequest, 
  'userId' | 'feedbackType' | 'comment' | 'questionQuality' | 'explanationQuality'
>;

export type LegacyRecordAnswerRequest = FlexibleRequest<
  RecordAnswerRequest,
  'correct' | 'chosenIndex' | 'timeToAnswer' | 'confidence' | 'sessionType' | 'sessionData'
>;

// Strict versions for new implementations
export interface StrictQualityFeedbackRequest {
  itemId: string;
  userId: string;
  feedbackType: 'quality' | 'difficulty' | 'content' | 'explanation';
  rating: number;
  comment?: string;
  questionQuality: number;
  explanationQuality: number;
}

export interface StrictRecordAnswerRequest {
  userId: string;
  itemId: string;
  answer: number;
  correctAnswer: number;
  timeSpent: number;
  correct: boolean;
  chosenIndex: number;
  confidence?: 'Low' | 'Medium' | 'High';
  sessionType?: 'quiz' | 'flashcard' | 'mock_exam';
  sessionData?: {
    totalQuestions: number;
    currentQuestionIndex: number;
    topicIds: string[];
    sessionId: string;
    sessionTitle: string;
  };
}

// Type guards and validators
export function isQuestionItem(obj: unknown): obj is QuestionItem {
  if (typeof obj !== 'object' || obj === null) return false;
  const q = obj as Partial<QuestionItem>;
  return typeof q.id === 'string' &&
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    typeof q.correctIndex === 'number' &&
    typeof q.explanation === 'string';
}

export function isUserProfile(obj: unknown): obj is UserProfile {
  if (typeof obj !== 'object' || obj === null) return false;
  const u = obj as Partial<UserProfile>;
  return typeof u.displayName === 'string' &&
    typeof u.email === 'string' &&
    typeof u.preferences === 'object' && u.preferences !== undefined &&
    typeof u.stats === 'object' && u.stats !== undefined;
}

export function isValidQualityFeedbackRequest(obj: unknown): obj is QualityFeedbackRequest {
  if (typeof obj !== 'object' || obj === null) return false;
  const q = obj as Partial<QualityFeedbackRequest>;
  return typeof q.itemId === 'string' &&
    (q.rating === undefined || (typeof q.rating === 'number' && q.rating >= 1 && q.rating <= 5)) &&
    (q.questionQuality === undefined || (typeof q.questionQuality === 'number' && q.questionQuality >= 1 && q.questionQuality <= 5)) &&
    (q.explanationQuality === undefined || (typeof q.explanationQuality === 'number' && q.explanationQuality >= 1 && q.explanationQuality <= 5));
}

export function isValidRecordAnswerRequest(obj: unknown): obj is RecordAnswerRequest {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Partial<RecordAnswerRequest>;
  return typeof r.itemId === 'string' &&
    (typeof r.answer === 'number' || typeof r.chosenIndex === 'number' || r.answer === undefined) &&
    (typeof r.timeSpent === 'number' || typeof r.timeToAnswer === 'number' || typeof r.timeToAnswerSec === 'number' || r.timeSpent === undefined);
}

// Transformation utilities for backward compatibility
export function normalizeQualityFeedbackRequest(data: unknown): StrictQualityFeedbackRequest {
  if (!isValidQualityFeedbackRequest(data)) {
    throw new Error('Invalid quality feedback request data');
  }

  const rating = data.rating ?? data.questionQuality ?? data.explanationQuality ?? 3;

  return {
    itemId: data.itemId,
    userId: data.userId || 'anonymous',
    feedbackType: data.feedbackType || 'quality',
    rating,
    comment: data.comment || data.feedbackText,
    questionQuality: data.questionQuality ?? rating,
    explanationQuality: data.explanationQuality ?? rating
  };
}

export function normalizeRecordAnswerRequest(data: unknown): StrictRecordAnswerRequest {
  if (!isValidRecordAnswerRequest(data)) {
    throw new Error('Invalid record answer request data');
  }

  const chosenIndex = data.chosenIndex ?? data.answer ?? 0;
  const timeSpent = data.timeToAnswerSec ?? data.timeToAnswer ?? data.timeSpent ?? 0;
  const correctAnswer = data.correctAnswer ?? data.correctIndex ?? 0;

  return {
    userId: data.userId || 'anonymous',
    itemId: data.itemId,
    answer: data.answer ?? chosenIndex,
    correctAnswer,
    timeSpent,
    correct: data.correct ?? (chosenIndex === correctAnswer),
    chosenIndex,
    confidence: data.confidence,
    sessionType: data.sessionType,
    sessionData: data.sessionData ? {
      totalQuestions: data.sessionData.totalQuestions ?? 0,
      currentQuestionIndex: data.sessionData.currentQuestionIndex ?? 0,
      topicIds: data.sessionData.topicIds ?? [],
      sessionId: data.sessionData.sessionId ?? '',
      sessionTitle: data.sessionData.sessionTitle ?? ''
    } : undefined
  };
}

// Union types for API flexibility
export type QualityFeedbackInput = QualityFeedbackRequest | LegacyQualityFeedbackRequest | {
  itemId: string;
  rating: number;
  questionQuality?: number;
  explanationQuality?: number;
  [key: string]: unknown;
};

export type RecordAnswerInput = RecordAnswerRequest | LegacyRecordAnswerRequest | {
  itemId: string;
  answer?: number;
  chosenIndex?: number;
  timeSpent?: number;
  timeToAnswer?: number;
  correctAnswer?: number;
  [key: string]: unknown;
};
