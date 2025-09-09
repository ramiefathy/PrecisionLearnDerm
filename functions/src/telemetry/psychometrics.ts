import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';

const db = admin.firestore();

/**
 * Aggregates item performance: P-value (difficulty) and discrimination proxy
 * Writes results to ops/itemStats/{itemId}
 */
export const aggregateItemPerformance = functions.https.onCall(async (data: { itemId: string; windowDays?: number }, context) => {
  requireAdmin(context);
  const { itemId, windowDays = 90 } = data || {} as any;
  if (!itemId) throw new functions.https.HttpsError('invalid-argument', 'itemId is required');

  const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - windowDays*24*60*60*1000));
  const answersSnap = await db.collection('userAnswers')
    .where('itemId', '==', itemId)
    .where('timestamp', '>=', since)
    .get();

  const total = answersSnap.size;
  if (total === 0) {
    await db.collection('ops').doc('itemStats').collection('items').doc(itemId).set({
      itemId,
      total: 0,
      pValue: null,
      discrimination: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { success: true, total: 0 };
  }

  let correctCount = 0;
  // Simple discrimination proxy: average correctness difference between top and bottom thirds by timeToAnswer
  type Rec = { correct: boolean; timeToAnswer?: number };
  const recs: Rec[] = [];
  answersSnap.forEach(d => {
    const data = d.data() as any;
    if (data.correct) correctCount++;
    recs.push({ correct: !!data.correct, timeToAnswer: Number(data.timeToAnswer || data.timeToAnswerSec || 0) });
  });

  const pValue = correctCount / total;
  recs.sort((a,b) => (a.timeToAnswer || 0) - (b.timeToAnswer || 0));
  const tercile = Math.max(1, Math.floor(total/3));
  const fast = recs.slice(0, tercile);
  const slow = recs.slice(-tercile);
  const mean = (arr: Rec[]) => (arr.reduce((acc, r) => acc + (r.correct ? 1 : 0), 0) / (arr.length || 1));
  const discrimination = Number((mean(fast) - mean(slow)).toFixed(3));

  await db.collection('ops').doc('itemStats').collection('items').doc(itemId).set({
    itemId,
    total,
    pValue,
    discrimination,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true, total, pValue, discrimination };
});

/**
 * Shared computation for scheduled job and callable
 */
export async function computeAndStoreItemPerformance(db: FirebaseFirestore.Firestore, itemId: string, windowDays: number = 90) {
  const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - windowDays*24*60*60*1000));
  const answersSnap = await db.collection('userAnswers')
    .where('itemId', '==', itemId)
    .where('timestamp', '>=', since)
    .get();

  const total = answersSnap.size;
  if (total === 0) {
    await db.collection('ops').doc('itemStats').collection('items').doc(itemId).set({
      itemId,
      total: 0,
      pValue: null,
      discrimination: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { total: 0 };
  }

  let correctCount = 0;
  type Rec = { correct: boolean; timeToAnswer?: number };
  const recs: Rec[] = [];
  answersSnap.forEach(d => {
    const data = d.data() as any;
    if (data.correct) correctCount++;
    recs.push({ correct: !!data.correct, timeToAnswer: Number(data.timeToAnswer || data.timeToAnswerSec || 0) });
  });

  const pValue = correctCount / total;
  recs.sort((a,b) => (a.timeToAnswer || 0) - (b.timeToAnswer || 0));
  const tercile = Math.max(1, Math.floor(total/3));
  const fast = recs.slice(0, tercile);
  const slow = recs.slice(-tercile);
  const mean = (arr: Rec[]) => (arr.reduce((acc, r) => acc + (r.correct ? 1 : 0), 0) / (arr.length || 1));
  const discrimination = Number((mean(fast) - mean(slow)).toFixed(3));

  await db.collection('ops').doc('itemStats').collection('items').doc(itemId).set({
    itemId,
    total,
    pValue,
    discrimination,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { total, pValue, discrimination };
}

/**
 * Daily scheduled aggregation
 */
export const scheduledAggregateItemPerformance = functions.pubsub
  .schedule('every day 04:00')
  .timeZone('America/New_York')
  .onRun(async () => {
    const recentDays = 90;
    const batchLimit = 200; // safeguard per run
    const stateRef = db.collection('ops').doc('itemStats').collection('state').doc('scheduler');
    const stateSnap = await stateRef.get();
    const lastRunAt = stateSnap.exists ? (stateSnap.data() as any)?.lastRunAt : null;

    // Query items; if we had updatedAt in items we could filter; for now process limited set
    const itemsSnap = await db.collection('items').orderBy('publishedAt', 'desc').limit(batchLimit).get();

    let processed = 0;
    for (const doc of itemsSnap.docs) {
      await computeAndStoreItemPerformance(db, doc.id, recentDays);
      processed++;
    }

    await stateRef.set({ lastRunAt: admin.firestore.FieldValue.serverTimestamp(), processed }, { merge: true });
    return null;
  });

