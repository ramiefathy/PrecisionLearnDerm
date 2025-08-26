/**
 * Seed function to create test activity data for development/testing
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { CallableContext } from '../types';
import { requireAuth } from '../util/auth';
import { logActivity } from './tracking';

const db = admin.firestore();

/**
 * Seeds test activity data for the current user
 */
export const seedUserActivities = functions.https.onCall(async (data: {
  count?: number;
}, context: CallableContext) => {
  try {
    const userId = requireAuth(context);
    const count = Math.min(data.count || 5, 20); // Cap at 20

    const sampleActivities = [
      {
        type: 'quiz_completion' as const,
        data: {
          title: 'Dermatitis Quiz',
          score: 0.85,
          totalQuestions: 10,
          correctAnswers: 8,
          timeSpent: 420, // 7 minutes
          difficulty: 'medium',
          topicIds: ['dermatitis', 'inflammatory-conditions']
        }
      },
      {
        type: 'flashcard_session' as const,
        data: {
          title: 'Reviewed Psoriasis Flashcards',
          totalQuestions: 15,
          timeSpent: 180, // 3 minutes
          difficulty: 'medium',
          topicIds: ['psoriasis', 'inflammatory-conditions']
        }
      },
      {
        type: 'mock_exam_attempt' as const,
        data: {
          title: 'USMLE Step 1 Practice Test',
          score: 0.78,
          totalQuestions: 40,
          correctAnswers: 31,
          timeSpent: 2400, // 40 minutes
          difficulty: 'hard'
        }
      },
      {
        type: 'quiz_completion' as const,
        data: {
          title: 'Acne and Rosacea Quiz',
          score: 0.92,
          totalQuestions: 8,
          correctAnswers: 7,
          timeSpent: 360, // 6 minutes
          difficulty: 'easy',
          topicIds: ['acne', 'rosacea']
        }
      },
      {
        type: 'study_session' as const,
        data: {
          title: 'Melanoma Study Session',
          timeSpent: 900, // 15 minutes
          difficulty: 'hard',
          topicIds: ['melanoma', 'skin-cancer']
        }
      },
      {
        type: 'flashcard_session' as const,
        data: {
          title: 'Reviewed Eczema Flashcards',
          totalQuestions: 20,
          timeSpent: 240, // 4 minutes
          difficulty: 'easy',
          topicIds: ['eczema', 'atopic-dermatitis']
        }
      },
      {
        type: 'quiz_completion' as const,
        data: {
          title: 'Skin Cancer Identification Quiz',
          score: 0.73,
          totalQuestions: 12,
          correctAnswers: 9,
          timeSpent: 480, // 8 minutes
          difficulty: 'hard',
          topicIds: ['skin-cancer', 'diagnosis']
        }
      },
      {
        type: 'mock_exam_attempt' as const,
        data: {
          title: 'Dermatology Board Review',
          score: 0.88,
          totalQuestions: 25,
          correctAnswers: 22,
          timeSpent: 1800, // 30 minutes
          difficulty: 'medium'
        }
      }
    ];

    const activitiesToCreate = sampleActivities.slice(0, count);
    const activityIds: string[] = [];

    // Create activities with timestamps spread over the last week
    for (let i = 0; i < activitiesToCreate.length; i++) {
      const activity = activitiesToCreate[i];
      
      // Create timestamps going backwards from now
      const hoursAgo = Math.floor(Math.random() * 168); // Random time in last week (168 hours)
      const timestamp = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000));
      
      // Add some session metadata
      const metadata = {
        sessionId: `test-session-${Date.now()}-${i}`,
        platform: 'web',
        deviceType: 'desktop'
      };

      const activityId = await logActivity(userId, activity.type, activity.data, metadata);
      activityIds.push(activityId);
    }

    return {
      success: true,
      message: `Created ${activitiesToCreate.length} test activities`,
      activityIds
    };

  } catch (error) {
    console.error('Error seeding activities:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to seed activities');
  }
});

/**
 * Clears all activities for the current user (for testing)
 */
export const clearUserActivities = functions.https.onCall(async (data: {}, context: CallableContext) => {
  try {
    const userId = requireAuth(context);

    // Get all user activities
    const activitiesRef = db.collection('users').doc(userId).collection('activities');
    const snapshot = await activitiesRef.get();

    // Delete in batches
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return {
      success: true,
      message: `Cleared ${snapshot.docs.length} activities`,
      deletedCount: snapshot.docs.length
    };

  } catch (error) {
    console.error('Error clearing activities:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to clear activities');
  }
});