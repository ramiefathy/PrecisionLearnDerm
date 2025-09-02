import { addDoc, collection, doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export type StoredQuestionAttempt = {
  itemRef: any;
  topicIds: string[];
  chosenIndex: number;
  correctIndex: number;
  correct: boolean;
  confidence: 'Low'|'Medium'|'High';
  timeToAnswerSec: number;
  ratings: { question: number|null; explanation: number|null; reasons: string[] };
  note?: string;
};

export async function saveAttempt(attempt: {
  startedAt: number;
  finishedAt: number;
  score: number;
  durationSec: number;
  items: StoredQuestionAttempt[];
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const col = collection(db, 'quizzes', uid, 'attempts');
  const ref = await addDoc(col, {
    ...attempt,
    startedAt: new Date(attempt.startedAt),
    finishedAt: new Date(attempt.finishedAt)
  });
  return ref.id;
}

export async function loadAttempt(uid: string, attemptId: string) {
  const ref = doc(db, 'quizzes', uid, 'attempts', attemptId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
} 