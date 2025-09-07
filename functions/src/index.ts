/**
 * Central export hub for Firebase Cloud Functions.
 * This file consolidates all active callable / HTTP / trigger functions
 * currently present in the codebase (as verified by repository inspection).
 *
 * Conventions:
 * - Maintain backward compatibility with legacy names via alias exports.
 * - Keep deprecated functions exported (marked clearly) to avoid hard client breaks.
 * - Development / test endpoints are guarded internally by environment checks.
 *
 * NOTE: Multi-agent / removed pipeline functions (e.g. ai_generate_enhanced_mcq and other
 * deprecated orchestration/test variants listed in CLEANUP_LOG.md) are intentionally
 * NOT exported here.
 *
 * If adding new modules, append exports in the appropriate section below.
 */

/* =========================================================
 * Admin / Legacy Import
 * ======================================================= */
export {
  importSampleLegacyQuestions as admin_import_sample_legacy,
  importSampleLegacyQuestions
} from './admin/importQuestions';

export {
  storageImportLegacyQuestions as storage_import_legacy_questions
} from './admin/importQuestions';

export {
  importLegacyQuestions // Deprecated callable (returns structured deprecation response)
} from './admin/importQuestions';

/* =========================================================
 * Personalization & Learning (SRS / Ability)
 * ======================================================= */
export {
  srsUpdate,
  srsUpdate as pe_srs_update   // Alias for namespaced style
} from './pe/srs';

export {
  srsDue,
  srsDue as pe_srs_due         // Alias for namespaced style
} from './pe/srs';

export {
  updateAbility,
  updateAbility as pe_update_ability
} from './pe/ability';

/* =========================================================
 * Personalized Content (Question Bank / Adaptive Retrieval)
 * ======================================================= */
export {
  getPersonalizedQuestions,
  getPersonalizedQuestions as pe_get_personalized_questions
} from './pe/adaptiveGeneration';

/* =========================================================
 * Item / Content Management
 * ======================================================= */
export {
  itemsPromote,
  itemsPromote as items_promote
} from './items/promote';

export {
  itemsPropose,
  itemsPropose as items_propose
} from './items/propose';

/* =========================================================
 * Queue / Generation Admin Utilities
 * ======================================================= */
export {
  initializeQueue,
  initializeQueue as admin_initialize_queue
} from './admin/questionQueue';

/* =========================================================
 * Monitoring & Observability
 * ======================================================= */
export {
  healthCheck
} from './util/monitoring';

export {
  getMetrics
} from './util/monitoring';

export {
  getLogs
} from './util/monitoring';

export {
  comprehensiveHealthCheck
} from './util/enhancedMonitoring';

/* =========================================================
 * Admin Status / Diagnostics (Development Only)
 * ======================================================= */
export {
  checkAdminStatus
} from './admin/initialSetup';

/* =========================================================
 * Test / Development Endpoints (Guarded Internally)
 * ======================================================= */
export {
  test_generate_question
} from './test/aiTestingEndpoints';

export {
  test_review_question
} from './test/aiTestingEndpoints';

/* =========================================================
 * IMPORTANT:
 * Functions explicitly removed or deprecated per CLEANUP_LOG.md
 * (e.g., ai_generate_enhanced_mcq, distributed pipeline agents,
 * evaluation batch orchestration placeholders) are not re-exported.
 * ======================================================= */
