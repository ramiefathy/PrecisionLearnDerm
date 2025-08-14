import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Elo rating calculation function
function calculateNewAbility(currentAbility: number, correct: boolean, itemDifficulty: number, confidence: number): number {
  const K = 32; // K-factor for rating changes
  const expectedScore = 1 / (1 + Math.pow(10, (itemDifficulty - currentAbility) / 400));
  const actualScore = correct ? 1 : 0;
  
  // Adjust K-factor based on confidence
  const adjustedK = K * (1 + confidence * 0.5);
  
  return Math.round(currentAbility + adjustedK * (actualScore - expectedScore));
}

export const updateAbility = functions.https.onCall(async (data: any, context: any) => {
  try {
    const {
      itemId,
      correct,
      chosenIndex,
      correctIndex,
      topicIds,
      confidence,
      timeToAnswerSec
    } = data || {};
    
    if (!itemId || typeof correct !== 'boolean') {
      throw new Error('Missing required parameters: itemId and correct');
    }
    
    const db = admin.firestore();
    const userId = context?.auth?.uid;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    // Get or create user ability record
    const abilityRef = db.collection('userAbilities').doc(userId);
    const abilityDoc = await abilityRef.get();
    
    let abilityData: any = abilityDoc.exists ? abilityDoc.data() : {
      userId,
      overallAbility: 1500, // Default Elo rating
      topicAbilities: {},
      itemHistory: [],
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (!abilityData) {
      abilityData = {
        userId,
        overallAbility: 1500,
        topicAbilities: {},
        itemHistory: [],
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
    }
    
    // Calculate new ability rating
    const itemDifficulty = 0.5; // This should come from the item data
    const newAbility = calculateNewAbility(
      abilityData.overallAbility,
      correct,
      itemDifficulty,
      confidence || 0.5
    );
    
    // Update topic-specific abilities
    const topicAbilities = { ...abilityData.topicAbilities };
    if (topicIds && Array.isArray(topicIds)) {
      topicIds.forEach(topicId => {
        const currentTopicAbility = topicAbilities[topicId] || 1500;
        topicAbilities[topicId] = calculateNewAbility(
          currentTopicAbility,
          correct,
          itemDifficulty,
          confidence || 0.5
        );
      });
    }
    
    // Add to item history
    const itemHistory = [
      ...(abilityData.itemHistory || []),
      {
        itemId,
        correct,
        chosenIndex,
        correctIndex,
        topicIds,
        confidence,
        timeToAnswerSec,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }
    ];
    
    // Update ability record
    await abilityRef.set({
      ...abilityData,
      overallAbility: newAbility,
      topicAbilities,
      itemHistory,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      newAbility,
      topicAbilities,
      message: 'Ability rating updated successfully'
    };
    
  } catch (error: any) {
    console.error('Error updating ability:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
