/**
 * Integration Test Utilities for PrecisionLearnDerm
 * Enhanced utilities for comprehensive integration testing
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { CallableContext } from 'firebase-functions/v1/https';
import * as sinon from 'sinon';
import { expect } from 'chai';

/**
 * Firebase Emulator Configuration
 */
export const EMULATOR_CONFIG = {
  firestore: {
    host: 'localhost',
    port: 8080,
  },
  auth: {
    host: 'localhost',
    port: 9099,
  },
  functions: {
    host: 'localhost',
    port: 5001,
  },
};

/**
 * Set up Firebase emulators for testing
 */
export function setupEmulators() {
  // Set environment variables for emulators
  process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_CONFIG.firestore.host}:${EMULATOR_CONFIG.firestore.port}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${EMULATOR_CONFIG.auth.host}:${EMULATOR_CONFIG.auth.port}`;
  
  // Initialize admin if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'test-project',
    });
  }
}

/**
 * Integration Test Context Builder
 */
export class IntegrationTestContext {
  private db: FirebaseFirestore.Firestore;
  private auth: admin.auth.Auth;
  private testUsers: Map<string, admin.auth.UserRecord> = new Map();
  private stubs: sinon.SinonStub[] = [];

  constructor() {
    this.db = admin.firestore();
    this.auth = admin.auth();
  }

  /**
   * Create a test user with specific claims
   */
  async createUser(
    uid: string,
    email: string,
    customClaims?: Record<string, any>
  ): Promise<admin.auth.UserRecord> {
    try {
      // Try to delete existing user first
      await this.auth.deleteUser(uid);
    } catch (error) {
      // User doesn't exist, continue
    }

    const user = await this.auth.createUser({
      uid,
      email,
      emailVerified: true,
      password: 'TestPassword123!',
    });

    if (customClaims) {
      await this.auth.setCustomUserClaims(uid, customClaims);
    }

    this.testUsers.set(uid, user);
    return user;
  }

  /**
   * Create an admin user
   */
  async createAdminUser(uid: string = 'test-admin', email: string = 'admin@test.com') {
    return this.createUser(uid, email, { admin: true });
  }

  /**
   * Get ID token for a user
   */
  async getIdToken(uid: string): Promise<string> {
    // In real tests, you would use Firebase Auth REST API
    // For now, we'll create a mock token
    return `mock-token-${uid}`;
  }

  /**
   * Create a mock callable context
   */
  createCallableContext(uid: string, customClaims?: Record<string, any>): CallableContext {
    return {
      auth: {
        uid,
        token: {
          uid,
          email: `${uid}@test.com`,
          email_verified: true,
          aud: 'test-project',
          auth_time: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          firebase: {
            identities: {},
            sign_in_provider: 'password',
          },
          iat: Math.floor(Date.now() / 1000),
          iss: 'https://securetoken.google.com/test-project',
          sub: uid,
          ...customClaims,
        },
      },
      rawRequest: {} as any,
    } as CallableContext;
  }

  /**
   * Seed test data in Firestore
   */
  async seedTestData() {
    const batch = this.db.batch();

    // Seed test questions
    const questions = [
      {
        id: 'test-q1',
        type: 'A',
        stem: 'A 45-year-old woman presents with a 3-month history of an itchy rash on her elbows.',
        leadIn: 'What is the most likely diagnosis?',
        options: [
          { text: 'Psoriasis' },
          { text: 'Eczema' },
          { text: 'Contact dermatitis' },
          { text: 'Seborrheic dermatitis' },
          { text: 'Lichen planus' },
        ],
        keyIndex: 0,
        explanation: 'The presentation is consistent with psoriasis.',
        difficulty: 0.6,
        topicIds: ['inflammatory', 'psoriasis'],
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {
        id: 'test-q2',
        type: 'K',
        stem: 'Which cytokine is primarily involved in the pathogenesis of psoriasis?',
        leadIn: 'Select the most important cytokine:',
        options: [
          { text: 'IL-17' },
          { text: 'IL-4' },
          { text: 'IL-10' },
          { text: 'IL-5' },
          { text: 'IL-13' },
        ],
        keyIndex: 0,
        explanation: 'IL-17 is a key cytokine in psoriasis pathogenesis.',
        difficulty: 0.7,
        topicIds: ['inflammatory', 'psoriasis', 'immunology'],
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    ];

    questions.forEach(q => {
      batch.set(this.db.collection('items').doc(q.id), q);
    });

    // Seed user profiles
    const userProfile = {
      uid: 'test-user',
      email: 'test@test.com',
      displayName: 'Test User',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      preferences: {
        learningPace: 'medium',
        darkMode: false,
        emailSummary: true,
        quizConfidenceAssessment: true,
      },
      stats: {
        quizzesTaken: 0,
        averageScore: 0,
        streak: 0,
        lastStudiedAt: null,
      },
      mastery: {},
      ability: { theta: 0.0, lastUpdate: admin.firestore.FieldValue.serverTimestamp() },
    };

    batch.set(this.db.collection('users').doc('test-user'), userProfile);

    await batch.commit();
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    // Delete test users
    for (const user of this.testUsers.values()) {
      try {
        await this.auth.deleteUser(user.uid);
      } catch (error) {
        // User might already be deleted
      }
    }
    this.testUsers.clear();

    // Clean up Firestore collections
    const collections = ['items', 'users', 'attempts', 'drafts', 'queue', 'activities'];
    for (const collection of collections) {
      const snapshot = await this.db.collection(collection).limit(100).get();
      const batch = this.db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      if (!snapshot.empty) {
        await batch.commit();
      }
    }

    // Restore all stubs
    this.stubs.forEach(stub => stub.restore());
    this.stubs = [];
  }

  /**
   * Stub external API calls
   */
  stubExternalAPIs() {
    // Stub Gemini API
    const geminiStub = sinon.stub().resolves({
      response: {
        text: () => JSON.stringify({
          stem: 'Test generated question',
          leadIn: 'What is the diagnosis?',
          options: [
            { text: 'Option A' },
            { text: 'Option B' },
            { text: 'Option C' },
            { text: 'Option D' },
            { text: 'Option E' },
          ],
          keyIndex: 0,
          explanation: 'Test explanation',
        }),
      },
    });
    
    this.stubs.push(geminiStub);
    return { geminiStub };
  }

  /**
   * Call a Firebase Function
   */
  async callFunction(functionName: string, data: any, context?: CallableContext) {
    // Import the function dynamically
    const functionModule = await import('../index');
    const fn = functionModule[functionName];
    
    if (!fn) {
      throw new Error(`Function ${functionName} not found`);
    }

    // Create default context if not provided
    const callContext = context || this.createCallableContext('test-user');

    // Call the function
    return fn(data, callContext);
  }

  /**
   * Assert function succeeds
   */
  expectSuccess(result: any) {
    expect(result).to.exist;
    expect(result).to.not.have.property('error');
    return result;
  }

  /**
   * Assert function fails with specific error
   */
  expectError(result: any, errorCode?: string) {
    expect(result).to.exist;
    expect(result).to.have.property('error');
    if (errorCode) {
      expect(result.error).to.include(errorCode);
    }
    return result;
  }

  /**
   * Get Firestore instance
   */
  getFirestore() {
    return this.db;
  }

  /**
   * Get Auth instance
   */
  getAuth() {
    return this.auth;
  }
}

/**
 * Test Data Factories
 */
export const testDataFactory = {
  /**
   * Create a valid MCQ question
   */
  createMCQQuestion: (overrides?: Partial<any>) => ({
    type: 'A',
    stem: 'A 35-year-old patient presents with erythematous plaques with silvery scales.',
    leadIn: 'What is the most likely diagnosis?',
    options: [
      { text: 'Psoriasis' },
      { text: 'Eczema' },
      { text: 'Seborrheic dermatitis' },
      { text: 'Contact dermatitis' },
      { text: 'Pityriasis rosea' },
    ],
    keyIndex: 0,
    explanation: 'The presentation of erythematous plaques with silvery scales is classic for psoriasis.',
    difficulty: 0.5,
    topicIds: ['inflammatory', 'psoriasis'],
    ...overrides,
  }),

  /**
   * Create a quiz session
   */
  createQuizSession: (overrides?: Partial<any>) => ({
    sessionId: `session-${Date.now()}`,
    userId: 'test-user',
    answers: [
      {
        itemId: 'test-q1',
        answer: 0,
        correct: true,
        timeSpent: 45,
        confidence: 80,
      },
      {
        itemId: 'test-q2',
        answer: 1,
        correct: false,
        timeSpent: 60,
        confidence: 60,
      },
    ],
    totalTime: 105,
    completedAt: new Date(),
    ...overrides,
  }),

  /**
   * Create user preferences
   */
  createUserPreferences: (overrides?: Partial<any>) => ({
    learningPace: 'medium',
    darkMode: false,
    emailSummary: true,
    quizConfidenceAssessment: true,
    focusTopics: ['inflammatory', 'neoplastic'],
    dailyGoal: 10,
    ...overrides,
  }),
};

/**
 * Performance Testing Utilities
 */
export const performanceTest = {
  /**
   * Measure function execution time
   */
  async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
    const start = Date.now();
    const result = await fn();
    const time = Date.now() - start;
    return { result, time };
  },

  /**
   * Assert execution completes within time limit
   */
  async assertPerformance<T>(
    fn: () => Promise<T>,
    maxTime: number,
    description: string
  ): Promise<T> {
    const { result, time } = await this.measureTime(fn);
    expect(time, `${description} took ${time}ms, expected < ${maxTime}ms`).to.be.lessThan(maxTime);
    return result;
  },
};

/**
 * Batch Testing Utilities
 */
export const batchTest = {
  /**
   * Run multiple test cases
   */
  async runTestCases<T, R>(
    testCases: T[],
    testFn: (testCase: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    for (const testCase of testCases) {
      const result = await testFn(testCase);
      results.push(result);
    }
    return results;
  },

  /**
   * Run tests in parallel
   */
  async runParallel<T, R>(
    testCases: T[],
    testFn: (testCase: T) => Promise<R>,
    maxConcurrency: number = 5
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < testCases.length; i += maxConcurrency) {
      const batch = testCases.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(batch.map(testFn));
      results.push(...batchResults);
    }
    return results;
  },
};
