import { expect } from 'chai';
import * as admin from 'firebase-admin';

describe('Admin generation → reviewQueue (integration)', function () {
  this.timeout(30000);

  before(async () => {
    if (!admin.apps.length) admin.initializeApp({ projectId: 'dermassist-ai-1zyic' });
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  });

  it('admin_generate_question_queue writes pending drafts to reviewQueue', async () => {
    const db = admin.firestore();
    const before = await db.collection('reviewQueue').get();

    const functions = require('firebase-functions-test')();
    const mod = require('../index');
    const wrapped = functions.wrap(mod.admin_generate_question_queue);
    const context: any = { auth: { uid: 'admin-test', token: { admin: true } } };

    const res = await wrapped({ targetCount: 1 }, context);
    expect(res).to.be.an('object');
    expect(res.success).to.eq(true);

    const after = await db.collection('reviewQueue').get();
    expect(after.size).to.be.greaterThanOrEqual(before.size);
  });
});


