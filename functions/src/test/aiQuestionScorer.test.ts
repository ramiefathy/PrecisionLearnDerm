import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { evaluateQuestionWithAI } from '../evaluation/aiQuestionScorer';
import * as geminiClient from '../util/robustGeminiClient';
import { setupTestEnvironment } from './test_setup';

setupTestEnvironment();

describe('aiQuestionScorer', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('returns flattened subscores when scoring succeeds', async () => {
    const responseText = `===SCORES===
MEDICAL_ACCURACY: 90
CLINICAL_REALISM: 85
STEM_COMPLETENESS: 80
DIFFICULTY_CALIBRATION: 75
DISTRACTOR_QUALITY: 70
CUEING_ABSENCE: 65
CLARITY: 88
CLINICAL_RELEVANCE: 92
EDUCATIONAL_VALUE: 89
BOARD_READINESS: ready

===FEEDBACK===
STRENGTHS:
- Good
WEAKNESSES:
- Weak
IMPROVEMENTS:
- Improve
`;

    const stubClient = { generateText: sinon.stub().resolves({ text: responseText }) } as any;
    sinon.stub(geminiClient, 'getRobustGeminiClient').returns(stubClient);

    const mcq = { stem: 'stub', options: ['a','b'], correctAnswer: 0, explanation: 'because' };
    const result = await evaluateQuestionWithAI(mcq, 'p1', 'topic', 'Basic');

    expect(result.clinicalRealism).to.equal(85);
    expect(result.medicalAccuracy).to.equal(90);
    expect(result.distractorQuality).to.equal(70);
    expect(result.cueingAbsence).to.equal(65);
  });
});
