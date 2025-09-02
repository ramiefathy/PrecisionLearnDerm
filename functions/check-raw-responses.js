const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function checkRawResponses() {
  try {
    console.log('Checking raw Gemini responses...\n');
    
    // Get the currently running evaluation
    const evalDoc = await db.collection('evaluationJobs')
      .doc('EjaJpuHDtScfsRfVWWiq')
      .get();
    
    if (!evalDoc.exists) {
      console.log('Evaluation not found');
      return;
    }
    
    const evalData = evalDoc.data();
    console.log(`Evaluation: ${evalDoc.id}`);
    console.log(`Status: ${evalData.status}`);
    console.log(`Topic: ${evalData.config.topics.join(', ')}`);
    
    // Get test results
    const testResults = await db.collection('evaluationJobs')
      .doc(evalDoc.id)
      .collection('testResults')
      .limit(3) // Just check first 3
      .get();
    
    console.log(`\nChecking ${testResults.size} test results for raw responses...\n`);
    
    testResults.forEach((doc) => {
      const data = doc.data();
      console.log(`\n=== Test ${doc.id} ===`);
      console.log(`Difficulty: ${data.testCase.difficulty}`);
      
      // Check if raw response is stored
      if (data.rawResponse) {
        console.log('Raw response length:', data.rawResponse.length);
        // Look for LEAD_IN in raw response
        const hasLeadIn = data.rawResponse.includes('LEAD_IN') || data.rawResponse.includes('LEAD-IN');
        console.log('Contains LEAD_IN section:', hasLeadIn);
        
        if (hasLeadIn) {
          // Extract the LEAD_IN section
          const leadInMatch = data.rawResponse.match(/(?:LEAD[_-]?IN):\s*\n?(.*?)(?=\n+(?:OPTIONS|CHOICES):|$)/i);
          if (leadInMatch) {
            console.log('Extracted lead-in:', leadInMatch[1].trim());
          }
        } else {
          // Show what sections ARE present
          const sections = data.rawResponse.match(/^[A-Z_]+:/gm);
          console.log('Sections found:', sections ? sections.join(', ') : 'none');
          
          // Show a snippet around OPTIONS to see what's there
          const optionsIndex = data.rawResponse.indexOf('OPTIONS');
          if (optionsIndex > -1) {
            console.log('\nSnippet before OPTIONS:');
            console.log(data.rawResponse.substring(Math.max(0, optionsIndex - 200), optionsIndex + 50));
          }
        }
      } else {
        console.log('No raw response stored');
        
        // Check if there's any agent output that might contain the raw response
        if (data.agentOutputs && data.agentOutputs.boardStyle) {
          console.log('Board style agent output available');
          const output = data.agentOutputs.boardStyle;
          if (typeof output === 'string' && output.includes('STEM')) {
            console.log('Found structured text in agent output');
            const hasLeadIn = output.includes('LEAD_IN') || output.includes('LEAD-IN');
            console.log('Contains LEAD_IN:', hasLeadIn);
          }
        }
      }
      
      // Show the saved result
      if (data.result) {
        console.log('\nSaved result:');
        console.log('- Has leadIn field:', 'leadIn' in data.result);
        console.log('- Lead-in value:', data.result.leadIn || '(empty)');
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkRawResponses();