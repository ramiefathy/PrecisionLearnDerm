#!/usr/bin/env node

/**
 * Script to mark stuck evaluations as failed
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function fixStuckEvaluations() {
  try {
    console.log('Searching for stuck evaluations...');
    
    // Find evaluations stuck in running or pending state
    const stuckQuery = await db.collection('evaluationJobs')
      .where('status', 'in', ['running', 'pending'])
      .get();
    
    if (stuckQuery.empty) {
      console.log('No stuck evaluations found.');
      return;
    }
    
    console.log(`Found ${stuckQuery.size} stuck evaluations. Marking as failed...`);
    
    const batch = db.batch();
    const now = new Date().toISOString();
    
    stuckQuery.docs.forEach(doc => {
      const data = doc.data();
      console.log(`- ${doc.id}: ${data.status} (created: ${data.createdAt?.toDate?.() || 'unknown'})`);
      
      batch.update(doc.ref, {
        status: 'failed',
        failedAt: admin.firestore.Timestamp.now(),
        results: {
          error: 'Evaluation was stuck and marked as failed by cleanup script',
          originalStatus: data.status,
          markedFailedAt: now,
          partial: {
            completedTests: data.progress?.completedTests || 0,
            totalTests: data.progress?.totalTests || 0
          }
        }
      });
    });
    
    await batch.commit();
    console.log('Successfully marked all stuck evaluations as failed.');
    
    // Show summary
    console.log('\nFixed evaluations:');
    stuckQuery.docs.forEach(doc => {
      console.log(`  - ${doc.id}`);
    });
    
  } catch (error) {
    console.error('Error fixing stuck evaluations:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
fixStuckEvaluations();