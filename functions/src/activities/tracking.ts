/**
 * User Activity Tracking System
 * Provides real-time user activity logging and retrieval
 */

import * as admin from 'firebase-admin';

const db = admin.firestore();
import { UserActivity, ActivitySummary } from '../types/shared';

/**
 * Logs a user activity to Firestore
 */
export async function logActivity(
  userId: string,
  activityType: UserActivity['type'],
  activityData: UserActivity['data'],
  metadata?: UserActivity['metadata']
): Promise<string> {
  try {
    const activity: Omit<UserActivity, 'id'> = {
      userId,
      type: activityType,
      timestamp: new Date(),
      data: activityData,
      metadata
    };

    // Add to user's activities subcollection
    const activityRef = await db
      .collection('users')
      .doc(userId)
      .collection('activities')
      .add(activity);

    // Update user stats
    await updateUserActivityStats(userId, activityType, activityData);

    return activityRef.id;
  } catch (error) {
    console.error('Error logging activity:', error);
    throw new Error('Failed to log user activity');
  }
}

/**
 * Retrieves recent user activities
 */
export async function getUserActivities(
  userId: string,
  limit: number = 20
): Promise<UserActivity[]> {
  try {
    const snapshot = await db
      .collection('users')
      .doc(userId)
      .collection('activities')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as UserActivity));
  } catch (error) {
    console.error('Error fetching user activities:', error);
    throw new Error('Failed to fetch user activities');
  }
}

/**
 * Gets activity summary for a user
 */
export async function getActivitySummary(userId: string): Promise<ActivitySummary> {
  try {
    const activities = await getUserActivities(userId, 50);
    
    // Calculate streak
    const streakDays = calculateStreakDays(activities);
    
    // Group by type
    const activityByType = activities.reduce((acc, activity) => {
      acc[activity.type] = (acc[activity.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalActivities: activities.length,
      recentActivities: activities.slice(0, 10), // Last 10 activities
      streakDays,
      lastActivity: activities.length > 0 ? activities[0].timestamp : undefined,
      activityByType
    };
  } catch (error) {
    console.error('Error getting activity summary:', error);
    throw new Error('Failed to get activity summary');
  }
}

/**
 * Updates user activity statistics in their profile
 */
async function updateUserActivityStats(
  userId: string, 
  activityType: UserActivity['type'], 
  activityData: UserActivity['data']
): Promise<void> {
  try {
    const userRef = db.collection('users').doc(userId);
    
    // Get current stats
    const userDoc = await userRef.get();
    const currentStats = userDoc.data()?.stats || {};
    
    const updates: any = {
      'stats.lastStudiedAt': new Date()
    };

    // Update specific stats based on activity type
    if (activityType === 'quiz_completion' && activityData.score !== undefined) {
      const currentQuizzes = currentStats.quizzesTaken || 0;
      const currentAverage = currentStats.averageScore || 0;
      const newAverage = (currentAverage * currentQuizzes + activityData.score) / (currentQuizzes + 1);
      
      updates['stats.quizzesTaken'] = currentQuizzes + 1;
      updates['stats.averageScore'] = newAverage;
    }

    // Update streak (this is simplified - could be more sophisticated)
    const lastActivity = currentStats.lastStudiedAt?.toDate();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (!lastActivity || lastActivity < yesterday) {
      // Reset streak or start new one
      updates['stats.streak'] = 1;
    } else if (lastActivity.toDateString() === yesterday.toDateString()) {
      // Continue streak
      updates['stats.streak'] = (currentStats.streak || 0) + 1;
    }
    // If activity was today, don't change streak

    await userRef.update(updates);
  } catch (error) {
    console.error('Error updating user activity stats:', error);
    // Don't throw here as this is secondary to logging the activity
  }
}

/**
 * Calculates consecutive study days streak
 */
function calculateStreakDays(activities: UserActivity[]): number {
  if (activities.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const activityDates = activities
    .map(activity => {
      const date = new Date(activity.timestamp);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    })
    .filter((date, index, array) => array.indexOf(date) === index) // Remove duplicates
    .sort((a, b) => b - a); // Sort descending

  let streak = 0;
  let expectedDate = today.getTime();

  for (const activityDate of activityDates) {
    if (activityDate === expectedDate) {
      streak++;
      expectedDate -= 24 * 60 * 60 * 1000; // Go back one day
    } else if (activityDate < expectedDate) {
      // Gap in activity, streak ends
      break;
    }
  }

  return streak;
}

/**
 * Bulk logs multiple activities (useful for imports or batch operations)
 */
export async function bulkLogActivities(
  userId: string,
  activities: Omit<UserActivity, 'id' | 'userId' | 'timestamp'>[]
): Promise<string[]> {
  try {
    const batch = db.batch();
    const activityIds: string[] = [];

    for (const activity of activities) {
      const activityRef = db
        .collection('users')
        .doc(userId)
        .collection('activities')
        .doc();
      
      batch.set(activityRef, {
        ...activity,
        userId,
        timestamp: new Date()
      });
      
      activityIds.push(activityRef.id);
    }

    await batch.commit();

    return activityIds;
  } catch (error) {
    console.error('Error bulk logging activities:', error);
    throw new Error('Failed to bulk log activities');
  }
}