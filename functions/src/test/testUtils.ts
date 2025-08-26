/**
 * Test utilities for PrecisionLearnDerm Functions
 * Provides mock objects and utilities for unit and integration testing
 */

import { CallableContext } from 'firebase-functions/v1/https';
import { MockCallableContext } from '../types/shared';

/**
 * Creates a mock CallableContext for testing Firebase Functions
 */
export function createMockContext(overrides: Partial<MockCallableContext> = {}): CallableContext {
  const defaultContext: MockCallableContext = {
    auth: {
      uid: 'test-user-123',
      token: {
        admin: false,
        email: 'test@example.com',
        aud: 'test-project',
        auth_time: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
        firebase: {
          identities: {},
          sign_in_provider: 'password'
        },
        iat: Date.now() / 1000,
        iss: 'https://securetoken.google.com/test-project',
        sub: 'test-user-123'
      }
    }
  };

  return {
    ...defaultContext,
    ...overrides
  } as CallableContext;
}

/**
 * Creates a mock admin context for testing admin functions
 */
export function createMockAdminContext(overrides: Partial<MockCallableContext> = {}): CallableContext {
  return createMockContext({
    auth: {
      uid: 'test-admin-123',
      token: {
        admin: true,
        email: 'admin@example.com',
        aud: 'test-project',
        auth_time: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
        firebase: {
          identities: {},
          sign_in_provider: 'password'
        },
        iat: Date.now() / 1000,
        iss: 'https://securetoken.google.com/test-project',
        sub: 'test-admin-123'
      }
    },
    ...overrides
  });
}

/**
 * Creates a mock unauthenticated context for testing unauthorized access
 */
export function createMockUnauthenticatedContext(): CallableContext {
  return {} as CallableContext;
}

/**
 * Test data generators
 */
export const testData = {
  // Generate a test question
  generateQuestion: (overrides: any = {}) => ({
    id: 'test-question-1',
    question: 'What is the most common cause of atopic dermatitis?',
    choices: [
      'Genetic predisposition',
      'Food allergies', 
      'Environmental toxins',
      'Stress'
    ],
    correct: 0,
    explanation: 'Atopic dermatitis has a strong genetic component.',
    topic: 'dermatology',
    difficulty: 0.65,
    metadata: {
      source: 'test',
      board_style: 'step1',
      created_at: new Date(),
      updated_at: new Date()
    },
    ...overrides
  }),

  // Generate a test user
  generateUser: (overrides: any = {}) => ({
    uid: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    preferences: {
      studyDuration: 30,
      difficulty: 'adaptive',
      focusAreas: ['dermatology'],
      notifications: true,
      dailyGoal: 10
    },
    stats: {
      totalAttempts: 0,
      correctAnswers: 0,
      accuracy: 0,
      streakDays: 0,
      lastActivity: new Date()
    },
    ...overrides
  }),

  // Generate test quality metrics
  generateQualityMetrics: (overrides: any = {}) => ({
    accuracy: 85,
    clarity: 80,
    difficulty: 75,
    relevance: 90,
    overallScore: 82.5,
    medicalAccuracy: 88,
    explanation: 75,
    abdCompliance: 80,
    structure: 85,
    clinicalRealism: 82,
    ...overrides
  })
};

/**
 * Mock Firestore for testing
 */
export class MockFirestore {
  private collections: Map<string, Map<string, any>> = new Map();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    
    return {
      doc: (id: string) => ({
        get: async () => {
          const collection = this.collections.get(name);
          const data = collection?.get(id);
          return {
            exists: !!data,
            data: () => data,
            id
          };
        },
        set: async (data: any) => {
          const collection = this.collections.get(name)!;
          collection.set(id, data);
        },
        update: async (data: any) => {
          const collection = this.collections.get(name)!;
          const existing = collection.get(id) || {};
          collection.set(id, { ...existing, ...data });
        },
        delete: async () => {
          const collection = this.collections.get(name)!;
          collection.delete(id);
        }
      }),
      get: async () => {
        const collection = this.collections.get(name) || new Map();
        const docs = Array.from(collection.entries()).map(([id, data]) => ({
          id,
          data: () => data,
          exists: true
        }));
        return { docs };
      },
      add: async (data: any) => {
        const id = `auto-${Date.now()}`;
        const collection = this.collections.get(name)!;
        collection.set(id, data);
        return { id };
      }
    };
  }

  // Clear all data for tests
  clear() {
    this.collections.clear();
  }
}

/**
 * Test assertion helpers
 */
export const testAssertions = {
  // Assert that a response is successful
  assertSuccess: (response: any) => {
    if (!response.success) {
      throw new Error(`Expected success but got error: ${response.error}`);
    }
  },

  // Assert that a response contains an error
  assertError: (response: any, expectedErrorCode?: string) => {
    if (response.success) {
      throw new Error('Expected error but got success');
    }
    if (expectedErrorCode && response.error !== expectedErrorCode) {
      throw new Error(`Expected error code ${expectedErrorCode} but got ${response.error}`);
    }
  },

  // Assert Firebase HttpsError with correct message
  assertAuthenticationError: (fn: () => void) => {
    try {
      fn();
      throw new Error('Expected authentication error but function succeeded');
    } catch (error: any) {
      if (error.message !== 'Authentication required') {
        throw new Error(`Expected 'Authentication required' but got '${error.message}'`);
      }
    }
  },

  // Assert Firebase HttpsError for admin permission denied
  assertAdminPermissionError: (fn: () => void) => {
    try {
      fn();
      throw new Error('Expected admin permission error but function succeeded');
    } catch (error: any) {
      if (error.message !== 'Admin role required') {
        throw new Error(`Expected 'Admin role required' but got '${error.message}'`);
      }
    }
  },

  // Generic Firebase HttpsError assertion
  assertHttpsError: (fn: () => void, expectedMessage: string) => {
    try {
      fn();
      throw new Error(`Expected HttpsError with message '${expectedMessage}' but function succeeded`);
    } catch (error: any) {
      if (error.message !== expectedMessage) {
        throw new Error(`Expected '${expectedMessage}' but got '${error.message}'`);
      }
    }
  },

  // Assert that a question is valid
  assertValidQuestion: (question: any) => {
    if (!question.question || typeof question.question !== 'string') {
      throw new Error('Question must have a valid question string');
    }
    if (!Array.isArray(question.choices) || question.choices.length < 2) {
      throw new Error('Question must have at least 2 choices');
    }
    if (typeof question.correct !== 'number' || question.correct < 0 || question.correct >= question.choices.length) {
      throw new Error('Question must have a valid correct answer index');
    }
    if (!question.explanation || typeof question.explanation !== 'string') {
      throw new Error('Question must have a valid explanation');
    }
  }
};

/**
 * Performance testing utilities
 */
export const performanceUtils = {
  // Time a function execution
  timeFunction: async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },

  // Assert that a function executes within a time limit
  assertExecutionTime: async <T>(fn: () => Promise<T>, maxDuration: number): Promise<T> => {
    const { result, duration } = await performanceUtils.timeFunction(fn);
    if (duration > maxDuration) {
      throw new Error(`Function took ${duration}ms but should complete within ${maxDuration}ms`);
    }
    return result;
  }
};