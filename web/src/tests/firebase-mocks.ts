import { vi } from 'vitest';

// Mock Firebase Auth
export const mockAuth = {
  currentUser: null,
  onAuthStateChanged: vi.fn((callback) => {
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
      onSnapshot: vi.fn((callback) => {
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
    onSnapshot: vi.fn((callback) => {
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
  }))
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
  onAuthStateChanged: vi.fn((_auth, callback) => mockAuth.onAuthStateChanged(callback)),
  signInWithEmailAndPassword: vi.fn((_auth, email, password) => 
    mockAuth.signInWithEmailAndPassword(email, password)
  ),
  createUserWithEmailAndPassword: vi.fn((_auth, email, password) =>
    mockAuth.createUserWithEmailAndPassword(email, password)
  ),
  signOut: vi.fn((_auth) => mockAuth.signOut()),
  sendPasswordResetEmail: vi.fn((_auth, email) => mockAuth.sendPasswordResetEmail(email))
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => mockFirestore),
  collection: vi.fn((_db, path) => mockFirestore.collection(path)),
  doc: vi.fn((_db, path) => mockFirestore.doc(path)),
  getDoc: vi.fn((docRef) => docRef.get()),
  getDocs: vi.fn((collectionRef) => collectionRef.get()),
  setDoc: vi.fn((docRef, data) => docRef.set(data)),
  updateDoc: vi.fn((docRef, data) => docRef.update(data)),
  deleteDoc: vi.fn((docRef) => docRef.delete()),
  addDoc: vi.fn((collectionRef, data) => collectionRef.add(data)),
  query: vi.fn((ref, ..._constraints) => ref),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  limit: vi.fn((num) => ({ limit: num })),
  onSnapshot: vi.fn((ref, callback) => ref.onSnapshot(callback)),
  runTransaction: vi.fn((_db, updateFunction) => 
    mockFirestore.runTransaction(updateFunction)
  ),
  writeBatch: vi.fn((_db) => mockFirestore.batch())
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => mockFunctions),
  httpsCallable: vi.fn((_functions, name) => mockFunctions.httpsCallable(name))
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => mockAnalytics),
  logEvent: vi.fn((_analytics, eventName, eventParams) => 
    mockAnalytics.logEvent(eventName, eventParams)
  ),
  setUserId: vi.fn((_analytics, userId) => mockAnalytics.setUserId(userId)),
  setUserProperties: vi.fn((_analytics, properties) => 
    mockAnalytics.setUserProperties(properties)
  )
}));

// Test utilities
export const createMockUser = (overrides = {}) => ({
  uid: 'test-uid',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
  getIdTokenResult: vi.fn().mockResolvedValue({
    token: 'mock-token',
    claims: {}
  }),
  ...overrides
});

export const createMockAdminUser = () => createMockUser({
  uid: 'admin-uid',
  email: 'admin@example.com',
  getIdTokenResult: vi.fn().mockResolvedValue({
    token: 'mock-admin-token',
    claims: { admin: true }
  })
});

export const setMockCurrentUser = (user: any) => {
  mockAuth.currentUser = user;
};

export const triggerAuthStateChange = (user: any) => {
  const callbacks = (mockAuth.onAuthStateChanged as any).mock.calls.map((call: any) => call[0]);
  callbacks.forEach((callback: any) => callback(user));
};