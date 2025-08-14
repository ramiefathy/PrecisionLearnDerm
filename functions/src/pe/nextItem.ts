import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const getNextItem = functions.https.onCall(async (data: any, context: any) => {
  try {
    const topicIds: string[] | undefined = data?.topicIds;
    
    if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
      throw new Error('topicIds array is required');
    }
    
    const db = admin.firestore();
    const userId = context?.auth?.uid;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    // Get user's ability ratings for the topics
    const abilityRef = db.collection('userAbilities').doc(userId);
    const abilityDoc = await abilityRef.get();
    
    let userAbilities: any = {};
    if (abilityDoc.exists) {
      const abilityData = abilityDoc.data();
      userAbilities = abilityData?.topicAbilities || {};
    }
    
    // Find items matching the topic IDs
    const itemsRef = db.collection('items');
    let query = itemsRef.where('topicIds', 'array-contains-any', topicIds);
    
    // Filter by status
    query = query.where('status', '==', 'active');
    
    const snapshot = await query.limit(50).get();
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    if (items.length === 0) {
      return {
        success: false,
        error: 'No items found for the specified topics'
      };
    }
    
    // Score items based on user ability and item difficulty
    const scoredItems = items.map(item => {
      const topicAbility = userAbilities[item.topicIds?.[0]] || 1500;
      const difficulty = item.difficulty || 0.5;
      
      // Calculate score (higher is better)
      const score = topicAbility - (difficulty * 1000);
      
      return {
        ...item,
        score
      };
    });
    
    // Sort by score and return the best match
    scoredItems.sort((a, b) => b.score - a.score);
    
    return {
      success: true,
      item: scoredItems[0],
      alternatives: scoredItems.slice(1, 4),
      totalAvailable: scoredItems.length
    };
    
  } catch (error: any) {
    console.error('Error getting next item:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
