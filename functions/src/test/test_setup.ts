import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import functionsTest from 'firebase-functions-test';
import { describe, beforeEach, afterEach } from 'mocha';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';

// Setup chai with sinon-chai plugin
chai.use(sinonChai);

dotenv.config({ path: '.env' });

const test = functionsTest();

// Initialize admin SDK with test project
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'test-project'
  });
}

// Mock configuration for Firebase Functions
test.mockConfig({
  firestore: {
    host: 'localhost',
    port: 8080
  },
  gemini: {
    api_key: 'test-api-key'
  },
  openai: {
    api_key: 'test-api-key'  
  }
});

// Global test utilities
export const testHelper = {
  // Clean up Firestore collections after each test
  async cleanupFirestore() {
    const db = admin.firestore();
    const collections = ['users', 'questions', 'attempts', 'taxonomy', 'queue'];
    
    for (const collection of collections) {
      const snapshot = await db.collection(collection).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }
  },

  // Create test user
  async createTestUser(uid: string = 'test-user', customClaims: any = {}) {
    try {
      await admin.auth().deleteUser(uid);
    } catch (error) {
      // User doesn't exist, that's fine
    }
    
    const user = await admin.auth().createUser({
      uid,
      email: `${uid}@test.com`,
      password: 'testpassword123'
    });

    if (Object.keys(customClaims).length > 0) {
      await admin.auth().setCustomUserClaims(uid, customClaims);
    }

    return user;
  },

  // Create test admin user
  async createTestAdmin(uid: string = 'test-admin') {
    return this.createTestUser(uid, { admin: true });
  },

  // Seed test data
  async seedTestData() {
    const db = admin.firestore();
    
    // Seed taxonomy
    await db.collection('taxonomy').doc('dermatology').set({
      name: 'Dermatology',
      children: {
        'inflammatory': {
          name: 'Inflammatory Conditions',
          children: {
            'eczema': { name: 'Eczema' },
            'psoriasis': { name: 'Psoriasis' }
          }
        },
        'infectious': {
          name: 'Infectious Conditions',
          children: {
            'bacterial': { name: 'Bacterial Infections' },
            'viral': { name: 'Viral Infections' }
          }
        }
      }
    });

    // Seed test questions
    const testQuestions = [
      {
        id: 'q1',
        question: 'What is the most common cause of atopic dermatitis?',
        options: [
          { id: 'a', text: 'Genetic predisposition', correct: true },
          { id: 'b', text: 'Food allergies', correct: false },
          { id: 'c', text: 'Environmental toxins', correct: false },
          { id: 'd', text: 'Stress', correct: false }
        ],
        explanation: 'Atopic dermatitis has a strong genetic component.',
        taxonomy: ['dermatology', 'inflammatory', 'eczema'],
        difficulty: 0.65,
        status: 'published',
        metadata: {
          source: 'test',
          board_style: 'step1',
          created_at: new Date(),
          updated_at: new Date()
        }
      },
      {
        id: 'q2',
        question: 'Which of the following is characteristic of psoriatic plaques?',
        options: [
          { id: 'a', text: 'Thin, fragile skin', correct: false },
          { id: 'b', text: 'Silvery scales', correct: true },
          { id: 'c', text: 'Vesicular eruption', correct: false },
          { id: 'd', text: 'Hyperpigmentation', correct: false }
        ],
        explanation: 'Psoriatic plaques are characterized by silvery scales on erythematous plaques.',
        taxonomy: ['dermatology', 'inflammatory', 'psoriasis'],
        difficulty: 0.55,
        status: 'published',
        metadata: {
          source: 'test',
          board_style: 'step1',
          created_at: new Date(),
          updated_at: new Date()
        }
      }
    ];

    for (const question of testQuestions) {
      await db.collection('questions').doc(question.id).set(question);
    }
  }
};

// Global hooks for test cleanup
export function setupTestEnvironment() {
  beforeEach(async function() {
    this.timeout(10000);
    await testHelper.cleanupFirestore();
  });

  afterEach(async function() {
    this.timeout(5000);
    await testHelper.cleanupFirestore();
  });
}

export { test, admin };
