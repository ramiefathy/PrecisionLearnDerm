import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, connectFirestoreEmulator, initializeFirestore, getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase app is already initialized to prevent duplicate app error
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
// Ensure session persists across reloads/deep-links
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Initialize Firestore with connection settings to prevent ERR_BLOCKED_BY_CLIENT
// Only initialize if not already done
let db: ReturnType<typeof getFirestore>;
try {
  // Try to get existing Firestore instance first
  db = getFirestore(app);
} catch {
  // If no existing instance, initialize with custom settings
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true, // Forces long-polling instead of WebSockets to avoid ad blocker issues
  });
}

// Connect to emulator in development
if (import.meta.env.DEV && !import.meta.env.VITE_USE_FIREBASE_PROD) {
  // Track if we've already connected to emulator to prevent duplicate connections
  const globalAny = globalThis as any;
  if (!globalAny.__firestoreEmulatorConnected) {
    try {
      connectFirestoreEmulator(db, 'localhost', 8080);
      globalAny.__firestoreEmulatorConnected = true;
      console.log('🔧 Connected to Firestore emulator');
    } catch (error: any) {
      // Silently ignore if already connected
      if (!error?.message?.includes('already started')) {
        console.warn('Failed to connect to Firestore emulator:', error);
      }
    }
  }
}

export { db };

export const functions = getFunctions(app, 'us-central1');

// User Profile Management
export interface UserProfile {
  displayName: string;
  email: string;
  createdAt: any;
  role?: 'admin' | 'user';
  isAdmin?: boolean;
  preferences: {
    learningPace: 'slow' | 'steady' | 'medium' | 'fast' | 'accelerated';
    darkMode: boolean;
    emailSummary: boolean;
    quizConfidenceAssessment: boolean;
  };
  stats: {
    quizzesTaken: number;
    averageScore: number;
    streak: number;
    lastStudiedAt: any;
  };
  mastery: Record<string, { pMastery: number; lastUpdate: any }>;
  ability: { theta: number; lastUpdate: any };
}

export async function createUserProfile(uid: string, email: string, displayName?: string): Promise<UserProfile> {
  const profile: UserProfile = {
    displayName: displayName || email.split('@')[0],
    email,
    createdAt: serverTimestamp(),
    preferences: {
      learningPace: 'medium',
      darkMode: false,
      emailSummary: true,
      quizConfidenceAssessment: true
    },
    stats: {
      quizzesTaken: 0,
      averageScore: 0,
      streak: 0,
      lastStudiedAt: null
    },
    mastery: {},
    ability: { theta: 0.0, lastUpdate: serverTimestamp() }
  };

  await setDoc(doc(db, 'users', uid), profile);
  return profile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  try {
    const docRef = doc(db, 'users', uid);
    await setDoc(docRef, updates, { merge: true });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}
