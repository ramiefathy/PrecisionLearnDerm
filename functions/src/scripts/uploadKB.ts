/**
 * Upload knowledge base to Firestore
 * Run this as a Firebase function or locally with emulator
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import * as functions from 'firebase-functions';

// Initialize admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Cloud function to upload KB from backup file
 */
export const uploadKnowledgeBase = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes
    memory: '2GB'
  })
  .https.onCall(async (data, context) => {
    try {
      // Optional: Add admin check
      // if (!context.auth || !context.auth.token.admin) {
      //   throw new functions.https.HttpsError('permission-denied', 'Admin access required');
      // }
      
      console.log('Starting knowledge base upload...');
      
      // Find the KB file
      const kbPath = path.join(__dirname, '../../../knowledgeBase.json.backup');
      
      if (!fs.existsSync(kbPath)) {
        throw new functions.https.HttpsError('not-found', `KB file not found at ${kbPath}`);
      }
      
      // Read the file
      const rawData = fs.readFileSync(kbPath, 'utf-8');
      const kbData = JSON.parse(rawData);
      
      if (!kbData.entities || !Array.isArray(kbData.entities)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid KB structure');
      }
      
      // Calculate stats
      const stats = {
        total: kbData.entities.length,
        complete: 0,
        partial: 0,
        minimal: 0,
        withTaxonomy: 0,
        categories: new Set<string>()
      };
      
      kbData.entities.forEach((entity: any) => {
        const score = entity.completeness_score || 0;
        if (score >= 80) stats.complete++;
        else if (score >= 50) stats.partial++;
        else stats.minimal++;
        
        if (entity.taxonomy?.category) {
          stats.withTaxonomy++;
          stats.categories.add(entity.taxonomy.category);
        }
      });
      
      // Prepare document
      const kbDocument = {
        entities: kbData.entities,
        metadata: {
          version: kbData.metadata?.version || '1.0.0',
          lastUpdated: new Date().toISOString(),
          uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
          entityCount: stats.total,
          source: 'manual_upload',
          stats: {
            complete: stats.complete,
            partial: stats.partial,
            minimal: stats.minimal,
            withTaxonomy: stats.withTaxonomy,
            categoryCount: stats.categories.size
          },
          notes: 'Knowledge base in development - work in progress'
        }
      };
      
      // Upload to Firestore
      await db.collection('system').doc('knowledgeBase').set(kbDocument);
      
      // Verify upload
      const verification = await db.collection('system').doc('knowledgeBase').get();
      
      return {
        success: true,
        message: 'Knowledge base uploaded successfully',
        stats: {
          uploaded: stats.total,
          verified: verification.exists,
          completeness: {
            complete: `${stats.complete} (${(stats.complete/stats.total*100).toFixed(1)}%)`,
            partial: `${stats.partial} (${(stats.partial/stats.total*100).toFixed(1)}%)`,
            minimal: `${stats.minimal} (${(stats.minimal/stats.total*100).toFixed(1)}%)`
          },
          taxonomy: {
            withTaxonomy: stats.withTaxonomy,
            categories: stats.categories.size
          }
        }
      };
      
    } catch (error) {
      console.error('Upload failed:', error);
      throw new functions.https.HttpsError(
        'internal',
        `Upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

/**
 * Alternative: Direct function to run locally
 */
export async function uploadKBDirect(): Promise<void> {
  try {
    console.log('Direct KB upload starting...');
    
    const kbPath = path.join(__dirname, '../../../knowledgeBase.json.backup');
    
    if (!fs.existsSync(kbPath)) {
      // Try alternative path
      const altPath = '/Users/ramiefathy/Desktop/WebApps/apps/PrecisionLearnDerm/functions/knowledgeBase.json.backup';
      if (fs.existsSync(altPath)) {
        console.log('Using alternative path:', altPath);
        const rawData = fs.readFileSync(altPath, 'utf-8');
        await uploadToDB(JSON.parse(rawData));
      } else {
        throw new Error('KB file not found');
      }
    } else {
      const rawData = fs.readFileSync(kbPath, 'utf-8');
      await uploadToDB(JSON.parse(rawData));
    }
    
  } catch (error) {
    console.error('Direct upload failed:', error);
    throw error;
  }
}

async function uploadToDB(kbData: any): Promise<void> {
  const kbDocument = {
    entities: kbData.entities,
    metadata: {
      version: kbData.metadata?.version || '1.0.0',
      lastUpdated: new Date().toISOString(),
      entityCount: kbData.entities?.length || 0,
      source: 'direct_upload',
      notes: 'Knowledge base in development'
    }
  };
  
  await db.collection('system').doc('knowledgeBase').set(kbDocument);
  console.log(`✅ Uploaded ${kbDocument.entities.length} entities to Firestore`);
}