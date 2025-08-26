import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { logInfo, logError } from './logging';
import * as fs from 'fs';
import * as path from 'path';

const db = admin.firestore();

export const seedDatabase = functions.https.onCall(async (data: any, context: any) => {
  try {
    // Check if user is admin
    const isAdmin = context?.auth?.token?.admin === true;
    
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required to seed database'
      );
    }
    
    await logInfo('seed.start', { userId: context.auth?.uid });
    
    // Load sample items from JSON file
    const seedDataPath = path.join(__dirname, 'seed-data.json');
    const seedData = fs.readFileSync(seedDataPath, 'utf8');
    const sampleItems = JSON.parse(seedData);
    
    // Add sample items to database
    const batch = db.batch();
    let addedCount = 0;
    
    // Ensure we're working with an array
    const itemsToAdd = Array.isArray(sampleItems) ? sampleItems : sampleItems.questions || [];
    
    for (const item of itemsToAdd) {
      const docRef = db.collection('items').doc();
      
      // Convert options format if needed
      let options = item.options;
      if (options && options.length > 0 && 'isCorrect' in options[0]) {
        // Convert from isCorrect format to keyIndex format
        const keyIndex = options.findIndex((opt: any) => opt.isCorrect === true);
        options = options.map((opt: any) => ({ text: opt.text }));
        item.keyIndex = keyIndex;
      }
      
      // Ensure required fields
      const processedItem = {
        ...item,
        id: docRef.id,
        type: item.type || 'mcq',
        status: item.status || 'active',
        source: item.source || 'seed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth?.uid || 'system',
        options: options,
        keyIndex: item.keyIndex !== undefined ? item.keyIndex : item.correct_answer_index,
        telemetry: item.telemetry || {
          attempts: 0,
          avgTimeSec: 0,
          p2TimeSec: 0,
          p98TimeSec: 0,
          times: []
        }
      };
      
      // Remove any undefined fields
      Object.keys(processedItem).forEach(key => {
        if (processedItem[key] === undefined) {
          delete processedItem[key];
        }
      });
      
      batch.set(docRef, processedItem);
      addedCount++;
    }
    
    await batch.commit();
    
    await logInfo('seed.complete', { 
      itemsAdded: addedCount,
      userId: context.auth?.uid 
    });
    
    return {
      success: true,
      message: `Database seeded successfully with ${addedCount} sample questions`,
      itemsAdded: addedCount
    };
    
  } catch (error: any) {
    await logError('seed.error', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to seed database',
      error instanceof Error ? error.message : String(error)
    );
  }
}); 