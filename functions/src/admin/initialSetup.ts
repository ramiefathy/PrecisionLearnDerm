import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as crypto from 'crypto';
import { logInfo, logError } from '../util/logging';
import { withCORS } from '../util/corsConfig';

// Simple rate limiting store (in production, use Redis or similar)
const setupAttempts = new Map<string, { count: number; firstAttempt: number }>();

/**
 * One-time setup function to grant initial admin role
 * This function should be disabled after initial setup for security
 * 
 * SECURITY WARNING: This function bypasses normal authentication.
 * It should only be used for initial setup and then disabled.
 */

export const grantInitialAdminRole = functions.https.onRequest(
  withCORS('STRICT', async (req, res) => {
  
  try {
    // Rate limiting: Track attempts by IP
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                     req.connection.remoteAddress || 
                     'unknown';
    
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    
    // Clean old attempts
    for (const [ip, data] of setupAttempts.entries()) {
      if (now - data.firstAttempt > hourInMs) {
        setupAttempts.delete(ip);
      }
    }
    
    // Check current IP attempts
    const currentAttempts = setupAttempts.get(clientIp) || { count: 0, firstAttempt: now };
    
    if (currentAttempts.count >= 3) {
      logError('admin.setup_rate_limited', { ip: clientIp, attempts: currentAttempts.count });
      res.status(429).json({
        success: false,
        error: 'Too many setup attempts. Please try again in an hour.'
      });
      return;
    }
    
    // Increment attempt counter
    setupAttempts.set(clientIp, {
      count: currentAttempts.count + 1,
      firstAttempt: currentAttempts.firstAttempt
    });

    // Get email from query params or body
    const email = req.query.email as string || req.body?.email;
    const setupKey = req.query.setupKey as string || req.body?.setupKey;
    
    // Enhanced security: require proper setup key and check for existing admins
    const expectedSetupKey = process.env.INITIAL_ADMIN_SETUP_KEY;
    
    if (!expectedSetupKey) {
      logError('admin.setup_key_missing', { attempt: 'initial_setup' });
      res.status(500).json({
        success: false,
        error: 'Setup not configured properly'
      });
      return;
    }
    
    // Use constant-time comparison to prevent timing attacks
    if (!setupKey || !crypto.timingSafeEqual(
      Buffer.from(setupKey, 'utf8'),
      Buffer.from(expectedSetupKey, 'utf8')
    )) {
      res.status(403).json({
        success: false,
        error: 'Invalid setup key'
      });
      return;
    }
    
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Email is required'
      });
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
      return;
    }
    
    // Security check: Ensure no admin users exist (one-time setup only)
    const existingUsers = await admin.auth().listUsers(1000);
    const existingAdmins = existingUsers.users.filter(user => user.customClaims?.admin === true);
    
    if (existingAdmins.length > 0) {
      logError('admin.setup_already_completed', { existingAdmins: existingAdmins.length });
      res.status(403).json({
        success: false,
        error: 'Initial setup already completed. This endpoint is disabled after first admin is created.'
      });
      return;
    }
    
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    
    // Double-check: if this specific user is already admin
    if (user.customClaims?.admin === true) {
      res.status(200).json({
        success: true,
        message: 'User already has admin role',
        uid: user.uid
      });
      return;
    }
    
    // Set admin custom claim
    await admin.auth().setCustomUserClaims(user.uid, {
      ...user.customClaims,
      admin: true
    });
    
    logInfo('admin.initial_setup', {
      grantedTo: user.uid,
      email: email,
      timestamp: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: `Admin role granted to ${email}. Please log out and log back in for changes to take effect.`,
      uid: user.uid
    });
    
  } catch (error: any) {
    logError('admin.initial_setup_error', {
      error: error instanceof Error ? error.message : String(error),
      email: req.query.email || req.body?.email
    });
    
    if (error.code === 'auth/user-not-found') {
      res.status(404).json({
        success: false,
        error: 'User not found. Please ensure the user has signed up first.'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to grant admin role'
    });
  }
}));

/**
 * Function to check if a user has admin role
 * SECURITY NOTE: This endpoint is DISABLED in production for security
 * Use only for development/debugging purposes
 */
export const checkAdminStatus = functions.https.onRequest(
  withCORS('STRICT', async (req, res) => {
    // SECURITY: Disable in production
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: 'Endpoint not available in production'
      });
      return;
    }
  
  try {
    const email = req.query.email as string || req.body?.email;
    
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Email is required'
      });
      return;
    }
    
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    
    const isAdmin = user.customClaims?.admin === true;
    
    res.status(200).json({
      success: true,
      email: email,
      uid: user.uid,
      isAdmin: isAdmin,
      customClaims: user.customClaims || {}
    });
    
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check admin status'
    });
  }
}));
