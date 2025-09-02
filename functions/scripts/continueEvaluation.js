#!/usr/bin/env node

/**
 * Script to manually continue stuck evaluation
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const { processBatchTestsLogic } = require('../lib/evaluation/evaluationProcessor');

async function continueEvaluation() {
  try {
    const jobId = 'C4KWnyfxcADCZhglSC84'; // From the database check
    const startIndex = 1; // Continue from test 1 (0 was already completed)
    const batchSize = 3;
    
    console.log('Continuing evaluation...', { jobId, startIndex, batchSize });
    
    const result = await processBatchTestsLogic(jobId, startIndex, batchSize);
    
    console.log('Batch continuation result:', result);
    
    if (!result.finished && result.success) {
      console.log('Evaluation is continuing in the background...');
    } else if (result.finished) {
      console.log('Evaluation completed!');
    }
    
  } catch (error) {
    console.error('Error continuing evaluation:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
continueEvaluation();