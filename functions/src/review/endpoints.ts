import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireReviewerOrAdmin } from '../util/auth';

const db = admin.firestore();

export const review_enqueue_draft = functions.https.onCall(async (data, context) => {
  requireReviewerOrAdmin(context);
  if (!data?.draftItem) {
    throw new functions.https.HttpsError('invalid-argument', 'draftItem is required');
  }
  const ref = db.collection('reviewQueue').doc();
  const payload = {
    ...data,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    versions: []
  };
  await ref.set(payload);
  return { success: true, id: ref.id };
});

export const review_list_queue = functions.https.onCall(async (data, context) => {
  requireReviewerOrAdmin(context);
  const { status = 'pending', topicIds, limit = 20, cursor } = data || {};
  let q: FirebaseFirestore.Query = db.collection('reviewQueue').where('status', '==', status).orderBy('createdAt', 'desc');
  if (Array.isArray(topicIds) && topicIds.length > 0) {
    q = q.where('topicIds', 'array-contains-any', topicIds.slice(0, 10));
  }
  if (cursor) {
    const snap = await db.collection('reviewQueue').doc(cursor).get();
    if (snap.exists) q = q.startAfter(snap);
  }
  const snap = await q.limit(Math.max(1, Math.min(100, Number(limit) || 20))).get();
  return { success: true, items: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});

export const review_save_draft = functions.https.onCall(async (data, context) => {
  requireReviewerOrAdmin(context);
  const { draftId, edits } = data || {};
  if (!draftId || !edits) throw new functions.https.HttpsError('invalid-argument', 'draftId and edits are required');
  const ref = db.collection('reviewQueue').doc(draftId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Draft not found');
  await ref.update({ ...edits, updatedAt: admin.firestore.FieldValue.serverTimestamp(), versions: admin.firestore.FieldValue.arrayUnion({ at: Date.now(), by: context.auth?.uid, diff: edits }) });
  return { success: true };
});

export const review_approve = functions.https.onCall(async (data, context) => {
  requireReviewerOrAdmin(context);
  const { draftId } = data || {};
  if (!draftId) throw new functions.https.HttpsError('invalid-argument', 'draftId is required');
  const ref = db.collection('reviewQueue').doc(draftId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Draft not found');
  const draft = snap.data() as any;
  // Minimal a11y enforcement: if imageUrl exists, require alt text
  const media = draft?.draftItem?.media || draft?.draftItem?.image || null;
  const imageUrl = media?.url || draft?.draftItem?.imageUrl;
  const altText = media?.alt || draft?.draftItem?.imageAlt;
  if (imageUrl && (!altText || String(altText).trim().length < 5)) {
    throw new functions.https.HttpsError('failed-precondition', 'Image alt text is required when an image is present.');
  }
  // Write to items collection
  const itemRef = db.collection('items').doc();
  await itemRef.set({
    ...draft.draftItem,
    status: 'active',
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewerId: context.auth?.uid,
    sourceDraftId: draftId
  });
  await ref.update({ status: 'approved', reviewerId: context.auth?.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { success: true, itemId: itemRef.id };
});

export const review_reject = functions.https.onCall(async (data, context) => {
  requireReviewerOrAdmin(context);
  const { draftId, notes } = data || {};
  if (!draftId) throw new functions.https.HttpsError('invalid-argument', 'draftId is required');
  const ref = db.collection('reviewQueue').doc(draftId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Draft not found');
  await ref.update({ status: 'rejected', reviewerId: context.auth?.uid, reviewerNotes: notes || '', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { success: true };
});
