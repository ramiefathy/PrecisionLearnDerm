const https = require('https');

// Try different function naming patterns based on the Firebase functions list
const functionNames = [
  'testIterativeScoringPipeline',
  'test_iterative_scoring_pipeline', 
  'testSimple'
];

function callFunction(functionName) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({});
    
    const options = {
      hostname: 'us-central1-dermassist-ai-1zyic.cloudfunctions.net',
      port: 443,
      path: `/${functionName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`\n🔍 Trying function: ${functionName}`);
    console.log(`URL: https://${options.hostname}${options.path}`);

    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Function found and executed!');
          try {
            const parsed = JSON.parse(data);
            resolve({ success: true, functionName, data: parsed });
          } catch (e) {
            resolve({ success: true, functionName, data: data });
          }
        } else if (res.statusCode === 404) {
          console.log('❌ Function not found (404)');
          resolve({ success: false, functionName, statusCode: res.statusCode });
        } else {
          console.log(`⚠️ Function found but returned ${res.statusCode}`);
          resolve({ success: false, functionName, statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => {
      console.log(`❌ Request failed: ${e.message}`);
      resolve({ success: false, functionName, error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function testFunctions() {
  console.log('🔍 Testing AI Pipeline Function Access');
  console.log('Trying different function naming patterns...');
  console.log('=' .repeat(50));
  
  for (const functionName of functionNames) {
    const result = await callFunction(functionName);
    
    if (result.success) {
      console.log('\n🎉 SUCCESS! Found working function:', functionName);
      console.log('Response:', JSON.stringify(result.data, null, 2));
      break;
    }
    
    // Wait between attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📋 Summary: Function testing completed');
}

testFunctions().catch(console.error); 