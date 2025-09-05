import { vi } from 'vitest';

interface MockTokenResult {
  token: string;
  claims: Record<string, unknown>;
}

export interface MockUser {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified?: boolean;
  getIdToken: () => Promise<string>;
  getIdTokenResult: () => Promise<MockTokenResult>;
}

type AuthStateCallback = (user: MockUser | null) => void;

const authStateCallbacks: AuthStateCallback[] = [];

// Mock Firebase Auth
export const mockAuth = {
  currentUser: null as MockUser | null,
  onAuthStateChanged: vi.fn((callback: AuthStateCallback) => {
    authStateCallbacks.push(callback);
    callback(null);
    return vi.fn(); // unsubscribe function
  }),
  signInWithEmailAndPassword: vi.fn().mockResolvedValue({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      getIdToken: vi.fn().mockResolvedValue('mock-token'),
      getIdTokenResult: vi.fn().mockResolvedValue({
        token: 'mock-token',
        claims: {}
      })
    }
  }),
  createUserWithEmailAndPassword: vi.fn().mockResolvedValue({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    }
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
};

// Mock Firestore
export const mockFirestore = {
  collection: vi.fn((_path?: string) => ({
    doc: vi.fn((_id?: string) => ({
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ id: 'test-doc', name: 'Test Document' }),
        id: 'test-doc'
      }),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    onSnapshot: vi.fn((callback: (snap: unknown) => void) => {
      callback({
        exists: () => true,
        data: () => ({ id: 'test-doc', name: 'Test Document' }),
        id: 'test-doc'
      });
      return vi.fn(); // unsubscribe function
    })
    })),
    add: vi.fn().mockResolvedValue({ id: 'new-doc-id' }),
    get: vi.fn().mockResolvedValue({
      docs: [
        {
          id: 'test-doc-1',
          data: () => ({ name: 'Test Doc 1' })
        },
        {
          id: 'test-doc-2', 
          data: () => ({ name: 'Test Doc 2' })
        }
      ]
    }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    onSnapshot: vi.fn((callback: (snap: unknown) => void) => {
      callback({
        docs: [
          {
            id: 'test-doc-1',
            data: () => ({ name: 'Test Doc 1' })
          }
        ]
      });
      return vi.fn(); // unsubscribe function
    })
  })),
  doc: vi.fn((_id?: string) => ({
    get: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({ id: 'test-doc', name: 'Test Document' }),
      id: 'test-doc'
    }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  })),
  runTransaction: vi.fn().mockResolvedValue({}),
  batch: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue(undefined)
  }))
};

// Mock Firebase Functions
export const mockFunctions = {
  httpsCallable: vi.fn((functionName: string) => 
    vi.fn().mockResolvedValue({
      data: {
        success: true,
        result: `Mock result for ${functionName}`
      }
    })
  )
};

// Mock Firebase Analytics
export const mockAnalytics = {
  logEvent: vi.fn(),
  setUserId: vi.fn(),
  setUserProperties: vi.fn()
};

// Mock the entire Firebase module
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({
    name: 'test-app',
    options: {}
  })),
  getApps: vi.fn(() => [])
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
  onAuthStateChanged: vi.fn((_auth: unknown, callback: AuthStateCallback) => mockAuth.onAuthStateChanged(callback)),
  signInWithEmailAndPassword: vi.fn((_auth: unknown, email: string, password: string) =>
    mockAuth.signInWithEmailAndPassword(email, password)
  ),
  createUserWithEmailAndPassword: vi.fn((_auth: unknown, email: string, password: string) =>
    mockAuth.createUserWithEmailAndPassword(email, password)
  ),
  signOut: vi.fn((_auth: unknown) => mockAuth.signOut()),
  sendPasswordResetEmail: vi.fn((_auth: unknown, email: string) => mockAuth.sendPasswordResetEmail(email)),
  setPersistence: vi.fn().mockResolvedValue(undefined),
  browserLocalPersistence: {}
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => mockFirestore),
  connectFirestoreEmulator: vi.fn(),
  collection: vi.fn((_db: unknown, path: string) => mockFirestore.collection(path)),
  doc: vi.fn((_db: unknown, path: string) => mockFirestore.doc(path)),
  getDoc: vi.fn((docRef: { get: () => unknown }) => docRef.get()),
  getDocs: vi.fn((collectionRef: { get: () => unknown }) => collectionRef.get()),
  setDoc: vi.fn((docRef: { set: (data: unknown) => unknown }, data: unknown) => docRef.set(data)),
  updateDoc: vi.fn((docRef: { update: (data: unknown) => unknown }, data: unknown) => docRef.update(data)),
  deleteDoc: vi.fn((docRef: { delete: () => unknown }) => docRef.delete()),
  addDoc: vi.fn((collectionRef: { add: (data: unknown) => unknown }, data: unknown) => collectionRef.add(data)),
  query: vi.fn((ref: unknown, ..._constraints: unknown[]) => ref),
  where: vi.fn((field: string, op: unknown, value: unknown) => ({ field, op, value })),
  orderBy: vi.fn((field: string, direction: unknown) => ({ field, direction })),
  limit: vi.fn((num: number) => ({ limit: num })),
  onSnapshot: vi.fn((ref: { onSnapshot: (cb: unknown) => unknown }, callback: unknown) => ref.onSnapshot(callback)),
  runTransaction: vi.fn((_db: unknown, updateFunction: unknown) =>
    mockFirestore.runTransaction(updateFunction)
  ),
  writeBatch: vi.fn((_db: unknown) => mockFirestore.batch())
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => mockFunctions),
  httpsCallable: vi.fn((_functions: unknown, name: string) => mockFunctions.httpsCallable(name))
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => mockAnalytics),
  logEvent: vi.fn((_analytics: unknown, eventName: string, eventParams: Record<string, unknown>) =>
    mockAnalytics.logEvent(eventName, eventParams)
  ),
  setUserId: vi.fn((_analytics: unknown, userId: string) => mockAnalytics.setUserId(userId)),
  setUserProperties: vi.fn((_analytics: unknown, properties: Record<string, unknown>) =>
    mockAnalytics.setUserProperties(properties)
  )
}));

// Test utilities
export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  uid: 'test-uid',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn().mockResolvedValue({
    token: 'mock-token',
    claims: {},
  }),
  ...overrides,
});

export const createMockAdminUser = (): MockUser =>
  createMockUser({
    uid: 'admin-uid',
    email: 'admin@example.com',
    getIdTokenResult: vi.fn().mockResolvedValue({
      token: 'mock-admin-token',
      claims: { admin: true },
    }),
  });

export const setMockCurrentUser = (user: MockUser | null): void => {
  mockAuth.currentUser = user;
};

export const triggerAuthStateChange = (user: MockUser | null): void => {
  authStateCallbacks.forEach(cb => cb(user));
};