import { expect } from 'chai';
import * as admin from 'firebase-admin';
import { https } from 'firebase-functions';
import { test, setupTestEnvironment, testHelper } from './test_setup';
import * as index from '../index';

describe('Integration: Evaluation batch + Review queue', function () {
  setupTestEnvironment();
  this.timeout(20000);

  it('enqueues and approves a draft via review endpoints', async () => {
    await testHelper.createTestAdmin('admin-1');

    // Simulate a minimal evaluation job with one test result
    const db = admin.firestore();
    const jobRef = await db.collection('evaluationJobs').add({ status: 'running', progress: { totalTests: 1, completedTests: 0 }, userId: 'admin-1', createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now() });
    await db.collection('evaluationJobs').doc(jobRef.id).collection('testResults').doc('test_0').set({
      success: true,
      testCase: { pipeline: 'boardStyle', topic: 'Psoriasis', difficulty: 'Basic', category: 'inflammatory' },
      result: { stem: 'A 35-year-old...', options: ['A','B','C','D','E'], correctAnswer: 0, explanation: 'because...' },
      latency: 1200
    });

    // Call review_enqueue_draft
    const draft = {
      draftItem: { stem: 'A 35-year-old...', options: ['A','B','C','D','E'], correctAnswer: 0, explanation: 'because...' },
      topicIds: ['psoriasis'],
      difficulty: 'Basic'
    };

    const enqueue = await (index.review_enqueue_draft as any).run(draft, { auth: { uid: 'admin-1', token: { admin: true } } });
    expect((enqueue as any).success).to.eq(true);
    const draftId = (enqueue as any).id as string;
    expect(draftId).to.be.a('string');

    // List queue
    const list = await (index.review_list_queue as any).run({ status: 'pending' }, { auth: { uid: 'admin-1', token: { admin: true } } });
    expect((list as any).success).to.eq(true);
    expect(((list as any).items || []).length).to.be.greaterThan(0);

    // Approve
    const approve = await (index.review_approve as any).run({ draftId }, { auth: { uid: 'admin-1', token: { admin: true } } });
    expect((approve as any).success).to.eq(true);

    // Verify item exists
    const itemsSnap = await db.collection('items').get();
    expect(itemsSnap.size).to.be.greaterThan(0);
  });
});
