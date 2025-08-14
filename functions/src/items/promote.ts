import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const itemsPromote = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { draftId } = data || {};
    
    if (!draftId) {
      throw new Error('Missing required parameter: draftId');
    }
    
    const db = admin.firestore();
    const draftRef = db.collection('drafts').doc(draftId);
    const itemRef = db.collection('items');
    
    const draftDoc = await draftRef.get();
    if (!draftDoc.exists) {
      throw new Error('Draft not found');
    }
    
    const draftData = draftDoc.data();
    
    // Create new item from draft
    const newItemRef = await itemRef.add({
      ...draftData,
      status: 'active',
      promotedAt: admin.firestore.FieldValue.serverTimestamp(),
      promotedBy: context?.auth?.uid || 'admin'
    });
    
    // Delete the draft
    await draftRef.delete();
    
    return {
      success: true,
      message: 'Draft promoted to item successfully',
      itemId: newItemRef.id
    };
    
  } catch (error: any) {
    console.error('Error promoting draft:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
