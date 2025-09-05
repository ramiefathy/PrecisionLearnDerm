import { expect } from 'chai';
import sinon from 'sinon';
import * as aiQuestionScorer from '../evaluation/aiQuestionScorer';
import { scoreWithAIFallback } from '../evaluation/aiFallbackScorer';
import { type DetailedQualityScore } from '../evaluation/questionScorer';

describe('scoreWithAIFallback', () => {
  afterEach(() => sinon.restore());

  const mcq = {
    stem: 'Patient presents with rash',
    options: ['A', 'B', 'C', 'D', 'E'],
    correctAnswer: 0,
    explanation: 'Because'
  };

  const detailed: DetailedQualityScore = {
    overall: 70,
    dimensions: {
      boardStyleSimilarity: 60,
      medicalAccuracy: 70,
      clinicalDetail: 65,
      distractorQuality: 50,
      explanationQuality: 55,
      complexity: 40
    },
    feedback: { strengths: [], weaknesses: [], boardStyleNotes: '' },
    metadata: {
      stemWordCount: 10,
      explanationWordCount: 10,
      hasClinicalVignette: false,
      hasLabValues: false,
      hasImageDescription: false,
      questionType: 'recall'
    }
  };

  it('falls back to rule-based scores when AI scorer fails', async () => {
    sinon.stub(aiQuestionScorer, 'evaluateQuestionWithAI').rejects(new Error('API down'));
    const result = await scoreWithAIFallback(mcq, 'pipeline', 'topic', 'Basic', detailed.overall, detailed);
    expect(result.overall).to.equal(Math.round(detailed.overall));
    expect(result.metadata.failureReason).to.equal('API down');
  });

  it('uses AI scores when available', async () => {
    const aiScore = {
      overall: 90,
      clinicalRealism: 80,
      medicalAccuracy: 85,
      distractorQuality: 70,
      cueingAbsence: 75,
      coreQuality: {
        medicalAccuracy: 85,
        clinicalRealism: 80,
        stemCompleteness: 75,
        difficultyCalibration: 70
      },
      technicalQuality: {
        distractorQuality: 70,
        cueingAbsence: 75,
        clarity: 80
      },
      educationalValue: {
        clinicalRelevance: 80,
        educationalValue: 85
      },
      detailedFeedback: { strengths: [], weaknesses: [], improvementSuggestions: [] },
      metadata: { boardReadiness: 'ready' }
    };

    sinon.stub(aiQuestionScorer, 'evaluateQuestionWithAI').resolves(aiScore as any);
    const result = await scoreWithAIFallback(mcq, 'pipeline', 'topic', 'Basic', detailed.overall, detailed);
    expect(result).to.deep.equal(aiScore);
  });
});
