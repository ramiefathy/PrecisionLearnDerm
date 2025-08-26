import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';

const db = admin.firestore();

// Submit user feedback on question quality
export const submitQuestionFeedback = functions.https.onCall(async (data: any, context: any) => {
  try {
    const uid = context?.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { itemId, questionQuality, explanationQuality } = data || {};
    
    if (!itemId || !questionQuality || !explanationQuality) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required feedback fields');
    }
    
    const feedbackRef = db.collection('questionFeedback').doc();
    await feedbackRef.set({
      userId: uid,
      itemId,
      questionQuality,
      explanationQuality,
      submittedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      message: 'Feedback submitted successfully',
      feedbackId: feedbackRef.id
    };
    
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Get quality review queue
export const getQualityReviewQueue = functions.https.onCall(async (data: any, context: any) => {
  try {
    requireAdmin(context);
    const { status = 'pending', limit = 25 } = data || {};
    
    const queueRef = db.collection('qualityReviewQueue');
    let query: any = queueRef;
    
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    
    query = query.orderBy('createdAt', 'desc').limit(limit);
    
    const snapshot = await query.get();
    const queueItems = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      success: true,
      queueItems,
      count: queueItems.length,
      status,
      limit
    };
    
  } catch (error: any) {
    console.error('Error getting quality review queue:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Resolve quality review
export const resolveQualityReview = functions.https.onCall(async (data: any, context: any) => {
  try {
    requireAdmin(context);
    const { queueId, action, adminNotes } = data || {};
    
    if (!queueId || !action) {
      throw new Error('Missing required parameters: queueId and action');
    }
    
    const queueRef = db.collection('qualityReviewQueue').doc(queueId);
    
    const queueDoc = await queueRef.get();
    if (!queueDoc.exists) {
      throw new Error('Queue item not found');
    }
    
    await queueRef.update({
      status: action,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      adminNotes: adminNotes || '',
      resolvedBy: context?.auth?.uid || 'admin'
    });
    
    return {
      success: true,
      message: `Quality review resolved - ${action}`,
      queueId
    };
    
  } catch (error: any) {
    console.error('Error resolving quality review:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Get quality analytics
export const getQualityAnalytics = functions.https.onCall(async (data: any, context: any) => {
  try {
    requireAdmin(context);
    const { timeRange = 30 } = data || {};
    
    const db = admin.firestore();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeRange);
    
    const feedbackQuery = await db.collection('questionFeedback')
      .where('submittedAt', '>=', cutoffDate)
      .get();
    
    if (feedbackQuery.empty) {
      return {
        success: true,
        analytics: {
          totalFeedback: 0,
          averageQuestionQuality: 0,
          averageExplanationQuality: 0,
          overallQuality: 0
        },
        timeRange
      };
    }
    
    const allFeedback = feedbackQuery.docs.map(doc => doc.data());
    const totalFeedback = allFeedback.length;
    
    const averageQuestionQuality = allFeedback.reduce((sum, feedback) => sum + feedback.questionQuality, 0) / totalFeedback;
    const averageExplanationQuality = allFeedback.reduce((sum, feedback) => sum + feedback.explanationQuality, 0) / totalFeedback;
    const overallQuality = (averageQuestionQuality + averageExplanationQuality) / 2;
    
    return {
      success: true,
      analytics: {
        totalFeedback,
        averageQuestionQuality: Math.round(averageQuestionQuality * 100) / 100,
        averageExplanationQuality: Math.round(averageExplanationQuality * 100) / 100,
        overallQuality: Math.round(overallQuality * 100) / 100
      },
      timeRange
    };
    
  } catch (error: any) {
    console.error('Error getting quality analytics:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}); 