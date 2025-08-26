import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { CallableContext, QuestionItem } from '../types';

interface GetItemRequest {
  itemId: string;
}

interface GetItemResponse {
  success: boolean;
  item?: QuestionItem & { id: string };
  error?: string;
}

export const itemsGet = functions.https.onCall(async (data: GetItemRequest, context: CallableContext): Promise<GetItemResponse> => {
  try {
    requireAuth(context);
    const { itemId } = data || {};
    
    if (!itemId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameter: itemId');
    }
    
    const db = admin.firestore();
    const itemRef = db.collection('items').doc(itemId);
    const itemDoc = await itemRef.get();
    
    if (!itemDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Item not found');
    }
    
    return {
      success: true,
      item: {
        id: itemDoc.id,
        ...itemDoc.data()
      } as QuestionItem & { id: string }
    };
    
  } catch (error) {
    console.error('Error getting item:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}); 