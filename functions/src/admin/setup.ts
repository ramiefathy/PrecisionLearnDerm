import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Callable: setup_check_admin
 * Returns whether a given email (or the caller) has the admin claim.
 * This avoids CORS and provides structured errors for the web client.
 */
export const setup_check_admin = functions.https.onCall(async (data: any, context: any) => {
  try {
    if (!context?.auth?.token?.email) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const callerEmail: string = context.auth.token.email as string;
    const callerIsAdmin: boolean = context.auth.token.admin === true;

    const requestedEmail: string | undefined = typeof data?.email === 'string' ? data.email : undefined;
    const targetEmail = requestedEmail || callerEmail;

    if (!callerIsAdmin && targetEmail !== callerEmail) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
    }

    const user = await admin.auth().getUserByEmail(targetEmail);
    const isAdmin = user.customClaims?.admin === true;

    const response: any = {
      success: true,
      uid: user.uid,
      email: targetEmail,
      isAdmin
    };

    if (callerIsAdmin) {
      response.claims = user.customClaims || {};
    }

    return response;
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to check admin status');
  }
});


