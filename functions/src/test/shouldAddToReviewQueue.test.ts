import * as admin from 'firebase-admin';
import { expect } from 'chai';
import { describe, it } from 'mocha';

// Initialize Firebase Admin before importing module under test
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'test-project' });
}

import { shouldAddToReviewQueue } from '../evaluation/evaluationProcessor';

describe('shouldAddToReviewQueue', () => {
  it('returns true when overall score is 70 or above', () => {
    const result = {
      aiScores: {
        overall: 85,
        metadata: { boardReadiness: 'ready' },
        coreQuality: { medicalAccuracy: 90 }
      }
    };
    expect(shouldAddToReviewQueue(result)).to.be.true;
  });

  it('flags legacy low-score conditions', () => {
    const result = {
      aiScores: {
        overall: 65,
        metadata: { boardReadiness: 'reject' },
        coreQuality: { medicalAccuracy: 75 }
      }
    };
    expect(shouldAddToReviewQueue(result)).to.be.true;
  });

  it('returns false for scores below 70 with no issues', () => {
    const result = {
      aiScores: {
        overall: 60,
        metadata: { boardReadiness: 'ready' },
        coreQuality: { medicalAccuracy: 85 }
      }
    };
    expect(shouldAddToReviewQueue(result)).to.be.false;
  });
});
