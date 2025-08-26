import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { CallableContext } from '../types';

interface ReviseItemData {
  itemId: string;
  instructions: string;
}

export const itemsRevise = functions.https.onCall(async (data: ReviseItemData, context: CallableContext) => {
  try {
    requireAdmin(context);
    
    if (!data?.itemId || !data?.instructions) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters: itemId and instructions');
    }
    
    const { itemId, instructions } = data;
    
    const db = admin.firestore();
    const itemRef = db.collection('items').doc(itemId);
    
    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Item not found');
    }
    
    // Create revision record
    const revisionRef = db.collection('itemRevisions');
    await revisionRef.add({
      itemId,
      originalData: itemDoc.data(),
      revisionInstructions: instructions,
      revisedBy: context.auth?.uid || 'unknown',
      revisedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending_review'
    });
    
    return {
      success: true,
      message: 'Item revision request created successfully',
      itemId,
      revisionStatus: 'pending_review'
    };
    
  } catch (error: any) {
    console.error('Error revising item:', error);
    
    // Re-throw HttpsError for proper client handling
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 
      error instanceof Error ? error.message : 'An unexpected error occurred');
  }
});
