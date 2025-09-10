import { expect } from 'chai';
import { parseStructuredMCQResponse, convertToLegacyFormat } from '../util/structuredTextParser';

describe('structuredTextParser.parseStructuredMCQResponse', () => {
  it('parses valid structured text with LEAD_IN and 5 options', () => {
    const text = `
=== STEM ===
A 35-year-old man presents with erythematous plaques with silvery scales on extensor surfaces.

=== LEAD_IN ===
Which of the following is the most likely diagnosis?

=== OPTIONS ===
A) Psoriasis vulgaris
B) Atopic dermatitis
C) Contact dermatitis
D) Lichen planus
E) Seborrheic dermatitis

=== CORRECT_ANSWER ===
A

=== EXPLANATION ===
Classic extensor plaques with silvery scales suggest psoriasis.
`;

    const parsed = parseStructuredMCQResponse(text)!;
    expect(parsed).to.be.ok;
    expect(parsed.stem).to.be.a('string').and.to.have.length.greaterThan(20);
    expect(parsed.leadIn).to.include('most likely');
    expect(parsed.options.A).to.include('Psoriasis');
    expect(parsed.correctAnswer).to.equal('A');
    expect(parsed.explanation).to.include('psoriasis');

    const legacy = convertToLegacyFormat(parsed, true);
    expect(Array.isArray(legacy.options)).to.equal(true);
    expect(legacy.options.length).to.equal(5);
    expect(typeof legacy.correctAnswer).to.equal('number');
  });

  it('returns null when missing required sections', () => {
    const invalid = `
STEM:
Short stem

OPTIONS:
A) One
B) Two
C) Three
D) Four
E) Five
`;
    const parsed = parseStructuredMCQResponse(invalid);
    expect(parsed).to.equal(null);
  });
});


