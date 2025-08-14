import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

export const srsUpdate = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { cardId, grade } = data || {};
    
    if (!cardId || !grade) {
      throw new Error('Missing required parameters: cardId and grade');
    }
    
    const db = admin.firestore();
    const cardRef = db.collection('flashcards').doc(cardId);
    
    const cardDoc = await cardRef.get();
    if (!cardDoc.exists) {
      throw new Error('Flashcard not found');
    }
    
    // Update SRS data
    await cardRef.update({
      lastReviewed: admin.firestore.FieldValue.serverTimestamp(),
      reviewCount: admin.firestore.FieldValue.increment(1),
      grade: grade
    });
    
    return {
      success: true,
      message: 'SRS data updated successfully',
      cardId
    };
    
  } catch (error: any) {
    console.error('Error updating SRS data:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

export const srsDue = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { topicIds } = data || {};
    
    const db = admin.firestore();
    const userId = context?.auth?.uid;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    // Get due cards for the user
    const cardsRef = db.collection('flashcards');
    let query = cardsRef.where('userId', '==', userId);
    
    if (topicIds && Array.isArray(topicIds) && topicIds.length > 0) {
      query = query.where('topicIds', 'array-contains-any', topicIds);
    }
    
    const snapshot = await query.limit(50).get();
    const dueCards = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      success: true,
      dueCards,
      count: dueCards.length
    };
    
  } catch (error: any) {
    console.error('Error getting due cards:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
