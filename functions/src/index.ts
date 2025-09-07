/* Excerpt: adjust exports to reflect renamed storage trigger plus deprecated wrapper. Keep existing exports. */
export { importSampleLegacyQuestions as admin_import_sample_legacy } from './admin/importQuestions';
export { storageImportLegacyQuestions as storage_import_legacy_questions } from './admin/importQuestions';
export { importLegacyQuestions } from './admin/importQuestions'; // deprecated callable (kept for backward compatibility)
