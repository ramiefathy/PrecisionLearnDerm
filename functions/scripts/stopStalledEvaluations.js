/**
 * Script to stop all stalled or stuck evaluation jobs
 * Marks them as failed with appropriate error messages
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function stopStalledEvaluations() {
  console.log('\n=== Stopping Stalled Evaluations ===\n');
  
  try {
    // Get all pending and running evaluations
    const pendingQuery = await db.collection('evaluationJobs')
      .where('status', 'in', ['pending', 'running'])
      .get();
    
    if (pendingQuery.empty) {
      console.log('No stalled evaluations found.');
      return;
    }
    
    console.log(`Found ${pendingQuery.size} evaluations to stop:\n`);
    
    const batch = db.batch();
    const now = admin.firestore.Timestamp.now();
    
    pendingQuery.docs.forEach(doc => {
      const data = doc.data();
      const jobId = doc.id;
      const createdAt = data.createdAt?.toDate() || new Date();
      const ageMinutes = Math.floor((Date.now() - createdAt.getTime()) / 1000 / 60);
      
      console.log(`Job ID: ${jobId}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Created: ${createdAt.toISOString()} (${ageMinutes} minutes ago)`);
      console.log(`  Progress: ${data.progress?.completedTests || 0}/${data.progress?.totalTests || 0} tests`);
      console.log(`  Topics: ${data.config?.topics?.join(', ') || 'N/A'}`);
      console.log(`  Pipelines: ${data.config?.pipelines?.join(', ') || 'N/A'}`);
      
      // Mark as failed
      batch.update(doc.ref, {
        status: 'failed',
        completedAt: now,
        updatedAt: now,
        'results.errors': admin.firestore.FieldValue.arrayUnion({
          timestamp: new Date().toISOString(),
          error: {
            message: 'Evaluation stopped manually due to stalled state',
            code: 'MANUALLY_STOPPED'
          },
          context: {
            stoppedBy: 'stopStalledEvaluations script',
            reason: 'Evaluation was stuck in pending/running state',
            ageMinutes: ageMinutes,
            progress: data.progress
          }
        })
      });
      
      console.log(`  -> Will mark as FAILED\n`);
    });
    
    // Commit the batch
    console.log('Committing changes...');
    await batch.commit();
    
    console.log(`\n✅ Successfully stopped ${pendingQuery.size} stalled evaluations\n`);
    
    // Also log to a collection for audit trail
    await db.collection('system').doc('evaluation_maintenance').set({
      lastStalledEvaluationCleanup: now,
      stalledEvaluationsStopped: pendingQuery.size,
      stoppedJobIds: pendingQuery.docs.map(doc => doc.id)
    }, { merge: true });
    
  } catch (error) {
    console.error('Error stopping stalled evaluations:', error);
    process.exit(1);
  }
}

// Prompt for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('\nThis will mark all pending/running evaluations as FAILED. Continue? (yes/no): ', async (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    await stopStalledEvaluations();
    process.exit(0);
  } else {
    console.log('\nOperation cancelled.');
    process.exit(0);
  }
  rl.close();
});