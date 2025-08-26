import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { CallableContext, SRSItem } from '../types';

const db = admin.firestore();

interface SRSUpdateRequest {
  cardId: string;
  grade: number; // 0-5 scale for SRS
  responseTime?: number;
}

interface SRSUpdateResponse {
  success: boolean;
  message?: string;
  cardId?: string;
  error?: string;
}

interface SRSDueRequest {
  topicIds?: string[];
  limit?: number;
}

interface SRSDueResponse {
  success: boolean;
  dueCards?: (SRSItem & { id: string })[];
  count?: number;
  error?: string;
}

export const srsUpdate = functions.https.onCall(async (data: SRSUpdateRequest, context: CallableContext): Promise<SRSUpdateResponse> => {
  try {
    const userId = requireAuth(context);
    const { cardId, grade, responseTime } = data || {};
    
    if (!cardId || grade === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters: cardId and grade');
    }
    
    if (grade < 0 || grade > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'Grade must be between 0 and 5');
    }
    
    const cardRef = db.collection('flashcards').doc(cardId);
    
    const cardDoc = await cardRef.get();
    if (!cardDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Flashcard not found');
    }
    
    const cardData = cardDoc.data() as SRSItem;
    
    // Verify ownership
    if (cardData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }
    
    // Calculate new SRS values
    const now = admin.firestore.Timestamp.now();
    let newInterval = cardData.interval || 1;
    let newRepetitions = cardData.repetitions || 0;
    let newEaseFactor = cardData.easeFactor || 2.5;
    
    if (grade >= 3) {
      // Correct response
      if (newRepetitions === 0) {
        newInterval = 1;
      } else if (newRepetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(newInterval * newEaseFactor);
      }
      newRepetitions += 1;
      newEaseFactor = Math.max(1.3, newEaseFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    } else {
      // Incorrect response
      newRepetitions = 0;
      newInterval = 1;
    }
    
    // Calculate next due date
    const dueDate = new admin.firestore.Timestamp(
      now.seconds + (newInterval * 24 * 60 * 60), 
      now.nanoseconds
    );
    
    // Update SRS data
    await cardRef.update({
      lastReviewed: now,
      dueDate: dueDate,
      interval: newInterval,
      repetitions: newRepetitions,
      easeFactor: newEaseFactor,
      quality: grade,
      ...(responseTime && { lastResponseTime: responseTime })
    });
    
    return {
      success: true,
      message: 'SRS data updated successfully',
      cardId
    };
    
  } catch (error) {
    console.error('Error updating SRS data:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

export const srsDue = functions.https.onCall(async (data: SRSDueRequest, context: CallableContext): Promise<SRSDueResponse> => {
  try {
    const userId = requireAuth(context);
    const { topicIds, limit = 50 } = data || {};
    
    // Get due cards for the user
    const cardsRef = db.collection('flashcards');
    let query = cardsRef
      .where('userId', '==', userId)
      .where('dueDate', '<=', admin.firestore.Timestamp.now());
    
    if (topicIds && Array.isArray(topicIds) && topicIds.length > 0) {
      query = query.where('topicIds', 'array-contains-any', topicIds);
    }
    
    const snapshot = await query.limit(Math.min(limit, 100)).get();
    const dueCards = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as (SRSItem & { id: string })[];
    
    return {
      success: true,
      dueCards,
      count: dueCards.length
    };
    
  } catch (error) {
    console.error('Error getting due cards:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
