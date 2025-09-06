import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as admin from 'firebase-admin';

import { createEvaluationJob } from '../evaluation/evaluationJobManager';
import {
  cancelEvaluationJob,
  processBatchTestsLogic
} from '../evaluation/evaluationProcessor';
import { updateJobProgress } from '../evaluation/evaluationJobManager';
import { createMockAdminContext } from './testUtils';
import { test } from './test_setup';

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

    // Use Firebase test SDK to invoke the real callable in a simulated environment
    const wrappedCancel = test.wrap(cancelEvaluationJob);
    await wrappedCancel({ jobId }, createMockAdminContext());

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

  it('should ignore progress updates once cancelled', async () => {
    const jobId = await createEvaluationJob('test-admin-123', {
      basicCount: 1,
      advancedCount: 0,
      veryDifficultCount: 0,
      pipelines: ['boardStyle'],
      topics: ['Psoriasis']
    });

    // Stub taskQueue.delete to prevent actual deletions
    const deleteStub = sinon.stub().resolves();
    sinon.stub(require('firebase-admin/functions'), 'getFunctions').returns({
      taskQueue: () => ({ delete: deleteStub })
    } as any);

    const wrappedCancel = test.wrap(cancelEvaluationJob);
    await wrappedCancel({ jobId }, createMockAdminContext());

    const beforeSnap = await admin
      .firestore()
      .collection('evaluationJobs')
      .doc(jobId)
      .get();
    const beforeProgress = beforeSnap.data()?.progress.completedTests;

    // Attempt to move job back to running state
    await updateJobProgress(jobId, {}, 'running');

    const afterSnap = await admin
      .firestore()
      .collection('evaluationJobs')
      .doc(jobId)
      .get();
    const afterData = afterSnap.data();

    expect(afterData?.status).to.equal('cancelled');
    expect(afterData?.progress.completedTests).to.equal(beforeProgress);
  });
});

