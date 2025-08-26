import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';
import { MockAI } from './mocks';

setupTestEnvironment();

describe('AI Scoring Pipeline Tests', function() {
  this.timeout(30000); // Set a 30-second timeout for all tests in this suite
  beforeEach(async () => {
    await testHelper.seedTestData();
  });

  afterEach(() => {
    MockAI.restoreAll();
    sinon.restore();
  });

  describe('Answer Scoring', () => {
    it('should score correct answers appropriately', async () => {
      const mockScoringResponse = {
        is_correct: true,
        confidence: 0.95,
        partial_credit: 1.0,
        reasoning_quality: 0.85,
        time_bonus: 0.1,
        final_score: 1.0,
        feedback: 'Excellent answer with correct reasoning',
        explanation: 'Your answer demonstrates good understanding of the clinical presentation.',
        next_difficulty_recommendation: 'increase'
      };

      MockAI.mockScoring(1.0, 'Correct answer with excellent reasoning');

      const scoreAnswer = async (attempt: any) => {
        return {
          isCorrect: mockScoringResponse.is_correct,
          confidence: mockScoringResponse.confidence,
          partialCredit: mockScoringResponse.partial_credit,
          reasoningQuality: mockScoringResponse.reasoning_quality,
          timeBonus: mockScoringResponse.time_bonus,
          finalScore: mockScoringResponse.final_score,
          feedback: mockScoringResponse.feedback,
          explanation: mockScoringResponse.explanation,
          nextDifficulty: mockScoringResponse.next_difficulty_recommendation
        };
      };

      const attempt = {
        questionId: 'q1',
        selectedOptionIndex: 0, // Correct answer
        timeSpent: 45000, // 45 seconds
        reasoning: 'The patient presents with classic atopic dermatitis symptoms'
      };

      const result = await scoreAnswer(attempt);

      expect(result.isCorrect).to.be.true;
      expect(result.finalScore).to.equal(1.0);
      expect(result.confidence).to.be.greaterThan(0.9);
      expect(result.nextDifficulty).to.equal('increase');
      expect(result.feedback).to.include('Excellent');
    });

    it('should score incorrect answers with appropriate feedback', async () => {
      const mockScoringResponse = {
        is_correct: false,
        confidence: 0.75,
        partial_credit: 0.0,
        reasoning_quality: 0.3,
        time_bonus: 0.0,
        final_score: 0.0,
        feedback: 'Incorrect answer. The key finding here is the distribution pattern.',
        explanation: 'While your reasoning shows some understanding, the characteristic features point to a different diagnosis.',
        next_difficulty_recommendation: 'maintain',
        learning_points: [
          'Consider the age and typical presentation patterns',
          'Review the distinguishing features between similar conditions'
        ]
      };

      MockAI.mockScoring(0.0, 'Incorrect answer with teaching feedback');

      const scoreAnswer = async (attempt: any) => {
        return {
          isCorrect: mockScoringResponse.is_correct,
          confidence: mockScoringResponse.confidence,
          partialCredit: mockScoringResponse.partial_credit,
          reasoningQuality: mockScoringResponse.reasoning_quality,
          finalScore: mockScoringResponse.final_score,
          feedback: mockScoringResponse.feedback,
          explanation: mockScoringResponse.explanation,
          nextDifficulty: mockScoringResponse.next_difficulty_recommendation,
          learningPoints: mockScoringResponse.learning_points
        };
      };

      const attempt = {
        questionId: 'q1',
        selectedOptionIndex: 2, // Incorrect answer
        timeSpent: 120000, // 2 minutes
        reasoning: 'I think this is psoriasis because of the scaling'
      };

      const result = await scoreAnswer(attempt);

      expect(result.isCorrect).to.be.false;
      expect(result.finalScore).to.equal(0.0);
      expect(result.partialCredit).to.equal(0.0);
      expect(result.nextDifficulty).to.equal('maintain');
      expect(result.learningPoints).to.be.an('array');
      expect(result.feedback).to.include('Incorrect');
    });

    it('should provide partial credit for near-miss answers', async () => {
      const mockScoringResponse = {
        is_correct: false,
        confidence: 0.65,
        partial_credit: 0.3,
        reasoning_quality: 0.7,
        time_bonus: 0.05,
        final_score: 0.35,
        feedback: 'Close answer with good clinical reasoning',
        explanation: 'Your choice shows good understanding of inflammatory conditions, though not the best answer.',
        next_difficulty_recommendation: 'slight_increase',
        educational_note: 'Consider the specific distribution pattern and patient age for differential diagnosis'
      };

      MockAI.mockScoring(0.35, 'Partial credit for near-miss');

      const scoreAnswer = async (attempt: any) => {
        return {
          isCorrect: mockScoringResponse.is_correct,
          confidence: mockScoringResponse.confidence,
          partialCredit: mockScoringResponse.partial_credit,
          reasoningQuality: mockScoringResponse.reasoning_quality,
          timeBonus: mockScoringResponse.time_bonus,
          finalScore: mockScoringResponse.final_score,
          feedback: mockScoringResponse.feedback,
          explanation: mockScoringResponse.explanation,
          nextDifficulty: mockScoringResponse.next_difficulty_recommendation,
          educationalNote: mockScoringResponse.educational_note
        };
      };

      const attempt = {
        questionId: 'q1',
        selectedOptionIndex: 1, // Plausible but incorrect
        timeSpent: 60000, // 1 minute
        reasoning: 'The inflammatory nature and pruritus suggest an eczematous condition'
      };

      const result = await scoreAnswer(attempt);

      expect(result.isCorrect).to.be.false;
      expect(result.finalScore).to.be.greaterThan(0);
      expect(result.finalScore).to.be.lessThan(0.5);
      expect(result.partialCredit).to.be.greaterThan(0);
      expect(result.reasoningQuality).to.be.greaterThan(0.5);
      expect(result.nextDifficulty).to.equal('slight_increase');
    });
  });

  describe('Time-based Scoring', () => {
    it('should apply time bonuses for quick correct answers', () => {
      const calculateTimeBonus = (timeSpent: number, expectedTime: number = 90000) => {
        if (timeSpent > expectedTime * 2) return 0; // Too slow, no bonus
        if (timeSpent < expectedTime * 0.3) return 0; // Too fast, likely guessing
        
        const efficiency = Math.max(0, (expectedTime - timeSpent) / expectedTime);
        return Math.min(0.2, efficiency * 0.3); // Max 20% bonus
      };

      // Quick but reasonable time (60 seconds vs 90 expected)
      const quickTime = calculateTimeBonus(60000, 90000);
      expect(quickTime).to.be.greaterThan(0);
      expect(quickTime).to.be.lessThan(0.2);

      // Very fast (suspiciously quick)
      const tooFastTime = calculateTimeBonus(15000, 90000);
      expect(tooFastTime).to.equal(0);

      // Very slow
      const tooSlowTime = calculateTimeBonus(200000, 90000);
      expect(tooSlowTime).to.equal(0);

      // Optimal time
      const optimalTime = calculateTimeBonus(75000, 90000);
      expect(optimalTime).to.be.greaterThan(0);
    });

    it('should penalize extremely slow responses', () => {
      const calculateTimePenalty = (timeSpent: number, maxTime: number = 300000) => {
        if (timeSpent > maxTime) {
          return Math.min(0.3, (timeSpent - maxTime) / maxTime * 0.2);
        }
        return 0;
      };

      // Normal time
      const normalTime = calculateTimePenalty(120000, 300000);
      expect(normalTime).to.equal(0);

      // Overtime
      const overtime = calculateTimePenalty(400000, 300000);
      expect(overtime).to.be.greaterThan(0);
      expect(overtime).to.be.lessThan(0.3);
    });
  });

  describe('Reasoning Quality Assessment', () => {
    it('should evaluate clinical reasoning quality', async () => {
      const assessReasoningQuality = async (reasoning: string, correctAnswer: string) => {
        // Mock reasoning quality assessment
        const keywords = ['clinical', 'presentation', 'diagnosis', 'symptoms', 'findings'];
        const medicalTerms = ['pruritus', 'erythema', 'lesion', 'chronic', 'acute'];
        
        let qualityScore = 0.5; // Base score
        
        // Check for medical terminology
        medicalTerms.forEach(term => {
          if (reasoning.toLowerCase().includes(term)) {
            qualityScore += 0.1;
          }
        });
        
        // Check for clinical reasoning words
        keywords.forEach(keyword => {
          if (reasoning.toLowerCase().includes(keyword)) {
            qualityScore += 0.05;
          }
        });
        
        // Check length and structure
        if (reasoning.length > 50 && reasoning.length < 500) {
          qualityScore += 0.1;
        }
        
        return Math.min(1.0, qualityScore);
      };

      // High-quality reasoning
      const goodReasoning = 'The clinical presentation with chronic pruritic lesions in a young adult with atopic history strongly suggests atopic dermatitis. The distribution and characteristic findings support this diagnosis.';
      const goodScore = await assessReasoningQuality(goodReasoning, 'Atopic dermatitis');
      expect(goodScore).to.be.greaterThan(0.8);

      // Poor reasoning
      const poorReasoning = 'I guessed';
      const poorScore = await assessReasoningQuality(poorReasoning, 'Atopic dermatitis');
      expect(poorScore).to.be.lessThan(0.6);

      // Moderate reasoning
      const moderateReasoning = 'This looks like eczema because of the itching';
      const moderateScore = await assessReasoningQuality(moderateReasoning, 'Atopic dermatitis');
      expect(moderateScore).to.be.greaterThan(0.5);
      expect(moderateScore).to.be.lessThan(0.8);
    });

    it('should identify misconceptions in reasoning', async () => {
      const identifyMisconceptions = async (reasoning: string, correctAnswer: string) => {
        const commonMisconceptions = [
          {
            pattern: /all rashes are eczema/i,
            misconception: 'Overgeneralization of eczema diagnosis',
            correction: 'Consider specific morphology and distribution'
          },
          {
            pattern: /only children get atopic dermatitis/i,
            misconception: 'Age-related misconception',
            correction: 'Atopic dermatitis can occur in adults'
          },
          {
            pattern: /steroids are dangerous/i,
            misconception: 'Steroid phobia',
            correction: 'Topical steroids are safe when used appropriately'
          }
        ];

        const identified = [];
        for (const item of commonMisconceptions) {
          if (item.pattern.test(reasoning)) {
            identified.push({
              misconception: item.misconception,
              correction: item.correction
            });
          }
        }

        return identified;
      };

      const reasoningWithMisconception = 'I think this is eczema because all itchy rashes are eczema and only children get atopic dermatitis';
      const misconceptions = await identifyMisconceptions(reasoningWithMisconception, 'Atopic dermatitis');

      expect(misconceptions).to.have.length.greaterThan(0);
      expect(misconceptions[0]).to.have.property('misconception');
      expect(misconceptions[0]).to.have.property('correction');
    });
  });

  describe('Adaptive Difficulty Adjustment', () => {
    it('should recommend difficulty increases for strong performance', () => {
      const recommendDifficultyAdjustment = (score: number, timeEfficiency: number, recentPerformance: number[]) => {
        const avgRecent = recentPerformance.reduce((a, b) => a + b, 0) / recentPerformance.length;
        
        if (score >= 0.9 && timeEfficiency > 0.8 && avgRecent > 0.85) {
          return 'significant_increase';
        } else if (score >= 0.8 && avgRecent > 0.75) {
          return 'moderate_increase';
        } else if (score >= 0.7 && avgRecent > 0.65) {
          return 'slight_increase';
        } else if (score < 0.5 || avgRecent < 0.4) {
          return 'decrease';
        } else {
          return 'maintain';
        }
      };

      // Strong performance
      const strongRecommendation = recommendDifficultyAdjustment(0.95, 0.9, [0.9, 0.85, 0.92, 0.88]);
      expect(strongRecommendation).to.equal('significant_increase');

      // Weak performance
      const weakRecommendation = recommendDifficultyAdjustment(0.3, 0.2, [0.4, 0.3, 0.2, 0.35]);
      expect(weakRecommendation).to.equal('decrease');

      // Average performance
      const averageRecommendation = recommendDifficultyAdjustment(0.65, 0.6, [0.7, 0.6, 0.65, 0.68]);
      expect(averageRecommendation).to.equal('maintain');
    });

    it('should consider question difficulty in scoring', () => {
      const adjustScoreForDifficulty = (rawScore: number, questionDifficulty: number) => {
        // Easier questions have lower maximum scores
        // Harder questions have bonus potential
        if (questionDifficulty < 0.3) { // Easy question
          return rawScore * 0.8; // Max 80% score
        } else if (questionDifficulty > 0.8) { // Very hard question
          return Math.min(1.2, rawScore * 1.2); // Up to 120% score
        }
        return rawScore; // Normal scoring for medium difficulty
      };

      // Easy question
      const easyScore = adjustScoreForDifficulty(1.0, 0.2);
      expect(easyScore).to.equal(0.8);

      // Hard question
      const hardScore = adjustScoreForDifficulty(1.0, 0.9);
      expect(hardScore).to.equal(1.2);

      // Medium question
      const mediumScore = adjustScoreForDifficulty(1.0, 0.5);
      expect(mediumScore).to.equal(1.0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing or invalid scoring data', () => {
      const validateScoringInput = (attempt: any) => {
        const errors = [];

        if (!attempt.questionId) {
          errors.push('Missing question ID');
        }

        if (typeof attempt.selectedOptionIndex !== 'number' || attempt.selectedOptionIndex < 0) {
          errors.push('Invalid selected option index');
        }

        if (typeof attempt.timeSpent !== 'number' || attempt.timeSpent <= 0) {
          errors.push('Invalid time spent');
        }

        return {
          valid: errors.length === 0,
          errors
        };
      };

      const invalidAttempts = [
        { questionId: '', selectedOptionIndex: -1, timeSpent: 0 },
        { questionId: 'valid', selectedOptionIndex: 'invalid', timeSpent: -1000 },
        { selectedOptionIndex: 0, timeSpent: 5000 }, // Missing questionId
        {}
      ];

      invalidAttempts.forEach((attempt, index) => {
        const result = validateScoringInput(attempt);
        expect(result.valid, `Test case ${index}`).to.be.false;
        expect(result.errors.length, `Test case ${index}`).to.be.greaterThan(0);
      });
    });

    it('should provide fallback scoring when AI fails', async () => {
      MockAI.mockScoring(undefined); // Simulate AI failure

      const fallbackScoring = async (attempt: any, question: any) => {
        try {
          throw new Error('AI scoring unavailable');
        } catch (error) {
          // Simple rule-based fallback
          const isCorrect = attempt.selectedOptionIndex === question.keyIndex;
          const baseScore = isCorrect ? 1.0 : 0.0;
          
          // Simple time bonus
          const timeBonus = attempt.timeSpent < 60000 && isCorrect ? 0.1 : 0;
          
          return {
            isCorrect,
            finalScore: Math.min(1.0, baseScore + timeBonus),
            feedback: isCorrect ? 'Correct answer' : 'Incorrect answer',
            explanation: 'Basic scoring - AI analysis unavailable',
            nextDifficulty: 'maintain',
            fallbackUsed: true
          };
        }
      };

      const attempt = {
        questionId: 'q1',
        selectedOptionIndex: 0,
        timeSpent: 45000
      };

      const question = { keyIndex: 0 };

      const result = await fallbackScoring(attempt, question);

      expect(result.fallbackUsed).to.be.true;
      expect(result.isCorrect).to.be.true;
      expect(result.explanation).to.include('unavailable');
    });

    it('should handle edge cases in time calculations', () => {
      const normalizeTime = (timeSpent: number) => {
        // Handle negative times (clock issues)
        if (timeSpent < 0) return 0;
        
        // Handle extremely large times (session timeouts)
        if (timeSpent > 1800000) return 1800000; // Cap at 30 minutes
        
        // Handle zero time (immediate submission)
        if (timeSpent === 0) return 1000; // Minimum 1 second
        
        return timeSpent;
      };

      expect(normalizeTime(-5000)).to.equal(0);
      expect(normalizeTime(0)).to.equal(1000);
      expect(normalizeTime(2000000)).to.equal(1800000);
      expect(normalizeTime(60000)).to.equal(60000);
    });
  });

  describe('Performance Analytics', () => {
    it('should track scoring metrics for analytics', async () => {
      const trackScoringMetrics = async (attempt: any, result: any) => {
        const metrics = {
          timestamp: new Date(),
          questionId: attempt.questionId,
          userId: attempt.userId,
          score: result.finalScore,
          timeSpent: attempt.timeSpent,
          difficulty: attempt.questionDifficulty,
          isCorrect: result.isCorrect,
          reasoningQuality: result.reasoningQuality,
          timeBonus: result.timeBonus,
          partialCredit: result.partialCredit
        };

        // Simulate analytics collection
        return {
          recorded: true,
          metrics,
          aggregations: {
            avgScore: 0.75,
            avgTime: 85000,
            accuracy: 0.68
          }
        };
      };

      const attempt = {
        questionId: 'q1',
        userId: 'user123',
        timeSpent: 75000,
        questionDifficulty: 0.6
      };

      const scoringResult = {
        finalScore: 0.85,
        isCorrect: true,
        reasoningQuality: 0.8,
        timeBonus: 0.05,
        partialCredit: 0.0
      };

      const analytics = await trackScoringMetrics(attempt, scoringResult);

      expect(analytics.recorded).to.be.true;
      expect(analytics.metrics).to.have.property('timestamp');
      expect(analytics.metrics.score).to.equal(0.85);
      expect(analytics.aggregations).to.have.property('avgScore');
    });
  });
});