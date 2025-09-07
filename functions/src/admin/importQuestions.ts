/* Excerpt showing only the added/renamed exports: integrate into existing file */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAdmin } from './auth'; // assuming existing helper
// ... existing imports and constants (including HIGH_QUALITY_QUESTIONS) ...

// Renamed original storage trigger to avoid name collision with deprecated callable.
export const storageImportLegacyQuestions = functions.storage.object().onFinalize(async (object) => {
  // (Existing implementation of previous importLegacyQuestions storage trigger unchanged)
  const fileBucket = object.bucket;
  const filePath = object.name;
  // ... existing logic ...
});

// Backward compatibility callable wrapper (deprecated).
export const importLegacyQuestions = functions.https.onCall(async (data, context) => {
  requireAdmin(context);
  return {
    success: false,
    deprecated: true,
    message: 'importLegacyQuestions is deprecated. Use admin_import_sample_legacy (callable) with { limit } instead of uploading direct question payloads.'
  };
});

// Existing sample import callable (already in your recent changes):
export const importSampleLegacyQuestions = functions.https.onCall(async (data, context) => {
  requireAdmin(context);
  const { limit } = data || {};

  const itemsRef = admin.firestore().collection('items');
  const batch = admin.firestore().batch();
  const count = limit ? Math.min(limit, HIGH_QUALITY_QUESTIONS.length) : HIGH_QUALITY_QUESTIONS.length;

  HIGH_QUALITY_QUESTIONS.slice(0, count).forEach(q => {
    const docRef = itemsRef.doc();
    batch.set(docRef, {
      question: q.stem,
      stem: q.stem,
      leadIn: q.leadIn,
      options: q.options,
      correctIndex: q.keyIndex,
      explanation: q.explanation,
      difficulty: q.difficulty ?? 0,
      topicIds: q.topicIds || [],
      tags: q.tags || [],
      source: 'legacy_question_bank',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      qualityScore: q.qualityScore
    });
  });

  await batch.commit();

  await admin.firestore().collection('admin').doc('questionBankMetadata').set({
    lastImportedAt: admin.firestore.FieldValue.serverTimestamp(),
    importedCount: admin.firestore.FieldValue.increment(count)
  }, { merge: true });

  return { success: true, importedCount: count };
});

// (Rest of original file unchanged)
