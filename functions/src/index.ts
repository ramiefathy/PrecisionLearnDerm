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
export const pe_get_personalized_questions = adaptiveExports.getPersonalizedQuestions;

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
