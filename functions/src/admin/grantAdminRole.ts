import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

interface GrantAdminRoleData {
  email: string;
  setupKey: string;
}

interface RevokeAdminRoleData {
  email: string;
}

/**
 * Cloud Function to grant admin role to a user
 * Protected by setup key for initial bootstrap
 */
export const grantAdminRole = functions.https.onCall(async (data: GrantAdminRoleData, context: any) => {
    logger.info('Grant admin role request', { email: data.email });
    
    try {
      // Validate setup key for security
      if (!data.setupKey || data.setupKey !== process.env.INITIAL_ADMIN_SETUP_KEY) {
        logger.warn('Invalid setup key provided', { email: data.email });
        throw new functions.https.HttpsError(
          'permission-denied',
          'Invalid setup key. Contact system administrator.'
        );
      }

      if (!data.email) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Email is required'
        );
      }

      // Get user by email
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(data.email);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          throw new functions.https.HttpsError(
            'not-found',
            'No user found with this email address. User must register first.'
          );
        }
        throw error;
      }

      // Check if user already has admin role
      const currentClaims = userRecord.customClaims || {};
      if (currentClaims.admin) {
        logger.info('User already has admin role', { email: data.email, uid: userRecord.uid });
        return {
          success: true,
          message: 'User already has admin privileges',
          uid: userRecord.uid
        };
      }

      // Grant admin role via custom claims
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        ...currentClaims,
        admin: true,
        role: 'admin'
      });

      // Update user profile in Firestore
      const userDocRef = admin.firestore().collection('users').doc(userRecord.uid);
      await userDocRef.set({
        email: data.email,
        role: 'admin',
        isAdmin: true,
        adminGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminGrantedBy: context.auth?.uid || 'system'
      }, { merge: true });

      logger.info('Admin role granted successfully', {
        email: data.email,
        uid: userRecord.uid,
        grantedBy: context.auth?.uid || 'system'
      });

      return {
        success: true,
        message: 'Admin role granted successfully',
        uid: userRecord.uid
      };

    } catch (error: any) {
      logger.error('Error granting admin role', {
        email: data.email,
        error: error.message,
        stack: error.stack
      });

      // Re-throw HttpsError as-is
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new functions.https.HttpsError(
        'internal',
        'Failed to grant admin role. Please try again.'
      );
    }
  });

/**
 * Cloud Function to revoke admin role from a user
 * Only callable by existing admins
 */
export const revokeAdminRole = functions.https.onCall(async (data: RevokeAdminRoleData, context: any) => {
    logger.info('Revoke admin role request', { email: data.email });

    try {
      // Ensure caller is authenticated and is admin
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'Must be authenticated to revoke admin roles'
        );
      }

      // Check if caller has admin privileges
      const callerRecord = await admin.auth().getUser(context.auth.uid);
      const callerClaims = callerRecord.customClaims || {};
      
      if (!callerClaims.admin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can revoke admin roles'
        );
      }

      if (!data.email) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Email is required'
        );
      }

      // Get user by email
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(data.email);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          throw new functions.https.HttpsError(
            'not-found',
            'No user found with this email address'
          );
        }
        throw error;
      }

      // Check if user has admin role
      const currentClaims = userRecord.customClaims || {};
      if (!currentClaims.admin) {
        return {
          success: true,
          message: 'User does not have admin privileges',
          uid: userRecord.uid
        };
      }

      // Remove admin role from custom claims
      const newClaims = { ...currentClaims };
      delete newClaims.admin;
      delete newClaims.role;

      await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);

      // Update user profile in Firestore
      const userDocRef = admin.firestore().collection('users').doc(userRecord.uid);
      await userDocRef.update({
        role: admin.firestore.FieldValue.delete(),
        isAdmin: false,
        adminRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminRevokedBy: context.auth.uid
      });

      logger.info('Admin role revoked successfully', {
        email: data.email,
        uid: userRecord.uid,
        revokedBy: context.auth.uid
      });

      return {
        success: true,
        message: 'Admin role revoked successfully',
        uid: userRecord.uid
      };

    } catch (error: any) {
      logger.error('Error revoking admin role', {
        email: data.email,
        error: error.message,
        stack: error.stack
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to revoke admin role. Please try again.'
      );
    }
  });

/**
 * Cloud Function to list all admin users
 * Only callable by existing admins
 */
export const listAdminUsers = functions.https.onCall(async (data: any, context: any) => {
    logger.info('List admin users request');

    try {
      // Ensure caller is authenticated and is admin
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'Must be authenticated to list admin users'
        );
      }

      const callerRecord = await admin.auth().getUser(context.auth.uid);
      const callerClaims = callerRecord.customClaims || {};
      
      if (!callerClaims.admin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can list admin users'
        );
      }

      // Get all admin users from Firestore
      const adminUsers = await admin.firestore()
        .collection('users')
        .where('isAdmin', '==', true)
        .get();

      const admins = adminUsers.docs.map((doc: any) => {
        const data = doc.data();
        return {
          uid: doc.id,
          email: data.email,
          adminGrantedAt: data.adminGrantedAt?.toDate?.() || null,
          adminGrantedBy: data.adminGrantedBy
        };
      });

      logger.info('Admin users listed successfully', { count: admins.length });

      return {
        success: true,
        admins
      };

    } catch (error: any) {
      logger.error('Error listing admin users', {
        error: error.message,
        stack: error.stack
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to list admin users. Please try again.'
      );
    }
  });