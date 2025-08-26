import * as functions from 'firebase-functions';
import { 
  EnhancedRateLimiter, 
  extractIPAddress, 
  RateLimitHeaders 
} from './enhancedRateLimit';
import { 
  ErrorHandler, 
  createErrorHandler, 
  ErrorType, 
  StandardizedError 
} from './errorHandler';
import { 
  RequestContextManager, 
  EnhancedPerformanceMonitor, 
  PayloadLogger,
  RequestContext 
} from './enhancedMonitoring';
import { requireAuth } from './auth';

// ============================================
// Middleware Configuration
// ============================================

export interface MiddlewareConfig {
  /** Operation name for logging and metrics */
  operation: string;
  
  /** Rate limiting configuration */
  rateLimit?: {
    endpoint: string;
    enabled: boolean;
  };
  
  /** Authentication requirements */
  auth?: {
    required: boolean;
    adminRequired?: boolean;
    allowAnonymous?: boolean;
  };
  
  /** Monitoring configuration */
  monitoring?: {
    logPayload: boolean;
    trackPerformance: boolean;
    maxPayloadSize?: number;
  };
  
  /** Error handling configuration */
  errorHandling?: {
    sanitizeErrors: boolean;
    includeStackTrace: boolean;
  };
}

export interface MiddlewareResult {
  context: RequestContext;
  monitor: EnhancedPerformanceMonitor;
  rateLimitHeaders: RateLimitHeaders;
}

// ============================================
// Unified Request Middleware
// ============================================

export class UnifiedRequestMiddleware {
  private config: MiddlewareConfig;
  private rateLimiter?: EnhancedRateLimiter;
  
  constructor(config: MiddlewareConfig) {
    this.config = {
      monitoring: {
        logPayload: false,
        trackPerformance: true,
        maxPayloadSize: 10 * 1024, // 10KB
        ...config.monitoring
      },
      errorHandling: {
        sanitizeErrors: true,
        includeStackTrace: false,
        ...config.errorHandling
      },
      ...config
    };
    
    // Initialize rate limiter if enabled
    if (this.config.rateLimit?.enabled) {
      this.rateLimiter = new EnhancedRateLimiter(this.config.rateLimit.endpoint);
    }
  }

  /**
   * Firebase Cloud Function middleware
   */
  async processFirebaseRequest(
    data: any,
    context: functions.https.CallableContext
  ): Promise<MiddlewareResult> {
    // Create request context
    const requestContext = RequestContextManager.create(this.config.operation, {
      userId: context.auth?.uid,
      correlationId: data?._correlationId,
      metadata: {
        functionType: 'callable',
        rawRequest: context.rawRequest ? {
          method: context.rawRequest.method,
          url: context.rawRequest.url,
          userAgent: context.rawRequest.headers['user-agent']
        } : undefined
      }
    });

    // Initialize performance monitor
    const monitor = new EnhancedPerformanceMonitor(requestContext);

    try {
      // Authentication check
      if (this.config.auth?.required) {
        monitor.checkpoint('auth.start');
        await this.handleAuthentication(context);
        monitor.checkpoint('auth.complete');
      }

      // Rate limiting check
      let rateLimitHeaders: RateLimitHeaders = {
        'X-RateLimit-Limit': '0',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '0'
      };

      if (this.rateLimiter) {
        monitor.checkpoint('rateLimit.start');
        const rateLimitResult = await this.rateLimiter.enforceRateLimit(
          context.auth?.uid,
          context.rawRequest?.ip
        );
        rateLimitHeaders = rateLimitResult.headers;
        
        if (!rateLimitResult.allowed) {
          throw new Error(`RATE_LIMIT_EXCEEDED: ${rateLimitResult.error}`);
        }
        monitor.checkpoint('rateLimit.complete');
      }

      // Log request payload if enabled
      if (this.config.monitoring?.logPayload && data) {
        monitor.checkpoint('payload.log.start');
        const payloadSize = JSON.stringify(data).length;
        monitor.trackRequestSize(payloadSize);
        
        if (payloadSize <= (this.config.monitoring.maxPayloadSize || 10240)) {
          await PayloadLogger.logRequest(
            requestContext.correlationId,
            'POST',
            this.config.operation,
            context.rawRequest?.headers || {},
            data
          );
        }
        monitor.checkpoint('payload.log.complete');
      }

      return {
        context: requestContext,
        monitor,
        rateLimitHeaders
      };

    } catch (error) {
      // Handle errors through unified error handling
      await this.handleError(error, requestContext, monitor);
      throw error; // Re-throw to be caught by the function wrapper
    }
  }

  /**
   * HTTP Request middleware
   */
  async processHttpRequest(
    req: any,
    res: any
  ): Promise<MiddlewareResult> {
    // Extract request information
    const ipAddress = extractIPAddress(req);
    const userId = req.user?.uid || req.auth?.uid;
    
    // Create request context
    const requestContext = RequestContextManager.create(this.config.operation, {
      userId,
      ipAddress,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl || req.url,
      correlationId: req.headers['x-correlation-id'],
      metadata: {
        functionType: 'http',
        method: req.method,
        url: req.url,
        headers: req.headers
      }
    });

    // Set correlation ID in response headers
    res.set('X-Correlation-ID', requestContext.correlationId);

    // Initialize performance monitor
    const monitor = new EnhancedPerformanceMonitor(requestContext);

    try {
      // Authentication check for HTTP requests (if implemented)
      if (this.config.auth?.required && req.auth) {
        monitor.checkpoint('auth.start');
        if (!req.auth.uid) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }
        if (this.config.auth.adminRequired && !req.auth.token?.admin) {
          throw new Error('ADMIN_ACCESS_REQUIRED');
        }
        monitor.checkpoint('auth.complete');
      }

      // Rate limiting check
      let rateLimitHeaders: RateLimitHeaders = {
        'X-RateLimit-Limit': '0',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '0'
      };

      if (this.rateLimiter) {
        monitor.checkpoint('rateLimit.start');
        const rateLimitResult = await this.rateLimiter.enforceRateLimit(
          userId,
          ipAddress
        );
        rateLimitHeaders = rateLimitResult.headers;
        
        // Add rate limit headers to response
        Object.entries(rateLimitHeaders).forEach(([key, value]) => {
          res.set(key, value);
        });
        
        if (!rateLimitResult.allowed) {
          const error = new Error(`RATE_LIMIT_EXCEEDED: ${rateLimitResult.error}`);
          await this.handleError(error, requestContext, monitor);
          
          return res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: rateLimitResult.error,
              correlationId: requestContext.correlationId,
              retryAfter: rateLimitHeaders['X-RateLimit-RetryAfter']
            }
          });
        }
        monitor.checkpoint('rateLimit.complete');
      }

      // Log request payload if enabled
      if (this.config.monitoring?.logPayload && req.body) {
        monitor.checkpoint('payload.log.start');
        const payloadSize = JSON.stringify(req.body).length;
        monitor.trackRequestSize(payloadSize);
        
        if (payloadSize <= (this.config.monitoring.maxPayloadSize || 10240)) {
          await PayloadLogger.logRequest(
            requestContext.correlationId,
            req.method,
            req.url,
            req.headers,
            req.body
          );
        }
        monitor.checkpoint('payload.log.complete');
      }

      return {
        context: requestContext,
        monitor,
        rateLimitHeaders
      };

    } catch (error) {
      // Handle errors through unified error handling
      await this.handleError(error, requestContext, monitor);
      throw error; // Re-throw to be caught by the calling function
    }
  }

  /**
   * Handle authentication
   */
  private async handleAuthentication(context: functions.https.CallableContext): Promise<void> {
    try {
      requireAuth(context);
      
      if (this.config.auth?.adminRequired) {
        if (!context.auth?.token?.admin) {
          throw new Error('ADMIN_ACCESS_REQUIRED');
        }
      }
    } catch (error) {
      throw new Error(`AUTHENTICATION_ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle errors through unified error handling
   */
  private async handleError(
    error: any,
    requestContext: RequestContext,
    monitor: EnhancedPerformanceMonitor
  ): Promise<StandardizedError> {
    const errorHandler = createErrorHandler({
      operation: this.config.operation,
      userId: requestContext.userId,
      ipAddress: requestContext.ipAddress,
      endpoint: requestContext.endpoint,
      correlationId: requestContext.correlationId
    });

    const standardizedError = await errorHandler.createStandardizedError(error);
    
    // End monitoring with error
    await monitor.endEnhanced(false, error);
    
    return standardizedError;
  }

  /**
   * Complete request processing
   */
  async completeRequest(
    monitor: EnhancedPerformanceMonitor,
    response?: any,
    success: boolean = true
  ): Promise<void> {
    // Track response size if provided
    if (response) {
      const responseSize = JSON.stringify(response).length;
      monitor.trackResponseSize(responseSize);
      
      // Log response payload if enabled
      if (this.config.monitoring?.logPayload) {
        if (responseSize <= (this.config.monitoring.maxPayloadSize || 10240)) {
          await PayloadLogger.logResponse(
            monitor['context'].correlationId,
            success ? 200 : 500,
            {},
            response
          );
        }
      }
    }

    // End performance monitoring
    await monitor.endEnhanced(success);
  }
}

// ============================================
// Convenience Wrapper Functions
// ============================================

/**
 * Wrap Firebase Cloud Function with unified middleware
 */
export function withUnifiedMiddleware<T extends (...args: any[]) => Promise<any>>(
  config: MiddlewareConfig,
  handler: (data: any, context: functions.https.CallableContext, middleware: MiddlewareResult) => Promise<any>
): functions.CloudFunction<any> {
  const middleware = new UnifiedRequestMiddleware(config);
  
  return functions
    .runWith({
      timeoutSeconds: 540,
      memory: '2GB'
    })
    .https.onCall(async (data, context) => {
      let middlewareResult: MiddlewareResult | undefined;
      
      try {
        // Process request through middleware
        middlewareResult = await middleware.processFirebaseRequest(data, context);
        
        // Execute the main handler
        const result = await handler(data, context, middlewareResult);
        
        // Complete request processing
        await middleware.completeRequest(middlewareResult.monitor, result, true);
        
        return result;
        
      } catch (error) {
        // Handle error through unified error handling
        if (middlewareResult) {
          const standardizedError = await middleware['handleError'](
            error, 
            middlewareResult.context, 
            middlewareResult.monitor
          );
          
          // Create Firebase error response
          const errorHandler = createErrorHandler({
            operation: config.operation,
            correlationId: middlewareResult.context.correlationId
          });
          
          throw errorHandler.toFirebaseError(standardizedError);
        } else {
          // Fallback error handling
          throw new functions.https.HttpsError(
            'internal',
            `${config.operation} failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    });
}

/**
 * Create middleware for HTTP functions
 */
export function createHttpMiddleware(config: MiddlewareConfig) {
  const middleware = new UnifiedRequestMiddleware(config);
  
  return {
    process: middleware.processHttpRequest.bind(middleware),
    complete: middleware.completeRequest.bind(middleware),
    handleError: middleware['handleError'].bind(middleware)
  };
}

/**
 * Express-style middleware factory
 */
export function expressMiddleware(config: MiddlewareConfig) {
  const middleware = new UnifiedRequestMiddleware(config);
  
  return async (req: any, res: any, next: any) => {
    try {
      const result = await middleware.processHttpRequest(req, res);
      
      // Add middleware result to request object
      req.middleware = result;
      
      // Override res.json to track response
      const originalJson = res.json.bind(res);
      res.json = function(body: any) {
        middleware.completeRequest(result.monitor, body, res.statusCode < 400);
        return originalJson(body);
      };
      
      next();
    } catch (error) {
      const errorHandler = createErrorHandler({
        operation: config.operation,
        endpoint: req.originalUrl || req.url,
        ipAddress: extractIPAddress(req)
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

// ============================================
// Pre-configured Middleware for Common Operations
// ============================================

export const aiGenerationMiddleware = (handler: any) => withUnifiedMiddleware({
  operation: 'ai.generation',
  rateLimit: {
    endpoint: 'ai.generation',
    enabled: true
  },
  auth: {
    required: true,
    adminRequired: false
  },
  monitoring: {
    logPayload: false, // Don't log AI generation payloads due to size
    trackPerformance: true
  },
  errorHandling: {
    sanitizeErrors: true,
    includeStackTrace: false
  }
}, handler);

export const adminOperationMiddleware = (handler: any) => withUnifiedMiddleware({
  operation: 'admin.operations',
  rateLimit: {
    endpoint: 'admin.operations',
    enabled: true
  },
  auth: {
    required: true,
    adminRequired: true
  },
  monitoring: {
    logPayload: true,
    trackPerformance: true,
    maxPayloadSize: 5 * 1024 // 5KB for admin operations
  },
  errorHandling: {
    sanitizeErrors: true,
    includeStackTrace: false
  }
}, handler);

export const generalApiMiddleware = (handler: any) => withUnifiedMiddleware({
  operation: 'api.general',
  rateLimit: {
    endpoint: 'api.general',
    enabled: true
  },
  auth: {
    required: true,
    adminRequired: false
  },
  monitoring: {
    logPayload: false,
    trackPerformance: true
  },
  errorHandling: {
    sanitizeErrors: true,
    includeStackTrace: false
  }
}, handler);

export const authOperationMiddleware = (handler: any) => withUnifiedMiddleware({
  operation: 'auth.operations',
  rateLimit: {
    endpoint: 'auth.operations',
    enabled: true
  },
  auth: {
    required: false, // Auth operations handle their own auth
    adminRequired: false
  },
  monitoring: {
    logPayload: false, // Never log auth payloads
    trackPerformance: true
  },
  errorHandling: {
    sanitizeErrors: true,
    includeStackTrace: false
  }
}, handler);