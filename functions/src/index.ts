import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
admin.initializeApp();

// AI functions
export { generateMcq as ai_generate_mcq } from './ai/drafting';
export { processReview as ai_review_mcq } from './ai/review';
export { processReviewV2 as ai_review_mcq_v2 } from './ai/reviewAgentV2';
export { processScoring as ai_score_mcq, processScoring as scoreMcq } from './ai/scoring';
// Enhanced scoring with ABD-specific 20-criterion rubric
export { enhancedScoring as ai_enhanced_scoring } from './ai/enhancedScoring';
// Tutor still disabled due to KB dependencies - export { tutorQuery as ai_tutor_query } from './ai/tutor';
// REMOVED: adaptedPipeline.ts - Obsolete experimental variant
// export { generateEnhancedMcq as ai_generate_enhanced_mcq } from './ai/adaptedPipeline';

// REMOVED: Distributed services - All replaced by single-pass architecture
// export { gatherQuestionContext } from './services/contextService';
// export { draftQuestion } from './services/draftingService';
// export { reviewQuestion } from './services/reviewService';
// export { scoreQuestion } from './services/scoringService';

// REMOVED: Orchestration coordination - Replaced by directGenerator.ts
// export { 
//   orchestrateDistributedQuestionGeneration,
//   getGenerationJobStatus 
// } from './coordination/orchestrationCoordinator';

// Main imports
import * as functions from 'firebase-functions';

// Knowledge base functions - Temporarily disabled for deployment timeout testing
// export { kbSearch as kb_search } from './kb/search';

// Personalization Engine functions
export { updateAbility as pe_update_ability } from './pe/ability';
// Adaptive generation still disabled due to KB dependencies
// export { triggerAdaptiveGeneration as pe_trigger_adaptive_generation } from './pe/adaptiveGeneration';
// export { getPersonalizedQuestions as pe_get_personal_questions } from './pe/adaptiveGeneration';
export { submitQuestionFeedback as pe_submit_question_feedback } from './pe/qualityRetirement';
export { getQualityReviewQueue as pe_get_quality_review_queue } from './pe/qualityRetirement';
export { resolveQualityReview as pe_resolve_quality_review } from './pe/qualityRetirement';
export { getQualityAnalytics as pe_get_quality_analytics } from './pe/qualityRetirement';
export { srsUpdate as pe_srs_update } from './pe/srs';
export { srsDue as pe_srs_due } from './pe/srs';
export { getNextItem as pe_next_item } from './pe/nextItem';
export { getNextItems as pe_get_next_items } from './pe/nextItems';
export { recordAnswer as pe_record_answer } from './pe/recordAnswer';
export { recordQuizSession as pe_record_quiz_session } from './pe/recordAnswer';

// Item management functions
export { itemsGet as items_get } from './items/get';
export { itemsList as items_list } from './items/list';
export { itemsPropose as items_propose } from './items/propose';
export { itemsPromote as items_promote } from './items/promote';
export { itemsRevise as items_revise } from './items/revise';

// Admin functions - Re-enabling essential admin panel functions
export { admin_generateQuestionQueue as admin_generate_question_queue } from './admin/questionQueue';
export { admin_generate_per_topic as admin_generate_per_topic } from './admin/questionQueue';
export { admin_getQuestionQueue as admin_get_question_queue } from './admin/questionQueue';
export { admin_reviewQuestion as admin_review_question } from './admin/questionQueue';
export { admin_listUncategorized as admin_list_uncategorized } from './admin/taxonomy';
export { admin_setItemTaxonomy as admin_set_item_taxonomy } from './admin/taxonomy';
// Re-enabled after taxonomy filtering optimization (categories 8-9 filtered out)
export { admin_getTaxonomy } from './admin/questionQueue';
export { admin_getTaxonomyEntities } from './admin/questionQueue';
// Temporarily commented out to avoid deployment timeout due to KB loading
// export { 
//   admin_migrateTaxonomy as admin_migrate_taxonomy,
//   admin_getTaxonomyMigrationStatus as admin_get_taxonomy_migration_status,
//   admin_getTaxonomyMigrationPreview as admin_get_taxonomy_migration_preview
// } from './admin/migration';
export { importLegacyQuestions as storage_import_legacy_questions } from './admin/importQuestions';
export { getQuestionBankStats as admin_get_question_bank_stats } from './admin/importQuestions';

// User Management - Admin Functions
export { grantAdminRole as admin_grant_role, revokeAdminRole as admin_revoke_role, listAdminUsers as admin_list_admins } from './admin/grantAdminRole';

// Admin Question Generation - Dedicated pipeline with ABD guidelines
export { adminGenerateQuestions as admin_generate_questions } from './admin/adminQuestionGeneration';
export { adminBatchGenerateQuestions as admin_batch_generate_questions } from './admin/adminQuestionGeneration';

// Admin AI Question Review System - AI-powered review and feedback
export { 
  aiReviewQuestion as admin_ai_review_question,
  regenerateQuestionWithFeedback as admin_regenerate_question,
  validateClinical as admin_validate_clinical
} from './admin/aiQuestionReview';

// Initial Setup Functions (disable after setup)
export { grantInitialAdminRole as setup_grant_admin } from './admin/initialSetup';
export { checkAdminStatus as setup_check_admin } from './admin/initialSetup';

// Enhanced MCQ System Schema Initialization
export { 
  initializeEnhancedSchema as admin_initialize_enhanced_schema,
  checkSchemaStatus as admin_check_schema_status,
  enableDirectGenerator as admin_enable_direct_generator,
  enableShadowMode as admin_enable_shadow_mode
} from './admin/schemaInitialization';

// Test functions - Re-enabled after fixing KB dependencies
export { testSimple, testSimpleHttp, testIterativeScoringPipeline } from './test/simpleTest';

// Testing endpoints (no auth required)
export { test_generate_question, test_review_question, test_score_question } from './test/aiTestingEndpoints';
// Test endpoints - temporarily disabled during deployment troubleshooting
// export { test_enhanced_pipeline, test_generate_with_details } from './test/enhancedTestEndpoints';

// REMOVED: Distributed services test endpoints - Files deleted
// export { 
//   testDistributedHealth,
//   testContextServiceDirect,
//   testQuestionGeneration
// } from './test/testDistributedEndpoints';


// Monitoring and observability functions
export { healthCheck, getMetrics, getLogs } from './util/monitoring';

// Activity tracking functions
export { activities_log, activities_get, activities_summary } from './activities/endpoints';
export { seedUserActivities as activities_seed, clearUserActivities as activities_clear } from './activities/seedActivities';

// Utility functions
export { seedDatabase as util_seed_database } from './util/seed';

// Main Orchestrator for Multi-Agent Pipeline
export { orchestrateQuestionGenerationFunction as orchestrateQuestionGeneration } from './ai/adaptedOrchestrator';

// Direct MCQ Generator - Single-pass architecture (will enable after deployment testing)
// export { generateMCQDirect } from './ai/directGenerator';

// Enhanced MCQ Generation System with Migration Support
// Removed commented code that was causing Firebase deployment timeout
// Migration wrapper will be enabled in Phase 3 after successful deployment



// REMOVED: Orchestrator Pipeline Tests - File deleted
// export { 
//   testOrchestratorPipeline, 
//   testOrchestratorBatch, 
//   testOrchestratorHealth 
// } from './test/orchestratorPipelineTest';

// Performance Benchmark Tests - temporarily disabled during deployment troubleshooting
// export { 
//   runPerformanceBenchmark, 
//   testImplementations 
// } from './test/performanceBenchmark';

// HTTP Streaming Endpoints (Temporarily disabled during API migration)
// export { 
//   streamGenerateQuestions,
//   checkGenerationProgress,
//   submitGenerationJob,
//   checkGenerationJob
// } from './ai/httpStreamingEndpoint';

// Public test endpoint (remove in production)
export { testGenerateQuestions } from './test/publicTestEndpoint';

