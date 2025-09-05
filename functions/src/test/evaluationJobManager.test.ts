import { expect } from 'chai';
import { generateTestCases } from '../evaluation/evaluationJobManager';

describe('generateTestCases', () => {
  it('assigns a category to every generated test case', () => {
    const config = {
      basicCount: 1,
      advancedCount: 0,
      veryDifficultCount: 0,
      pipelines: ['pipelineA'],
      topics: ['Psoriasis']
    };
    const cases = generateTestCases(config);
    expect(cases.length).to.equal(1);
    expect(cases[0].category).to.be.a('string').and.not.empty;
  });

  it('uses default category when topic mapping is missing', () => {
    const config = {
      basicCount: 1,
      advancedCount: 0,
      veryDifficultCount: 0,
      pipelines: ['pipelineA'],
      topics: ['Unknown Topic']
    };
    const cases = generateTestCases(config);
    expect(cases[0].category).to.equal('general');
  });
});
