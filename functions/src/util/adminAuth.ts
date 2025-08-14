import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export async function requireAdminByEmail(context: any): Promise<string> {
  if (!context || !context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const email = context.auth.token.email;
  if (!email) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User email not found in token'
    );
  }

  // Check if user is admin (ramiefathy@gmail.com)
  if (email !== 'ramiefathy@gmail.com') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }

  return email;
}

export function isAuthorizedAdminEmail(email: string): boolean {
  return email === 'ramiefathy@gmail.com';
} 