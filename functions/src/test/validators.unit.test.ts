import { expect } from 'chai';
import { ensureFiveOptions, hasSingleBestAnswer, checkHomogeneous, checkCoverTheOptions, detectDuplicateOptions } from '../generation/validators';

describe('generation/validators', () => {
  it('ensureFiveOptions converts object options to array', () => {
    const arr = ensureFiveOptions({ A: 'One', B: 'Two', C: 'Three', D: 'Four', E: 'Five' });
    expect(arr).to.deep.equal(['One','Two','Three','Four','Five']);
  });

  it('hasSingleBestAnswer validates letter and index', () => {
    expect(hasSingleBestAnswer('C')).to.equal(true);
    expect(hasSingleBestAnswer(2)).to.equal(true);
    expect(hasSingleBestAnswer('Z')).to.equal(false);
  });

  it('checkHomogeneous detects mixed categories', () => {
    expect(checkHomogeneous(['Psoriasis','Lichen planus','Atopic dermatitis'])).to.equal(true);
    expect(checkHomogeneous(['Skin biopsy','Topical corticosteroids','Psoriasis'])).to.equal(false);
  });

  it('checkCoverTheOptions requires proper lead-in and sufficient stem', () => {
    const ok = checkCoverTheOptions('Which of the following is the most likely diagnosis?', 'A very long stem '.repeat(10));
    const bad = checkCoverTheOptions('What?', 'Too short');
    expect(ok).to.equal(true);
    expect(bad).to.equal(false);
  });

  it('detectDuplicateOptions returns duplicate indices', () => {
    const d = detectDuplicateOptions(['A','B','A','C','D']);
    expect(d).to.include(2);
  });
});


