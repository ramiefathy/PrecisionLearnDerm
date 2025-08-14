#!/usr/bin/env node

/**
 * Import High-Quality Questions to Firebase
 * ========================================
 * 
 * This script imports the exported questions into our Firebase Firestore database.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccount = {
  "type": "service_account",
  "project_id": "dermassist-ai-1zyic",
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL
};

// Check if we have the required environment variables
if (!serviceAccount.private_key || !serviceAccount.client_email) {
  console.log('Using Firebase emulator or default credentials...');
  admin.initializeApp();
} else {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function importQuestions() {
  try {
    // Find the latest exported questions file
    const files = fs.readdirSync('.')
      .filter(file => file.startsWith('firebase_questions_') && file.endsWith('.json') && !file.includes('_summary'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      console.error('No exported questions file found. Run the export script first.');
      process.exit(1);
    }
    
    const questionsFile = files[0];
    console.log(`Found questions file: ${questionsFile}`);
    
    // Load questions
    const questionsData = fs.readFileSync(questionsFile, 'utf8');
    const questions = JSON.parse(questionsData);
    
    console.log(`Loaded ${questions.length} questions for import`);
    
    // Check if questions already exist to avoid duplicates
    console.log('Checking for existing questions...');
    const existingSnapshot = await db.collection('items')
      .where('source', '==', 'legacy_question_bank')
      .limit(10)
      .get();
    
    if (!existingSnapshot.empty) {
      console.log(`Found ${existingSnapshot.size} existing imported questions.`);
      const response = await askQuestion('Do you want to continue and potentially create duplicates? (y/N): ');
      if (response.toLowerCase() !== 'y') {
        console.log('Import cancelled.');
        process.exit(0);
      }
    }
    
    // Import in batches (Firestore limit is 500 operations per batch)
    const batchSize = 100; // Use smaller batches for safety
    let totalImported = 0;
    
    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = db.batch();
      const currentBatch = questions.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(questions.length/batchSize)} (${currentBatch.length} questions)...`);
      
      for (const question of currentBatch) {
        const docRef = db.collection('items').doc(question.itemId);
        
        // Convert ISO date strings to Firestore timestamps
        const firestoreQuestion = {
          ...question,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        batch.set(docRef, firestoreQuestion);
      }
      
      try {
        await batch.commit();
        totalImported += currentBatch.length;
        console.log(`✅ Successfully imported batch (${totalImported}/${questions.length} total)`);
      } catch (error) {
        console.error(`❌ Failed to import batch: ${error.message}`);
        // Continue with next batch
      }
      
      // Small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n🎉 Import complete! Successfully imported ${totalImported} questions.`);
    
    // Generate import report
    const categories = {};
    const difficulties = {};
    
    questions.forEach(q => {
      categories[q.category] = (categories[q.category] || 0) + 1;
      difficulties[q.estimatedDifficulty] = (difficulties[q.estimatedDifficulty] || 0) + 1;
    });
    
    console.log('\n📊 Import Summary:');
    console.log('Categories imported:');
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count} questions`);
    });
    
    console.log('\nDifficulty distribution:');
    Object.entries(difficulties).forEach(([diff, count]) => {
      console.log(`  ${diff}: ${count} questions`);
    });
    
    const avgQuality = questions.reduce((sum, q) => sum + q.qualityScore, 0) / questions.length;
    console.log(`\nAverage quality score: ${avgQuality.toFixed(1)}/10`);
    
    // Update our question bank organization
    await updateQuestionBankMetadata(questions.length, categories, avgQuality);
    
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    admin.app().delete();
  }
}

async function updateQuestionBankMetadata(totalQuestions, categories, avgQuality) {
  try {
    const metadataRef = db.collection('admin').doc('questionBankMetadata');
    
    await metadataRef.set({
      lastImport: admin.firestore.FieldValue.serverTimestamp(),
      totalImportedQuestions: totalQuestions,
      categoryBreakdown: categories,
      averageQuality: avgQuality,
      source: 'legacy_question_bank',
      importedBy: 'automated_import_script'
    }, { merge: true });
    
    console.log('✅ Updated question bank metadata');
  } catch (error) {
    console.log('⚠️ Failed to update metadata:', error.message);
  }
}

function askQuestion(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Add some helpful command line arguments
if (process.argv.includes('--help')) {
  console.log(`
Usage: node import-questions.js [options]

Options:
  --help     Show this help message
  --dry-run  Show what would be imported without actually importing

Environment Variables:
  FIREBASE_PRIVATE_KEY_ID    Firebase service account private key ID
  FIREBASE_PRIVATE_KEY       Firebase service account private key
  FIREBASE_CLIENT_EMAIL      Firebase service account client email
  FIREBASE_CLIENT_ID         Firebase service account client ID
  FIREBASE_CLIENT_CERT_URL   Firebase service account cert URL

Note: If environment variables are not set, the script will try to use 
default Firebase credentials or the emulator.
`);
  process.exit(0);
}

if (process.argv.includes('--dry-run')) {
  console.log('🔍 DRY RUN MODE - No questions will be imported');
  
  // Find and analyze the questions file
  const files = fs.readdirSync('.')
    .filter(file => file.startsWith('firebase_questions_') && file.endsWith('.json') && !file.includes('_summary'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    console.error('No exported questions file found.');
    process.exit(1);
  }
  
  const questionsFile = files[0];
  const questionsData = fs.readFileSync(questionsFile, 'utf8');
  const questions = JSON.parse(questionsData);
  
  console.log(`Found ${questions.length} questions ready for import from ${questionsFile}`);
  
  const categories = {};
  questions.forEach(q => {
    categories[q.category] = (categories[q.category] || 0) + 1;
  });
  
  console.log('\nWould import by category:');
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count} questions`);
  });
  
  process.exit(0);
}

// Run the import
console.log('🚀 Starting Firebase question import...\n');
importQuestions(); 