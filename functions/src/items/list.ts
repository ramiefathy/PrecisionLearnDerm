import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { CallableContext, QuestionItem } from '../types';

interface ListItemsRequest {
  limit?: number;
  offset?: number;
  status?: string;
  topicFilter?: string;
}

interface ListItemsResponse {
  success: boolean;
  items?: (QuestionItem & { id: string })[];
  total?: number;
  hasMore?: boolean;
  error?: string;
}

export const itemsList = functions.https.onCall(async (data: ListItemsRequest, context: CallableContext): Promise<ListItemsResponse> => {
  try {
    requireAuth(context);
    const { limit = 50, offset = 0, status, topicFilter } = data || {};
    
    const db = admin.firestore();
    let query = db.collection('items').orderBy('createdAt', 'desc');
    
    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }
    
    if (topicFilter) {
      query = query.where('topicIds', 'array-contains', topicFilter);
    }
    
    // Apply pagination
    query = query.offset(offset).limit(limit + 1); // Get one extra to check if there are more
    
    const snapshot = await query.get();
    const items = snapshot.docs.slice(0, limit).map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as (QuestionItem & { id: string })[];
    
    const hasMore = snapshot.docs.length > limit;
    
    // Get total count (note: this is expensive for large collections)
    const countSnapshot = await db.collection('items').count().get();
    const total = countSnapshot.data().count;
    
    return {
      success: true,
      items,
      total,
      hasMore
    };
    
  } catch (error) {
    console.error('Error listing items:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});