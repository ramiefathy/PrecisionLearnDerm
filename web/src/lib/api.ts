import { httpsCallable } from 'firebase/functions';
import type { HttpsCallableOptions } from 'firebase/functions';
import { functions, auth } from './firebase';
import type { 
  APIResponse, 
  QuestionGenerationResponse,
  NextItemRequest,
  NextItemResponse,
  RecordAnswerRequest,
  SRSUpdateRequest,
  AbilityUpdateRequest,
  QualityFeedbackRequest,
  QualityAnalytics,
  KBSearchRequest,
  KBSearchResponse,
  ItemProposeRequest,
  ItemPromoteRequest,
  ItemReviseRequest,
  ItemGetResponse,
  AdminUserRequest,
  GrantAdminRoleRequest,
  QuestionQueueResponse,
  QuestionBankStats,
  ActivityLogRequest,
  ActivitySummaryResponse,
  HealthCheckResponse,
  MetricsResponse
} from '../types';



// Configure extended timeout for long-running operations (5 minutes)
const EXTENDED_TIMEOUT_OPTIONS: HttpsCallableOptions = {
  timeout: 300000 // 5 minutes in milliseconds
};

// Configure standard timeout for normal operations (2 minutes)
const STANDARD_TIMEOUT_OPTIONS: HttpsCallableOptions = {
  timeout: 120000 // 2 minutes in milliseconds
};

export const api = {
  ai: {
    generateMcq: (payload: { topic: string; difficulty?: number }) => 
      httpsCallable(functions, 'ai_generate_mcq')(payload).then(r => r.data as QuestionGenerationResponse),
    generateEnhancedMcq: (payload: { topic: string; difficulty?: number }) => 
      httpsCallable(functions, 'ai_generate_enhanced_mcq')(payload).then(r => r.data as QuestionGenerationResponse),
    reviewMcq: (payload: { question: any; context?: any }) => 
      httpsCallable(functions, 'ai_review_mcq', STANDARD_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    reviewMcqV2: (payload: { question: any }) => 
      httpsCallable(functions, 'ai_review_mcq_v2', STANDARD_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    scoreMcq: (payload: { question: any; criteria?: any }) => 
      httpsCallable(functions, 'ai_score_mcq', STANDARD_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    tutorQuery: (payload: { query: string; context?: any }) => 
      httpsCallable(functions, 'ai_tutor_query')(payload).then(r => r.data as APIResponse),
    // Multi-agent orchestrator for comprehensive question generation (uses extended timeout)
    orchestrateGeneration: (payload: { topic: string; difficulties?: ('Basic' | 'Advanced' | 'Very Difficult')[] }) => 
      httpsCallable(functions, 'orchestrateQuestionGeneration', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
  },
  test: {
    // Simple Testing Functions - now using stable Firebase callable functions (uses standard timeout)
    simpleTest: (payload: any) => httpsCallable(functions, 'testSimple', STANDARD_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    iterativeScoring: (payload: any) => httpsCallable(functions, 'testIterativeScoringPipeline')(payload).then(r => r.data as APIResponse),
    // Test endpoints (no auth required)
    generateQuestion: (payload: { topic: string; difficulty?: number }) => 
      httpsCallable(functions, 'test_generate_question')(payload).then(r => r.data as QuestionGenerationResponse),
    reviewQuestion: (payload: { question: any }) => 
      httpsCallable(functions, 'test_review_question')(payload).then(r => r.data as APIResponse),
    scoreQuestion: (payload: { question: any }) => 
      httpsCallable(functions, 'test_score_question')(payload).then(r => r.data as APIResponse),
    // Enhanced Test Endpoints (uses extended timeout)
    enhancedPipeline: (payload: { topic: string; difficulty?: number }) => 
      httpsCallable(functions, 'test_enhanced_pipeline', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    generateWithDetails: (payload: { topic: string; difficulty?: number }) => 
      httpsCallable(functions, 'test_generate_with_details')(payload).then(r => r.data as APIResponse),
    // Orchestrator Test Endpoints (uses extended timeout)
    orchestratorPipeline: (payload: { topic: string }) => 
      httpsCallable(functions, 'testOrchestratorPipeline', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    orchestratorBatch: (payload: { topics: string[] }) => 
      httpsCallable(functions, 'testOrchestratorBatch')(payload).then(r => r.data as APIResponse),
    orchestratorHealth: () => 
      httpsCallable(functions, 'testOrchestratorHealth')({}).then(r => r.data as APIResponse),
  },
  pe: {
    nextItem: (payload: NextItemRequest) => httpsCallable(functions, 'pe_next_item')(payload).then(r => r.data as NextItemResponse),
    nextItems: (payload: NextItemRequest) => httpsCallable(functions, 'pe_get_next_items')(payload).then(r => r.data as APIResponse),
    recordAnswer: (payload: RecordAnswerRequest) => httpsCallable(functions, 'pe_record_answer')(payload).then(r => r.data as APIResponse),
    recordQuizSession: (payload: any) => httpsCallable(functions, 'pe_record_quiz_session')(payload).then(r => r.data as APIResponse),
    srsUpdate: (payload: SRSUpdateRequest) => httpsCallable(functions, 'pe_srs_update')(payload).then(r => r.data as APIResponse),
    srsDue: (payload: { userId: string }) => httpsCallable(functions, 'pe_srs_due')(payload).then(r => r.data as APIResponse),
    // Adaptive Personalized Generation
    triggerAdaptiveGeneration: (payload: any) => httpsCallable(functions, 'pe_trigger_adaptive_generation')(payload).then(r => r.data as APIResponse),
    getPersonalizedQuestions: (payload: { userId?: string; limit?: number }) =>
      httpsCallable(functions, 'pe_get_personal_questions')(payload)
        .then(r => r.data as { success: boolean; questions?: any[]; count?: number; totalAvailable?: number }),
    updateAbility: (payload: AbilityUpdateRequest) => httpsCallable(functions, 'pe_update_ability')(payload).then(r => r.data as APIResponse),
  },
  quality: {
    // Quality-Based Question Retirement System
    submitFeedback: (payload: QualityFeedbackRequest) => httpsCallable(functions, 'pe_submit_question_feedback')(payload).then(r => r.data as APIResponse),
    getReviewQueue: (payload: { status?: string; limit?: number }) => httpsCallable(functions, 'pe_get_quality_review_queue')(payload).then(r => r.data as APIResponse),
    resolveReview: (payload: { reviewId: string; action: string; notes?: string }) => httpsCallable(functions, 'pe_resolve_quality_review')(payload).then(r => r.data as APIResponse),
    getAnalytics: (payload: { timeRange?: string }) => httpsCallable(functions, 'pe_get_quality_analytics')(payload).then(r => r.data as QualityAnalytics),
  },
  kb: {
    search: (payload: KBSearchRequest) => httpsCallable(functions, 'kb_search')(payload).then(r => r.data as KBSearchResponse)
  },
  items: {
    propose: (payload: ItemProposeRequest) => httpsCallable(functions, 'items_propose')(payload).then(r => r.data as APIResponse),
    promote: (payload: ItemPromoteRequest) => httpsCallable(functions, 'items_promote')(payload).then(r => r.data as APIResponse),
    revise: (payload: ItemReviseRequest) => httpsCallable(functions, 'items_revise')(payload).then(r => r.data as APIResponse),
    get: (itemId: string) => httpsCallable(functions, 'items_get')({ itemId }).then(r => r.data as ItemGetResponse),
    list: (payload: { limit?: number; offset?: number; status?: string; topicFilter?: string } = {}) => 
      httpsCallable(functions, 'items_list')(payload).then(r => r.data as APIResponse),
  },
  admin: {
    getQuestionQueue: (payload: { status?: string; limit?: number } = {}) => httpsCallable(functions, 'admin_get_question_queue')(payload).then(r => r.data as QuestionQueueResponse),
    reviewQuestion: (payload: { questionId: string; action: 'approve' | 'reject'; notes?: string }) => httpsCallable(functions, 'admin_review_question')(payload).then(r => r.data as APIResponse),
    generateQuestionQueue: (payload: { count?: number; topics?: string[] } = {}) => httpsCallable(functions, 'admin_generate_question_queue')(payload).then(r => r.data as APIResponse),
    generatePerTopic: (payload: { topics?: string[]; questionsPerTopic?: number; perTopic?: number } = {}) => httpsCallable(functions, 'admin_generate_per_topic')(payload).then(r => r.data as APIResponse),
    // Fixed function names to match backend exports
    importLegacyQuestions: (payload: { filePath?: string } = {}) => httpsCallable(functions, 'storage_import_legacy_questions')(payload).then(r => r.data as APIResponse),
    getQuestionBankStats: (payload: { includeDetails?: boolean } = {}) => httpsCallable(functions, 'admin_get_question_bank_stats')(payload).then(r => r.data as QuestionBankStats),
    listUncategorized: (payload: { limit?: number }) => httpsCallable(functions, 'admin_list_uncategorized')(payload).then(r => r.data as APIResponse),
    setItemTaxonomy: (payload: { itemId: string; taxonomy?: any; categoryId?: string; topicId?: string; subtopicId?: string }) => httpsCallable(functions, 'admin_set_item_taxonomy')(payload).then(r => r.data as APIResponse),
    grantAdminRole: (payload: GrantAdminRoleRequest) => 
      httpsCallable(functions, 'admin_grant_role')(payload).then(r => r.data as APIResponse),
    revokeAdminRole: (payload: AdminUserRequest) => 
      httpsCallable(functions, 'admin_revoke_role')(payload).then(r => r.data as APIResponse),
    listAdmins: () => 
      httpsCallable(functions, 'admin_list_admins')({}).then(r => r.data as APIResponse),
    // Dedicated admin question generation with ABD guidelines (uses extended timeout)
    generateQuestions: (payload: { 
      topic: string; 
      difficulties?: string[]; 
      questionCount?: number; 
      useABDGuidelines?: boolean; 
      focusArea?: string;
      enableProgress?: boolean;
      enableStreaming?: boolean;
    }) => httpsCallable(functions, 'admin_generate_questions', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    batchGenerateQuestions: (payload: { 
      topics: string[]; 
      difficulties?: string[];
    }) => httpsCallable(functions, 'admin_batch_generate_questions', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    // AI-powered question review and feedback system (uses extended timeout)
    aiReviewQuestion: (payload: {
      questionId: string;
      questionData: any;
      performClinicalValidation?: boolean;
      focusAreas?: string[];
    }) => httpsCallable(functions, 'admin_ai_review_question', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    regenerateQuestion: (payload: {
      questionId: string;
      questionData: any;
      adminFeedback: string;
      preserveCorrectAnswer?: boolean;
      focusArea?: string;
      autoSave?: boolean;
    }) => httpsCallable(functions, 'admin_regenerate_question', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
    updateQuestion: (payload: {
      questionId: string;
      updates: any;
      saveAsDraft?: boolean;
    }) => httpsCallable(functions, 'admin_update_question')(payload).then(r => r.data as APIResponse),
    validateClinical: (payload: {
      questionData: any;
      searchTerms?: string[];
    }) => httpsCallable(functions, 'admin_validate_clinical', EXTENDED_TIMEOUT_OPTIONS)(payload).then(r => r.data as APIResponse),
  },
  setup: {
    grantAdmin: (payload: { email: string; setupKey: string }) => 
      httpsCallable(functions, 'setup_grant_admin')(payload).then(r => r.data as APIResponse),
    checkAdmin: () => 
      httpsCallable(functions, 'setup_check_admin')({}).then(r => r.data as APIResponse),
  },
  activities: {
    log: (payload: ActivityLogRequest) => httpsCallable(functions, 'activities_log')(payload).then(r => r.data as APIResponse),
    get: (payload: { userId?: string; limit?: number; offset?: number }) => httpsCallable(functions, 'activities_get')(payload).then(r => r.data as APIResponse),
    summary: () => httpsCallable(functions, 'activities_summary')({}).then(r => r.data as ActivitySummaryResponse),
    seed: (payload: { count?: number }) => httpsCallable(functions, 'activities_seed')(payload).then(r => r.data as APIResponse),
    clear: () => httpsCallable(functions, 'activities_clear')({}).then(r => r.data as APIResponse),
  },
  util: {
    seedDatabase: () => httpsCallable(functions, 'util_seed_database')({}).then(r => r.data as APIResponse),
  },
  monitoring: {
    healthCheck: () => fetch(`https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/healthCheck`).then(r => r.json()) as Promise<HealthCheckResponse>,
    getMetrics: (payload: { timeRange?: string; includeDetails?: boolean }) => httpsCallable(functions, 'getMetrics')(payload).then(r => r.data as MetricsResponse),
    getLogs: (payload: { level?: string; limit?: number; startTime?: string }) => httpsCallable(functions, 'getLogs')(payload).then(r => r.data as APIResponse),
  }
};
