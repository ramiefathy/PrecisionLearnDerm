const admin = require('firebase-admin');
const path = require('path');

// Initialize admin with service account
const serviceAccount = require(path.join(__dirname, '../service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});
const db = admin.firestore();

async function cancelStalledEvaluation() {
  const jobId = 'nSbMsJM1wtWGwVEF0vf8';
  
  try {
    console.log(`Cancelling stalled evaluation: ${jobId}`);
    
    // Update the job to mark it as cancelled
    await db.collection('evaluationJobs').doc(jobId).update({
      status: 'failed',
      cancelRequested: true,
      cancellationReason: 'Evaluation stalled in pending status - manually cancelled',
      completedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      'results.errors': admin.firestore.FieldValue.arrayUnion({
        timestamp: new Date().toISOString(),
        error: {
          message: 'Evaluation cancelled due to stalled state',
          code: 'MANUALLY_CANCELLED'
        },
        context: {
          cancelledBy: 'manual script',
          reason: 'Evaluation was stuck in pending state with incomplete processing',
          progress: {
            totalTests: 12,
            completedTests: 5,
            lastUpdate: '2025-09-02T21:12:28.666Z'
          }
        }
      })
    });
    
    // Add a cancellation log
    await db.collection('evaluationJobs').doc(jobId)
      .collection('liveLogs').add({
        type: 'evaluation_cancelled',
        timestamp: new Date().toISOString(),
        message: '🛑 Evaluation cancelled manually due to stalled state',
        createdAt: admin.firestore.Timestamp.now()
      });
    
    console.log('Successfully cancelled stalled evaluation');
  } catch (error) {
    console.error('Error cancelling evaluation:', error);
  }
  
  process.exit(0);
}

cancelStalledEvaluation();