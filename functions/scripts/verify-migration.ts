import * as admin from 'firebase-admin';

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  const qqSnap = await db.collection('questionQueue').where('status', '==', 'pending').get();
  const rqSnap = await db.collection('reviewQueue').where('status', '==', 'pending').get();
  const rqMigratedSnap = await db.collection('reviewQueue').where('migratedFrom', '==', 'questionQueue').get();

  console.log(`[VERIFY] questionQueue pending: ${qqSnap.size}`);
  console.log(`[VERIFY] reviewQueue pending: ${rqSnap.size}`);
  console.log(`[VERIFY] reviewQueue migratedFrom=questionQueue: ${rqMigratedSnap.size}`);

  // Sample verify fields
  const sample = rqMigratedSnap.docs[0];
  if (sample) {
    const d = sample.data() as any;
    const hasFields = !!d.draftItem && !!d.topicHierarchy && d.kbSource != null && 'priority' in d;
    console.log(`[VERIFY] Sample migrated doc id=${sample.id}, has required fields: ${hasFields}`);
  } else {
    console.log('[VERIFY] No migrated docs found to sample');
  }
}

main().catch((e) => {
  console.error('[VERIFY] Failed:', e);
  process.exit(1);
});


