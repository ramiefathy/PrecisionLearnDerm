import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';

export const itemsPropose = functions.https.onCall(async (data: any, context) => {
  try {
    const { topicIds = [], constraints = [] } = data || {};
    
    if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
      throw new Error('topicIds array is required');
    }
    
    const db = admin.firestore();
    const itemsRef = db.collection('items');
    
    // Build query based on topic IDs
    let query = itemsRef.where('topicIds', 'array-contains-any', topicIds);
    
    // Apply constraints if specified
    if (constraints && constraints.length > 0) {
      constraints.forEach((constraint: any) => {
        if (constraint.type === 'difficulty_range') {
          query = query.where('difficulty', '>=', constraint.min).where('difficulty', '<=', constraint.max);
        }
        if (constraint.type === 'status') {
          query = query.where('status', '==', constraint.value);
        }
      });
    }
    
    const snapshot = await query.limit(10).get();
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      success: true,
      items,
      count: items.length,
      topicIds,
      constraints
    };
    
  } catch (error: any) {
    console.error('Error proposing items:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
