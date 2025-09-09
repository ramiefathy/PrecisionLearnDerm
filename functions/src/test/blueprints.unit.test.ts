import { expect } from 'chai';
import { ensureFiveOptions, hasSingleBestAnswer, checkHomogeneous, checkCoverTheOptions, guardNegativeLeadIn, detectDuplicateOptions } from '../generation/validators';
import { selectBlueprint } from '../generation/blueprintSelector';

describe('Blueprint validators', () => {
  it('ensureFiveOptions handles object and array', () => {
    const arr = ensureFiveOptions(['A','B','C','D','E','F']);
    expect(arr).to.have.length(5);
    const obj = ensureFiveOptions({ A:'a', B:'b', C:'c', D:'d', E:'e' });
    expect(obj).to.have.length(5);
  });

  it('single best answer letter/index', () => {
    expect(hasSingleBestAnswer(0)).to.eq(true);
    expect(hasSingleBestAnswer('C')).to.eq(true);
    expect(hasSingleBestAnswer('Z')).to.eq(false);
  });

  it('homogeneity categorizes options', () => {
    expect(checkHomogeneous(['Psoriasis','Lichen planus','Pityriasis rosea','Tinea versicolor','Seborrheic dermatitis'])).to.eq(true);
    expect(checkHomogeneous(['Biopsy','KOH prep','CT scan','MRI','CBC'])).to.eq(true);
    expect(checkHomogeneous(['Psoriasis','Biopsy','Methotrexate','CT scan','MRI'])).to.eq(false);
  });

  it('cover-the-options heuristic and negative lead-ins', () => {
    const lead = 'Which of the following is the most likely diagnosis?';
    const stem = 'A 35-year-old presents with a 3-month history of pruritic plaques on extensor surfaces with overlying silvery scale and pinpoint bleeding on removal.';
    expect(checkCoverTheOptions(lead, stem)).to.eq(true);
    expect(guardNegativeLeadIn('Which of the following is NOT correct?').ok).to.eq(false);
  });

  it('detectDuplicateOptions finds duplicates', () => {
    const d = detectDuplicateOptions(['A','B','b','C','A']);
    expect(d.length).to.be.greaterThan(0);
  });
});

describe('Blueprint selector', () => {
  it('returns deterministic selection with seed', () => {
    const b1 = selectBlueprint({ topic: 'Psoriasis', difficulty: 'Basic', seed: 42 });
    const b2 = selectBlueprint({ topic: 'Psoriasis', difficulty: 'Basic', seed: 42 });
    expect(b1.id).to.eq(b2.id);
  });
});
