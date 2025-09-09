import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Callable: setup_check_admin
 * Returns whether a given email (or the caller) has the admin claim.
 * This avoids CORS and provides structured errors for the web client.
 */
export const setup_check_admin = functions.https.onCall(async (data: any, context: any) => {
  try {
    const emailFromData: string | undefined = data?.email;
    const emailFromToken: string | undefined = (context?.auth?.token?.email as string) || undefined;
    const email = emailFromData || emailFromToken;

    if (!email) {
      throw new functions.https.HttpsError('invalid-argument', 'Email is required or must be available in auth token');
    }

    const user = await admin.auth().getUserByEmail(email);
    const isAdmin = user.customClaims?.admin === true;

    return {
      success: true,
      uid: user.uid,
      email,
      isAdmin,
      claims: user.customClaims || {}
    };
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


