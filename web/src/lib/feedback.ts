import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export type FeedbackPayload = {
  questionStars: number|null;
  explanationStars: number|null;
  reasons: string[];
  comment?: string;
  confidence?: 'Low'|'Medium'|'High';
  timeToAnswerSec?: number;
};

export async function saveFeedback(itemId: string, payload: FeedbackPayload) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const ref = doc(db, 'feedback', itemId, 'users', uid);
  const data = { ...payload, createdAt: new Date(), uid };
  await setDoc(ref, data, { merge: true });
} 