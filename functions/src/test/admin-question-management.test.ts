import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';
import { MockAI } from './mocks';

// Import admin functions
import { admin_generateQuestionQueue, admin_getQuestionQueue, admin_reviewQuestion } from '../admin/questionQueue';
import { importSampleLegacyQuestions, getQuestionBankStats } from '../admin/importQuestions';

setupTestEnvironment();

describe('Admin Question Management Tests', () => {
  let testAdminContext: any;
  let testUserContext: any;

  beforeEach(async function() {
    this.timeout(10000);
    
    // Create test admin and regular user
    await testHelper.createTestAdmin('test-admin');
    await testHelper.createTestUser('test-user');
    
    // Create mock contexts
    testAdminContext = {
      auth: {
        uid: 'test-admin',
        token: { admin: true }
      }
    };
    
    testUserContext = {
      auth: {
        uid: 'test-user',
        token: { admin: false }
      }
    };
    
    await testHelper.seedTestData();
  });

  afterEach(() => {
    MockAI.restoreAll();
    sinon.restore();
  });

  describe('Question Queue Management', () => {
    it('should generate questions for admin queue', async function() {
      this.timeout(15000);
      
      const mockGenerationResponse = {
        clinical_vignette: 'A 35-year-old woman presents with bilateral symmetric rash on her hands.',
        lead_in: 'What is the most likely diagnosis?',
        answer_options: [
          { text: 'Contact dermatitis', is_correct: true },
          { text: 'Atopic dermatitis', is_correct: false },
          { text: 'Psoriasis', is_correct: false },
          { text: 'Seborrheic dermatitis', is_correct: false },
          { text: 'Lichen planus', is_correct: false }
        ],
        comprehensive_explanation: {
          correct_answer_rationale: 'Bilateral symmetric hand rash suggests contact dermatitis.',
          educational_pearls: ['Contact dermatitis often affects exposed areas']
        },
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'YES',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(mockGenerationResponse));

      const requestData = {
        topicIds: ['contact_dermatitis'],
        count: 2,
        difficultyTarget: 0.5,
        useAI: true
      };

      const result = await admin_generateQuestionQueue(requestData, testAdminContext);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('questionsGenerated');
      expect(result.questionsGenerated).to.be.at.least(1);
      expect(result).to.have.property('queueId');
    });

    it('should deny queue generation to non-admin users', async function() {
      this.timeout(5000);
      
      const requestData = {
        topicIds: ['atopic_dermatitis'],
        count: 1
      };

      try {
        await admin_generateQuestionQueue(requestData, testUserContext);
        expect.fail('Should have thrown authorization error');
      } catch (error: any) {
        expect(error.message).to.include('admin');
      }
    });

    it('should retrieve admin question queue', async function() {
      this.timeout(8000);
      
      // First, seed some queue items
      const db = admin.firestore();
      const queueItems = [
        {
          id: 'queue-1',
          question: 'What is the primary treatment for atopic dermatitis?',
          options: [
            { text: 'Topical corticosteroids', correct: true },
            { text: 'Oral antibiotics', correct: false },
            { text: 'Antifungal cream', correct: false },
            { text: 'UV therapy', correct: false }
          ],
          status: 'pending_review',
          priority: 'high',
          createdAt: admin.firestore.Timestamp.now(),
          generatedBy: 'ai_enhanced',
          qualityScore: 85
        },
        {
          id: 'queue-2',
          question: 'Which medication is first-line for psoriasis?',
          options: [
            { text: 'Topical corticosteroids', correct: true },
            { text: 'Methotrexate', correct: false },
            { text: 'Biologics', correct: false },
            { text: 'Cyclosporine', correct: false }
          ],
          status: 'pending_review',
          priority: 'medium',
          createdAt: admin.firestore.Timestamp.now(),
          generatedBy: 'ai_enhanced',
          qualityScore: 78
        }
      ];

      for (const item of queueItems) {
        await db.collection('admin_queue').doc(item.id).set(item);
      }

      const result = await admin_getQuestionQueue({}, testAdminContext);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('items');
      expect(result.items).to.be.an('array');
      expect(result.items.length).to.be.at.least(2);
      expect(result).to.have.property('totalCount');
      expect(result.totalCount).to.be.at.least(2);
    });

    it('should allow admin to review and approve questions', async function() {
      this.timeout(8000);
      
      // Mock AI review response
      const reviewResponse = {
        reviewId: 'review-123',
        qualityScore: 88,
        status: 'approved',
        overallAssessment: 'High-quality question with good clinical relevance',
        improvementSuggestions: [],
        changes: []
      };

      MockAI.mockGemini(JSON.stringify(reviewResponse));

      // Seed a question for review
      const db = admin.firestore();
      const questionForReview = {
        id: 'review-test-1',
        question: 'What is the most common cause of contact dermatitis?',
        options: [
          { text: 'Nickel allergy', correct: true },
          { text: 'Food allergies', correct: false },
          { text: 'Viral infection', correct: false },
          { text: 'Genetic factors', correct: false }
        ],
        status: 'pending_review',
        qualityScore: 75
      };

      await db.collection('admin_queue').doc(questionForReview.id).set(questionForReview);

      const requestData = {
        questionId: questionForReview.id,
        action: 'approve',
        comments: 'Excellent clinical question'
      };

      const result = await admin_reviewQuestion(requestData, testAdminContext);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('reviewId');
      expect(result).to.have.property('qualityScore');
      expect(result.qualityScore).to.be.at.least(80);
      expect(result).to.have.property('status', 'approved');

      const saved = await db.collection('items').doc(result.itemId).get();
      expect(saved.exists).to.be.true;
      const data = saved.data();
      expect(data).to.have.property('question');
      expect(data).to.have.property('options');
      expect(data).to.have.property('correctIndex');
      expect(Array.isArray(data?.options)).to.be.true;
    });

    it('should allow admin to reject questions with feedback', async function() {
      this.timeout(8000);
      
      const reviewResponse = {
        reviewId: 'review-456',
        qualityScore: 45,
        status: 'rejected',
        overallAssessment: 'Question lacks clinical realism and has poorly constructed distractors',
        improvementSuggestions: [
          'Improve clinical vignette realism',
          'Make distractors more plausible',
          'Add better explanation'
        ],
        changes: []
      };

      MockAI.mockGemini(JSON.stringify(reviewResponse));

      const db = admin.firestore();
      const poorQualityQuestion = {
        id: 'reject-test-1',
        question: 'What is skin?',
        options: [
          { text: 'Organ', correct: true },
          { text: 'Not organ', correct: false },
          { text: 'Maybe organ', correct: false },
          { text: 'Unknown', correct: false }
        ],
        status: 'pending_review',
        qualityScore: 35
      };

      await db.collection('admin_queue').doc(poorQualityQuestion.id).set(poorQualityQuestion);

      const requestData = {
        questionId: poorQualityQuestion.id,
        action: 'reject',
        comments: 'Poor quality - lacks clinical context'
      };

      const result = await admin_reviewQuestion(requestData, testAdminContext);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('status', 'rejected');
      expect(result).to.have.property('qualityScore');
      expect(result.qualityScore).to.be.lessThan(60);
      expect(result).to.have.property('improvementSuggestions');
      expect(result.improvementSuggestions).to.be.an('array');
    });
  });

  describe('Question Bank Management', () => {
    it('should provide question bank statistics for admin', async function() {
      this.timeout(8000);
      
      // Seed some published questions
      const db = admin.firestore();
      const publishedQuestions = [
        {
          id: 'pub-1',
          question: 'Test question 1',
          status: 'published',
          topic: 'dermatology',
          qualityScore: 85,
          difficulty: 0.3,
          createdAt: admin.firestore.Timestamp.now()
        },
        {
          id: 'pub-2',
          question: 'Test question 2',
          status: 'published',
          topic: 'dermatology',
          qualityScore: 78,
          difficulty: 0.6,
          createdAt: admin.firestore.Timestamp.now()
        },
        {
          id: 'draft-1',
          question: 'Draft question',
          status: 'draft',
          topic: 'dermatology',
          qualityScore: 65,
          difficulty: 0.4,
          createdAt: admin.firestore.Timestamp.now()
        }
      ];

      for (const question of publishedQuestions) {
        await db.collection('questions').doc(question.id).set(question);
      }

      const result = await getQuestionBankStats({}, testAdminContext);

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('totalQuestions');
      expect(result.totalQuestions).to.be.at.least(3);
      expect(result).to.have.property('publishedQuestions');
      expect(result.publishedQuestions).to.be.at.least(2);
      expect(result).to.have.property('averageQuality');
      expect(result.averageQuality).to.be.a('number');
      expect(result).to.have.property('difficultyDistribution');
      expect(result.difficultyDistribution).to.be.an('object');
    });

    it('should import sample legacy questions', async function() {
      this.timeout(8000);

      const result = await importSampleLegacyQuestions({}, testAdminContext);

      expect(result).to.have.property('success', true);
      expect(result.importedCount).to.be.greaterThan(0);

      const snapshot = await admin.firestore()
        .collection('items')
        .where('source', '==', 'legacy_question_bank')
        .get();
      expect(snapshot.size).to.be.at.least(result.importedCount);
    });
  });

  describe('Authorization and Security', () => {
    it('should deny admin functions to non-admin users', async function() {
      this.timeout(5000);
      
        const restrictedFunctions = [
        () => admin_generateQuestionQueue({ topicIds: ['test'] }, testUserContext),
        () => admin_getQuestionQueue({}, testUserContext),
        () => admin_reviewQuestion({ questionId: 'test', action: 'approve' }, testUserContext),
        () => getQuestionBankStats({}, testUserContext),
        () => importSampleLegacyQuestions({}, testUserContext)
      ];

      for (const func of restrictedFunctions) {
        try {
          await func();
          expect.fail('Should have thrown authorization error');
        } catch (error: any) {
          expect(error.message).to.match(/admin|unauthorized|permission/i);
        }
      }
    });

    it('should validate input parameters', async function() {
      this.timeout(5000);
      
        const invalidRequests = [
          { func: 'generateQueue', data: {} }, // Missing topicIds
          { func: 'generateQueue', data: { topicIds: 'invalid' } }, // Invalid topicIds type
          { func: 'reviewQuestion', data: {} }, // Missing questionId
          { func: 'reviewQuestion', data: { questionId: 'test' } } // Missing action
        ];

      for (const request of invalidRequests) {
        try {
          switch (request.func) {
            case 'generateQueue':
              await admin_generateQuestionQueue(request.data, testAdminContext);
              break;
            case 'reviewQuestion':
              await admin_reviewQuestion(request.data, testAdminContext);
              break;
          }
          expect.fail(`Should have thrown validation error for ${request.func}`);
        } catch (error: any) {
          expect(error.message).to.match(/required|invalid|parameter/i);
        }
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large question queue efficiently', async function() {
      this.timeout(15000);
      
      // Seed a large number of queue items
      const db = admin.firestore();
      const batchSize = 50;
      const batch = db.batch();

      for (let i = 0; i < batchSize; i++) {
        const docRef = db.collection('admin_queue').doc(`perf-test-${i}`);
        batch.set(docRef, {
          question: `Performance test question ${i}`,
          status: 'pending_review',
          priority: i % 3 === 0 ? 'high' : 'medium',
          qualityScore: 70 + (i % 20),
          createdAt: admin.firestore.Timestamp.now()
        });
      }

      await batch.commit();

      const startTime = Date.now();
      const result = await admin_getQuestionQueue({ limit: 20 }, testAdminContext);
      const endTime = Date.now();

      expect(endTime - startTime).to.be.lessThan(3000); // Should complete within 3 seconds
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('items');
      expect(result.items).to.have.length.at.most(20);
      expect(result).to.have.property('totalCount');
      expect(result.totalCount).to.be.at.least(batchSize);
    });

    it('should handle concurrent admin operations', async function() {
      this.timeout(20000);
      
      // Mock AI responses for concurrent operations
      MockAI.mockGemini(JSON.stringify({
        clinical_vignette: 'Concurrent test vignette',
        lead_in: 'Concurrent test question?',
        answer_options: [
          { text: 'A', is_correct: true },
          { text: 'B', is_correct: false },
          { text: 'C', is_correct: false },
          { text: 'D', is_correct: false }
        ],
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'YES',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      }));

      // Run multiple admin operations concurrently
      const operations = [
        admin_generateQuestionQueue({ topicIds: ['test1'], count: 1 }, testAdminContext),
        admin_generateQuestionQueue({ topicIds: ['test2'], count: 1 }, testAdminContext),
        admin_getQuestionQueue({}, testAdminContext),
        getQuestionBankStats({}, testAdminContext)
      ];

      const results = await Promise.all(operations);

      expect(results).to.have.length(4);
      results.forEach(result => {
        expect(result).to.have.property('success', true);
      });
    });
  });
});