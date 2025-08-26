import { expect } from 'chai';
import { describe, it, before, after, beforeEach } from 'mocha';
import { IntegrationTestContext, setupEmulators, testDataFactory } from './integrationTestUtils';

describe('Quiz Workflow Integration Tests @integration', () => {
  let testContext: IntegrationTestContext;
  let testUserId: string;
  let testUserContext: any;

  before(async function() {
    this.timeout(10000);
    setupEmulators();
    testContext = new IntegrationTestContext();
    await testContext.cleanup();
    
    // Create a test user for all quiz tests
    testUserId = 'quiz-test-user';
    await testContext.createUser(testUserId, 'quiz-user@test.com');
    testUserContext = testContext.createCallableContext(testUserId);
    
    // Seed initial data
    await testContext.seedTestData();
  });

  after(async function() {
    this.timeout(10000);
    await testContext.cleanup();
  });

  describe('Getting Quiz Questions', () => {
    it('should retrieve next items for a quiz', async () => {
      const result = await testContext.callFunction(
        'pe_get_next_items',
        { count: 5 },
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.items).to.be.an('array');
      expect(result.items.length).to.be.at.least(1);
      expect(result.items.length).to.be.at.most(5);

      // Validate question structure
      result.items.forEach((item: any) => {
        expect(item).to.have.property('id');
        expect(item).to.have.property('stem');
        expect(item).to.have.property('leadIn');
        expect(item).to.have.property('options').that.is.an('array');
        expect(item.options.length).to.equal(5);
        expect(item).to.have.property('keyIndex').that.is.a('number');
        expect(item).to.have.property('difficulty').that.is.a('number');
      });
    });

    it('should retrieve questions filtered by topic', async () => {
      const result = await testContext.callFunction(
        'pe_get_next_items',
        { 
          count: 3,
          topicIds: ['inflammatory', 'psoriasis']
        },
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.items).to.be.an('array');
      
      // Check that returned items match the requested topics
      result.items.forEach((item: any) => {
        expect(item.topicIds).to.include.oneOf(['inflammatory', 'psoriasis']);
      });
    });

    it('should retrieve questions with appropriate difficulty', async () => {
      const targetDifficulty = 0.6;
      const result = await testContext.callFunction(
        'pe_next_item',
        { 
          userId: testUserId,
          targetDifficulty: targetDifficulty
        },
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.item).to.exist;
      
      // Check difficulty is within reasonable range
      const difficulty = result.item.difficulty;
      expect(difficulty).to.be.at.least(0);
      expect(difficulty).to.be.at.most(1);
    });

    it('should exclude already seen questions', async () => {
      // Get first batch
      const firstBatch = await testContext.callFunction(
        'pe_get_next_items',
        { count: 2 },
        testUserContext
      );
      
      const seenIds = firstBatch.items.map((item: any) => item.id);
      
      // Get second batch excluding first
      const secondBatch = await testContext.callFunction(
        'pe_get_next_items',
        { 
          count: 2,
          excludeIds: seenIds
        },
        testUserContext
      );

      testContext.expectSuccess(secondBatch);
      
      // Verify no overlap
      const secondIds = secondBatch.items.map((item: any) => item.id);
      const hasOverlap = seenIds.some(id => secondIds.includes(id));
      expect(hasOverlap).to.be.false;
    });
  });

  describe('Recording Quiz Answers', () => {
    let testQuestionId: string;

    beforeEach(async () => {
      // Get a test question
      const result = await testContext.callFunction(
        'pe_get_next_items',
        { count: 1 },
        testUserContext
      );
      testQuestionId = result.items[0].id;
    });

    it('should record a correct answer', async () => {
      const answerData = {
        itemId: testQuestionId,
        answer: 0, // Assuming this is correct based on seed data
        correct: true,
        timeSpent: 45,
        confidence: 80,
        userId: testUserId
      };

      const result = await testContext.callFunction(
        'pe_record_answer',
        answerData,
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.recorded).to.be.true;
      
      // Verify answer was saved to Firestore
      const attemptDoc = await testContext.getFirestore()
        .collection('attempts')
        .where('userId', '==', testUserId)
        .where('itemId', '==', testQuestionId)
        .limit(1)
        .get();
      
      expect(attemptDoc.empty).to.be.false;
      const attempt = attemptDoc.docs[0].data();
      expect(attempt.correct).to.be.true;
      expect(attempt.timeSpent).to.equal(45);
      expect(attempt.confidence).to.equal(80);
    });

    it('should record an incorrect answer', async () => {
      const answerData = {
        itemId: testQuestionId,
        answer: 2, // Wrong answer
        correct: false,
        timeSpent: 60,
        confidence: 50,
        userId: testUserId
      };

      const result = await testContext.callFunction(
        'pe_record_answer',
        answerData,
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.recorded).to.be.true;
      
      // Verify answer was saved
      const attemptDoc = await testContext.getFirestore()
        .collection('attempts')
        .where('userId', '==', testUserId)
        .where('itemId', '==', testQuestionId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
      
      expect(attemptDoc.empty).to.be.false;
      const attempt = attemptDoc.docs[0].data();
      expect(attempt.correct).to.be.false;
    });

    it('should record a complete quiz session', async () => {
      const sessionData = testDataFactory.createQuizSession({
        userId: testUserId,
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
      });

      const result = await testContext.callFunction(
        'pe_record_quiz_session',
        sessionData,
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.sessionId).to.exist;
      expect(result.recorded).to.be.true;
      expect(result.stats).to.exist;
      expect(result.stats.totalQuestions).to.equal(2);
      expect(result.stats.correctAnswers).to.equal(1);
      expect(result.stats.accuracy).to.equal(50);
    });
  });

  describe('User Progress and Statistics', () => {
    it('should update user ability after answering questions', async () => {
      const responses = [
        { itemId: 'test-q1', correct: true, difficulty: 0.5 },
        { itemId: 'test-q2', correct: false, difficulty: 0.7 },
      ];

      const result = await testContext.callFunction(
        'pe_update_ability',
        { userId: testUserId, responses },
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.newAbility).to.exist;
      expect(result.newAbility.theta).to.be.a('number');
      expect(result.previousAbility).to.exist;
      
      // Verify ability was updated in user profile
      const userDoc = await testContext.getFirestore()
        .collection('users')
        .doc(testUserId)
        .get();
      
      const userData = userDoc.data();
      expect(userData?.ability).to.exist;
      expect(userData?.ability.theta).to.equal(result.newAbility.theta);
    });

    it('should track user mastery by topic', async () => {
      // Record answers for specific topics
      const answerData = {
        itemId: 'test-q1',
        answer: 0,
        correct: true,
        timeSpent: 45,
        confidence: 80,
        userId: testUserId,
        topicIds: ['inflammatory', 'psoriasis']
      };

      await testContext.callFunction(
        'pe_record_answer',
        answerData,
        testUserContext
      );

      // Check mastery update
      const userDoc = await testContext.getFirestore()
        .collection('users')
        .doc(testUserId)
        .get();
      
      const userData = userDoc.data();
      expect(userData?.mastery).to.exist;
      
      // Mastery should be tracked for the topics
      if (userData?.mastery['inflammatory']) {
        expect(userData.mastery['inflammatory'].pMastery).to.be.a('number');
        expect(userData.mastery['inflammatory'].pMastery).to.be.at.least(0);
        expect(userData.mastery['inflammatory'].pMastery).to.be.at.most(1);
      }
    });

    it('should update user statistics after quiz completion', async () => {
      // Get initial stats
      const userDocBefore = await testContext.getFirestore()
        .collection('users')
        .doc(testUserId)
        .get();
      const statsBefore = userDocBefore.data()?.stats || {};
      
      // Complete a quiz session
      const sessionData = testDataFactory.createQuizSession({
        userId: testUserId,
        answers: [
          { itemId: 'test-q1', answer: 0, correct: true, timeSpent: 45, confidence: 90 },
          { itemId: 'test-q2', answer: 0, correct: true, timeSpent: 50, confidence: 85 },
        ],
      });

      await testContext.callFunction(
        'pe_record_quiz_session',
        sessionData,
        testUserContext
      );

      // Get updated stats
      const userDocAfter = await testContext.getFirestore()
        .collection('users')
        .doc(testUserId)
        .get();
      const statsAfter = userDocAfter.data()?.stats || {};

      // Verify stats were updated
      expect(statsAfter.quizzesTaken).to.be.greaterThan(statsBefore.quizzesTaken || 0);
      expect(statsAfter.lastStudiedAt).to.exist;
    });
  });

  describe('Spaced Repetition System', () => {
    it('should update SRS schedule after answering', async () => {
      const updateData = {
        userId: testUserId,
        itemId: 'test-q1',
        performance: 'good',
        timeSpent: 45
      };

      const result = await testContext.callFunction(
        'pe_srs_update',
        updateData,
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.nextReview).to.exist;
      expect(result.interval).to.be.a('number');
      expect(result.interval).to.be.greaterThan(0);
    });

    it('should retrieve due items for review', async () => {
      // First, update some items with SRS
      await testContext.callFunction(
        'pe_srs_update',
        { userId: testUserId, itemId: 'test-q1', performance: 'again' },
        testUserContext
      );

      // Get due items
      const result = await testContext.callFunction(
        'pe_srs_due',
        { userId: testUserId, limit: 10 },
        testUserContext
      );

      testContext.expectSuccess(result);
      expect(result.dueItems).to.be.an('array');
      
      // Items marked as 'again' should be due immediately
      const hasDueItem = result.dueItems.some((item: any) => item.itemId === 'test-q1');
      expect(hasDueItem).to.be.true;
    });
  });
});
