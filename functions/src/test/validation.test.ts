import { expect } from 'chai';
import { 
  validateInput,
  GenerateMCQSchema,
  UpdateAbilitySchema,
  ReviewQuestionSchema,
  ItemsProposeSchema
} from '../util/validation';

describe('Input Validation Tests', () => {
  
  describe('validateInput helper', () => {
    it('should pass valid data through', () => {
      const data = { topicIds: ['topic1'], difficulty: 0.5 };
      const result = validateInput(GenerateMCQSchema, data);
      expect(result).to.deep.equal(data);
    });

    it('should throw HttpsError on invalid data', () => {
      const data = { difficulty: 2 }; // Invalid: difficulty > 1
      try {
        validateInput(GenerateMCQSchema, data);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).to.equal('invalid-argument');
        expect(error instanceof Error ? error.message : String(error)).to.include('Invalid input');
      }
    });
  });

  describe('GenerateMCQSchema', () => {
    it('should accept valid MCQ generation data', () => {
      const validData = {
        topicIds: ['dermatology', 'psoriasis'],
        difficulty: 0.7,
        entityName: 'Psoriasis vulgaris',
        useAI: true
      };
      
      const result = GenerateMCQSchema.parse(validData);
      expect(result).to.deep.equal(validData);
    });

    it('should reject invalid difficulty', () => {
      const invalidData = {
        topicIds: ['topic1'],
        difficulty: 1.5 // > 1
      };
      
      expect(() => GenerateMCQSchema.parse(invalidData)).to.throw();
    });

    it('should reject empty topic array', () => {
      const invalidData = {
        topicIds: [],
        difficulty: 0.5
      };
      
      expect(() => GenerateMCQSchema.parse(invalidData)).to.throw();
    });

    it('should accept data without optional fields', () => {
      const minimalData = {};
      const result = GenerateMCQSchema.parse(minimalData);
      expect(result).to.deep.equal({});
    });
  });

  describe('UpdateAbilitySchema', () => {
    it('should accept valid ability update data', () => {
      const validData = {
        userId: 'user123',
        questionId: 'q456',
        isCorrect: true,
        difficulty: 0.6,
        timeSpent: 45,
        confidenceLevel: 'high' as const
      };
      
      const result = UpdateAbilitySchema.parse(validData);
      expect(result).to.deep.equal(validData);
    });

    it('should reject invalid confidence level', () => {
      const invalidData = {
        userId: 'user123',
        questionId: 'q456',
        isCorrect: true,
        difficulty: 0.6,
        confidenceLevel: 'very-high' // Invalid
      };
      
      expect(() => UpdateAbilitySchema.parse(invalidData)).to.throw();
    });

    it('should reject negative time spent', () => {
      const invalidData = {
        userId: 'user123',
        questionId: 'q456',
        isCorrect: false,
        difficulty: 0.5,
        timeSpent: -10
      };
      
      expect(() => UpdateAbilitySchema.parse(invalidData)).to.throw();
    });
  });

  describe('ReviewQuestionSchema', () => {
    it('should accept valid review data', () => {
      const validData = {
        questionId: 'q123',
        action: 'approve' as const,
        notes: 'Good question, well-structured'
      };
      
      const result = ReviewQuestionSchema.parse(validData);
      expect(result).to.deep.equal(validData);
    });

    it('should accept revise action with revisions', () => {
      const validData = {
        questionId: 'q123',
        action: 'revise' as const,
        revisions: {
          stem: 'Updated stem text',
          explanation: 'Better explanation'
        }
      };
      
      const result = ReviewQuestionSchema.parse(validData);
      expect(result).to.deep.equal(validData);
    });

    it('should reject invalid action', () => {
      const invalidData = {
        questionId: 'q123',
        action: 'delete' // Invalid action
      };
      
      expect(() => ReviewQuestionSchema.parse(invalidData)).to.throw();
    });

    it('should reject notes exceeding max length', () => {
      const invalidData = {
        questionId: 'q123',
        action: 'reject' as const,
        notes: 'x'.repeat(1001) // > 1000 chars
      };
      
      expect(() => ReviewQuestionSchema.parse(invalidData)).to.throw();
    });
  });

  describe('ItemsProposeSchema', () => {
    it('should accept valid item proposal', () => {
      const validData = {
        stem: 'A 45-year-old patient presents with...',
        leadIn: 'What is the most likely diagnosis?',
        options: [
          { text: 'Psoriasis', isCorrect: true },
          { text: 'Eczema', isCorrect: false },
          { text: 'Dermatitis', isCorrect: false },
          { text: 'Vitiligo', isCorrect: false },
          { text: 'Melanoma', isCorrect: false }
        ],
        explanation: 'Psoriasis is characterized by...',
        topicIds: ['dermatology', 'inflammatory'],
        difficulty: 0.6
      };
      
      const result = ItemsProposeSchema.parse(validData);
      expect(result).to.deep.equal(validData);
    });

    it('should reject item with wrong number of options', () => {
      const invalidData = {
        stem: 'A patient presents with...',
        leadIn: 'What is the diagnosis?',
        options: [
          { text: 'Option 1', isCorrect: true },
          { text: 'Option 2', isCorrect: false },
          { text: 'Option 3', isCorrect: false }
        ], // Only 3 options, need exactly 5
        explanation: 'Because...',
        topicIds: ['topic1']
      };
      
      expect(() => ItemsProposeSchema.parse(invalidData)).to.throw();
    });

    it('should reject item with short stem', () => {
      const invalidData = {
        stem: 'Short', // < 10 chars
        leadIn: 'What is it?',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
          { text: 'C', isCorrect: false },
          { text: 'D', isCorrect: false },
          { text: 'E', isCorrect: false }
        ],
        explanation: 'Explanation here',
        topicIds: ['topic1']
      };
      
      expect(() => ItemsProposeSchema.parse(invalidData)).to.throw();
    });

    it('should reject empty topic array', () => {
      const invalidData = {
        stem: 'A valid stem with enough characters',
        leadIn: 'Valid lead-in question?',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
          { text: 'C', isCorrect: false },
          { text: 'D', isCorrect: false },
          { text: 'E', isCorrect: false }
        ],
        explanation: 'Valid explanation',
        topicIds: [] // Empty array
      };
      
      expect(() => ItemsProposeSchema.parse(invalidData)).to.throw();
    });
  });
});
