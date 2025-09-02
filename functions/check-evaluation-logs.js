const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function checkEvaluationLogs() {
  try {
    console.log('Checking evaluation logs for leadIn debug output...\n');
    
    // Get the debug evaluation
    const evalDoc = await db.collection('evaluationJobs')
      .doc('cyJIifAdEvVhRQlzPAAt')
      .get();
    
    if (!evalDoc.exists) {
      console.log('Debug evaluation not found');
      
      // List recent evaluations
      const recent = await db.collection('evaluationJobs')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
        
      console.log('\nRecent evaluations:');
      recent.forEach(doc => {
        const data = doc.data();
        console.log(`- ${doc.id}: ${data.status} (${data.config?.topics?.join(', ')})`);
      });
      return;
    }
    
    const evalData = evalDoc.data();
    console.log(`Evaluation: ${evalDoc.id}`);
    console.log(`Status: ${evalData.status}`);
    console.log(`Topic: ${evalData.config.topics.join(', ')}`);
    
    // Check live logs for board_result_leadIn
    const logs = evalData.liveLogs || [];
    const leadInLogs = logs.filter(log => 
      log.type === 'generation_progress' && 
      log.stage === 'board_result_leadIn'
    );
    
    if (leadInLogs.length > 0) {
      console.log('\n=== Lead-in Debug Logs Found ===');
      leadInLogs.forEach(log => {
        console.log(`\nTimestamp: ${log.timestamp}`);
        console.log('Details:', JSON.stringify(log.details, null, 2));
      });
    } else {
      console.log('\nNo lead-in debug logs found yet');
      
      // Show other generation logs
      const genLogs = logs.filter(log => log.type === 'generation_progress');
      console.log(`\nOther generation logs: ${genLogs.length}`);
      if (genLogs.length > 0) {
        console.log('Stages:', genLogs.map(l => l.stage).join(', '));
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkEvaluationLogs();