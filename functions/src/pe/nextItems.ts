import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const getNextItems = functions.https.onCall(async (data: any, context: any) => {
  try {
    const topicIds: string[] | undefined = data?.topicIds;
    const count: number = Math.min(Math.max(Number(data?.count ?? 10), 1), 25);
    
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
    
    const snapshot = await query.limit(count * 2).get(); // Get more items for better selection
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
    
    // Sort by score and return the requested number
    scoredItems.sort((a, b) => b.score - a.score);
    
    return {
      success: true,
      items: scoredItems.slice(0, count),
      totalAvailable: scoredItems.length,
      requestedCount: count
    };
    
  } catch (error: any) {
    console.error('Error getting next items:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
