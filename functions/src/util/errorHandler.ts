import * as functions from 'firebase-functions';
import { logError, generateCorrelationId, LogLevel, log } from './monitoring';

// ============================================
// Error Classification System
// ============================================

export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RESOURCE_EXHAUSTED_ERROR = 'RESOURCE_EXHAUSTED_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  MAINTENANCE_ERROR = 'MAINTENANCE_ERROR'
}

export interface ErrorContext {
  operation: string;
  userId?: string;
  ipAddress?: string;
  endpoint?: string;
  requestId?: string;
  correlationId?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface StandardizedError {
  code: ErrorType;
  message: string;
  details?: any;
  correlationId: string;
  timestamp: string;
  retryAfter?: number;
  userFriendlyMessage: string;
  actionableGuidance?: string;
  context: ErrorContext;
}

// ============================================
// Error Mapping Configuration
// ============================================

interface ErrorMapping {
  httpStatus: number;
  userFriendlyMessage: string;
  actionableGuidance?: string;
  isRetryable: boolean;
  shouldLog: boolean;
  logLevel: LogLevel;
}

const ERROR_MAPPINGS: Record<ErrorType, ErrorMapping> = {
  [ErrorType.VALIDATION_ERROR]: {
    httpStatus: 400,
    userFriendlyMessage: 'The information provided is invalid or incomplete.',
    actionableGuidance: 'Please check your input and try again.',
    isRetryable: false,
    shouldLog: false,
    logLevel: LogLevel.WARN
  },
  [ErrorType.AUTHENTICATION_ERROR]: {
    httpStatus: 401,
    userFriendlyMessage: 'Authentication required.',
    actionableGuidance: 'Please sign in to access this feature.',
    isRetryable: false,
    shouldLog: true,
    logLevel: LogLevel.WARN
  },
  [ErrorType.AUTHORIZATION_ERROR]: {
    httpStatus: 403,
    userFriendlyMessage: 'You do not have permission to perform this action.',
    actionableGuidance: 'Contact your administrator if you believe this is an error.',
    isRetryable: false,
    shouldLog: true,
    logLevel: LogLevel.WARN
  },
  [ErrorType.NOT_FOUND_ERROR]: {
    httpStatus: 404,
    userFriendlyMessage: 'The requested resource was not found.',
    actionableGuidance: 'Please check the URL and try again.',
    isRetryable: false,
    shouldLog: false,
    logLevel: LogLevel.INFO
  },
  [ErrorType.RATE_LIMIT_ERROR]: {
    httpStatus: 429,
    userFriendlyMessage: 'Too many requests. Please slow down.',
    actionableGuidance: 'Wait a moment before trying again.',
    isRetryable: true,
    shouldLog: true,
    logLevel: LogLevel.WARN
  },
  [ErrorType.EXTERNAL_SERVICE_ERROR]: {
    httpStatus: 502,
    userFriendlyMessage: 'A required service is temporarily unavailable.',
    actionableGuidance: 'Please try again in a few moments.',
    isRetryable: true,
    shouldLog: true,
    logLevel: LogLevel.ERROR
  },
  [ErrorType.DATABASE_ERROR]: {
    httpStatus: 503,
    userFriendlyMessage: 'Database service is temporarily unavailable.',
    actionableGuidance: 'Please try again in a few moments.',
    isRetryable: true,
    shouldLog: true,
    logLevel: LogLevel.ERROR
  },
  [ErrorType.AI_SERVICE_ERROR]: {
    httpStatus: 503,
    userFriendlyMessage: 'AI service is temporarily unavailable.',
    actionableGuidance: 'Our AI services are experiencing issues. Please try again later.',
    isRetryable: true,
    shouldLog: true,
    logLevel: LogLevel.ERROR
  },
  [ErrorType.CONFIGURATION_ERROR]: {
    httpStatus: 500,
    userFriendlyMessage: 'Service configuration error.',
    actionableGuidance: 'This appears to be a system issue. Please contact support.',
    isRetryable: false,
    shouldLog: true,
    logLevel: LogLevel.CRITICAL
  },
  [ErrorType.NETWORK_ERROR]: {
    httpStatus: 503,
    userFriendlyMessage: 'Network connectivity issue.',
    actionableGuidance: 'Please check your internet connection and try again.',
    isRetryable: true,
    shouldLog: true,
    logLevel: LogLevel.WARN
  },
  [ErrorType.TIMEOUT_ERROR]: {
    httpStatus: 504,
    userFriendlyMessage: 'The request timed out.',
    actionableGuidance: 'Please try again. If the problem persists, contact support.',
    isRetryable: true,
    shouldLog: true,
    logLevel: LogLevel.WARN
  },
  [ErrorType.RESOURCE_EXHAUSTED_ERROR]: {
    httpStatus: 503,
    userFriendlyMessage: 'System resources are temporarily exhausted.',
    actionableGuidance: 'Please try again in a few minutes.',
    isRetryable: true,
    shouldLog: true,
    logLevel: LogLevel.ERROR
  },
  [ErrorType.INTERNAL_SERVER_ERROR]: {
    httpStatus: 500,
    userFriendlyMessage: 'An unexpected error occurred.',
    actionableGuidance: 'Please try again. If the problem persists, contact support.',
    isRetryable: false,
    shouldLog: true,
    logLevel: LogLevel.ERROR
  },
  [ErrorType.MAINTENANCE_ERROR]: {
    httpStatus: 503,
    userFriendlyMessage: 'System is currently under maintenance.',
    actionableGuidance: 'Please try again later.',
    isRetryable: true,
    shouldLog: false,
    logLevel: LogLevel.INFO
  }
};

// ============================================
// Error Handler Class
// ============================================

export class ErrorHandler {
  protected context: ErrorContext;

  constructor(context: ErrorContext) {
    this.context = {
      ...context,
      correlationId: context.correlationId || generateCorrelationId()
    };
  }

  /**
   * Create a standardized error from any error type
   */
  async createStandardizedError(
    error: any,
    errorType?: ErrorType,
    customMessage?: string,
    additionalContext?: Record<string, any>
  ): Promise<StandardizedError> {
    const detectedType = errorType || this.detectErrorType(error);
    const mapping = ERROR_MAPPINGS[detectedType];
    
    const standardizedError: StandardizedError = {
      code: detectedType,
      message: customMessage || this.extractErrorMessage(error),
      details: this.sanitizeErrorDetails(error),
      correlationId: this.context.correlationId!,
      timestamp: new Date().toISOString(),
      userFriendlyMessage: mapping.userFriendlyMessage,
      actionableGuidance: mapping.actionableGuidance,
      context: {
        ...this.context,
        ...additionalContext
      }
    };

    // Add retry information for retryable errors
    if (mapping.isRetryable) {
      standardizedError.retryAfter = this.calculateRetryAfter(detectedType);
    }

    // Log the error if configured to do so
    if (mapping.shouldLog) {
      await this.logStandardizedError(standardizedError, error, mapping.logLevel);
    }

    return standardizedError;
  }

  /**
   * Convert standardized error to Firebase HTTPS error
   */
  toFirebaseError(standardizedError: StandardizedError): functions.https.HttpsError {
    const mapping = ERROR_MAPPINGS[standardizedError.code];
    const firebaseErrorCode = this.mapToFirebaseErrorCode(mapping.httpStatus);
    
    const errorResponse = {
      code: standardizedError.code,
      message: standardizedError.userFriendlyMessage,
      details: {
        correlationId: standardizedError.correlationId,
        timestamp: standardizedError.timestamp,
        actionableGuidance: standardizedError.actionableGuidance,
        retryAfter: standardizedError.retryAfter
      }
    };

    return new functions.https.HttpsError(firebaseErrorCode, JSON.stringify(errorResponse));
  }

  /**
   * Convert standardized error to HTTP response format
   */
  toHttpResponse(standardizedError: StandardizedError): {
    status: number;
    body: any;
    headers: Record<string, string>;
  } {
    const mapping = ERROR_MAPPINGS[standardizedError.code];
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-ID': standardizedError.correlationId
    };

    if (standardizedError.retryAfter) {
      headers['Retry-After'] = Math.ceil(standardizedError.retryAfter / 1000).toString();
    }

    return {
      status: mapping.httpStatus,
      body: {
        error: {
          code: standardizedError.code,
          message: standardizedError.userFriendlyMessage,
          correlationId: standardizedError.correlationId,
          timestamp: standardizedError.timestamp,
          actionableGuidance: standardizedError.actionableGuidance,
          retryAfter: standardizedError.retryAfter
        }
      },
      headers
    };
  }

  /**
   * Detect error type from various error sources
   */
  private detectErrorType(error: any): ErrorType {
    if (!error) return ErrorType.INTERNAL_SERVER_ERROR;

    const message = (error.message || error.toString()).toLowerCase();
    const code = error.code || error.status;

    // Check error codes first
    if (code === 'permission-denied' || code === 403) return ErrorType.AUTHORIZATION_ERROR;
    if (code === 'unauthenticated' || code === 401) return ErrorType.AUTHENTICATION_ERROR;
    if (code === 'not-found' || code === 404) return ErrorType.NOT_FOUND_ERROR;
    if (code === 'invalid-argument' || code === 400) return ErrorType.VALIDATION_ERROR;
    if (code === 'resource-exhausted' || code === 429) return ErrorType.RATE_LIMIT_ERROR;
    if (code === 'deadline-exceeded' || message.includes('timeout')) return ErrorType.TIMEOUT_ERROR;

    // Check error messages
    if (message.includes('rate limit')) return ErrorType.RATE_LIMIT_ERROR;
    if (message.includes('validation') || message.includes('invalid')) return ErrorType.VALIDATION_ERROR;
    if (message.includes('auth') || message.includes('permission')) return ErrorType.AUTHORIZATION_ERROR;
    if (message.includes('not found')) return ErrorType.NOT_FOUND_ERROR;
    if (message.includes('network') || message.includes('connection')) return ErrorType.NETWORK_ERROR;
    if (message.includes('timeout') || message.includes('deadline')) return ErrorType.TIMEOUT_ERROR;
    if (message.includes('database') || message.includes('firestore')) return ErrorType.DATABASE_ERROR;
    if (message.includes('gemini') || message.includes('ai') || message.includes('generation')) return ErrorType.AI_SERVICE_ERROR;
    if (message.includes('config') || message.includes('environment')) return ErrorType.CONFIGURATION_ERROR;
    if (message.includes('maintenance')) return ErrorType.MAINTENANCE_ERROR;

    // Check for Firebase-specific errors
    if (error.code && error.code.startsWith('functions/')) {
      if (error.code.includes('unauthenticated')) return ErrorType.AUTHENTICATION_ERROR;
      if (error.code.includes('permission-denied')) return ErrorType.AUTHORIZATION_ERROR;
      if (error.code.includes('invalid-argument')) return ErrorType.VALIDATION_ERROR;
      if (error.code.includes('resource-exhausted')) return ErrorType.RESOURCE_EXHAUSTED_ERROR;
      if (error.code.includes('deadline-exceeded')) return ErrorType.TIMEOUT_ERROR;
    }

    // Default to internal server error
    return ErrorType.INTERNAL_SERVER_ERROR;
  }

  /**
   * Extract meaningful error message
   */
  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.error && error.error.message) return error.error.message;
    if (error.details) return JSON.stringify(error.details);
    return 'Unknown error occurred';
  }

  /**
   * Sanitize error details to remove sensitive information
   */
  private sanitizeErrorDetails(error: any): any {
    if (!error) return undefined;

    const sensitiveKeys = [
      'password', 'token', 'apikey', 'secret', 'authorization',
      'cookie', 'session', 'private', 'key', 'credential'
    ];

    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') {
        // Remove potential sensitive patterns
        return obj.replace(/([a-zA-Z0-9+/]{20,})/g, '[REDACTED]');
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }

      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const keyLower = key.toLowerCase();
          if (sensitiveKeys.some(sensitive => keyLower.includes(sensitive))) {
            sanitized[key] = '[REDACTED]';
          } else {
            sanitized[key] = sanitize(value);
          }
        }
        return sanitized;
      }

      return obj;
    };

    return sanitize({
      type: error.constructor?.name,
      code: error.code,
      stack: error.stack ? '[REDACTED]' : undefined,
      details: error.details
    });
  }

  /**
   * Calculate retry delay for retryable errors
   */
  private calculateRetryAfter(errorType: ErrorType): number {
    switch (errorType) {
      case ErrorType.RATE_LIMIT_ERROR:
        return 60 * 1000; // 1 minute
      case ErrorType.EXTERNAL_SERVICE_ERROR:
      case ErrorType.DATABASE_ERROR:
      case ErrorType.AI_SERVICE_ERROR:
        return 30 * 1000; // 30 seconds
      case ErrorType.NETWORK_ERROR:
        return 15 * 1000; // 15 seconds
      case ErrorType.TIMEOUT_ERROR:
        return 5 * 1000; // 5 seconds
      case ErrorType.RESOURCE_EXHAUSTED_ERROR:
        return 5 * 60 * 1000; // 5 minutes
      case ErrorType.MAINTENANCE_ERROR:
        return 15 * 60 * 1000; // 15 minutes
      default:
        return 10 * 1000; // 10 seconds default
    }
  }

  /**
   * Map HTTP status codes to Firebase error codes
   */
  private mapToFirebaseErrorCode(httpStatus: number): functions.https.FunctionsErrorCode {
    switch (httpStatus) {
      case 400: return 'invalid-argument';
      case 401: return 'unauthenticated';
      case 403: return 'permission-denied';
      case 404: return 'not-found';
      case 429: return 'resource-exhausted';
      case 500: return 'internal';
      case 503: return 'unavailable';
      case 504: return 'deadline-exceeded';
      default: return 'internal';
    }
  }

  /**
   * Log the standardized error
   */
  private async logStandardizedError(
    standardizedError: StandardizedError,
    originalError: any,
    logLevel: LogLevel
  ): Promise<void> {
    await log({
      level: logLevel,
      operation: `error.${standardizedError.code.toLowerCase()}`,
      correlationId: standardizedError.correlationId,
      userId: this.context.userId,
      details: {
        errorCode: standardizedError.code,
        httpStatus: ERROR_MAPPINGS[standardizedError.code].httpStatus,
        userFriendlyMessage: standardizedError.userFriendlyMessage,
        originalMessage: standardizedError.message,
        endpoint: this.context.endpoint,
        ipAddress: this.context.ipAddress,
        userAgent: this.context.userAgent,
        sanitizedDetails: standardizedError.details,
        retryAfter: standardizedError.retryAfter
      }
    });
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create error handler with context
 */
export function createErrorHandler(context: ErrorContext): ErrorHandler {
  return new ErrorHandler(context);
}

/**
 * Quick error handling for Firebase Functions
 */
export async function handleFirebaseError(
  error: any,
  operation: string,
  context?: Partial<ErrorContext>
): Promise<never> {
  const errorHandler = createErrorHandler({
    operation,
    ...context
  });
  
  const standardizedError = await errorHandler.createStandardizedError(error);
  throw errorHandler.toFirebaseError(standardizedError);
}

/**
 * Error handling middleware for HTTP functions
 */
export function errorHandlingMiddleware(operation: string) {
  return async (req: any, res: any, next: any) => {
    try {
      await next();
    } catch (error) {
      const errorHandler = createErrorHandler({
        operation,
        endpoint: req.originalUrl || req.url,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: req.correlationId
      });
      
      const standardizedError = await errorHandler.createStandardizedError(error);
      const response = errorHandler.toHttpResponse(standardizedError);
      
      Object.entries(response.headers).forEach(([key, value]) => {
        res.set(key, value);
      });
      
      res.status(response.status).json(response.body);
    }
  };
}

/**
 * Wrap Firebase Cloud Function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  operation: string,
  handler: T
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      await handleFirebaseError(error, operation);
    }
  }) as T;
}

// ============================================
// Enhanced Recovery Strategies (Phase 2)
// ============================================

export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  CIRCUIT_BREAK = 'circuit_break',
  GRACEFUL_DEGRADATION = 'graceful_degradation',
  FAIL_FAST = 'fail_fast'
}

interface RecoveryOptions {
  strategy: RecoveryStrategy;
  maxRetries?: number;
  retryDelayMs?: number;
  fallbackValue?: any;
  fallbackFunction?: () => Promise<any>;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTime?: number;
}

// Circuit breaker state management
const circuitBreakers = new Map<string, {
  failures: number;
  lastFailure: Date;
  isOpen: boolean;
  successCount: number;
  halfOpenAttempts: number;
}>();

/**
 * Enhanced error handler with recovery strategies
 */
export class EnhancedErrorHandler extends ErrorHandler {
  private recoveryOptions?: RecoveryOptions;
  
  constructor(context: ErrorContext, recoveryOptions?: RecoveryOptions) {
    super(context);
    this.recoveryOptions = recoveryOptions;
  }
  
  /**
   * Handle error with recovery strategy
   */
  async handleWithRecovery(
    error: any,
    operation: () => Promise<any>
  ): Promise<any> {
    if (!this.recoveryOptions) {
      throw error;
    }
    
    switch (this.recoveryOptions.strategy) {
      case RecoveryStrategy.RETRY:
        return this.retryWithBackoff(operation, error);
      
      case RecoveryStrategy.FALLBACK:
        return this.fallback(error);
      
      case RecoveryStrategy.CIRCUIT_BREAK:
        return this.circuitBreak(operation, error);
      
      case RecoveryStrategy.GRACEFUL_DEGRADATION:
        return this.gracefulDegrade(error);
      
      case RecoveryStrategy.FAIL_FAST:
      default:
        throw error;
    }
  }
  
  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff(
    operation: () => Promise<any>,
    originalError: any
  ): Promise<any> {
    const maxRetries = this.recoveryOptions?.maxRetries || 3;
    const baseDelay = this.recoveryOptions?.retryDelayMs || 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          await log({
            level: LogLevel.INFO,
            operation: 'error.retry',
            correlationId: this.context.correlationId,
            details: { attempt, maxRetries, delay }
          });
        }
        
        return await operation();
        
      } catch (error) {
        if (attempt === maxRetries) {
          await log({
            level: LogLevel.ERROR,
            operation: 'error.retry.exhausted',
            correlationId: this.context.correlationId,
            details: { attempts: maxRetries, error: error instanceof Error ? error.message : String(error) }
          });
          throw originalError;
        }
      }
    }
  }
  
  /**
   * Fallback to alternative value or function
   */
  private async fallback(error: any): Promise<any> {
    if (this.recoveryOptions?.fallbackFunction) {
      try {
        const result = await this.recoveryOptions.fallbackFunction();
        
        await log({
          level: LogLevel.WARN,
          operation: 'error.fallback.success',
          correlationId: this.context.correlationId,
          details: { originalError: error instanceof Error ? error.message : String(error) }
        });
        
        return result;
      } catch (fallbackError) {
        await log({
          level: LogLevel.ERROR,
          operation: 'error.fallback.failed',
          correlationId: this.context.correlationId,
          details: { 
            originalError: error instanceof Error ? error.message : String(error),
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          }
        });
        throw error;
      }
    }
    
    return this.recoveryOptions?.fallbackValue;
  }
  
  /**
   * Circuit breaker pattern implementation
   */
  private async circuitBreak(
    operation: () => Promise<any>,
    error: any
  ): Promise<any> {
    const operationName = this.context.operation;
    const threshold = this.recoveryOptions?.circuitBreakerThreshold || 5;
    const resetTime = this.recoveryOptions?.circuitBreakerResetTime || 60000;
    
    let breaker = circuitBreakers.get(operationName);
    
    if (!breaker) {
      breaker = {
        failures: 0,
        lastFailure: new Date(),
        isOpen: false,
        successCount: 0,
        halfOpenAttempts: 0
      };
      circuitBreakers.set(operationName, breaker);
    }
    
    // Check if circuit should be reset
    const timeSinceLastFailure = Date.now() - breaker.lastFailure.getTime();
    
    // Circuit is open
    if (breaker.isOpen) {
      if (timeSinceLastFailure > resetTime) {
        // Try half-open state
        breaker.halfOpenAttempts++;
        
        try {
          const result = await operation();
          
          // Success in half-open state - close circuit
          breaker.isOpen = false;
          breaker.failures = 0;
          breaker.successCount = 1;
          breaker.halfOpenAttempts = 0;
          
          await log({
            level: LogLevel.INFO,
            operation: 'circuit_breaker.closed',
            correlationId: this.context.correlationId,
            details: { operationName }
          });
          
          return result;
          
        } catch (halfOpenError) {
          // Failed in half-open state - keep circuit open
          breaker.lastFailure = new Date();
          
          if (breaker.halfOpenAttempts >= 3) {
            // Reset half-open attempts after 3 failures
            breaker.halfOpenAttempts = 0;
          }
          
          throw new Error(`Circuit breaker open for ${operationName}`);
        }
      } else {
        // Circuit is still open
        throw new Error(`Circuit breaker open for ${operationName} (resets in ${Math.ceil((resetTime - timeSinceLastFailure) / 1000)}s)`);
      }
    }
    
    // Circuit is closed - execute operation
    try {
      const result = await operation();
      
      // Success - reset failure count
      breaker.successCount++;
      if (breaker.successCount > 5) {
        breaker.failures = Math.max(0, breaker.failures - 1);
      }
      
      return result;
      
    } catch (operationError) {
      // Failure - increment failure count
      breaker.failures++;
      breaker.lastFailure = new Date();
      breaker.successCount = 0;
      
      // Open circuit if threshold reached
      if (breaker.failures >= threshold) {
        breaker.isOpen = true;
        
        await log({
          level: LogLevel.ERROR,
          operation: 'circuit_breaker.opened',
          correlationId: this.context.correlationId,
          details: { 
            operationName,
            failures: breaker.failures,
            threshold
          }
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Graceful degradation
   */
  private async gracefulDegrade(error: any): Promise<any> {
    await log({
      level: LogLevel.WARN,
      operation: 'error.graceful_degradation',
      correlationId: this.context.correlationId,
      details: { 
        originalError: error instanceof Error ? error.message : String(error)
      }
    });
    
    if (this.recoveryOptions?.fallbackValue !== undefined) {
      return {
        data: this.recoveryOptions.fallbackValue,
        degraded: true,
        reason: error instanceof Error ? error.message : 'Service degraded',
        timestamp: new Date().toISOString()
      };
    }
    
    return {
      success: false,
      degraded: true,
      message: 'Service temporarily degraded',
      correlationId: this.context.correlationId,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Create enhanced error handler with recovery options
 */
export function createEnhancedErrorHandler(
  context: ErrorContext,
  recoveryOptions?: RecoveryOptions
): EnhancedErrorHandler {
  return new EnhancedErrorHandler(context, recoveryOptions);
}

/**
 * Wrap function with enhanced error handling and recovery
 */
export function withEnhancedErrorHandling<T extends (...args: any[]) => Promise<any>>(
  operation: string,
  handler: T,
  recoveryOptions?: RecoveryOptions
): T {
  return (async (...args: any[]) => {
    const errorHandler = createEnhancedErrorHandler(
      { operation },
      recoveryOptions
    );
    
    try {
      return await handler(...args);
    } catch (error) {
      return errorHandler.handleWithRecovery(
        error,
        () => handler(...args)
      );
    }
  }) as T;
}

/**
 * Get circuit breaker metrics
 */
export function getCircuitBreakerMetrics(): Record<string, any> {
  const metrics: Record<string, any> = {};
  
  circuitBreakers.forEach((breaker, operation) => {
    metrics[operation] = {
      failures: breaker.failures,
      isOpen: breaker.isOpen,
      lastFailure: breaker.lastFailure.toISOString(),
      successCount: breaker.successCount,
      halfOpenAttempts: breaker.halfOpenAttempts
    };
  });
  
  return metrics;
}

/**
 * Reset circuit breaker for specific operation
 */
export function resetCircuitBreaker(operation: string): void {
  circuitBreakers.delete(operation);
  log({
    level: LogLevel.INFO,
    operation: 'circuit_breaker.manual_reset',
    details: { operation }
  });
}