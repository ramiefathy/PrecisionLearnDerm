const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function startDebugEvaluation() {
  try {
    console.log('Starting debug evaluation with Dermatomyositis...\n');
    
    // Create a new evaluation job
    const jobData = {
      config: {
        topics: ['Dermatomyositis'],
        difficulties: ['Basic', 'Advanced', 'Very Difficult'],
        pipelines: ['boardStyle'],
        samplesPerCombination: 1
      },
      metadata: {
        description: 'Debug evaluation to track leadIn values',
        tags: ['debug', 'lead-in-tracking']
      },
      status: 'pending',
      progress: {
        completedTests: 0,
        totalTests: 3 // 1 topic × 3 difficulties × 1 pipeline
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      startedAt: null,
      completedAt: null
    };
    
    const jobRef = await db.collection('evaluationJobs').add(jobData);
    console.log(`Created evaluation job: ${jobRef.id}`);
    console.log('Monitor the live logs to see leadIn debug output');
    
    // Add test cases
    const testCases = [];
    for (const difficulty of jobData.config.difficulties) {
      testCases.push({
        topic: 'Dermatomyositis',
        difficulty,
        pipeline: 'boardStyle',
        category: 'inflammatory'
      });
    }
    
    await jobRef.update({
      testCases,
      'progress.totalTests': testCases.length
    });
    
    console.log(`\nAdded ${testCases.length} test cases`);
    console.log('\nTo start processing, use Admin Testing page or run:');
    console.log(`node scripts/startEvaluation.js ${jobRef.id}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

startDebugEvaluation();