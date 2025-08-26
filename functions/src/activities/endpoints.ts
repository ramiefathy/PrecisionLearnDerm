/**
 * Cloud Functions endpoints for user activity tracking
 */

import { https } from 'firebase-functions/v1';
import { UserActivity } from '../types/shared';
import { CallableContext } from '../types';
import { requireAuth } from '../util/auth';
import { logActivity, getUserActivities, getActivitySummary } from './tracking';

/**
 * Logs a user activity
 * POST /activities_log
 */
export const activities_log = https.onCall(async (data: {
  type: UserActivity['type'];
  data: UserActivity['data'];
  metadata?: UserActivity['metadata'];
}, context: CallableContext) => {
  try {
    const userId = requireAuth(context);

    const { type, data: activityData, metadata } = data;

    if (!type || !activityData) {
      throw new https.HttpsError('invalid-argument', 'Activity type and data are required');
    }

    const activityId = await logActivity(userId, type, activityData, metadata);

    return {
      success: true,
      activityId,
      message: 'Activity logged successfully'
    };
  } catch (error) {
    console.error('Error in activities_log:', error);
    
    if (error instanceof https.HttpsError) {
      throw error;
    }
    
    throw new https.HttpsError('internal', 'Failed to log activity');
  }
});

/**
 * Gets user's recent activities
 * GET /activities_get
 */
export const activities_get = https.onCall(async (data: {
  limit?: number;
}, context: CallableContext) => {
  try {
    const userId = requireAuth(context);
    
    const limit = Math.min(data.limit || 20, 100); // Cap at 100
    
    const activities = await getUserActivities(userId, limit);

    return {
      success: true,
      activities
    };
  } catch (error) {
    console.error('Error in activities_get:', error);
    
    if (error instanceof https.HttpsError) {
      throw error;
    }
    
    throw new https.HttpsError('internal', 'Failed to get activities');
  }
});

/**
 * Gets user's activity summary
 * GET /activities_summary
 */
export const activities_summary = https.onCall(async (data: {}, context: CallableContext) => {
  try {
    const userId = requireAuth(context);
    
    const summary = await getActivitySummary(userId);

    return {
      success: true,
      summary
    };
  } catch (error) {
    console.error('Error in activities_summary:', error);
    
    if (error instanceof https.HttpsError) {
      throw error;
    }
    
    throw new https.HttpsError('internal', 'Failed to get activity summary');
  }
});

/**
 * Utility function to log quiz completion activity
 */
export async function logQuizCompletion(
  userId: string,
  quizData: {
    topicIds?: string[];
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    timeSpent: number;
    difficulty?: string;
    title: string;
  },
  sessionId?: string
): Promise<string> {
  return await logActivity(
    userId,
    'quiz_completion',
    {
      title: quizData.title,
      score: quizData.score,
      totalQuestions: quizData.totalQuestions,
      correctAnswers: quizData.correctAnswers,
      timeSpent: quizData.timeSpent,
      difficulty: quizData.difficulty,
      topicIds: quizData.topicIds
    },
    {
      sessionId,
      platform: 'web'
    }
  );
}

/**
 * Utility function to log flashcard session activity
 */
export async function logFlashcardSession(
  userId: string,
  sessionData: {
    cardsReviewed: number;
    timeSpent: number;
    topicIds?: string[];
    difficulty?: string;
  },
  sessionId?: string
): Promise<string> {
  return await logActivity(
    userId,
    'flashcard_session',
    {
      title: `Reviewed ${sessionData.cardsReviewed} flashcards`,
      totalQuestions: sessionData.cardsReviewed,
      timeSpent: sessionData.timeSpent,
      difficulty: sessionData.difficulty,
      topicIds: sessionData.topicIds
    },
    {
      sessionId,
      platform: 'web'
    }
  );
}

/**
 * Utility function to log mock exam attempt activity
 */
export async function logMockExamAttempt(
  userId: string,
  examData: {
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    timeSpent: number;
    examType: string;
  },
  sessionId?: string
): Promise<string> {
  return await logActivity(
    userId,
    'mock_exam_attempt',
    {
      title: `${examData.examType} Mock Exam`,
      score: examData.score,
      totalQuestions: examData.totalQuestions,
      correctAnswers: examData.correctAnswers,
      timeSpent: examData.timeSpent
    },
    {
      sessionId,
      platform: 'web'
    }
  );
}