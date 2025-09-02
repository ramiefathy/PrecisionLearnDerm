const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function checkLatestResults() {
  try {
    console.log('Checking latest evaluation results...\n');
    
    // Get the completed evaluation after parser fix
    const evalDoc = await db.collection('evaluationJobs')
      .doc('gOqeOT7hEqQO1IX25q79')
      .get();
    
    if (!evalDoc.exists) {
      console.log('Evaluation not found');
      return;
    }
    
    const evalData = evalDoc.data();
    console.log(`Evaluation: ${evalDoc.id}`);
    console.log(`Status: ${evalData.status}`);
    console.log(`Completed at: ${evalData.completedAt.toDate()}`);
    console.log(`Topic: ${evalData.config.topics.join(', ')}`);
    console.log('\n--- Test Results ---\n');
    
    // Get test results
    const testResults = await db.collection('evaluationJobs')
      .doc(evalDoc.id)
      .collection('testResults')
      .get();
    
    console.log(`Found ${testResults.size} test results\n`);
    
    // Sort and check results
    const sortedResults = testResults.docs.sort((a, b) => {
      const aIndex = parseInt(a.id.replace('test_', ''));
      const bIndex = parseInt(b.id.replace('test_', ''));
      return aIndex - bIndex;
    });
    
    let leadInCount = 0;
    let basicWithTooManyFindings = 0;
    
    sortedResults.forEach((doc) => {
      const data = doc.data();
      console.log(`\nTest ${doc.id}:`);
      console.log(`Difficulty: ${data.testCase.difficulty}`);
      console.log(`Success: ${data.success}`);
      
      if (data.result) {
        // Check lead-in
        const hasLeadIn = !!data.result.leadIn && data.result.leadIn.length > 0;
        console.log(`Has lead-in: ${hasLeadIn}`);
        if (hasLeadIn) {
          console.log(`Lead-in: "${data.result.leadIn}"`);
          leadInCount++;
        }
        
        // Check pathognomonic findings for Basic questions
        if (data.testCase.difficulty === 'Basic' && data.result.stem) {
          const stem = data.result.stem.toLowerCase();
          const findings = {
            'heliotrope': stem.includes('heliotrope'),
            'gottron': stem.includes('gottron'),
            'shawl sign': stem.includes('shawl sign'),
            'mechanic hands': stem.includes('mechanic'),
            'v-neck': stem.includes('v-neck') || stem.includes('v neck'),
            'muscle weakness': stem.includes('muscle weakness') || stem.includes('proximal weakness')
          };
          
          const foundCount = Object.values(findings).filter(v => v).length;
          const foundFindings = Object.entries(findings).filter(([_, v]) => v).map(([k]) => k);
          
          console.log(`Pathognomonic findings: ${foundCount} - ${foundFindings.join(', ')}`);
          if (foundCount > 2) {
            console.log('⚠️  WARNING: Too many pathognomonic findings for Basic question!');
            basicWithTooManyFindings++;
          }
        }
        
        // Show AI scores
        if (data.aiScores) {
          console.log(`AI Score: ${data.aiScores.overall}% (${data.aiScores.metadata.boardReadiness})`);
        }
      }
    });
    
    console.log('\n--- Summary ---');
    console.log(`Total tests: ${testResults.size}`);
    console.log(`Tests with lead-in: ${leadInCount}/${testResults.size}`);
    console.log(`Basic questions with >2 pathognomonic findings: ${basicWithTooManyFindings}`);
    
    // Check currently running evaluation
    console.log('\n--- Currently Running ---');
    const running = await db.collection('evaluationJobs')
      .doc('EjaJpuHDtScfsRfVWWiq')
      .get();
    
    if (running.exists) {
      const runningData = running.data();
      console.log(`Status: ${runningData.status}`);
      console.log(`Topic: ${runningData.config.topics.join(', ')}`);
      console.log(`Progress: ${runningData.progress.completedTests}/${runningData.progress.totalTests}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkLatestResults();