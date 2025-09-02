#!/usr/bin/env node

/**
 * Script to check evaluation status
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function checkEvaluationStatus() {
  try {
    console.log('Checking evaluation status...');
    
    // Get most recent evaluation jobs
    const recentQuery = await db.collection('evaluationJobs')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    if (recentQuery.empty) {
      console.log('No evaluation jobs found.');
      return;
    }
    
    console.log('\nRecent evaluation jobs:');
    console.log('=' * 50);
    
    for (const doc of recentQuery.docs) {
      const data = doc.data();
      console.log(`\nJob ID: ${doc.id}`);
      console.log(`Status: ${data.status}`);
      console.log(`Created: ${data.createdAt?.toDate?.() || 'unknown'}`);
      console.log(`Config: ${JSON.stringify(data.config, null, 2)}`);
      
      if (data.progress) {
        console.log(`Progress: ${data.progress.completedTests}/${data.progress.totalTests} tests`);
      }
      
      if (data.testCases) {
        console.log(`Total test cases: ${data.testCases.length}`);
      }
      
      if (data.status === 'running' || data.status === 'pending') {
        console.log('🔍 Checking test results for running job...');
        
        // Get test results
        const resultsSnapshot = await db.collection('evaluationJobs')
          .doc(doc.id)
          .collection('testResults')
          .get();
        
        console.log(`Found ${resultsSnapshot.size} test results:`);
        resultsSnapshot.docs.forEach((resultDoc, index) => {
          const result = resultDoc.data();
          console.log(`  ${index + 1}. ${resultDoc.id}: ${result.success ? '✅' : '❌'} ${result.testCase?.pipeline} - ${result.testCase?.topic}`);
        });
        
        // Get live logs
        const logsSnapshot = await db.collection('evaluationJobs')
          .doc(doc.id)
          .collection('liveLogs')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();
        
        console.log('\nRecent live logs:');
        logsSnapshot.docs.forEach(logDoc => {
          const log = logDoc.data();
          console.log(`  ${log.timestamp}: ${log.message || log.type}`);
        });
      }
      
      console.log('\n' + '=' * 50);
    }
    
  } catch (error) {
    console.error('Error checking evaluation status:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
checkEvaluationStatus();