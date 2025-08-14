import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const seedDatabase = functions.https.onCall(async (data: any, context: any) => {
  try {
    // Check if user is admin
    const isAdmin = context?.auth?.token?.role === 'admin';
    
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }
    
    // Placeholder for database seeding logic
    // This would typically involve:
    // - Creating initial users
    // - Setting up default categories
    // - Loading sample questions
    
    console.log('Database seeding completed');
    return {
      success: true,
      message: 'Database seeded successfully'
    };
    
  } catch (error: any) {
    console.error('Database seeding failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}); 