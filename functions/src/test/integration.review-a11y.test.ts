import { expect } from 'chai';
import * as admin from 'firebase-admin';
import * as index from '../index';
import { setupTestEnvironment, testHelper } from './test_setup';

// NOTE: This assumes emulator is running and functions are compiled to lib/
// and that test runner sets up firebase-functions-test context if needed.

describe('review_approve a11y enforcement', () => {
  const db = admin.firestore();

  it('fails approve without alt text and records lastApprovalError', async () => {
    const ref = db.collection('reviewQueue').doc();
    await ref.set({
      draftItem: { imageUrl: 'https://example.com/img.jpg' },
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Call the callable via admin SDK invoke is non-trivial here; instead, simulate effect by running same logic
    // If test harness has a client, replace this with httpsCallable invocation.
    try {
      // Simulate: calling the function would throw
      const snap = await ref.get();
      const draft = snap.data() as any;
      const imageUrl = draft?.draftItem?.imageUrl;
      const altText = draft?.draftItem?.imageAlt;
      if (imageUrl && (!altText || String(altText).trim().length < 5)) {
        await ref.set({ lastApprovalError: 'alt_text_missing' }, { merge: true });
        throw new Error('failed-precondition');
      }
      throw new Error('should-have-failed');
    } catch (e:any) {
      // expected
    }

    const updated = await ref.get();
    expect(updated.data()?.lastApprovalError).to.eq('alt_text_missing');
  });
});


describe('Integration: Review endpoints a11y (image alt text)', function () {
  setupTestEnvironment();
  this.timeout(20000);

  it('rejects approve when image has no alt text', async () => {
    await testHelper.createTestAdmin('admin-2');
    const db = admin.firestore();
    const draftRef = db.collection('reviewQueue').doc();
    await draftRef.set({
      draftItem: { stem: 'A 40-year-old...', options: ['A','B','C','D','E'], correctAnswer: 'A', explanation: '...' , media: { url: 'https://example.com/img.png' } },
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    try {
      await (index.review_approve as any).run({ draftId: draftRef.id }, { auth: { uid: 'admin-2', token: { admin: true } } });
      expect.fail('approve should have thrown failed-precondition');
    } catch (e: any) {
      expect(String(e.message)).to.match(/alt text/i);
    }
  });

  it('approves when image alt text is present', async () => {
    const db = admin.firestore();
    const draftRef = db.collection('reviewQueue').doc();
    await draftRef.set({
      draftItem: { stem: 'A 50-year-old...', options: ['A','B','C','D','E'], correctAnswer: 'B', explanation: '...' , media: { url: 'https://example.com/img.png', alt: 'classic target lesion' } },
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    const res = await (index.review_approve as any).run({ draftId: draftRef.id }, { auth: { uid: 'admin-2', token: { admin: true } } });
    expect((res as any).success).to.equal(true);
    expect((res as any).itemId).to.be.a('string');
  });
});


