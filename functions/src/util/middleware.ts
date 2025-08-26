import * as functions from 'firebase-functions';
import cors from 'cors';
import { Request, Response } from 'express';
import { logError, logInfo } from './logging';

// Configure CORS options
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests from localhost in development
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://dermassist-ai-1zyic.firebaseapp.com',
      'https://dermassist-ai-1zyic.web.app',
      'https://precisionlearnderm.com', // Add your custom domain here
    ];
    
    // Allow requests with no origin (like mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Initialize CORS middleware
export const corsMiddleware = cors(corsOptions);

// Error response interface
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

// Success response interface
interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

// Standardized error handler
export function handleError(error: any, res: Response, functionName: string): void {
  logError(`${functionName}.error`, error);
  
  let statusCode = 500;
  let errorCode = 'internal';
  let message = 'An internal error occurred';
  let details = undefined;
  
  if (error instanceof functions.https.HttpsError) {
    const codeMap: Record<string, number> = {
      'ok': 200,
      'cancelled': 499,
      'unknown': 500,
      'invalid-argument': 400,
      'deadline-exceeded': 504,
      'not-found': 404,
      'already-exists': 409,
      'permission-denied': 403,
      'unauthenticated': 401,
      'resource-exhausted': 429,
      'failed-precondition': 400,
      'aborted': 409,
      'out-of-range': 400,
      'unimplemented': 501,
      'internal': 500,
      'unavailable': 503,
      'data-loss': 500,
    };
    
    statusCode = codeMap[error.code] || 500;
    errorCode = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
    
    // Check for specific error types
    if (error.message.includes('permission') || error.message.includes('auth')) {
      statusCode = 403;
      errorCode = 'permission-denied';
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'not-found';
    } else if (error.message.includes('invalid') || error.message.includes('validation')) {
      statusCode = 400;
      errorCode = 'invalid-argument';
    }
  }
  
  const errorResponse: ErrorResponse = {
    error: {
      code: errorCode,
      message: message,
    },
  };
  
  if (details) {
    errorResponse.error.details = details;
  }
  
  res.status(statusCode).json(errorResponse);
}

// Standardized success response
export function sendSuccess<T = any>(res: Response, data: T, functionName: string): void {
  logInfo(`${functionName}.success`, { responseSize: JSON.stringify(data).length });
  
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };
  
  res.status(200).json(response);
}

// Authentication middleware for HTTP functions
export async function verifyAuth(req: Request): Promise<string> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Missing or invalid authorization header'
    );
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const admin = await import('firebase-admin');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Invalid authentication token'
    );
  }
}

// Admin verification middleware
export async function verifyAdmin(req: Request): Promise<string> {
  const uid = await verifyAuth(req);
  
  try {
    const admin = await import('firebase-admin');
    const user = await admin.auth().getUser(uid);
    
    if (!user.customClaims?.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }
    
    return uid;
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      'internal',
      'Failed to verify admin status'
    );
  }
}

// Wrapper for HTTP functions with CORS and error handling
export function wrapHttpFunction(
  handler: (req: Request, res: Response) => Promise<void>,
  options?: {
    requireAuth?: boolean;
    requireAdmin?: boolean;
    functionName?: string;
  }
): (req: Request, res: Response) => void {
  const functionName = options?.functionName || 'httpFunction';
  
  return (req: Request, res: Response) => {
    corsMiddleware(req, res, async () => {
      try {
        // Handle preflight OPTIONS request
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
        
        // Verify authentication if required
        if (options?.requireAuth || options?.requireAdmin) {
          if (options.requireAdmin) {
            await verifyAdmin(req);
          } else {
            await verifyAuth(req);
          }
        }
        
        // Execute the handler
        await handler(req, res);
      } catch (error) {
        handleError(error, res, functionName);
      }
    });
  };
}

// Input validation helper
export function validateInput<T>(data: any, schema: {
  validate: (data: any) => { success: boolean; data?: T; error?: any };
}): T {
  const result = schema.validate(data);
  
  if (!result.success) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid input data',
      result.error
    );
  }
  
  return result.data as T;
}
