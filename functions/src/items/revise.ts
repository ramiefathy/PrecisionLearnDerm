import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const itemsRevise = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { itemId, instructions } = data || {};
    
    if (!itemId || !instructions) {
      throw new Error('Missing required parameters: itemId and instructions');
    }
    
    const db = admin.firestore();
    const itemRef = db.collection('items').doc(itemId);
    
    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) {
      throw new Error('Item not found');
    }
    
    // Create revision record
    const revisionRef = db.collection('itemRevisions');
    await revisionRef.add({
      itemId,
      originalData: itemDoc.data(),
      revisionInstructions: instructions,
      revisedBy: context?.auth?.uid || 'admin',
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
    return {
      success: false,
      error: error.message
    };
  }
});
