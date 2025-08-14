const https = require('https');

function callTestFunction() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ testType: 'iterative_scoring_pipeline' });
    
    const options = {
      hostname: 'us-central1-dermassist-ai-1zyic.cloudfunctions.net',
      port: 443,
      path: '/testIterativeScoringPipeline',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('\n=== RESPONSE ===');
        try {
          const parsed = JSON.parse(data);
          console.log(JSON.stringify(parsed, null, 2));
          resolve(parsed);
        } catch (e) {
          console.log('Raw response:', data);
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Problem with request: ${e.message}`);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

console.log('🧪 Testing AI Pipeline via testIterativeScoringPipeline function...');
console.log('This will test the complete multi-agent pipeline 3 times');
console.log('=' .repeat(60));

callTestFunction()
  .then(result => {
    console.log('\n✅ Test completed successfully!');
    
    // Analyze results if available
    if (result && result.results) {
      console.log('\n📊 PIPELINE ANALYSIS:');
      result.results.forEach((test, i) => {
        console.log(`\nTest ${i + 1} (${test.entityName}):`);
        console.log(`  - Initial Quality: ${test.initialQuality || 'N/A'}`);
        console.log(`  - Final Score: ${test.finalScore || 'N/A'}/25`);
        console.log(`  - Iterations: ${test.totalIterations || 'N/A'}`);
        console.log(`  - Target Achieved: ${test.improvementAchieved ? 'Yes' : 'No'}`);
      });
      
      const avgFinalScore = result.averageFinalScore || 0;
      const avgIterations = result.averageIterations || 0;
      
      console.log('\n📈 SUMMARY:');
      console.log(`  - Average Final Score: ${avgFinalScore}/25`);
      console.log(`  - Average Iterations: ${avgIterations}`);
      console.log(`  - Success Rate: ${result.successfulTests || 0}/${result.totalTests || 0}`);
      
      // ABD Guidelines Assessment
      console.log('\n📋 ABD GUIDELINES ASSESSMENT:');
      if (avgFinalScore >= 20) {
        console.log('✅ EXCELLENT: Questions meet high-quality standards (20+/25)');
      } else if (avgFinalScore >= 15) {
        console.log('⚠️  GOOD: Questions are acceptable but could be improved (15-19/25)');
      } else {
        console.log('❌ NEEDS WORK: Questions need significant improvement (<15/25)');
      }
    }
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
  }); 