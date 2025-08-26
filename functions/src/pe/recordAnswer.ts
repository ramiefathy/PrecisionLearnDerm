/**
 * Records user answers and logs activities
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { CallableContext } from 'firebase-functions/lib/common/providers/https';
import { requireAuth } from '../util/auth';
import { logQuizCompletion, logFlashcardSession, logMockExamAttempt } from '../activities/endpoints';

const db = admin.firestore();

/**
 * Records a user's answer to a question and updates their ability
 */
export const recordAnswer = functions.https.onCall(async (data: {
  itemId: string;
  chosenIndex: number;
  correct: boolean;
  timeToAnswer: number;
  confidence?: string;
  sessionType?: 'quiz' | 'flashcard' | 'mock_exam';
  sessionData?: {
    totalQuestions?: number;
    currentQuestionIndex?: number;
    topicIds?: string[];
    sessionId?: string;
    sessionTitle?: string;
  };
}, context: CallableContext) => {
  try {
    const userId = requireAuth(context);
    
    const {
      itemId,
      chosenIndex,
      correct,
      timeToAnswer,
      confidence,
      sessionType = 'quiz',
      sessionData
    } = data;

    if (!itemId || chosenIndex === undefined || correct === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // Record the answer
    const answerRecord = {
      userId,
      itemId,
      chosenIndex,
      correct,
      timeToAnswer,
      confidence,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      sessionType,
      sessionId: sessionData?.sessionId
    };

    await db.collection('userAnswers').add(answerRecord);

    // Update user ability (simplified IRT update)
    await updateUserAbility(userId, itemId, correct);

    // Check if this completes a session and log activity
    if (sessionData && shouldLogSessionActivity(sessionData)) {
      await logSessionActivity(userId, sessionType, sessionData, correct);
    }

    return {
      success: true,
      message: 'Answer recorded successfully'
    };

  } catch (error) {
    console.error('Error recording answer:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to record answer');
  }
});

/**
 * Records completion of a quiz session
 */
export const recordQuizSession = functions.https.onCall(async (data: {
  sessionId: string;
  topicIds: string[];
  answers: Array<{
    itemId: string;
    chosenIndex: number;
    correct: boolean;
    timeToAnswer: number;
    confidence?: string;
  }>;
  totalTimeSpent: number;
  sessionTitle: string;
  difficulty?: string;
}, context: CallableContext) => {
  try {
    const userId = requireAuth(context);
    
    const {
      sessionId,
      topicIds,
      answers,
      totalTimeSpent,
      sessionTitle,
      difficulty
    } = data;

    // Calculate session statistics
    const totalQuestions = answers.length;
    const correctAnswers = answers.filter(a => a.correct).length;
    const score = totalQuestions > 0 ? correctAnswers / totalQuestions : 0;

    // Record all answers
    const batch = db.batch();
    const answerRecords = answers.map(answer => ({
      userId,
      ...answer,
      sessionId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      sessionType: 'quiz'
    }));

    answerRecords.forEach(record => {
      const docRef = db.collection('userAnswers').doc();
      batch.set(docRef, record);
    });

    await batch.commit();

    // Update abilities for all answered questions
    for (const answer of answers) {
      await updateUserAbility(userId, answer.itemId, answer.correct);
    }

    // Log the activity
    await logQuizCompletion(
      userId,
      {
        title: sessionTitle,
        score,
        totalQuestions,
        correctAnswers,
        timeSpent: totalTimeSpent,
        difficulty,
        topicIds
      },
      sessionId
    );

    return {
      success: true,
      sessionStats: {
        totalQuestions,
        correctAnswers,
        score,
        timeSpent: totalTimeSpent
      }
    };

  } catch (error) {
    console.error('Error recording quiz session:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to record quiz session');
  }
});

/**
 * Updates user's ability using simplified IRT
 */
async function updateUserAbility(userId: string, itemId: string, correct: boolean): Promise<void> {
  try {
    // Get item difficulty
    const itemDoc = await db.collection('items').doc(itemId).get();
    const itemData = itemDoc.data();
    const difficulty = itemData?.difficulty || 0.5;
    
    // Get user's current ability
    const abilityRef = db.collection('userAbilities').doc(userId);
    const abilityDoc = await abilityRef.get();
    
    let currentTheta = 0.0; // Default ability
    if (abilityDoc.exists) {
      const abilityData = abilityDoc.data();
      currentTheta = abilityData?.theta || 0.0;
    }
    
    // Simple ability update (in real IRT this would be more sophisticated)
    const learningRate = 0.1;
    const expected = 1 / (1 + Math.exp(-(currentTheta - difficulty)));
    const actual = correct ? 1 : 0;
    const error = actual - expected;
    const newTheta = currentTheta + learningRate * error;
    
    // Update ability
    await abilityRef.set({
      theta: newTheta,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      responseCount: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    
  } catch (error) {
    console.error('Error updating user ability:', error);
    // Don't throw here as this is secondary to recording the answer
  }
}

/**
 * Determines if session activity should be logged
 */
function shouldLogSessionActivity(sessionData: any): boolean {
  // Log if this is the last question in a session
  return sessionData.currentQuestionIndex === sessionData.totalQuestions - 1;
}

/**
 * Logs session activity based on type
 */
async function logSessionActivity(
  userId: string,
  sessionType: string,
  sessionData: any,
  lastAnswerCorrect: boolean
): Promise<void> {
  try {
    // This is a placeholder - in a real implementation,
    // you'd gather session statistics from all answers
    const mockSessionStats = {
      score: 0.8, // This should be calculated from actual session data
      totalQuestions: sessionData.totalQuestions || 1,
      correctAnswers: Math.round((sessionData.totalQuestions || 1) * 0.8),
      timeSpent: 300, // This should be tracked throughout the session
      title: sessionData.sessionTitle || `${sessionType} Session`
    };

    switch (sessionType) {
      case 'quiz':
        await logQuizCompletion(userId, {
          ...mockSessionStats,
          topicIds: sessionData.topicIds,
          difficulty: 'medium'
        }, sessionData.sessionId);
        break;
      
      case 'flashcard':
        await logFlashcardSession(userId, {
          cardsReviewed: mockSessionStats.totalQuestions,
          timeSpent: mockSessionStats.timeSpent,
          topicIds: sessionData.topicIds
        }, sessionData.sessionId);
        break;
      
      case 'mock_exam':
        await logMockExamAttempt(userId, {
          ...mockSessionStats,
          examType: sessionData.examType || 'Practice Exam'
        }, sessionData.sessionId);
        break;
    }
  } catch (error) {
    console.error('Error logging session activity:', error);
    // Don't throw here as this is secondary functionality
  }
}