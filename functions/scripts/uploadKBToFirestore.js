/**
 * Script to upload the current knowledge base to Firestore
 * This handles incomplete data gracefully
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../../firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'dermassist-ai-1zyic'
});

const db = admin.firestore();

async function uploadKnowledgeBase() {
  try {
    console.log('Starting knowledge base upload to Firestore...');
    
    // Try to find the KB file
    const possiblePaths = [
      path.join(__dirname, '../../knowledgeBase.json.backup'),
      path.join(__dirname, '../knowledgeBase.json.backup'),
      path.join(__dirname, '../src/kb/knowledgeBase.json'),
      '/Users/ramiefathy/Desktop/WebApps/apps/PrecisionLearnDerm/functions/knowledgeBase.json.backup'
    ];
    
    let kbPath = null;
    let kbData = null;
    
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        kbPath = testPath;
        console.log(`Found knowledge base at: ${kbPath}`);
        break;
      }
    }
    
    if (!kbPath) {
      console.error('Knowledge base file not found in any expected location');
      console.log('Searched paths:', possiblePaths);
      process.exit(1);
    }
    
    // Read and parse the knowledge base
    console.log('Reading knowledge base file...');
    const rawData = fs.readFileSync(kbPath, 'utf-8');
    console.log(`File size: ${(rawData.length / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('Parsing JSON...');
    kbData = JSON.parse(rawData);
    
    // Validate basic structure
    if (!kbData.entities || !Array.isArray(kbData.entities)) {
      console.error('Invalid KB structure: missing entities array');
      process.exit(1);
    }
    
    console.log(`Found ${kbData.entities.length} entities`);
    
    // Count entities by completeness
    let completeCount = 0;
    let partialCount = 0;
    let minimalCount = 0;
    
    kbData.entities.forEach(entity => {
      const score = entity.completeness_score || 0;
      if (score >= 80) completeCount++;
      else if (score >= 50) partialCount++;
      else minimalCount++;
    });
    
    console.log(`Entity completeness breakdown:`);
    console.log(`  - Complete (80%+): ${completeCount}`);
    console.log(`  - Partial (50-79%): ${partialCount}`);
    console.log(`  - Minimal (<50%): ${minimalCount}`);
    
    // Add metadata
    const kbDocument = {
      entities: kbData.entities,
      metadata: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        entityCount: kbData.entities.length,
        source: 'upload_script',
        completeness: {
          complete: completeCount,
          partial: partialCount,
          minimal: minimalCount
        },
        notes: 'Knowledge base in development - incomplete data expected'
      }
    };
    
    // Upload to Firestore
    console.log('Uploading to Firestore...');
    await db.collection('system').doc('knowledgeBase').set(kbDocument);
    
    console.log('✅ Knowledge base successfully uploaded to Firestore!');
    console.log(`   Collection: system`);
    console.log(`   Document: knowledgeBase`);
    console.log(`   Entities: ${kbData.entities.length}`);
    
    // Optionally verify by reading it back
    console.log('\nVerifying upload...');
    const verification = await db.collection('system').doc('knowledgeBase').get();
    if (verification.exists) {
      const data = verification.data();
      console.log('✅ Verification successful!');
      console.log(`   Entities in Firestore: ${data.entities?.length || 0}`);
      console.log(`   Metadata:`, data.metadata);
    } else {
      console.error('❌ Verification failed - document not found');
    }
    
  } catch (error) {
    console.error('Error uploading knowledge base:', error);
    process.exit(1);
  }
}

// Run the upload
uploadKnowledgeBase()
  .then(() => {
    console.log('\n🎉 Upload complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Upload failed:', error);
    process.exit(1);
  });