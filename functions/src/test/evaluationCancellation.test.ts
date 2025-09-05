import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';

import { createEvaluationJob } from '../evaluation/evaluationJobManager';
import { cancelEvaluationJob, processBatchTestsLogic } from '../evaluation/evaluationProcessor';
import { createMockAdminContext } from './testUtils';

// Unit test for evaluation cancellation flow

describe('Evaluation cancellation', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should mark job cancelled and prevent further processing', async () => {
    const jobId = await createEvaluationJob('test-admin-123', {
      basicCount: 1,
      advancedCount: 0,
      veryDifficultCount: 0,
      pipelines: ['boardStyle'],
      topics: ['Psoriasis']
    });

    // Seed job with a queued task id
    await admin.firestore().collection('evaluationJobs').doc(jobId).update({
      taskIds: ['task1']
    });

    // Stub taskQueue.delete to track deletions
    const deleteStub = sinon.stub().resolves();
    sinon.stub(require('firebase-admin/functions'), 'getFunctions').returns({
      taskQueue: () => ({ delete: deleteStub })
    } as any);

    await cancelEvaluationJob({ jobId }, createMockAdminContext());

    // Job should be marked cancelled
    const jobSnap = await admin.firestore().collection('evaluationJobs').doc(jobId).get();
    const jobData = jobSnap.data();
    expect(jobData?.status).to.equal('cancelled');
    expect(jobData?.completedAt).to.exist;
    expect(deleteStub.calledWith('task1')).to.be.true;

    // Further processing should stop immediately
    const result = await processBatchTestsLogic(jobId, 0, 1, false);
    expect(result.finished).to.be.true;
  });
});

