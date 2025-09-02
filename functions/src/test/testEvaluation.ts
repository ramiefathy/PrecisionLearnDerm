/**
 * Test Script for Evaluation System
 * Tests the complete pipeline evaluation flow
 */

import * as admin from 'firebase-admin';
import { config } from '../util/config';

// Initialize admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function testEvaluationSystem() {
  console.log('🧪 Testing Evaluation System...\n');
  
  try {
    // 1. Create a minimal test configuration
    const testConfig = {
      basicCount: 1,
      advancedCount: 1,
      veryDifficultCount: 0,
      pipelines: ['boardStyle'], // Start with just boardStyle for testing
      topics: ['Psoriasis'] // Single topic for quick test
    };
    
    console.log('📋 Test Configuration:', testConfig);
    
    // 2. Call the evaluation job manager directly
    const { createEvaluationJob } = require('../evaluation/evaluationJobManager');
    const { processEvaluationJob } = require('../evaluation/processPipelineEvaluation');
    
    // Create a test job
    const jobId = await createEvaluationJob('test-user', testConfig);
    console.log(`✅ Created evaluation job: ${jobId}\n`);
    
    // 3. Monitor job progress
    console.log('📊 Starting evaluation processing...\n');
    
    // Process the job
    await processEvaluationJob(jobId);
    
    // 4. Get final results
    const jobDoc = await db.collection('evaluationJobs').doc(jobId).get();
    const finalJob = jobDoc.data();
    
    if (finalJob?.status === 'completed') {
      console.log('✅ Evaluation completed successfully!\n');
      console.log('📈 Results Summary:');
      console.log(`   - Total Tests: ${finalJob.results?.overall?.totalTests || 0}`);
      console.log(`   - Success Rate: ${((finalJob.results?.overall?.overallSuccessRate || 0) * 100).toFixed(1)}%`);
      console.log(`   - Avg Latency: ${(finalJob.results?.overall?.avgLatency || 0) / 1000}s`);
      console.log(`   - Avg Quality: ${(finalJob.results?.overall?.avgQuality || 0).toFixed(2)}/10`);
      
      if (finalJob.results?.errors && finalJob.results.errors.length > 0) {
        console.log(`\n⚠️  Errors encountered: ${finalJob.results.errors.length}`);
        finalJob.results.errors.forEach((error: any, index: number) => {
          console.log(`   ${index + 1}. ${error.pipeline} - ${error.topic}: ${error.error.message}`);
        });
      }
    } else if (finalJob?.status === 'failed') {
      console.error('❌ Evaluation failed:', finalJob.error);
    } else {
      console.log('⏳ Job status:', finalJob?.status);
    }
    
    console.log('\n✅ Test completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testEvaluationSystem();