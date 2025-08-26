import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { CallableContext, QuestionItem } from '../types';

interface PromoteItemRequest {
  draftId: string;
}

interface PromoteItemResponse {
  success: boolean;
  message?: string;
  itemId?: string;
  error?: string;
}

export const itemsPromote = functions.https.onCall(async (data: PromoteItemRequest, context: CallableContext): Promise<PromoteItemResponse> => {
  try {
    requireAdmin(context);
    const { draftId } = data || {};
    
    if (!draftId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameter: draftId');
    }
    
    const db = admin.firestore();
    const draftRef = db.collection('drafts').doc(draftId);
    const itemRef = db.collection('items');
    
    const draftDoc = await draftRef.get();
    if (!draftDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Draft not found');
    }
    
    const draftData = draftDoc.data() as QuestionItem;
    
    // Create new item from draft
    const newItemRef = await itemRef.add({
      ...draftData,
      status: 'approved',
      metadata: {
        ...draftData.metadata,
        promotedAt: admin.firestore.FieldValue.serverTimestamp(),
        promotedBy: context?.auth?.uid || 'admin'
      }
    });
    
    // Delete the draft
    await draftRef.delete();
    
    return {
      success: true,
      message: 'Draft promoted to item successfully',
      itemId: newItemRef.id
    };
    
  } catch (error) {
    console.error('Error promoting draft:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
