import { describe, expect, it } from 'vitest';
import { normalizeRecordAnswerRequest, normalizeQualityFeedbackRequest } from '../types';

describe('type utilities', () => {
  it('normalizes record answer request', () => {
    const result = normalizeRecordAnswerRequest({
      itemId: 'q1',
      answer: 1,
      correctAnswer: 1,
      timeSpent: 5,
    });
    expect(result).toMatchObject({
      userId: 'anonymous',
      itemId: 'q1',
      answer: 1,
      correctAnswer: 1,
      timeSpent: 5,
      correct: true,
      chosenIndex: 1,
    });
  });

  it('normalizes quality feedback request', () => {
    const result = normalizeQualityFeedbackRequest({
      itemId: 'q1',
      rating: 4,
    });
    expect(result).toMatchObject({
      itemId: 'q1',
      rating: 4,
      userId: 'anonymous',
    });
  });
});
