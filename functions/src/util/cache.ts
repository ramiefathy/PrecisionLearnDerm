import * as admin from 'firebase-admin';

const db = admin.firestore();

export async function getCached(key: string): Promise<any | null> {
  const ref = db.collection('ops').doc('cache').collection('entries').doc(key);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  const ttlMs = Number(data.ttlMs || 0);
  const at = Number(data.cachedAt || 0);
  if (Date.now() - at > ttlMs) return null;
  return data.value ?? null;
}

export async function setCached(key: string, value: any, ttlMs: number) {
  const ref = db.collection('ops').doc('cache').collection('entries').doc(key);
  await ref.set({ value, ttlMs, cachedAt: Date.now() }, { merge: true });
} 