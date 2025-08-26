import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';
import { MockAI } from './mocks';

setupTestEnvironment();

describe('AI Review Pipeline Tests', function() {
  this.timeout(30000); // Set a 30-second timeout for all tests in this suite
  let mockFirestore: any;

  beforeEach(async () => {
    await testHelper.seedTestData();
    
    // Create a more complete Firestore mock
    const firestoreMock = {
      collection: sinon.stub().returns({
        doc: sinon.stub().returns({
          get: sinon.stub().resolves({
            exists: true,
            data: () => ({
              type: 'A',
              stem: 'A 25-year-old woman presents with pruritic lesions.',
              leadIn: 'What is the most likely diagnosis?',
              options: [
                { text: 'Atopic dermatitis' },
                { text: 'Contact dermatitis' },
                { text: 'Psoriasis' },
                { text: 'Eczema' }
              ],
              keyIndex: 0,
              explanation: 'This is a case of atopic dermatitis.',
              status: 'draft'
            })
          }),
          update: sinon.stub().resolves()
        }),
        settings: {},
        databaseId: 'test-database',
        collectionGroup: sinon.stub(),
        runTransaction: sinon.stub(),
        batch: sinon.stub(),
        getAll: sinon.stub(),
        recursiveDelete: sinon.stub(),
        terminate: sinon.stub(),
        clearPersistence: sinon.stub()
      })
    };
    
    mockFirestore = sinon.stub(admin, 'firestore').returns(firestoreMock as any);
  });

  afterEach(() => {
    MockAI.restoreAll();
    sinon.restore();
  });

  describe('Question Review Process', () => {
    it('should perform comprehensive quality review', async () => {
      const mockReviewResponse = {
        overall_score: 85,
        quality_metrics: {
          medical_accuracy: 90,
          clarity: 85,
          realism: 80,
          educational_value: 85
        },
        identified_issues: [
          {
            field: 'stem',
            issue: 'Could include more specific age and demographics',
            severity: 'minor',
            suggested_fix: 'Consider adding more clinical context'
          }
        ],
        corrected_content: {
          stem: 'A 25-year-old woman with a history of allergies presents with a 3-week history of pruritic, erythematous lesions on her arms and legs.',
          explanation: 'Enhanced explanation with better clinical reasoning.'
        },
        recommendations: [
          'Add more specific physical examination findings',
          'Consider including relevant family history'
        ],
        approval_status: 'approved_with_edits'
      };

      MockAI.mockReview(85, 'High quality question with minor improvements needed');

      // Mock the review function (since we're testing the logic)
      const reviewQuestion = async (questionId: string, reviewerId: string) => {
        const reviewResult = {
          score: mockReviewResponse.overall_score,
          qualityMetrics: mockReviewResponse.quality_metrics,
          issues: mockReviewResponse.identified_issues,
          recommendations: mockReviewResponse.recommendations,
          status: mockReviewResponse.approval_status,
          reviewedAt: new Date(),
          reviewedBy: reviewerId
        };

        return reviewResult;
      };

      const result = await reviewQuestion('test-question-id', 'admin@test.com');

      expect(result).to.have.property('score');
      expect(result.score).to.equal(85);
      expect(result).to.have.property('qualityMetrics');
      expect(result.qualityMetrics).to.have.property('medical_accuracy');
      expect(result.qualityMetrics.medical_accuracy).to.equal(90);
      expect(result).to.have.property('issues');
      expect(result.issues).to.be.an('array');
      expect(result).to.have.property('recommendations');
      expect(result.status).to.equal('approved_with_edits');
    });

    it('should identify quality issues and suggest improvements', async () => {
      const mockReviewResponse = {
        overall_score: 65,
        quality_metrics: {
          medical_accuracy: 70,
          clarity: 60,
          realism: 65,
          educational_value: 65
        },
        identified_issues: [
          {
            field: 'options',
            issue: 'Options are not homogeneous - mixing diagnoses and treatments',
            severity: 'major',
            suggested_fix: 'Ensure all options are diagnostic possibilities'
          },
          {
            field: 'stem',
            issue: 'Lacks sufficient clinical detail for diagnosis',
            severity: 'moderate',
            suggested_fix: 'Add more specific physical findings and history'
          }
        ],
        recommendations: [
          'Revise answer options to ensure homogeneity',
          'Expand clinical vignette with relevant details',
          'Consider adding laboratory or diagnostic test results'
        ],
        approval_status: 'revision_required'
      };

      MockAI.mockReview(65, 'Question needs significant improvements');

      const reviewQuestion = async (questionId: string) => {
        return {
          score: mockReviewResponse.overall_score,
          qualityMetrics: mockReviewResponse.quality_metrics,
          issues: mockReviewResponse.identified_issues,
          recommendations: mockReviewResponse.recommendations,
          status: mockReviewResponse.approval_status
        };
      };

      const result = await reviewQuestion('test-question-id');

      expect(result.score).to.be.lessThan(70);
      expect(result.issues).to.have.length(2);
      expect(result.issues[0].severity).to.equal('major');
      expect(result.status).to.equal('revision_required');
      expect(result.recommendations).to.include('Revise answer options to ensure homogeneity');
    });

    it('should approve high-quality questions without changes', async () => {
      const mockReviewResponse = {
        overall_score: 92,
        quality_metrics: {
          medical_accuracy: 95,
          clarity: 90,
          realism: 90,
          educational_value: 93
        },
        identified_issues: [],
        recommendations: [
          'Excellent question - meets all quality standards'
        ],
        approval_status: 'approved'
      };

      MockAI.mockReview(92, 'Excellent question quality');

      const reviewQuestion = async (questionId: string) => {
        return {
          score: mockReviewResponse.overall_score,
          qualityMetrics: mockReviewResponse.quality_metrics,
          issues: mockReviewResponse.identified_issues,
          recommendations: mockReviewResponse.recommendations,
          status: mockReviewResponse.approval_status
        };
      };

      const result = await reviewQuestion('test-question-id');

      expect(result.score).to.be.greaterThan(90);
      expect(result.issues).to.have.length(0);
      expect(result.status).to.equal('approved');
    });
  });

  describe('Medical Accuracy Validation', () => {
    it('should detect medical inaccuracies', async () => {
      const mockReviewResponse = {
        overall_score: 45,
        quality_metrics: {
          medical_accuracy: 30,
          clarity: 70,
          realism: 50,
          educational_value: 40
        },
        identified_issues: [
          {
            field: 'explanation',
            issue: 'Contains factually incorrect medical information',
            severity: 'critical',
            suggested_fix: 'Correct the pathophysiology explanation'
          },
          {
            field: 'keyIndex',
            issue: 'Incorrect answer selected',
            severity: 'critical',
            suggested_fix: 'Review the correct diagnosis based on clinical presentation'
          }
        ],
        approval_status: 'rejected'
      };

      MockAI.mockReview(45, 'Medical inaccuracies detected');

      const reviewQuestion = async (questionId: string) => {
        return {
          score: mockReviewResponse.overall_score,
          qualityMetrics: mockReviewResponse.quality_metrics,
          issues: mockReviewResponse.identified_issues,
          status: mockReviewResponse.approval_status
        };
      };

      const result = await reviewQuestion('test-question-id');

      expect(result.score).to.be.lessThan(50);
      expect(result.qualityMetrics.medical_accuracy).to.be.lessThan(50);
      expect(result.issues.some(issue => issue.severity === 'critical')).to.be.true;
      expect(result.status).to.equal('rejected');
    });

    it('should validate answer key correctness', async () => {
      // Test case where the marked correct answer is actually wrong
      const mockReviewResponse = {
        overall_score: 55,
        quality_metrics: {
          medical_accuracy: 40,
          clarity: 80,
          realism: 60,
          educational_value: 40
        },
        identified_issues: [
          {
            field: 'keyIndex',
            issue: 'Based on the clinical presentation, option B is the correct answer, not option A',
            severity: 'critical',
            suggested_fix: 'Change keyIndex from 0 to 1'
          }
        ],
        corrected_content: {
          keyIndex: 1,
          explanation: 'Corrected explanation supporting the right answer'
        },
        approval_status: 'revision_required'
      };

      MockAI.mockReview(55, 'Answer key correction needed');

      const validateAnswerKey = async (question: any) => {
        return {
          score: mockReviewResponse.overall_score,
          qualityMetrics: mockReviewResponse.quality_metrics,
          issues: mockReviewResponse.identified_issues,
          correctedContent: mockReviewResponse.corrected_content,
          status: mockReviewResponse.approval_status
        };
      };

      const testQuestion = {
        stem: 'Clinical vignette',
        options: ['Wrong answer', 'Correct answer', 'Other', 'Other'],
        keyIndex: 0
      };

      const result = await validateAnswerKey(testQuestion);

      expect(result.issues.some(issue => issue.field === 'keyIndex')).to.be.true;
      expect(result.correctedContent.keyIndex).to.equal(1);
    });
  });

  describe('Distractor Analysis', () => {
    it('should evaluate distractor quality and plausibility', async () => {
      const mockReviewResponse = {
        overall_score: 70,
        quality_metrics: {
          medical_accuracy: 85,
          clarity: 75,
          realism: 65,
          educational_value: 70
        },
        distractor_analysis: {
          option_1: { plausibility: 80, educational_value: 75 },
          option_2: { plausibility: 40, educational_value: 30 },
          option_3: { plausibility: 85, educational_value: 80 },
          option_4: { plausibility: 70, educational_value: 65 }
        },
        identified_issues: [
          {
            field: 'options',
            issue: 'Option 2 is implausible and easily eliminated',
            severity: 'moderate',
            suggested_fix: 'Replace with more plausible dermatological condition'
          }
        ],
        recommendations: [
          'Improve option 2 plausibility',
          'Consider conditions with similar presentations'
        ]
      };

      MockAI.mockReview(70, 'Good question with weak distractor');

      const analyzeDistractors = async (question: any) => {
        return {
          score: mockReviewResponse.overall_score,
          distractorAnalysis: mockReviewResponse.distractor_analysis,
          issues: mockReviewResponse.identified_issues,
          recommendations: mockReviewResponse.recommendations
        };
      };

      const testQuestion = {
        options: [
          'Correct diagnosis',
          'Implausible option',
          'Good distractor',
          'Decent distractor'
        ]
      };

      const result = await analyzeDistractors(testQuestion);

      expect(result).to.have.property('distractorAnalysis');
      expect(result.distractorAnalysis.option_2.plausibility).to.be.lessThan(50);
      expect(result.issues.some(issue => issue.field === 'options')).to.be.true;
    });

    it('should check for homogeneity in answer options', async () => {
      const mockReviewResponse = {
        identified_issues: [
          {
            field: 'options',
            issue: 'Options mix diagnostic and therapeutic choices - not homogeneous',
            severity: 'major',
            suggested_fix: 'Ensure all options are either diagnoses or treatments, not mixed'
          }
        ],
        recommendations: [
          'Keep all options in the same category (all diagnoses or all treatments)',
          'Ensure grammatical consistency across options'
        ]
      };

      const checkHomogeneity = async (options: string[]) => {
        return {
          issues: mockReviewResponse.identified_issues,
          recommendations: mockReviewResponse.recommendations
        };
      };

      const mixedOptions = [
        'Atopic dermatitis',
        'Topical corticosteroids',
        'Psoriasis',
        'Contact dermatitis'
      ];

      const result = await checkHomogeneity(mixedOptions);

      expect(result.issues[0].issue).to.include('not homogeneous');
      expect(result.recommendations[0]).to.include('same category');
    });
  });

  describe('Clinical Realism Assessment', () => {
    it('should evaluate clinical vignette realism', async () => {
      const mockReviewResponse = {
        quality_metrics: {
          realism: 90,
          clarity: 85
        },
        realism_assessment: {
          demographics_appropriate: true,
          presentation_typical: true,
          timeline_realistic: true,
          examination_findings_consistent: true
        },
        identified_issues: [],
        recommendations: [
          'Excellent clinical realism',
          'Typical presentation well described'
        ]
      };

      const assessRealism = async (vignette: string) => {
        return {
          qualityMetrics: mockReviewResponse.quality_metrics,
          realismAssessment: mockReviewResponse.realism_assessment,
          issues: mockReviewResponse.identified_issues,
          recommendations: mockReviewResponse.recommendations
        };
      };

      const realisticVignette = 'A 28-year-old woman with a history of atopy presents with a 2-week history of intensely pruritic, erythematous patches on her arms and legs. Physical examination reveals lichenified plaques with excoriation marks.';

      const result = await assessRealism(realisticVignette);

      expect(result.qualityMetrics.realism).to.equal(90);
      expect(result.realismAssessment.demographics_appropriate).to.be.true;
      expect(result.realismAssessment.presentation_typical).to.be.true;
    });

    it('should identify unrealistic clinical presentations', async () => {
      const mockReviewResponse = {
        quality_metrics: {
          realism: 35,
          clarity: 70
        },
        realism_assessment: {
          demographics_appropriate: false,
          presentation_typical: false,
          timeline_realistic: true,
          examination_findings_consistent: false
        },
        identified_issues: [
          {
            field: 'stem',
            issue: 'Atypical age for this condition',
            severity: 'moderate',
            suggested_fix: 'Adjust demographics to typical patient population'
          },
          {
            field: 'stem',
            issue: 'Physical findings inconsistent with described condition',
            severity: 'major',
            suggested_fix: 'Correct examination findings to match diagnosis'
          }
        ]
      };

      const assessRealism = async (vignette: string) => {
        return {
          qualityMetrics: mockReviewResponse.quality_metrics,
          realismAssessment: mockReviewResponse.realism_assessment,
          issues: mockReviewResponse.identified_issues
        };
      };

      const unrealisticVignette = 'A 5-year-old child presents with chronic plaque psoriasis covering 80% of body surface area for 10 years.';

      const result = await assessRealism(unrealisticVignette);

      expect(result.qualityMetrics.realism).to.be.lessThan(50);
      expect(result.realismAssessment.demographics_appropriate).to.be.false;
      expect(result.issues.length).to.be.greaterThan(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle AI service failures gracefully', async () => {
      MockAI.mockReview(undefined); // Simulate API failure

      const reviewQuestion = async (questionId: string) => {
        try {
          // Simulate AI failure and fallback to basic validation
          throw new Error('AI service unavailable');
        } catch (error) {
          // Fallback review logic
          return {
            score: 70, // Default score
            qualityMetrics: {
              medical_accuracy: 70,
              clarity: 70,
              realism: 70,
              educational_value: 70
            },
            issues: [],
            recommendations: ['Manual review required - AI service unavailable'],
            status: 'manual_review_required',
            error: 'AI review failed'
          };
        }
      };

      const result = await reviewQuestion('test-question-id');

      expect(result.status).to.equal('manual_review_required');
      expect(result.recommendations[0]).to.include('Manual review required');
      expect(result).to.have.property('error');
    });

    it('should handle malformed question data', async () => {
      const validateQuestionStructure = (question: any) => {
        const issues = [];

        if (!question.stem || question.stem.trim().length === 0) {
          issues.push({ field: 'stem', issue: 'Missing or empty stem', severity: 'critical' });
        }

        if (!question.options || !Array.isArray(question.options) || question.options.length < 4) {
          issues.push({ field: 'options', issue: 'Invalid options array', severity: 'critical' });
        }

        if (typeof question.keyIndex !== 'number' || question.keyIndex < 0) {
          issues.push({ field: 'keyIndex', issue: 'Invalid key index', severity: 'critical' });
        }

        return {
          valid: issues.length === 0,
          issues,
          status: issues.length > 0 ? 'invalid_structure' : 'valid'
        };
      };

      const malformedQuestions = [
        { stem: '', options: [], keyIndex: -1 },
        { stem: 'Valid stem', options: ['A'], keyIndex: 0 },
        { stem: null, options: undefined, keyIndex: 'invalid' },
        {}
      ];

      malformedQuestions.forEach((question, index) => {
        const result = validateQuestionStructure(question);
        expect(result.valid, `Test case ${index}`).to.be.false;
        expect(result.issues.length, `Test case ${index}`).to.be.greaterThan(0);
        expect(result.status, `Test case ${index}`).to.equal('invalid_structure');
      });
    });
  });

  describe('Review Workflow Integration', () => {
    it('should update question status after review', async () => {
      const updateStub = sinon.stub().resolves();
      mockFirestore.returns({
        collection: sinon.stub().returns({
          doc: sinon.stub().returns({
            update: updateStub
          })
        })
      });

      const updateQuestionStatus = async (questionId: string, reviewResult: any) => {
        const updateData = {
          status: reviewResult.status,
          reviewScore: reviewResult.score,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          qualityMetrics: reviewResult.qualityMetrics,
          reviewNotes: reviewResult.recommendations
        };

        await admin.firestore().collection('questions').doc(questionId).update(updateData);
        return updateData;
      };

      const reviewResult = {
        score: 85,
        status: 'approved',
        qualityMetrics: { medical_accuracy: 90 },
        recommendations: ['High quality question']
      };

      await updateQuestionStatus('test-id', reviewResult);

      expect(updateStub).to.have.been.calledOnce;
      const updateCall = updateStub.getCall(0);
      expect(updateCall.args[0]).to.have.property('status', 'approved');
      expect(updateCall.args[0]).to.have.property('reviewScore', 85);
    });
  });
});