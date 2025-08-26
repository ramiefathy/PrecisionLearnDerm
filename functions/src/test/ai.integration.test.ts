import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import * as sinon from 'sinon';
import { IntegrationTestContext, setupEmulators } from './integrationTestUtils';

describe('AI Generation Pipeline Integration Tests @integration', () => {
  let testContext: IntegrationTestContext;
  let adminContext: any;
  let geminiStub: sinon.SinonStub;

  before(async function() {
    this.timeout(10000);
    setupEmulators();
    testContext = new IntegrationTestContext();
    await testContext.cleanup();
    
    // Create admin user
    await testContext.createAdminUser('ai-test-admin', 'ai-admin@test.com');
    adminContext = testContext.createCallableContext('ai-test-admin', { admin: true });
    
    // Stub Gemini API
    const stubs = testContext.stubExternalAPIs();
    geminiStub = stubs.geminiStub;
  });

  after(async function() {
    this.timeout(10000);
    await testContext.cleanup();
    if (geminiStub) geminiStub.restore();
  });

  describe('Question Generation', () => {
    it('should generate a board-style MCQ question', async () => {
      // Mock Gemini response
      geminiStub.resolves({
        response: {
          text: () => JSON.stringify({
            stem: 'A 45-year-old woman presents with a 6-month history of symmetric joint pain and morning stiffness lasting > 1 hour. Physical examination reveals synovitis of MCPs and PIPs bilaterally.',
            leadIn: 'What is the most appropriate initial diagnostic test?',
            options: [
              { text: 'Rheumatoid factor and anti-CCP antibodies' },
              { text: 'ANA and anti-dsDNA' },
              { text: 'HLA-B27' },
              { text: 'Serum uric acid' },
              { text: 'Joint aspiration and crystal analysis' }
            ],
            keyIndex: 0,
            explanation: 'The clinical presentation suggests rheumatoid arthritis. RF and anti-CCP antibodies are the most appropriate initial tests.',
            difficulty: 0.6,
            topicIds: ['inflammatory', 'arthritis']
          })
        }
      });

      const result = await testContext.callFunction(
        'ai_generate_mcq',
        { 
          topic: 'rheumatoid arthritis',
          difficulty: 0.6,
          boardStyle: true
        },
        adminContext
      );

      testContext.expectSuccess(result);
      expect(result.question).to.exist;
      expect(result.question.stem).to.include('45-year-old woman');
      expect(result.question.options).to.have.lengthOf(5);
      expect(result.question.keyIndex).to.equal(0);
    });

    it('should handle generation failures gracefully', async () => {
      // Mock failed response
      geminiStub.rejects(new Error('API quota exceeded'));

      try {
        await testContext.callFunction(
          'ai_generate_mcq',
          { topic: 'test topic' },
          adminContext
        );
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('quota');
      }
    });
  });

  describe('Question Review Pipeline', () => {
    it('should review and improve a question', async () => {
      const draftQuestion = {
        stem: 'What causes psoriasis?',
        leadIn: 'Choose the correct answer:',
        options: [
          { text: 'Genetics' },
          { text: 'Stress' },
          { text: 'Infection' },
          { text: 'Diet' },
          { text: 'Unknown' }
        ],
        keyIndex: 0,
        explanation: 'Psoriasis has genetic factors.'
      };

      // Mock review response
      geminiStub.resolves({
        response: {
          text: () => JSON.stringify({
            improved: true,
            stem: 'A 35-year-old man presents with well-demarcated, erythematous plaques with silvery scales on extensor surfaces. Family history is positive for similar skin conditions.',
            leadIn: 'Which factor is most strongly associated with this condition?',
            options: [
              { text: 'Genetic predisposition with HLA-Cw6 association' },
              { text: 'Chronic psychological stress' },
              { text: 'Group A streptococcal infection' },
              { text: 'High-fat dietary intake' },
              { text: 'Idiopathic etiology' }
            ],
            feedback: 'Improved clinical vignette and made options more specific',
            score: 85
          })
        }
      });

      const result = await testContext.callFunction(
        'ai_review_mcq',
        { draftItem: draftQuestion, draftId: 'test-draft-1' },
        adminContext
      );

      testContext.expectSuccess(result);
      expect(result.improved).to.be.true;
      expect(result.score).to.be.greaterThan(80);
      expect(result.stem).to.include('35-year-old');
    });
  });

  describe('Question Scoring', () => {
    it('should score a user answer with detailed feedback', async () => {
      const questionItem = {
        stem: 'A patient presents with targetoid lesions after starting a new medication.',
        leadIn: 'What is the most likely diagnosis?',
        options: [
          { text: 'Stevens-Johnson syndrome' },
          { text: 'Toxic epidermal necrolysis' },
          { text: 'Erythema multiforme' },
          { text: 'Fixed drug eruption' },
          { text: 'DRESS syndrome' }
        ],
        keyIndex: 2,
        explanation: 'Targetoid lesions are characteristic of erythema multiforme.'
      };

      // Mock scoring response
      geminiStub.resolves({
        response: {
          text: () => JSON.stringify({
            correct: false,
            userAnswer: 0,
            correctAnswer: 2,
            feedback: 'While SJS can present with skin lesions, the classic targetoid lesions are most characteristic of erythema multiforme.',
            conceptsToReview: ['Drug reactions', 'Erythema multiforme', 'SJS/TEN spectrum'],
            difficulty: 0.7
          })
        }
      });

      const result = await testContext.callFunction(
        'ai_score_mcq',
        { 
          questionItem,
          userAnswer: 0,
          draftId: 'test-score-1'
        },
        adminContext
      );

      testContext.expectSuccess(result);
      expect(result.correct).to.be.false;
      expect(result.feedback).to.exist;
      expect(result.conceptsToReview).to.be.an('array');
    });
  });
});
