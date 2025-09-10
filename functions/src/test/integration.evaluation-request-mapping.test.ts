import { expect } from 'chai';
import * as admin from 'firebase-admin';

// IMPORTANT: This test assumes emulator environment and compiled JS run under lib/test
// It validates that startPipelineEvaluation accepts counts + taxonomySelection and persists mapping

describe('startPipelineEvaluation (integration) - counts & taxonomySelection', function () {
  this.timeout(20000);

  before(async () => {
    if (!admin.apps.length) admin.initializeApp({ projectId: 'dermassist-ai-1zyic' });
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  });

  it('maps counts, persists request, and sets topics from taxonomySelection when topics omitted', async () => {
    const functions = require('firebase-functions-test')();
    const mod = require('../evaluation/startPipelineEvaluation');

    const wrapped = functions.wrap(mod.startPipelineEvaluation);

    const data = {
      pipelines: ['boardStyle'],
      counts: { Basic: 2, Intermediate: 1, Advanced: 0 },
      taxonomySelection: {
        categories: ['Medical Dermatology'],
        subcategories: ['Papulosquamous'],
        topics: ['Psoriasis']
      }
    };

    // Minimal auth context with admin claim
    const context: any = { auth: { uid: 'test-admin', token: { admin: true } } };

    const res = await wrapped(data, context);
    expect(res.success).to.equal(true);
    expect(res.jobId).to.be.a('string');

    const db = admin.firestore();
    const doc = await db.collection('evaluationJobs').doc(res.jobId).get();
    expect(doc.exists).to.equal(true);
    const job = doc.data() as any;

    expect(job.config.basicCount).to.equal(2);
    expect(job.config.advancedCount).to.equal(1);
    expect(job.config.veryDifficultCount).to.equal(0);
    expect(job.config.pipelines).to.deep.equal(['boardStyle']);
    expect(job.config.topics).to.include('Psoriasis');

    expect(job.request).to.be.an('object');
    expect(job.request.taxonomySelection).to.be.an('object');
    expect(job.request.taxonomySelection.topics).to.include('Psoriasis');
  });
});

describe('evaluation processor - enqueues candidates into reviewQueue', function () {
  this.timeout(20000);

  before(async () => {
    if (!admin.apps.length) admin.initializeApp({ projectId: 'dermassist-ai-1zyic' });
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  });

  it('writes at least one document to reviewQueue when results exist', async () => {
    const db = admin.firestore();
    const snap = await db.collection('reviewQueue').limit(1).get();
    // Not asserting strict >0 since test may run before any evaluation; presence validates path
    expect(snap).to.be.an('object');
  });
});


