/**
 * Centralized CORS Configuration and Middleware
 * Provides secure, environment-aware CORS policies for Firebase Cloud Functions
 */

import * as functions from 'firebase-functions';

export interface CORSConfig {
  allowedOrigins: string[];
  allowCredentials: boolean;
  maxAge?: number;
  methods?: string[];
  headers?: string[];
}

/**
 * CORS Policy Configurations
 */
export const CORS_POLICIES = {
  /**
   * STRICT: Admin and sensitive endpoints
   * Only allows legitimate production and development domains
   */
  STRICT: {
    allowedOrigins: [
      'https://dermassist-ai-1zyic.web.app',
      'https://dermassist-ai-1zyic.firebaseapp.com',
      // Development origins (only in dev/staging)
      ...(process.env.NODE_ENV !== 'production' ? [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:5001',
        'http://localhost:5173'
      ] : [])
    ],
    allowCredentials: true,
    maxAge: 3600, // 1 hour
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Requested-With']
  },

  /**
   * TEST: Development and testing endpoints
   * More permissive for development, but still restricted
   */
  TEST: {
    allowedOrigins: [
      'https://dermassist-ai-1zyic.web.app',
      'https://dermassist-ai-1zyic.firebaseapp.com',
      'http://localhost:3000',
      'http://localhost:5000',
      'http://localhost:5173',
      'http://localhost:5001'
    ],
    allowCredentials: true,
    maxAge: 300, // 5 minutes
    methods: ['GET', 'POST', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization']
  },

  /**
   * PUBLIC: Health checks and truly public endpoints
   * Most restrictive - no credentials, limited methods
   */
  PUBLIC: {
    allowedOrigins: ['*'],
    allowCredentials: false,
    maxAge: 300,
    methods: ['GET', 'OPTIONS'],
    headers: ['Content-Type']
  }
};

/**
 * Creates CORS middleware for Firebase Functions
 * @param policy - CORS policy to apply
 * @returns Express middleware function
 */
export function createCORSMiddleware(policy: keyof typeof CORS_POLICIES) {
  return (req: functions.Request, res: functions.Response, next?: () => void) => {
    const config = CORS_POLICIES[policy];
    const requestOrigin = req.headers.origin;

    // Handle OPTIONS preflight requests
    if (req.method === 'OPTIONS') {
      setCORSHeaders(res, config, requestOrigin || '*');
      res.status(204).send('');
      return;
    }

    // Validate origin
    if (config.allowedOrigins.includes('*')) {
      // Public endpoints - allow all origins
      setCORSHeaders(res, config, '*');
    } else if (requestOrigin && config.allowedOrigins.includes(requestOrigin)) {
      // Private endpoints - validate origin
      setCORSHeaders(res, config, requestOrigin);
    } else {
      // Reject unauthorized origins
      logCORSViolation(requestOrigin || 'unknown', req.path);
      res.status(403).json({ 
        error: 'CORS: Origin not allowed',
        code: 'cors/origin-not-allowed'
      });
      return;
    }

    if (next) next();
  };
}

/**
 * Sets CORS headers on response
 */
function setCORSHeaders(res: functions.Response, config: CORSConfig, origin: string) {
  res.set('Access-Control-Allow-Origin', origin);
  
  if (config.allowCredentials && origin !== '*') {
    res.set('Access-Control-Allow-Credentials', 'true');
  }
  
  if (config.methods) {
    res.set('Access-Control-Allow-Methods', config.methods.join(', '));
  }
  
  if (config.headers) {
    res.set('Access-Control-Allow-Headers', config.headers.join(', '));
  }
  
  if (config.maxAge) {
    res.set('Access-Control-Max-Age', config.maxAge.toString());
  }

  // Additional security headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-XSS-Protection', '1; mode=block');
}

/**
 * Logs CORS policy violations for monitoring
 */
function logCORSViolation(origin: string, path: string) {
  console.warn('CORS Policy Violation', {
    origin,
    path,
    timestamp: new Date().toISOString(),
    severity: 'WARNING',
    type: 'cors_violation'
  });
}

/**
 * Convenience function for wrapping onRequest functions with CORS
 */
export function withCORS(
  policy: keyof typeof CORS_POLICIES,
  handler: (req: functions.Request, res: functions.Response) => Promise<void> | void
) {
  return (req: functions.Request, res: functions.Response) => {
    const corsMiddleware = createCORSMiddleware(policy);
    corsMiddleware(req, res, async () => {
      try {
        await handler(req, res);
      } catch (error) {
        console.error('Function handler error:', error);
        res.status(500).json({ 
          error: 'Internal server error',
          code: 'internal/handler-error'
        });
      }
    });
  };
}

/**
 * Environment-aware domain configuration
 */
export function getAllowedOrigins(): string[] {
  const baseOrigins = [
    'https://dermassist-ai-1zyic.web.app',
    'https://dermassist-ai-1zyic.firebaseapp.com'
  ];

  if (process.env.NODE_ENV !== 'production') {
    return [
      ...baseOrigins,
      'http://localhost:3000',
      'http://localhost:5000', 
      'http://localhost:5001'
    ];
  }

  return baseOrigins;
}

/**
 * Validates if an origin is allowed
 */
export function isOriginAllowed(origin: string, policy: keyof typeof CORS_POLICIES = 'STRICT'): boolean {
  const config = CORS_POLICIES[policy];
  return config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);
}