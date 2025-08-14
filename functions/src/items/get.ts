import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';

export const itemsGet = functions.https.onCall(async (data: any, context) => {
  try {
    const { itemId } = data || {};
    
    if (!itemId) {
      throw new Error('Missing required parameter: itemId');
    }
    
    const db = admin.firestore();
    const itemRef = db.collection('items').doc(itemId);
    const itemDoc = await itemRef.get();
    
    if (!itemDoc.exists) {
      throw new Error('Item not found');
    }
    
    return {
      success: true,
      item: {
        id: itemDoc.id,
        ...itemDoc.data()
      }
    };
    
  } catch (error: any) {
    console.error('Error getting item:', error);
    return {
      success: false,
      error: error.message
    };
  }
}); 