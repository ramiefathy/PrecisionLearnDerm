import * as admin from 'firebase-admin';

const db = admin.firestore();

export async function enforcePerUserRateLimit(uid: string, op: string, limitPerMinute: number) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const ref = db.collection('ops').doc('rate').collection('users').doc(`${op}_${uid}`);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as any) : { events: [] as number[] };
  const events = (data.events || []).filter((ts: number) => ts >= windowStart);
  if (events.length >= limitPerMinute) {
    throw new Error('RATE_LIMIT_EXCEEDED');
  }
  events.push(now);
  await ref.set({ events }, { merge: true });
} 