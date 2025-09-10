import { expect } from 'chai';
import * as admin from 'firebase-admin';
import * as index from '../index';
import { setupTestEnvironment, testHelper } from './test_setup';

describe('Integration: review_list_queue filters', function () {
  setupTestEnvironment();
  this.timeout(20000);

  it('filters by source=user_feedback and sinceDays', async () => {
    await testHelper.createTestAdmin('admin-filters');
    const db = admin.firestore();

    // Seed two drafts: one feedback-triggered recent, one other older
    const recentFeedbackRef = db.collection('reviewQueue').doc();
    await recentFeedbackRef.set({
      draftItem: { stem: 'feedback item' },
      status: 'pending',
      source: 'user_feedback',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      topicIds: ['t1']
    });

    const oldOtherRef = db.collection('reviewQueue').doc();
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    await oldOtherRef.set({
      draftItem: { stem: 'other item' },
      status: 'pending',
      source: 'pipeline',
      createdAt: admin.firestore.Timestamp.fromDate(oldDate),
      updatedAt: admin.firestore.Timestamp.fromDate(oldDate),
      topicIds: ['t2']
    });

    const res = await (index.review_list_queue as any).run(
      { status: 'pending', source: 'user_feedback', sinceDays: 30, limit: 50 },
      { auth: { uid: 'admin-filters', token: { admin: true } } }
    );

    expect(res.success).to.equal(true);
    expect(Array.isArray(res.items)).to.equal(true);
    const ids = res.items.map((i: any) => i.id);
    expect(ids).to.include(recentFeedbackRef.id);
    expect(ids).to.not.include(oldOtherRef.id);
  });

  it('supports topicIds array-contains-any along with status and createdAt', async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const tRef = db.collection('reviewQueue').doc();
    await tRef.set({
      draftItem: { stem: 'topic filtered' },
      status: 'pending',
      source: 'user_feedback',
      createdAt: now,
      updatedAt: now,
      topicIds: ['x1', 'x2']
    });

    const res = await (index.review_list_queue as any).run(
      { status: 'pending', topicIds: ['x2'], sinceDays: 90, limit: 10 },
      { auth: { uid: 'admin-filters', token: { admin: true } } }
    );

    expect(res.success).to.equal(true);
    const ids = (res.items || []).map((i: any) => i.id);
    expect(ids).to.include(tRef.id);
  });
});


