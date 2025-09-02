#!/usr/bin/env node

/**
 * Script to start pipeline evaluation
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function startEvaluation() {
  try {
    console.log('Starting pipeline evaluation...');
    
    const config = {
      basicCount: 1,
      advancedCount: 0,
      veryDifficultCount: 0,
      pipelines: ['boardStyle', 'optimizedOrchestrator', 'hybridRouter'],
      topics: ['Alopecia areata', 'Pemphigus vulgaris']
    };
    
    console.log('Configuration:', config);
    
    // Calculate total test cases
    const difficulties = [];
    if (config.basicCount > 0) difficulties.push('Basic');
    if (config.advancedCount > 0) difficulties.push('Advanced');
    if (config.veryDifficultCount > 0) difficulties.push('Very Difficult');
    
    const testCases = [];
    
    // Generate test cases
    for (const pipeline of config.pipelines) {
      for (const topic of config.topics) {
        for (const difficulty of difficulties) {
          const count = difficulty === 'Basic' ? config.basicCount :
                       difficulty === 'Advanced' ? config.advancedCount :
                       config.veryDifficultCount;
          
          for (let i = 0; i < count; i++) {
            testCases.push({
              pipeline,
              topic,
              difficulty,
              category: `${pipeline}_${difficulty.toLowerCase()}`
            });
          }
        }
      }
    }
    
    console.log(`Total test cases: ${testCases.length}`);
    console.log('Test breakdown:');
    console.log(`  - Pipelines: ${config.pipelines.join(', ')}`);
    console.log(`  - Topics: ${config.topics.join(', ')}`);
    console.log(`  - Difficulties: ${difficulties.join(', ')}`);
    
    // Create evaluation job
    const jobRef = db.collection('evaluationJobs').doc();
    const jobId = jobRef.id;
    
    const job = {
      id: jobId,
      status: 'pending',
      config,
      testCases,
      totalTests: testCases.length,
      createdAt: admin.firestore.Timestamp.now(),
      createdBy: 'script',
      progress: {
        completedTests: 0,
        totalTests: testCases.length,
        currentPipeline: null,
        currentTopic: null,
        currentDifficulty: null
      }
    };
    
    await jobRef.set(job);
    
    console.log(`\nEvaluation job created: ${jobId}`);
    console.log('Monitor at: https://dermassist-ai-1zyic.web.app/admin/evaluation');
    
    // Directly invoke the batch processor
    const { processBatchTestsLogic } = require('../lib/evaluation/evaluationProcessor');
    
    console.log('\nStarting batch processing...');
    const result = await processBatchTestsLogic(jobId, 0, 3);
    
    console.log('First batch initiated:', result);
    console.log('\nEvaluation is running in the background.');
    console.log('Check the dashboard for real-time updates.');
    
  } catch (error) {
    console.error('Error starting evaluation:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
startEvaluation();