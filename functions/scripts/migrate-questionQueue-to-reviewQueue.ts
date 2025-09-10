import * as admin from 'firebase-admin';

// CLI migration: Copies pending questionQueue → reviewQueue, preserving key metadata
// Usage: ts-node scripts/migrate-questionQueue-to-reviewQueue.ts [--dryRun]

async function main() {
  const dryRun = process.argv.includes('--dryRun') || process.argv.includes('--dry-run');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  const batchSize = 200;
  let migrated = 0;
  let skipped = 0;

  console.log(`[MIGRATE] Starting migration (dryRun=${dryRun})`);
  const snap = await db.collection('questionQueue')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .get();

  if (snap.empty) {
    console.log('[MIGRATE] No pending documents found in questionQueue.');
    return;
  }

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const slice = docs.slice(i, i + batchSize);
    const batch = db.batch();

    for (const d of slice) {
      const data = d.data() as any;
      const targetRef = db.collection('reviewQueue').doc();

      const payload = {
        id: targetRef.id,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        draftItem: data.draftItem || {},
        topicHierarchy: data.topicHierarchy || {},
        kbSource: data.kbSource || {},
        pipelineOutputs: data.pipelineOutputs || undefined,
        priority: typeof data.priority === 'number' ? data.priority : 0,
        migratedFrom: 'questionQueue',
        legacyQueueId: d.id,
      } as any;

      if (!dryRun) {
        batch.set(targetRef, payload);
      }
      migrated++;
    }

    if (!dryRun) {
      await batch.commit();
    }
    console.log(`[MIGRATE] Processed ${Math.min(i + batchSize, docs.length)}/${docs.length}`);
  }

  console.log(`[MIGRATE] Completed. Migrated=${migrated} Skipped=${skipped}`);
}

main().catch((e) => {
  console.error('[MIGRATE] Failed:', e);
  process.exit(1);
});


