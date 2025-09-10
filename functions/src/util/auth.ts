import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { logInfo, logError } from './logging';
import { 
  CallableContext, 
  AuthenticatedContext, 
  AdminContext,
  isAuthenticated,
  isAdmin as typeGuardIsAdmin
} from '../types';

let app: admin.app.App | undefined;

/**
 * Gets or initializes the Firebase Admin app instance
 */
export function getAdminApp(): admin.app.App {
  if (!app) {
    app = admin.apps.length ? admin.app() : admin.initializeApp();
  }
  return app;
}

/**
 * Type-safe authentication requirement that returns the user ID
 * @param context - Firebase callable context
 * @returns User ID string
 * @throws HttpsError if not authenticated
 */
export function requireAuth(context: CallableContext): string {
  if (!isAuthenticated(context)) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  return context.auth.uid;
}

/**
 * Type-safe authentication requirement that returns authenticated context
 * @param context - Firebase callable context
 * @returns AuthenticatedContext with guaranteed auth properties
 * @throws HttpsError if not authenticated
 */
export function requireAuthentication(context: CallableContext): AuthenticatedContext {
  if (!isAuthenticated(context)) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  return context;
}

/**
 * Type-safe admin requirement (void return for backward compatibility)
 * @param context - Firebase callable context
 * @throws HttpsError if not authenticated or not admin
 */
export function requireAdmin(context: CallableContext): void {
  if (!typeGuardIsAdmin(context)) {
    const uid = context?.auth?.uid || 'unknown';
    
    if (!isAuthenticated(context)) {
      // Fire-and-forget logging to avoid affecting test behavior
      logError('auth.authentication_failed', { 
        uid, 
        reason: 'no_auth_context',
        timestamp: new Date().toISOString()
      }).catch(() => {}); // Ignore logging errors
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    
    // Fire-and-forget logging to avoid affecting test behavior
    logError('auth.authorization_failed', { 
      uid, 
      reason: 'insufficient_privileges',
      required: 'admin',
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore logging errors
    throw new functions.https.HttpsError('permission-denied', 'Admin role required');
  }
  
  // Fire-and-forget logging for successful admin access
  logInfo('auth.admin_access_granted', {
    uid: context.auth!.uid,
    timestamp: new Date().toISOString()
  }).catch(() => {}); // Ignore logging errors
}

/**
 * Type-safe admin requirement that returns admin context
 * @param context - Firebase callable context
 * @returns AdminContext with guaranteed admin properties
 * @throws HttpsError if not authenticated or not admin
 */
export function requireAdminContext(context: CallableContext): AdminContext {
  if (!typeGuardIsAdmin(context)) {
    const uid = context?.auth?.uid || 'unknown';
    
    if (!isAuthenticated(context)) {
      // Fire-and-forget logging to avoid affecting test behavior
      logError('auth.authentication_failed', { 
        uid, 
        reason: 'no_auth_context',
        function: 'requireAdminContext',
        timestamp: new Date().toISOString()
      }).catch(() => {}); // Ignore logging errors
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    
    // Fire-and-forget logging to avoid affecting test behavior
    logError('auth.authorization_failed', { 
      uid, 
      reason: 'insufficient_privileges',
      required: 'admin',
      function: 'requireAdminContext',
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore logging errors
    throw new functions.https.HttpsError('permission-denied', 'Admin role required');
  }
  
  // Fire-and-forget logging for successful admin access
  logInfo('auth.admin_context_granted', {
    uid: context.auth!.uid,
    timestamp: new Date().toISOString()
  }).catch(() => {}); // Ignore logging errors
  
  return context;
}

/**
 * Type-safe admin check
 * @param context - Firebase callable context
 * @returns true if user is admin, false otherwise
 */
export function isAdmin(context: CallableContext): boolean {
  return typeGuardIsAdmin(context);
}

/**
 * Reviewer role check (custom claim: reviewer: true)
 */
export function isReviewer(context: CallableContext): boolean {
  return !!context?.auth?.token?.reviewer === true || !!context?.auth?.token?.['reviewer'] === true;
}

/**
 * Allow either admin or reviewer
 */
export function requireReviewerOrAdmin(context: CallableContext): void {
  const uid = context?.auth?.uid || 'unknown';
  const ok = isAdmin(context) || isReviewer(context);
  if (!ok) {
    if (!isAuthenticated(context)) {
      logError('auth.authentication_failed', { uid, reason: 'no_auth_context', required: 'admin_or_reviewer', timestamp: new Date().toISOString() }).catch(()=>{});
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    logError('auth.authorization_failed', { uid, reason: 'insufficient_privileges', required: 'admin_or_reviewer', timestamp: new Date().toISOString() }).catch(()=>{});
    throw new functions.https.HttpsError('permission-denied', 'Admin or Reviewer role required');
  }
  logInfo('auth.reviewer_or_admin_access_granted', { uid: context.auth!.uid, timestamp: new Date().toISOString() }).catch(()=>{});
}

/**
 * Type-safe admin requirement that returns user email or UID
 * Replacement for deprecated requireAdminByEmail
 * @param context - Firebase callable context
 * @returns User email if available, otherwise UID
 * @throws HttpsError if not authenticated or not admin
 */
export function requireAdminIdentifier(context: CallableContext): string {
  const adminContext = requireAdminContext(context);
  return adminContext.auth.token.email || adminContext.auth.uid;
}

/**
 * Async admin user management - sets custom admin claim
 * @param uid - User ID to grant admin access
 */
export async function setAdminClaim(uid: string): Promise<void> {
  try {
    const adminApp = getAdminApp();
    await adminApp.auth().setCustomUserClaims(uid, { admin: true });
    
    // Fire-and-forget logging
    logInfo('auth.admin_claim_granted', {
      targetUid: uid,
      claim: 'admin',
      value: true,
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore logging errors
  } catch (error) {
    // Fire-and-forget logging
    logError('auth.admin_claim_set_failed', {
      targetUid: uid,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore logging errors
    throw error;
  }
}

/**
 * Async admin user management - removes custom admin claim
 * @param uid - User ID to revoke admin access
 */
export async function removeAdminClaim(uid: string): Promise<void> {
  try {
    const adminApp = getAdminApp();
    const user = await adminApp.auth().getUser(uid);
    const customClaims = user.customClaims || {};
    const hadAdminClaim = customClaims.admin === true;
    
    delete customClaims.admin;
    await adminApp.auth().setCustomUserClaims(uid, customClaims);
    
    // Fire-and-forget logging
    logInfo('auth.admin_claim_revoked', {
      targetUid: uid,
      claim: 'admin',
      previousValue: hadAdminClaim,
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore logging errors
  } catch (error) {
    // Fire-and-forget logging
    logError('auth.admin_claim_remove_failed', {
      targetUid: uid,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore logging errors
    throw error;
  }
}
