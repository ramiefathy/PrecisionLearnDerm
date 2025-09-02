#!/usr/bin/env node

/**
 * Script to reset evaluation status from 'completed' to 'running' so it can continue
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function resetEvaluationStatus() {
  try {
    const jobId = 'C4KWnyfxcADCZhglSC84';
    
    console.log('Resetting evaluation status...', { jobId });
    
    // Update the job to running status
    await db.collection('evaluationJobs').doc(jobId).update({
      status: 'running',
      updatedAt: admin.firestore.Timestamp.now()
    });
    
    console.log('✅ Job status reset to "running" - can now continue processing');
    
  } catch (error) {
    console.error('❌ Error resetting evaluation status:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
resetEvaluationStatus();