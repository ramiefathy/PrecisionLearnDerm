import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';

/**
 * Cloud Function to grant admin role to a user
 * Only callable by existing admins
 */
export const grantAdminRole = functions.https.onCall(async (data, context) => {
  try {
    // Require caller to be an admin
    requireAdmin(context);
    
    const { email } = data;
    
    if (!email || typeof email !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Email is required and must be a string'
      );
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid email format'
      );
    }
    
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    
    // Set admin custom claim
    await admin.auth().setCustomUserClaims(user.uid, {
      ...user.customClaims,
      admin: true
    });
    
    logInfo('admin.grant_role', {
      grantedBy: context.auth?.uid,
      grantedTo: user.uid,
      email: email
    });
    
    return {
      success: true,
      message: `Admin role granted to ${email}`,
      uid: user.uid
    };
    
  } catch (error: any) {
    logError('admin.grant_role_error', {
      error: error instanceof Error ? error.message : String(error),
      email: data.email,
      grantedBy: context.auth?.uid
    });
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      error instanceof Error ? error.message : String(error) || 'Failed to grant admin role'
    );
  }
});

/**
 * Cloud Function to revoke admin role from a user
 * Only callable by existing admins
 */
export const revokeAdminRole = functions.https.onCall(async (data, context) => {
  try {
    // Require caller to be an admin
    requireAdmin(context);
    
    const { email } = data;
    
    if (!email || typeof email !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Email is required and must be a string'
      );
    }
    
    // Prevent self-revocation
    if (context.auth?.token?.email === email) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot revoke your own admin role'
      );
    }
    
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    
    // Remove admin custom claim
    const customClaims = user.customClaims || {};
    delete customClaims.admin;
    await admin.auth().setCustomUserClaims(user.uid, customClaims);
    
    logInfo('admin.revoke_role', {
      revokedBy: context.auth?.uid,
      revokedFrom: user.uid,
      email: email
    });
    
    return {
      success: true,
      message: `Admin role revoked from ${email}`,
      uid: user.uid
    };
    
  } catch (error: any) {
    logError('admin.revoke_role_error', {
      error: error instanceof Error ? error.message : String(error),
      email: data.email,
      revokedBy: context.auth?.uid
    });
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      error instanceof Error ? error.message : String(error) || 'Failed to revoke admin role'
    );
  }
});

/**
 * Cloud Function to list all admin users
 * Only callable by existing admins
 */
export const listAdminUsers = functions.https.onCall(async (data, context) => {
  try {
    // Require caller to be an admin
    requireAdmin(context);
    
    const admins: Array<{
      uid: string;
      email: string;
      displayName?: string;
      createdAt?: string;
    }> = [];
    
    // List all users and filter by admin claim
    let pageToken: string | undefined;
    
    do {
      const listUsersResult = await admin.auth().listUsers(1000, pageToken);
      
      for (const user of listUsersResult.users) {
        if (user.customClaims?.admin === true) {
          admins.push({
            uid: user.uid,
            email: user.email || 'No email',
            displayName: user.displayName,
            createdAt: user.metadata.creationTime
          });
        }
      }
      
      pageToken = listUsersResult.pageToken;
    } while (pageToken);
    
    logInfo('admin.list_admins', {
      requestedBy: context.auth?.uid,
      adminCount: admins.length
    });
    
    return {
      success: true,
      admins: admins,
      count: admins.length
    };
    
  } catch (error: any) {
    logError('admin.list_admins_error', {
      error: error instanceof Error ? error.message : String(error),
      requestedBy: context.auth?.uid
    });
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      error instanceof Error ? error.message : String(error) || 'Failed to list admin users'
    );
  }
});
