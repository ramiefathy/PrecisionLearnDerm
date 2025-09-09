/**
 * Central export hub for Firebase Cloud Functions.
 * This file consolidates all active callable / HTTP / trigger functions
 * currently present in the codebase (as verified by repository inspection).
 *
 * DEFENSIVE EXPORT PATTERN:
 * This file implements defensive exports that gracefully handle missing modules
 * and provide fallback behaviors when functions fail to load. This ensures
 * the deployment doesn't fail if individual modules have issues.
 *
 * Conventions:
 * - Maintain backward compatibility with legacy names via alias exports.
 * - Keep deprecated functions exported (marked clearly) to avoid hard client breaks.
 * - Development / test endpoints are guarded internally by environment checks.
 * - Use defensive exports for all non-critical functions to prevent deployment failures.
 *
 * NOTE: Multi-agent / removed pipeline functions (e.g. ai_generate_enhanced_mcq and other
 * deprecated orchestration/test variants listed in CLEANUP_LOG.md) are intentionally
 * NOT exported here.
 *
 * If adding new modules, append exports in the appropriate section below using
 * defensive export patterns where appropriate.
 */

import { safeExportBatch, safeExportWithStub, conditionalExport } from './util/defensiveExport';

/* =========================================================
 * Admin / Legacy Import (Defensive Exports)
 * ======================================================= */
const adminImports = safeExportBatch('./admin/importQuestions', [
  { name: 'importSampleLegacyQuestions' },
  { name: 'storageImportLegacyQuestions' },
  { name: 'importLegacyQuestions' }
]);

export const importSampleLegacyQuestions = adminImports.importSampleLegacyQuestions;
export const admin_import_sample_legacy = adminImports.importSampleLegacyQuestions;
export const storage_import_legacy_questions = adminImports.storageImportLegacyQuestions;
export const importLegacyQuestions = adminImports.importLegacyQuestions; // Deprecated callable

/* =========================================================
 * Personalization & Learning (SRS / Ability) - Defensive Exports
 * ======================================================= */
const srsExports = safeExportBatch('./pe/srs', [
  { name: 'srsUpdate' },
  { name: 'srsDue' }
]);

const abilityExports = safeExportBatch('./pe/ability', [
  { name: 'updateAbility' }
]);

export const srsUpdate = srsExports.srsUpdate;
export const pe_srs_update = srsExports.srsUpdate; // Alias for namespaced style
export const srsDue = srsExports.srsDue;
export const pe_srs_due = srsExports.srsDue; // Alias for namespaced style
export const updateAbility = abilityExports.updateAbility;
export const pe_update_ability = abilityExports.updateAbility;

/* =========================================================
 * Personalized Content (Question Bank / Adaptive Retrieval) - Defensive Exports
 * ======================================================= */
const adaptiveExports = safeExportBatch('./pe/adaptiveGeneration', [
  { name: 'getPersonalizedQuestions' }
]);

export const getPersonalizedQuestions = adaptiveExports.getPersonalizedQuestions;

/* =========================================================
 * Item / Content Management - Defensive Exports
 * ======================================================= */
const itemsExports = safeExportBatch('./items/promote', [
  { name: 'itemsPromote' }
]);

const proposeExports = safeExportBatch('./items/propose', [
  { name: 'itemsPropose' }
]);

export const itemsPromote = itemsExports.itemsPromote;
export const items_promote = itemsExports.itemsPromote;
export const itemsPropose = proposeExports.itemsPropose;
export const items_propose = proposeExports.itemsPropose;

/* =========================================================
 * Queue / Generation Admin Utilities - Defensive Exports
 * ======================================================= */
const queueExports = safeExportBatch('./admin/questionQueue', [
  { name: 'initializeQueue' }
]);

export const initializeQueue = queueExports.initializeQueue;
export const admin_initialize_queue = queueExports.initializeQueue;

/* =========================================================
 * Monitoring & Observability - Critical Functions (Safe Exports)
 * ======================================================= */
// These are critical for deployment health, use safe exports but prefer to fail fast if missing
const monitoringExports = safeExportBatch('./util/monitoring', [
  { name: 'healthCheck' },
  { name: 'getMetrics' },
  { name: 'getLogs' }
]);

const enhancedMonitoringExports = safeExportBatch('./util/enhancedMonitoring', [
  { name: 'comprehensiveHealthCheck' }
]);

export const healthCheck = monitoringExports.healthCheck;
export const getMetrics = monitoringExports.getMetrics;
export const getLogs = monitoringExports.getLogs;
export const comprehensiveHealthCheck = enhancedMonitoringExports.comprehensiveHealthCheck;

/* =========================================================
 * Explicit callable exports to align with web client usage
 * (Avoid defensive stubs; fail fast if modules are missing)
 * ======================================================= */
// PE - Next item(s) and recording
export { getNextItem as pe_next_item } from './pe/nextItem';
export { getNextItems as pe_get_next_items } from './pe/nextItems';
export { recordAnswer as pe_record_answer, recordQuizSession as pe_record_quiz_session } from './pe/recordAnswer';

// PE - Quality retirement
export { submitQuestionFeedback as pe_submit_question_feedback, getQualityReviewQueue as pe_get_quality_review_queue, resolveQualityReview as pe_resolve_quality_review, getQualityAnalytics as pe_get_quality_analytics } from './pe/qualityRetirement';

// PE - Adaptive generation / personalization
export { triggerAdaptiveGeneration as pe_trigger_adaptive_generation } from './pe/adaptiveGeneration';
export { getPersonalizedQuestionsCallable as pe_get_personalized_questions, getPersonalizedQuestionsCallable as pe_get_personal_questions } from './pe/adaptiveGeneration';

// KB
export { kbSearch as kb_search } from './kb/search';

// Items
export { itemsList as items_list } from './items/list';
export { itemsGet as items_get } from './items/get';
export { itemsRevise as items_revise } from './items/revise';

// Activities
export { activities_log, activities_get, activities_summary } from './activities/endpoints';
export { seedUserActivities as activities_seed, clearUserActivities as activities_clear } from './activities/seedActivities';

// Admin - Question queue and taxonomy
export { admin_generateQuestionQueue as admin_generate_question_queue, admin_generate_per_topic, admin_getQuestionQueue as admin_get_question_queue, admin_reviewQuestion as admin_review_question, admin_update_question } from './admin/questionQueue';
export { admin_listUncategorized as admin_list_uncategorized, admin_setItemTaxonomy as admin_set_item_taxonomy } from './admin/taxonomy';
export { admin_getTaxonomy, admin_getTaxonomyEntities } from './admin/questionQueue';

// Admin - Question bank stats and legacy import
export { getQuestionBankStats as admin_get_question_bank_stats } from './admin/importQuestions';

// Admin - Role management
export { grantAdminRole as admin_grant_role, revokeAdminRole as admin_revoke_role, listAdminUsers as admin_list_admins } from './admin/grantAdminRole';

// Admin - Generation endpoints
export { adminGenerateQuestions as admin_generate_questions, adminBatchGenerateQuestions as admin_batch_generate_questions } from './admin/adminQuestionGeneration';

// Setup callables
export { grantAdminRole as setup_grant_admin } from './admin/grantAdminRole';
export { setup_check_admin } from './admin/setup';

/* =========================================================
 * Admin Status / Diagnostics (Development Only) - Conditional Export
 * ======================================================= */
// Only export in development/testing environments
const isDevelopment = process.env.NODE_ENV !== 'production';
const adminStatusExports = conditionalExport(
  isDevelopment,
  './admin/initialSetup',
  'checkAdminStatus',
  // Fallback for production
  () => ({
    success: false,
    error: 'Admin status checks disabled in production',
    code: 'PRODUCTION_DISABLED'
  })
);

export const checkAdminStatus = adminStatusExports;


/* =========================================================
 * IMPORTANT:
 * Functions explicitly removed or deprecated per CLEANUP_LOG.md
 * (e.g., ai_generate_enhanced_mcq, distributed pipeline agents,
 * evaluation batch orchestration placeholders) are not re-exported.
 * 
 * DEFENSIVE EXPORT PATTERN:
 * This index now uses defensive exports that:
 * 1. Gracefully handle missing modules without failing deployment
 * 2. Provide fallback stubs for non-critical functions
 * 3. Disable development/test endpoints in production
 * 4. Log warnings for missing modules while maintaining service availability
 * ======================================================= */
