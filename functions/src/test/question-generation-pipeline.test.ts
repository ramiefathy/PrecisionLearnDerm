import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';
import { MockAI } from './mocks';
import { generateEnhancedMCQ, generateFallbackMCQ } from '../ai/drafting';
import { processReview } from '../ai/review';
import { processScoring } from '../ai/scoring';

setupTestEnvironment();

describe('Question Generation Pipeline Integration Tests', () => {
  let mockFS: sinon.SinonStub;
  let mockPath: sinon.SinonStub;

  beforeEach(async function() {
    this.timeout(10000);
    
    // Mock the knowledge base
    const mockKnowledgeBase = {
      'atopic_dermatitis': {
        description: 'Chronic inflammatory skin condition characterized by eczematous lesions',
        symptoms: 'Intense pruritus, dry skin, erythematous patches with scaling',
        treatment: 'Topical corticosteroids, emollients, antihistamines',
        diagnosis: 'Clinical diagnosis with characteristic features',
        completeness_score: 85
      },
      'psoriasis': {
        description: 'Chronic autoimmune skin disorder with characteristic plaques',
        symptoms: 'Well-demarcated erythematous plaques with silvery scales',
        treatment: 'Topical corticosteroids, vitamin D analogs, biologics',
        diagnosis: 'Clinical diagnosis with typical morphology',
        completeness_score: 90
      },
      'melanoma': {
        description: 'Malignant tumor arising from melanocytes',
        symptoms: 'Asymmetric pigmented lesion with irregular borders',
        treatment: 'Surgical excision, immunotherapy, targeted therapy',
        diagnosis: 'Histopathological confirmation required',
        completeness_score: 95
      },
      'contact_dermatitis': {
        description: 'Inflammatory skin reaction to external substance',
        symptoms: 'Acute eczematous eruption at contact site',
        treatment: 'Avoidance of allergen, topical corticosteroids',
        diagnosis: 'Patch testing for confirmation',
        completeness_score: 80
      }
    };

    mockFS = sinon.stub(require('fs'), 'readFileSync').returns(JSON.stringify(mockKnowledgeBase));
    mockPath = sinon.stub(require('path'), 'join').returns('/mock/path/knowledgeBase.json');
    
    await testHelper.seedTestData();
  });

  afterEach(() => {
    MockAI.restoreAll();
    sinon.restore();
  });

  describe('Full Pipeline: Generation -> Review -> Scoring', () => {
    it('should complete full pipeline with AI generation', async function() {
      this.timeout(15000);
      
      // Step 1: Generate question with AI
      const generateResponse = {
        clinical_vignette: 'A 28-year-old woman presents with a 6-month history of intensely pruritic, dry skin lesions on her arms and legs.',
        lead_in: 'What is the most likely diagnosis?',
        answer_options: [
          { text: 'Atopic dermatitis', is_correct: true },
          { text: 'Contact dermatitis', is_correct: false },
          { text: 'Seborrheic dermatitis', is_correct: false },
          { text: 'Psoriasis', is_correct: false },
          { text: 'Lichen planus', is_correct: false }
        ],
        comprehensive_explanation: {
          correct_answer_rationale: 'This presentation is classic for atopic dermatitis.',
          distractor_explanations: {
            distractor_1: 'Contact dermatitis would have clear exposure history',
            distractor_2: 'Seborrheic dermatitis affects sebaceous areas',
            distractor_3: 'Psoriasis has characteristic silvery scales',
            distractor_4: 'Lichen planus has violaceous papules'
          },
          educational_pearls: [
            'Atopic dermatitis is a chronic inflammatory condition',
            'Pruritus is the primary symptom'
          ]
        },
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'YES',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(generateResponse));

      const entity = {
        description: 'Chronic inflammatory skin condition',
        symptoms: 'Intense pruritus, dry skin',
        treatment: 'Topical corticosteroids',
        completeness_score: 85
      };

      const generatedQuestion = await generateEnhancedMCQ(entity, 'Atopic Dermatitis', 0.3);

      // Validate generation results
      expect(generatedQuestion).to.have.property('type', 'A');
      expect(generatedQuestion).to.have.property('stem');
      expect(generatedQuestion).to.have.property('options');
      expect(generatedQuestion.options).to.have.length(5);
      expect(generatedQuestion).to.have.property('qualityScore');
      expect(generatedQuestion.qualityScore).to.be.greaterThan(75);
      expect(generatedQuestion).to.have.property('aiGenerated', true);

      // Step 2: Review the generated question
      const reviewResponse = {
        reviewId: 'test-review-123',
        correctedItem: generatedQuestion,
        changes: [],
        overallAssessment: 'High-quality question with good clinical realism',
        qualityScore: 85,
        improvementSuggestions: ['Consider adding more specific physical exam findings'],
        reviewedAt: admin.firestore.Timestamp.now(),
        status: 'approved'
      };

      MockAI.mockGemini(JSON.stringify(reviewResponse));

      const reviewResult = await processReview(generatedQuestion);

      // Validate review results
      expect(reviewResult).to.have.property('reviewId');
      expect(reviewResult).to.have.property('qualityScore');
      expect(reviewResult.qualityScore).to.be.greaterThan(80);
      expect(reviewResult).to.have.property('status', 'approved');

      // Step 3: Score a user's answer
      const scoringResponse = {
        score: 0.85,
        explanation: 'Correct diagnosis with good reasoning',
        feedback: 'Excellent understanding of atopic dermatitis features',
        nextDifficulty: 'increase'
      };

      MockAI.mockGemini(JSON.stringify(scoringResponse));

      const userAnswer = {
        questionId: 'test-question-id',
        selectedOption: 0, // Correct answer
        timeSpent: 45
      };

      const scoringResult = await processScoring(generatedQuestion, userAnswer);

      // Validate scoring results
      expect(scoringResult).to.have.property('score');
      expect(scoringResult.score).to.be.greaterThan(0.8);
      expect(scoringResult).to.have.property('explanation');
      expect(scoringResult).to.have.property('nextDifficulty', 'increase');
    });

    it('should handle pipeline with fallback generation', async function() {
      this.timeout(10000);
      
      // Force fallback by mocking API failure
      MockAI.mockGemini('Invalid response');

      const entity = {
        description: 'Test condition',
        symptoms: 'Test symptoms',
        completeness_score: 70
      };

      const generatedQuestion = await generateEnhancedMCQ(entity, 'Test Condition', 0.5);

      // Should fallback to KB-only generation
      expect(generatedQuestion).to.have.property('aiGenerated', false);
      expect(generatedQuestion).to.have.property('type', 'A');
      expect(generatedQuestion).to.have.property('qualityScore');
      
      // Review should still work with fallback questions
      MockAI.mockGemini(JSON.stringify({
        qualityScore: 75,
        status: 'needs_revision',
        improvementSuggestions: ['Improve clinical vignette realism']
      }));

      const reviewResult = await processReview(generatedQuestion);
      expect(reviewResult).to.have.property('qualityScore');
      expect(reviewResult.qualityScore).to.be.at.least(70);
    });
  });

  describe('Quality Validation Across Pipeline', () => {
    it('should maintain quality standards throughout pipeline', async function() {
      this.timeout(10000);
      
      const highQualityResponse = {
        clinical_vignette: 'A 45-year-old construction worker presents with a 3-week history of well-demarcated, erythematous plaques with silvery scales on his elbows and knees.',
        lead_in: 'What is the most likely diagnosis?',
        answer_options: [
          { text: 'Psoriasis vulgaris', is_correct: true },
          { text: 'Atopic dermatitis', is_correct: false },
          { text: 'Contact dermatitis', is_correct: false },
          { text: 'Lichen planus', is_correct: false },
          { text: 'Seborrheic dermatitis', is_correct: false }
        ],
        comprehensive_explanation: {
          correct_answer_rationale: 'The classic presentation of well-demarcated plaques with silvery scales in typical locations is pathognomonic for psoriasis.',
          distractor_explanations: {
            distractor_1: 'Atopic dermatitis typically lacks the silvery scales',
            distractor_2: 'Contact dermatitis would have exposure history',
            distractor_3: 'Lichen planus has violaceous papules',
            distractor_4: 'Seborrheic dermatitis affects sebaceous areas'
          },
          educational_pearls: [
            'Psoriasis commonly affects extensor surfaces',
            'Silvery scales are pathognomonic',
            'Koebner phenomenon may be present'
          ]
        },
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'YES',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(highQualityResponse));

      const entity = {
        description: 'Chronic autoimmune skin disorder',
        symptoms: 'Well-demarcated erythematous plaques with silvery scales',
        treatment: 'Topical corticosteroids, vitamin D analogs',
        completeness_score: 90
      };

      const question = await generateEnhancedMCQ(entity, 'Psoriasis', 0.4);

      // Quality checks
      expect(question.qualityScore).to.be.at.least(85);
      expect(question.abdCompliance.coversOptionsTest).to.be.true;
      expect(question.abdCompliance.clinicalRealism).to.be.true;
      expect(question.abdCompliance.cognitiveLevel).to.be.true;
      expect(question.abdCompliance.homogeneousOptions).to.be.true;
      expect(question.abdCompliance.difficultyAppropriate).to.be.true;

      // Clinical realism checks
      expect(question.stem).to.match(/\d+-year-old/);
      expect(question.stem).to.include('presents');
      expect(question.explanation).to.include('educational purposes');
    });

    it('should reject low-quality generations', async function() {
      this.timeout(8000);
      
      const lowQualityResponse = {
        clinical_vignette: 'Patient has skin problem.',
        lead_in: 'What is it?',
        answer_options: [
          { text: 'Disease A', is_correct: true },
          { text: 'Disease B', is_correct: false },
          { text: 'Disease C', is_correct: false }
        ],
        quality_validation: {
          covers_options_test: 'NO',
          cognitive_level: 'NO',
          clinical_realism: 'NO',
          homogeneous_options: 'NO',
          difficulty_appropriate: 'NO'
        }
      };

      MockAI.mockGemini(JSON.stringify(lowQualityResponse));

      const entity = { completeness_score: 50 };
      const question = await generateEnhancedMCQ(entity, 'Test', 0.3);

      // Should have lower quality score due to validation failures
      expect(question.qualityScore).to.be.lessThan(70);
      expect(question.abdCompliance.coversOptionsTest).to.be.false;
      expect(question.abdCompliance.clinicalRealism).to.be.false;
    });
  });

  describe('Knowledge Base Integration', () => {
    it('should utilize knowledge base context effectively', async function() {
      this.timeout(8000);
      
      const entity = {
        description: 'Malignant tumor arising from melanocytes',
        symptoms: 'Asymmetric pigmented lesion with irregular borders',
        treatment: 'Surgical excision, immunotherapy',
        diagnosis: 'Histopathological confirmation',
        completeness_score: 95
      };

      const melanomaResponse = {
        clinical_vignette: 'A 55-year-old fair-skinned man presents with a 6-month history of a changing mole on his back. The lesion is 8mm in diameter, asymmetric, with irregular borders and variegated color.',
        lead_in: 'What is the most likely diagnosis?',
        answer_options: [
          { text: 'Melanoma', is_correct: true },
          { text: 'Seborrheic keratosis', is_correct: false },
          { text: 'Basal cell carcinoma', is_correct: false },
          { text: 'Atypical nevus', is_correct: false },
          { text: 'Solar lentigo', is_correct: false }
        ],
        comprehensive_explanation: {
          correct_answer_rationale: 'The ABCD features (Asymmetry, Border irregularity, Color variegation, Diameter >6mm) are highly suggestive of melanoma.',
          educational_pearls: [
            'ABCD criteria for melanoma detection',
            'Early detection improves prognosis significantly'
          ]
        },
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'YES',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(melanomaResponse));

      const question = await generateEnhancedMCQ(entity, 'Melanoma', 0.6);

      // Should incorporate high-quality KB information
      expect(question.qualityScore).to.be.at.least(85);
      expect(question.stem).to.include('mole');
      expect(question.stem).to.include('changing');
      expect(question.explanation).to.include('ABCD');
      expect(question.difficulty).to.equal(0.6);
    });

    it('should handle entities with varying completeness scores', async function() {
      this.timeout(8000);
      
      const lowCompletenessEntity = {
        description: 'Basic skin condition',
        completeness_score: 60
      };

      const highCompletenessEntity = {
        description: 'Well-documented skin condition with comprehensive details',
        symptoms: 'Detailed symptom description',
        treatment: 'Comprehensive treatment protocol',
        diagnosis: 'Clear diagnostic criteria',
        completeness_score: 95
      };

      const lowQuestion = generateFallbackMCQ(lowCompletenessEntity, 'Low Quality Entity');
      const highQuestion = generateFallbackMCQ(highCompletenessEntity, 'High Quality Entity');

      expect(highQuestion.qualityScore).to.be.greaterThan(lowQuestion.qualityScore);
      expect(highQuestion.explanation.length).to.be.greaterThan(lowQuestion.explanation.length);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle API timeouts gracefully', async function() {
      this.timeout(8000);
      
      // Mock timeout scenario
      MockAI.mockGemini(new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 1000)
      ));

      const entity = { completeness_score: 70 };
      const question = await generateEnhancedMCQ(entity, 'Test', 0.3);

      // Should fallback to KB generation
      expect(question).to.have.property('aiGenerated', false);
      expect(question).to.have.property('type', 'A');
      expect(question).to.have.property('qualityScore');
    });

    it('should handle malformed knowledge base data', async function() {
      this.timeout(5000);
      
      // Mock corrupted KB data
      mockFS.restore();
      mockFS = sinon.stub(require('fs'), 'readFileSync').throws(new Error('KB corrupted'));

      const entity = { completeness_score: 70 };
      
      expect(() => {
        generateFallbackMCQ(entity, 'Test');
      }).to.not.throw();
    });

    it('should validate input parameters', async function() {
      this.timeout(5000);
      
      const invalidEntities = [
        null,
        undefined,
        {},
        { completeness_score: 'invalid' },
        { description: null, completeness_score: 70 }
      ];

      for (const entity of invalidEntities) {
        expect(() => {
          generateFallbackMCQ(entity, 'Test');
        }).to.not.throw();
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should generate questions within acceptable time limits', async function() {
      this.timeout(10000);
      
      const mockResponse = {
        clinical_vignette: 'Test vignette',
        lead_in: 'Test question?',
        answer_options: [
          { text: 'A', is_correct: true },
          { text: 'B', is_correct: false },
          { text: 'C', is_correct: false },
          { text: 'D', is_correct: false },
          { text: 'E', is_correct: false }
        ],
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'YES',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(mockResponse));

      const entity = { completeness_score: 80 };
      const startTime = Date.now();
      
      const question = await generateEnhancedMCQ(entity, 'Performance Test', 0.5);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).to.be.lessThan(8000); // Should complete within 8 seconds
      expect(question).to.have.property('type', 'A');
    });

    it('should handle concurrent question generation requests', async function() {
      this.timeout(15000);
      
      const mockResponse = {
        clinical_vignette: 'Concurrent test vignette',
        lead_in: 'Concurrent test question?',
        answer_options: [
          { text: 'Option A', is_correct: true },
          { text: 'Option B', is_correct: false },
          { text: 'Option C', is_correct: false },
          { text: 'Option D', is_correct: false },
          { text: 'Option E', is_correct: false }
        ],
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'YES',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(mockResponse));

      const entity = { completeness_score: 80 };
      
      // Generate 5 questions concurrently
      const promises = Array.from({ length: 5 }, (_, i) => 
        generateEnhancedMCQ(entity, `Concurrent Test ${i}`, 0.5)
      );

      const results = await Promise.all(promises);

      expect(results).to.have.length(5);
      results.forEach((question, index) => {
        expect(question).to.have.property('type', 'A');
        expect(question).to.have.property('qualityScore');
      });
    });
  });
});