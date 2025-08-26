import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';
import { MockAI } from './mocks';
import { generateEnhancedMCQ, generateFallbackMCQ } from '../ai/drafting';

setupTestEnvironment();

describe('AI Drafting Pipeline Tests', function() {
  this.timeout(30000); // Set a 30-second timeout for all tests in this suite
  let mockFS: sinon.SinonStub;
  let mockPath: sinon.SinonStub;

  beforeEach(() => {
    // Mock the knowledge base loading
    const mockKnowledgeBase = {
      'atopic_dermatitis': {
        description: 'Chronic inflammatory skin condition characterized by eczematous lesions',
        symptoms: 'Intense pruritus, dry skin, erythematous patches with scaling',
        treatment: 'Topical corticosteroids, emollients, antihistamines',
        completeness_score: 85
      },
      'psoriasis': {
        description: 'Chronic autoimmune skin disorder with characteristic plaques',
        symptoms: 'Well-demarcated erythematous plaques with silvery scales',
        treatment: 'Topical corticosteroids, vitamin D analogs, biologics',
        completeness_score: 90
      },
      'melanoma': {
        description: 'Malignant tumor arising from melanocytes',
        symptoms: 'Asymmetric pigmented lesion with irregular borders',
        treatment: 'Surgical excision, immunotherapy, targeted therapy',
        completeness_score: 95
      }
    };

    mockFS = sinon.stub(require('fs'), 'readFileSync').returns(JSON.stringify(mockKnowledgeBase));
    mockPath = sinon.stub(require('path'), 'join').returns('/mock/path/knowledgeBase.json');
  });

  afterEach(() => {
    MockAI.restoreAll();
    sinon.restore();
  });

  describe('generateEnhancedMCQ', () => {
    it('should generate a high-quality MCQ using AI', async () => {
      const mockResponse = {
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
          correct_answer_rationale: 'This presentation is classic for atopic dermatitis with chronic pruritic lesions.',
          distractor_explanations: {
            distractor_1: 'Contact dermatitis would have clear exposure history',
            distractor_2: 'Seborrheic dermatitis typically affects sebaceous areas',
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

      MockAI.mockGemini(JSON.stringify(mockResponse));

      const entity = {
        description: 'Chronic inflammatory skin condition',
        symptoms: 'Intense pruritus, dry skin',
        treatment: 'Topical corticosteroids',
        completeness_score: 85
      };

      const result = await generateEnhancedMCQ(entity, 'Atopic Dermatitis', 0.3);

      expect(result).to.have.property('type', 'A');
      expect(result).to.have.property('stem');
      expect(result).to.have.property('leadIn');
      expect(result).to.have.property('options');
      expect(result.options).to.have.length(5);
      expect(result).to.have.property('keyIndex');
      expect(result.keyIndex).to.be.a('number');
      expect(result).to.have.property('explanation');
      expect(result).to.have.property('qualityScore');
      expect(result.qualityScore).to.be.greaterThan(75);
      expect(result).to.have.property('aiGenerated', true);
      expect(result).to.have.property('abdCompliance');
      expect(result.abdCompliance.coversOptionsTest).to.be.true;
    });

    it('should handle AI API errors gracefully and fallback', async () => {
      MockAI.mockGemini(JSON.stringify({ error: 'API Error' }));

      const entity = {
        description: 'Test condition',
        symptoms: 'Test symptoms',
        completeness_score: 70
      };

      const result = await generateEnhancedMCQ(entity, 'Test Condition', 0.5);

      // Should fallback to KB-only generation
      expect(result).to.have.property('type', 'A');
      expect(result).to.have.property('aiGenerated', false);
      expect(result).to.have.property('createdBy');
      expect(result.createdBy.model).to.equal('kb-fallback-generator');
    });

    it('should calculate quality scores correctly', async () => {
      const mockResponse = {
        clinical_vignette: 'Test vignette',
        lead_in: 'Test question?',
        answer_options: [
          { text: 'Correct answer', is_correct: true },
          { text: 'Wrong 1', is_correct: false },
          { text: 'Wrong 2', is_correct: false },
          { text: 'Wrong 3', is_correct: false },
          { text: 'Wrong 4', is_correct: false }
        ],
        comprehensive_explanation: {
          correct_answer_rationale: 'Test rationale',
          distractor_explanations: {},
          educational_pearls: []
        },
        quality_validation: {
          covers_options_test: 'YES',
          cognitive_level: 'YES',
          clinical_realism: 'NO',
          homogeneous_options: 'YES',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(mockResponse));

      const entity = { completeness_score: 80 };
      const result = await generateEnhancedMCQ(entity, 'Test', 0.3);

      // Base score (75) + entity bonus (7.5) + 4 quality bonuses (20) = 102.5, capped at 95
      expect(result.qualityScore).to.equal(95);
    });
  });

  describe('generateFallbackMCQ', () => {
    it('should generate a basic MCQ from knowledge base', () => {
      const entity = {
        description: 'Chronic inflammatory skin condition characterized by eczematous lesions',
        symptoms: 'Intense pruritus, dry skin, erythematous patches',
        treatment: 'Topical corticosteroids, emollients',
        completeness_score: 85
      };

      const result = generateFallbackMCQ(entity, 'Atopic Dermatitis', 0.4);

      expect(result).to.have.property('type', 'A');
      expect(result).to.have.property('stem');
      expect(result.stem).to.include('presents to the dermatology clinic');
      expect(result).to.have.property('leadIn');
      expect(result).to.have.property('options');
      expect(result.options).to.have.length.greaterThan(0);
      expect(result).to.have.property('keyIndex');
      expect(result).to.have.property('explanation');
      expect(result.explanation).to.include('Atopic Dermatitis');
      expect(result).to.have.property('difficulty', 0.4);
      expect(result).to.have.property('aiGenerated', false);
      expect(result).to.have.property('qualityScore');
    });

    it('should handle entities with minimal information', () => {
      const entity = {
        description: 'Basic description',
        completeness_score: 65
      };

      const result = generateFallbackMCQ(entity, 'Test Condition');

      expect(result).to.have.property('type', 'A');
      expect(result).to.have.property('stem');
      expect(result).to.have.property('options');
      expect(result).to.have.property('explanation');
      expect(result.qualityScore).to.be.at.least(65);
    });

    it('should generate appropriate lead-in questions based on content', () => {
      const entityWithTreatment = {
        description: 'Test condition',
        treatment: 'Treatment A, Treatment B, Treatment C',
        completeness_score: 70
      };

      const result = generateFallbackMCQ(entityWithTreatment, 'Test');

      expect(result.leadIn).to.include('treatment');
    });

    it('should truncate long content appropriately', () => {
      const entity = {
        description: 'Very long description that exceeds the normal length limit and should be truncated appropriately to maintain readability',
        symptoms: 'Very long symptoms list; that has multiple items; separated by semicolons; and should be truncated at the first semicolon',
        treatment: 'A'.repeat(500), // Very long treatment
        completeness_score: 75
      };

      const result = generateFallbackMCQ(entity, 'Test');

      expect(result.stem.length).to.be.lessThan(500);
      expect(result.explanation).to.include('...');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed AI responses', async () => {
      MockAI.mockGemini('Invalid JSON response');

      const entity = { completeness_score: 70 };

      const result = await generateEnhancedMCQ(entity, 'Test', 0.3);

      // Should fallback to KB generation
      expect(result).to.have.property('aiGenerated', false);
    });

    it('should handle missing optional fields in AI response', async () => {
      const minimalResponse = {
        clinical_vignette: 'Test',
        lead_in: 'Test?',
        answer_options: [
          { text: 'A', is_correct: true },
          { text: 'B', is_correct: false },
          { text: 'C', is_correct: false },
          { text: 'D', is_correct: false },
          { text: 'E', is_correct: false }
        ]
      };

      MockAI.mockGemini(JSON.stringify(minimalResponse));

      const entity = { completeness_score: 70 };
      const result = await generateEnhancedMCQ(entity, 'Test', 0.3);

      expect(result).to.have.property('type', 'A');
      expect(result).to.have.property('explanation');
      expect(result).to.have.property('qualityScore');
    });

    it('should handle entities with missing or invalid data', () => {
      const invalidEntities = [
        {},
        { completeness_score: 'invalid' },
        { description: null, completeness_score: 70 },
        { symptoms: undefined, completeness_score: 70 }
      ];

      invalidEntities.forEach((entity, index) => {
        expect(() => {
          generateFallbackMCQ(entity, `Test${index}`);
        }, `Test case ${index}`).to.not.throw();
      });
    });
  });

  describe('Quality Validation', () => {
    it('should validate ABD compliance flags correctly', async () => {
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
          cognitive_level: 'NO',
          clinical_realism: 'YES',
          homogeneous_options: 'NO',
          difficulty_appropriate: 'YES'
        }
      };

      MockAI.mockGemini(JSON.stringify(mockResponse));

      const entity = { completeness_score: 70 };
      const result = await generateEnhancedMCQ(entity, 'Test', 0.3);

      expect(result.abdCompliance.coversOptionsTest).to.be.true;
      expect(result.abdCompliance.cognitiveLevel).to.be.false;
      expect(result.abdCompliance.clinicalRealism).to.be.true;
      expect(result.abdCompliance.homogeneousOptions).to.be.false;
      expect(result.abdCompliance.difficultyAppropriate).to.be.true;
    });

    it('should set reasonable quality scores for fallback questions', () => {
      const highQualityEntity = { completeness_score: 90 };
      const lowQualityEntity = { completeness_score: 65 };

      const highResult = generateFallbackMCQ(highQualityEntity, 'High');
      const lowResult = generateFallbackMCQ(lowQualityEntity, 'Low');

      expect(highResult.qualityScore).to.be.greaterThan(lowResult.qualityScore);
      expect(highResult.qualityScore).to.be.lessThan(86); // Cap check
    });
  });

  describe('Content Generation Quality', () => {
    it('should generate clinically realistic vignettes', async () => {
      const entity = {
        description: 'Autoimmune blistering disease',
        symptoms: 'Painful oral erosions, skin blisters',
        completeness_score: 80
      };

      const result = generateFallbackMCQ(entity, 'Pemphigus Vulgaris');

      expect(result.stem).to.match(/\d+-year-old (man|woman|patient|male|female)/);
      expect(result.stem).to.include('dermatology clinic');
      expect(result.stem).to.include('Physical examination');
    });

    it('should create appropriate explanations with educational value', () => {
      const entity = {
        description: 'Chronic condition with specific features',
        symptoms: 'Characteristic symptoms',
        treatment: 'Standard treatment approach',
        diagnosis: 'Clinical diagnosis criteria',
        completeness_score: 75
      };

      const result = generateFallbackMCQ(entity, 'Test Condition');

      expect(result.explanation).to.include('Correct Answer:');
      expect(result.explanation).to.include('Clinical Features:');
      expect(result.explanation).to.include('Treatment:');
      expect(result.explanation).to.include('Diagnosis:');
      expect(result.explanation).to.include('educational purposes');
    });
  });
});