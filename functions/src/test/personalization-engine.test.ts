import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';

setupTestEnvironment();

describe('Personalization Engine Tests', () => {
  let mockFirestore: any;

  beforeEach(async () => {
    await testHelper.seedTestData();
    
    mockFirestore = {
      collection: sinon.stub().returns({
        doc: sinon.stub().returns({
          get: sinon.stub().resolves({
            exists: true,
            data: () => ({
              userId: 'test-user',
              overallAbility: 1500,
              topicAbilities: {
                'dermatology.inflammatory.eczema': 1450,
                'dermatology.infectious.bacterial': 1550
              },
              itemHistory: [],
              lastUpdated: new Date()
            })
          }),
          set: sinon.stub().resolves(),
          update: sinon.stub().resolves()
        })
      })
    };

    sinon.stub(admin, 'firestore').returns(mockFirestore as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Ability Estimation (Elo Rating)', () => {
    it('should calculate new ability rating after correct answer', () => {
      const calculateNewAbility = (currentAbility: number, correct: boolean, itemDifficulty: number, confidence: number = 0.7): number => {
        const K = 32; // K-factor for rating changes
        const expectedScore = 1 / (1 + Math.pow(10, (itemDifficulty - currentAbility) / 400));
        const actualScore = correct ? 1 : 0;
        
        // Adjust K-factor based on confidence
        const adjustedK = K * (1 + confidence * 0.5);
        
        return Math.round(currentAbility + adjustedK * (actualScore - expectedScore));
      };

      // Test correct answer on appropriately difficult question
      const newAbility = calculateNewAbility(1500, true, 1500, 0.8);
      expect(newAbility).to.be.greaterThan(1500);

      // Test correct answer on easy question (less rating gain)
      const easyQuestionAbility = calculateNewAbility(1500, true, 1200, 0.8);
      expect(easyQuestionAbility).to.be.greaterThan(1500);
      expect(easyQuestionAbility).to.be.lessThan(newAbility);

      // Test incorrect answer (rating loss)
      const incorrectAbility = calculateNewAbility(1500, false, 1500, 0.5);
      expect(incorrectAbility).to.be.lessThan(1500);
    });

    it('should adjust K-factor based on confidence level', () => {
      const calculateKFactor = (baseK: number, confidence: number): number => {
        return baseK * (1 + confidence * 0.5);
      };

      const baseK = 32;
      
      // High confidence should increase K-factor
      const highConfidenceK = calculateKFactor(baseK, 0.9);
      expect(highConfidenceK).to.be.greaterThan(baseK);

      // Low confidence should have minimal K-factor increase
      const lowConfidenceK = calculateKFactor(baseK, 0.1);
      expect(lowConfidenceK).to.be.greaterThan(baseK);
      expect(lowConfidenceK).to.be.lessThan(highConfidenceK);

      // Zero confidence should equal base K-factor
      const zeroConfidenceK = calculateKFactor(baseK, 0);
      expect(zeroConfidenceK).to.equal(baseK);
    });

    it('should handle edge cases in ability calculation', () => {
      const calculateNewAbility = (currentAbility: number, correct: boolean, itemDifficulty: number, confidence: number = 0.7): number => {
        const K = 32;
        const expectedScore = 1 / (1 + Math.pow(10, (itemDifficulty - currentAbility) / 400));
        const actualScore = correct ? 1 : 0;
        const adjustedK = K * (1 + confidence * 0.5);
        
        const newAbility = currentAbility + adjustedK * (actualScore - expectedScore);
        
        // Clamp ability ratings to reasonable bounds
        return Math.round(Math.max(800, Math.min(2400, newAbility)));
      };

      // Test extreme difficulty differences
      const veryEasyCorrect = calculateNewAbility(1500, true, 800, 0.9);
      const veryHardCorrect = calculateNewAbility(1500, true, 2200, 0.9);
      
      expect(veryEasyCorrect).to.be.greaterThan(1500);
      expect(veryHardCorrect).to.be.greaterThan(veryEasyCorrect);

      // Test ability bounds
      const lowAbility = calculateNewAbility(700, false, 1500, 0.8);
      expect(lowAbility).to.be.at.least(800);

      const highAbility = calculateNewAbility(2500, true, 1000, 0.9);
      expect(highAbility).to.be.at.most(2400);
    });
  });

  describe('Topic-specific Ability Tracking', () => {
    it('should maintain separate ability ratings for different topics', async () => {
      const updateTopicAbility = async (userId: string, topicId: string, newAbility: number) => {
        const userAbilityRef = mockFirestore.collection('userAbilities').doc(userId);
        const currentData = await userAbilityRef.get();
        const userData = currentData.data();
        
        const updatedTopicAbilities = {
          ...userData.topicAbilities,
          [topicId]: newAbility
        };

        await userAbilityRef.update({
          topicAbilities: updatedTopicAbilities,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        return updatedTopicAbilities;
      };

      const updatedAbilities = await updateTopicAbility('test-user', 'dermatology.neoplasms.melanoma', 1600);
      
      expect(updatedAbilities).to.have.property('dermatology.neoplasms.melanoma', 1600);
      expect(updatedAbilities).to.have.property('dermatology.inflammatory.eczema', 1450);
      expect(updatedAbilities).to.have.property('dermatology.infectious.bacterial', 1550);
    });

    it('should calculate weighted overall ability from topic abilities', () => {
      const calculateOverallAbility = (topicAbilities: Record<string, number>, attempts: Record<string, number> = {}): number => {
        const topics = Object.keys(topicAbilities);
        if (topics.length === 0) return 1500; // Default ability
        
        let totalWeightedAbility = 0;
        let totalWeight = 0;
        
        topics.forEach(topic => {
          const weight = Math.max(1, attempts[topic] || 1); // Weight by number of attempts
          totalWeightedAbility += topicAbilities[topic] * weight;
          totalWeight += weight;
        });
        
        return Math.round(totalWeightedAbility / totalWeight);
      };

      const topicAbilities = {
        'dermatology.inflammatory': 1600,
        'dermatology.infectious': 1400,
        'dermatology.neoplasms': 1700
      };

      const attempts = {
        'dermatology.inflammatory': 10,
        'dermatology.infectious': 5,
        'dermatology.neoplasms': 2
      };

      const overallAbility = calculateOverallAbility(topicAbilities, attempts);
      
      // Should be weighted towards topics with more attempts
      expect(overallAbility).to.be.greaterThan(1400);
      expect(overallAbility).to.be.lessThan(1700);
    });

    it('should handle new topics with no prior history', () => {
      const getTopicAbility = (topicAbilities: Record<string, number>, topicId: string, overallAbility: number = 1500): number => {
        // If no specific topic ability, use overall ability as starting point
        return topicAbilities[topicId] || overallAbility;
      };

      const topicAbilities = {
        'dermatology.inflammatory.eczema': 1450
      };

      const existingTopic = getTopicAbility(topicAbilities, 'dermatology.inflammatory.eczema', 1500);
      expect(existingTopic).to.equal(1450);

      const newTopic = getTopicAbility(topicAbilities, 'dermatology.surgical.procedures', 1600);
      expect(newTopic).to.equal(1600);
    });
  });

  describe('Spaced Repetition System (SRS)', () => {
    it('should calculate next review interval based on performance', () => {
      const calculateNextInterval = (currentInterval: number, grade: number, easinessFactor: number = 2.5): { interval: number, easiness: number } => {
        let newEasiness = easinessFactor;
        let newInterval = currentInterval;

        if (grade >= 3) {
          // Successful recall
          if (currentInterval === 0) {
            newInterval = 1; // First review in 1 day
          } else if (currentInterval === 1) {
            newInterval = 6; // Second review in 6 days
          } else {
            newInterval = Math.round(currentInterval * easinessFactor);
          }
          
          // Adjust easiness factor based on grade
          newEasiness = Math.max(1.3, easinessFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
        } else {
          // Failed recall - reset interval
          newInterval = 1;
          newEasiness = Math.max(1.3, easinessFactor - 0.2);
        }

        return { interval: newInterval, easiness: newEasiness };
      };

      // Test successful progression
      const firstReview = calculateNextInterval(0, 4, 2.5);
      expect(firstReview.interval).to.equal(1);
      expect(firstReview.easiness).to.be.greaterThan(2.5);

      const secondReview = calculateNextInterval(1, 4, firstReview.easiness);
      expect(secondReview.interval).to.equal(6);

      const thirdReview = calculateNextInterval(6, 4, secondReview.easiness);
      expect(thirdReview.interval).to.be.greaterThan(6);

      // Test failed recall
      const failedReview = calculateNextInterval(10, 2, 2.5);
      expect(failedReview.interval).to.equal(1);
      expect(failedReview.easiness).to.be.lessThan(2.5);
    });

    it('should identify cards due for review', () => {
      const getDueCards = (cards: any[], currentDate: Date = new Date()) => {
        return cards.filter(card => {
          const dueDate = new Date(card.nextReview);
          return dueDate <= currentDate;
        }).sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());
      };

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const cards = [
        { id: 'card1', nextReview: yesterday.toISOString(), priority: 2 },
        { id: 'card2', nextReview: now.toISOString(), priority: 1 },
        { id: 'card3', nextReview: tomorrow.toISOString(), priority: 3 }
      ];

      const dueCards = getDueCards(cards, now);
      
      expect(dueCards).to.have.length(2);
      expect(dueCards[0].id).to.equal('card1'); // Oldest due first
      expect(dueCards[1].id).to.equal('card2');
    });

    it('should calculate SRS metrics and statistics', () => {
      const calculateSRSMetrics = (cards: any[]) => {
        const totalCards = cards.length;
        const dueCards = cards.filter(card => new Date(card.nextReview) <= new Date()).length;
        const newCards = cards.filter(card => card.interval === 0).length;
        const learningCards = cards.filter(card => card.interval > 0 && card.interval < 21).length;
        const matureCards = cards.filter(card => card.interval >= 21).length;
        
        const avgEasiness = cards.reduce((sum, card) => sum + (card.easinessFactor || 2.5), 0) / totalCards;
        const avgInterval = cards.reduce((sum, card) => sum + card.interval, 0) / totalCards;
        
        return {
          totalCards,
          dueCards,
          newCards,
          learningCards,
          matureCards,
          avgEasiness: Math.round(avgEasiness * 100) / 100,
          avgInterval: Math.round(avgInterval * 10) / 10
        };
      };

      const sampleCards = [
        { interval: 0, easinessFactor: 2.5, nextReview: new Date().toISOString() },
        { interval: 3, easinessFactor: 2.6, nextReview: new Date().toISOString() },
        { interval: 25, easinessFactor: 2.8, nextReview: new Date(Date.now() + 86400000).toISOString() },
        { interval: 45, easinessFactor: 3.0, nextReview: new Date(Date.now() - 86400000).toISOString() }
      ];

      const metrics = calculateSRSMetrics(sampleCards);
      
      expect(metrics.totalCards).to.equal(4);
      expect(metrics.newCards).to.equal(1);
      expect(metrics.learningCards).to.equal(1);
      expect(metrics.matureCards).to.equal(2);
      expect(metrics.dueCards).to.equal(3); // New + current due + overdue
      expect(metrics.avgEasiness).to.be.greaterThan(2.5);
      expect(metrics.avgInterval).to.be.greaterThan(0);
    });
  });

  describe('Adaptive Question Selection', () => {
    it('should select questions based on ability and difficulty match', () => {
      const selectOptimalQuestions = (userAbility: number, availableQuestions: any[], targetCount: number = 5) => {
        // Sort questions by how well they match user ability
        const scoredQuestions = availableQuestions.map(q => {
          const difficultyDiff = Math.abs(q.difficulty - userAbility);
          const optimalDiff = 50; // Optimal difficulty difference
          const score = Math.max(0, 100 - difficultyDiff / optimalDiff * 100);
          
          return { ...q, matchScore: score };
        });

        // Select best matching questions with some randomization
        scoredQuestions.sort((a, b) => b.matchScore - a.matchScore);
        
        // Take top candidates and add some randomization
        const topCandidates = scoredQuestions.slice(0, targetCount * 2);
        const selected = [];
        
        for (let i = 0; i < Math.min(targetCount, topCandidates.length); i++) {
          const randomIndex = Math.floor(Math.random() * Math.min(3, topCandidates.length - i)) + i;
          selected.push(topCandidates[randomIndex]);
          topCandidates.splice(randomIndex, 1);
        }
        
        return selected;
      };

      const userAbility = 1500;
      const questions = [
        { id: 'q1', difficulty: 1450, topic: 'eczema' },
        { id: 'q2', difficulty: 1500, topic: 'psoriasis' },
        { id: 'q3', difficulty: 1550, topic: 'melanoma' },
        { id: 'q4', difficulty: 1200, topic: 'acne' },
        { id: 'q5', difficulty: 1800, topic: 'lupus' }
      ];

      const selectedQuestions = selectOptimalQuestions(userAbility, questions, 3);
      
      expect(selectedQuestions).to.have.length(3);
      // Should prefer questions closer to user ability
      const avgDifficulty = selectedQuestions.reduce((sum, q) => sum + q.difficulty, 0) / selectedQuestions.length;
      expect(Math.abs(avgDifficulty - userAbility)).to.be.lessThan(100);
    });

    it('should prioritize topics based on learning goals and weakness', () => {
      const prioritizeTopics = (topicAbilities: Record<string, number>, learningGoals: string[] = [], recentErrors: Record<string, number> = {}) => {
        const priorities: Record<string, number> = {};
        
        Object.entries(topicAbilities).forEach(([topic, ability]) => {
          let priority = 1.0;
          
          // Boost priority for learning goals
          if (learningGoals.includes(topic)) {
            priority += 0.5;
          }
          
          // Boost priority for topics with recent errors
          if (recentErrors[topic]) {
            priority += recentErrors[topic] * 0.2;
          }
          
          // Boost priority for lower ability topics (focus on weaknesses)
          const avgAbility = Object.values(topicAbilities).reduce((a, b) => a + b, 0) / Object.values(topicAbilities).length;
          if (ability < avgAbility) {
            priority += (avgAbility - ability) / 200;
          }
          
          priorities[topic] = priority;
        });
        
        return priorities;
      };

      const topicAbilities = {
        'dermatology.inflammatory': 1400,
        'dermatology.infectious': 1600,
        'dermatology.neoplasms': 1300
      };

      const learningGoals = ['dermatology.neoplasms'];
      const recentErrors = {
        'dermatology.inflammatory': 3,
        'dermatology.infectious': 1
      };

      const priorities = prioritizeTopics(topicAbilities, learningGoals, recentErrors);
      
      // Neoplasms should have highest priority (learning goal + low ability)
      expect(priorities['dermatology.neoplasms']).to.be.greaterThan(priorities['dermatology.infectious']);
      
      // Inflammatory should have higher priority than infectious (more recent errors + lower ability)
      expect(priorities['dermatology.inflammatory']).to.be.greaterThan(priorities['dermatology.infectious']);
    });

    it('should implement spaced learning intervals', () => {
      const calculateSpacedInterval = (topic: string, lastStudied: Date, masteryLevel: number): number => {
        const daysSinceStudy = (Date.now() - lastStudied.getTime()) / (1000 * 60 * 60 * 24);
        
        // Base interval increases with mastery level
        const baseInterval = Math.pow(2, masteryLevel); // 1, 2, 4, 8, 16... days
        
        // Calculate urgency based on how long since last study
        const urgency = Math.max(0, daysSinceStudy - baseInterval) / baseInterval;
        
        return urgency;
      };

      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      // Low mastery topic studied 3 days ago (should be urgent)
      const lowMasteryUrgency = calculateSpacedInterval('topic1', threeDaysAgo, 1);
      expect(lowMasteryUrgency).to.be.greaterThan(0);

      // High mastery topic studied 10 days ago (should be less urgent)
      const highMasteryUrgency = calculateSpacedInterval('topic2', tenDaysAgo, 3);
      expect(highMasteryUrgency).to.be.lessThan(lowMasteryUrgency);
    });
  });

  describe('Performance Prediction', () => {
    it('should predict performance based on ability and question difficulty', () => {
      const predictPerformance = (userAbility: number, questionDifficulty: number): { probability: number, confidence: number } => {
        // Use logistic function for probability calculation
        const z = (userAbility - questionDifficulty) / 400; // Elo rating difference
        const probability = 1 / (1 + Math.exp(-z));
        
        // Confidence is higher when ability and difficulty are well-matched
        const abilityDiff = Math.abs(userAbility - questionDifficulty);
        const confidence = Math.max(0.1, 1 - abilityDiff / 800);
        
        return { probability, confidence };
      };

      // Equal ability and difficulty should give ~50% probability
      const equalMatch = predictPerformance(1500, 1500);
      expect(equalMatch.probability).to.be.approximately(0.5, 0.1);
      expect(equalMatch.confidence).to.be.greaterThan(0.9);

      // Higher ability should give higher probability
      const higherAbility = predictPerformance(1600, 1500);
      expect(higherAbility.probability).to.be.greaterThan(0.6);

      // Lower ability should give lower probability
      const lowerAbility = predictPerformance(1400, 1500);
      expect(lowerAbility.probability).to.be.lessThan(0.4);

      // Large differences should reduce confidence
      const largeDiff = predictPerformance(1500, 2000);
      expect(largeDiff.confidence).to.be.lessThan(0.5);
    });

    it('should estimate time to mastery', () => {
      const estimateTimeToMastery = (currentAbility: number, targetAbility: number, recentProgress: number[] = []): { estimatedSessions: number, confidence: number } => {
        const abilityGap = targetAbility - currentAbility;
        
        if (abilityGap <= 0) {
          return { estimatedSessions: 0, confidence: 1.0 };
        }
        
        // Calculate average progress from recent sessions
        let avgProgress = 10; // Default assumption
        if (recentProgress.length > 0) {
          avgProgress = recentProgress.reduce((sum, progress) => sum + progress, 0) / recentProgress.length;
        }
        
        // Prevent division by zero or negative progress
        avgProgress = Math.max(1, avgProgress);
        
        const estimatedSessions = Math.ceil(abilityGap / avgProgress);
        
        // Confidence decreases with larger gaps and inconsistent progress
        const progressVariance = recentProgress.length > 1 ? 
          recentProgress.reduce((sum, p) => sum + Math.pow(p - avgProgress, 2), 0) / recentProgress.length : 0;
        const confidence = Math.max(0.1, 1 - (abilityGap / 500) - (progressVariance / 100));
        
        return { estimatedSessions, confidence };
      };

      // Close to target with consistent progress
      const closeTarget = estimateTimeToMastery(1450, 1500, [8, 12, 10, 9]);
      expect(closeTarget.estimatedSessions).to.be.lessThan(10);
      expect(closeTarget.confidence).to.be.greaterThan(0.7);

      // Far from target
      const farTarget = estimateTimeToMastery(1200, 1600, [5, 8, 3, 12]);
      expect(farTarget.estimatedSessions).to.be.greaterThan(20);
      expect(farTarget.confidence).to.be.lessThan(0.6);

      // Already at target
      const atTarget = estimateTimeToMastery(1500, 1450, []);
      expect(atTarget.estimatedSessions).to.equal(0);
      expect(atTarget.confidence).to.equal(1.0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing or corrupted ability data', () => {
      const sanitizeAbilityData = (data: any) => {
        const defaultData = {
          userId: data?.userId || '',
          overallAbility: 1500,
          topicAbilities: {},
          itemHistory: [],
          lastUpdated: new Date()
        };

        if (!data || typeof data !== 'object') {
          return defaultData;
        }

        return {
          userId: data.userId || defaultData.userId,
          overallAbility: (typeof data.overallAbility === 'number' && data.overallAbility > 0) ? 
            Math.max(800, Math.min(2400, data.overallAbility)) : defaultData.overallAbility,
          topicAbilities: (data.topicAbilities && typeof data.topicAbilities === 'object') ? 
            data.topicAbilities : defaultData.topicAbilities,
          itemHistory: Array.isArray(data.itemHistory) ? data.itemHistory : defaultData.itemHistory,
          lastUpdated: data.lastUpdated || defaultData.lastUpdated
        };
      };

      // Test various corrupted data scenarios
      const corruptedData = [
        null,
        undefined,
        { overallAbility: -100 },
        { overallAbility: 'invalid' },
        { topicAbilities: 'not an object' },
        { itemHistory: 'not an array' },
        { overallAbility: 3000 } // Too high
      ];

      corruptedData.forEach((data, index) => {
        const sanitized = sanitizeAbilityData(data);
        expect(sanitized.overallAbility, `Test case ${index}`).to.be.at.least(800);
        expect(sanitized.overallAbility, `Test case ${index}`).to.be.at.most(2400);
        expect(sanitized.topicAbilities, `Test case ${index}`).to.be.an('object');
        expect(sanitized.itemHistory, `Test case ${index}`).to.be.an('array');
      });
    });

    it('should handle extreme ability values', () => {
      const clampAbility = (ability: number): number => {
        const MIN_ABILITY = 800;
        const MAX_ABILITY = 2400;
        
        if (typeof ability !== 'number' || isNaN(ability)) {
          return 1500; // Default
        }
        
        return Math.max(MIN_ABILITY, Math.min(MAX_ABILITY, Math.round(ability)));
      };

      expect(clampAbility(-1000)).to.equal(800);
      expect(clampAbility(5000)).to.equal(2400);
      expect(clampAbility(NaN)).to.equal(1500);
      expect(clampAbility('invalid' as any)).to.equal(1500);
      expect(clampAbility(1750.7)).to.equal(1751);
    });

    it('should handle empty question pools gracefully', () => {
      const selectQuestionsFromEmptyPool = (questions: any[], userAbility: number) => {
        if (!Array.isArray(questions) || questions.length === 0) {
          return {
            questions: [],
            fallbackRecommendation: 'No questions available for current ability level',
            suggestedAction: 'broaden_criteria'
          };
        }
        
        return { questions, fallbackRecommendation: null, suggestedAction: null };
      };

      const emptyResult = selectQuestionsFromEmptyPool([], 1500);
      expect(emptyResult.questions).to.have.length(0);
      expect(emptyResult.fallbackRecommendation).to.include('No questions available');
      expect(emptyResult.suggestedAction).to.equal('broaden_criteria');
    });
  });
});