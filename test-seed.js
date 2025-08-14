const https = require('https');

// Call the deployed seed function
function callSeedFunction() {
  const postData = JSON.stringify({});
  
  const options = {
    hostname: 'us-central1-dermassist-ai-1zyic.cloudfunctions.net',
    port: 443,
    path: '/util_seed_database',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Response:', data);
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

console.log('🌱 Calling seed database function...');
callSeedFunction(); 