import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as admin from 'firebase-admin';

import { createEvaluationJob, updateJobProgress } from '../evaluation/evaluationJobManager';
import { processBatchTestsLogic } from '../evaluation/evaluationProcessor';

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

    await admin.firestore().collection('evaluationJobs').doc(jobId).update({
      status: 'cancelled',
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    const jobSnap = await admin.firestore().collection('evaluationJobs').doc(jobId).get();
    const jobData = jobSnap.data();
    expect(jobData?.status).to.equal('cancelled');
    expect(jobData?.completedAt).to.exist;

    const result = await processBatchTestsLogic(jobId, 0, 1, false);
    expect(result.finished).to.be.true;
  });

  it('should ignore progress updates for a cancelled job', async () => {
    const jobId = await createEvaluationJob('test-admin-456', {
      basicCount: 1,
      advancedCount: 0,
      veryDifficultCount: 0,
      pipelines: ['boardStyle'],
      topics: ['Psoriasis']
    });

    await admin.firestore().collection('evaluationJobs').doc(jobId).update({
      status: 'cancelled',
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    const snapBefore = await admin.firestore().collection('evaluationJobs').doc(jobId).get();
    const dataBefore = snapBefore.data();

    await updateJobProgress(jobId, { completedTests: 1 }, 'running');

    const snapAfter = await admin.firestore().collection('evaluationJobs').doc(jobId).get();
    const dataAfter = snapAfter.data();

    expect(dataAfter?.status).to.equal('cancelled');
    expect(dataAfter?.progress.completedTests).to.equal(
      dataBefore?.progress.completedTests
    );
    expect(dataAfter?.updatedAt.isEqual(dataBefore?.updatedAt)).to.be.true;
  });
});

