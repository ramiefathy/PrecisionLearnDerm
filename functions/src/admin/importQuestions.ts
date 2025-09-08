/**
 * Admin question import utilities (legacy + sample).
 * Provides:
 *  - storageImportLegacyQuestions: (placeholder) storage trigger for legacy imports (kept if original existed).
 *  - importLegacyQuestions: deprecated callable wrapper returning guidance (backward compatibility).
 *  - importSampleLegacyQuestions: new simplified seeding callable using HIGH_QUALITY_QUESTIONS.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAdmin } from '../util/auth';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Example curated set of high quality questions.
 * (Replace or expand with your real dataset.)
 */
interface LegacyQuestionSeed {
  stem: string;
  leadIn?: string;
  options: string[];
  keyIndex: number;
  explanation?: string;
  difficulty?: number;
  topicIds?: string[];
  tags?: string[];
  qualityScore?: number;
}

export const HIGH_QUALITY_QUESTIONS: LegacyQuestionSeed[] = [
  {
    stem: 'What is the primary layer of skin affected in superficial (first-degree) burns?',
    options: ['Epidermis', 'Dermis', 'Subcutaneous tissue', 'Muscle'],
    keyIndex: 0,
    explanation: 'First-degree burns involve only the epidermis.',
    difficulty: 1,
    topicIds: ['burns', 'anatomy'],
    tags: ['foundational'],
    qualityScore: 0.95
  },
  {
    stem: 'A patient presents with a herald patch followed by a Christmas-tree pattern rash. Most likely diagnosis?',
    options: ['Pityriasis rosea', 'Tinea corporis', 'Psoriasis', 'Lichen planus'],
    keyIndex: 0,
    explanation: 'Pityriasis rosea often starts with a herald patch followed by diffuse lesions.',
    difficulty: 2,
    topicIds: ['rashes'],
    tags: ['pattern-recognition'],
    qualityScore: 0.92
  }
];

/**
 * (Optional) Legacy storage-trigger import handler.
 * If you previously supported uploading a JSON file to Cloud Storage and parsing it into questions,
 * re-implement that logic here. Currently a placeholder to avoid runtime errors if referenced.
 */
export const storageImportLegacyQuestions = functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;
  const bucketName = object.bucket;
  console.log('[storageImportLegacyQuestions] Triggered for', { bucketName, filePath });

  // Placeholder: In a real implementation you would:
  //  1. Download the file from Storage.
  //  2. Parse JSON containing an array of question objects.
  //  3. Validate & write to Firestore.
  // For now we simply log the event.
  await db.collection('admin_logs').add({
    type: 'storage_legacy_import_trigger',
    filePath,
    bucketName,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
});

/**
 * Deprecated callable wrapper: retains the old function name to avoid hard breaks.
 * Always returns a structured deprecation response.
 */
export const importLegacyQuestions = functions.https.onCall(async (data, context) => {
  requireAdmin(context);
  return {
    success: false,
    deprecated: true,
    message: 'importLegacyQuestions is deprecated. Use admin_import_sample_legacy with { limit } instead.'
  };
});

/**
 * New simplified sample import callable.
 * Accepts: { limit?: number }
 * Writes up to `limit` (or all) HIGH_QUALITY_QUESTIONS into items collection with normalized schema.
 */
export const importSampleLegacyQuestions = functions.https.onCall(async (data, context) => {
  requireAdmin(context);
  const { limit } = data || {};

  const itemsRef = db.collection('items');
  const batch = db.batch();

  const total = limit
    ? Math.min(limit, HIGH_QUALITY_QUESTIONS.length)
    : HIGH_QUALITY_QUESTIONS.length;

  HIGH_QUALITY_QUESTIONS.slice(0, total).forEach(seed => {
    const docRef = itemsRef.doc();
    batch.set(docRef, {
      question: seed.stem,
      stem: seed.stem,
      leadIn: seed.leadIn || null,
      options: seed.options,
      correctIndex: seed.keyIndex,
      explanation: seed.explanation || null,
      difficulty: seed.difficulty ?? 0,
      topicIds: seed.topicIds || [],
      tags: seed.tags || [],
      source: 'legacy_question_bank',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      qualityScore: seed.qualityScore ?? null
    });
  });

  await batch.commit();

  await db.collection('admin').doc('questionBankMetadata').set({
    lastImportedAt: admin.firestore.FieldValue.serverTimestamp(),
    importedCount: admin.firestore.FieldValue.increment(total)
  }, { merge: true });

  return { success: true, importedCount: total };
});
