import * as admin from 'firebase-admin';
import { logError, recordMetric } from './monitoring';

const db = admin.firestore();

// ============================================
// Configuration Types
// ============================================

export interface RateLimitConfig {
  /** Requests allowed per time window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Rate limiting strategy */
  strategy: 'sliding_window' | 'fixed_window';
  /** Whether to skip successful requests in counting */
  skipSuccessfulRequests?: boolean;
  /** Custom error message */
  message?: string;
}

export interface EndpointConfig {
  /** Per-user rate limits */
  perUser?: RateLimitConfig;
  /** Per-IP rate limits */
  perIP?: RateLimitConfig;
  /** Global rate limits */
  global?: RateLimitConfig;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'X-RateLimit-RetryAfter'?: string;
}

// ============================================
// Default Configurations
// ============================================

const DEFAULT_CONFIGS: Record<string, EndpointConfig> = {
  // AI Question Generation - More restrictive due to resource intensity
  'ai.generation': {
    perUser: {
      limit: 10,
      windowMs: 15 * 60 * 1000, // 15 minutes
      strategy: 'sliding_window',
      message: 'Too many question generation requests. Please try again in a few minutes.'
    },
    perIP: {
      limit: 25,
      windowMs: 15 * 60 * 1000, // 15 minutes
      strategy: 'sliding_window',
      message: 'IP address has exceeded question generation limits.'
    }
  },
  
  // Admin Operations - Moderate restrictions
  'admin.operations': {
    perUser: {
      limit: 100,
      windowMs: 60 * 1000, // 1 minute
      strategy: 'sliding_window'
    },
    perIP: {
      limit: 200,
      windowMs: 60 * 1000, // 1 minute
      strategy: 'sliding_window'
    }
  },
  
  // General API - Less restrictive
  'api.general': {
    perUser: {
      limit: 300,
      windowMs: 60 * 1000, // 1 minute
      strategy: 'sliding_window'
    },
    perIP: {
      limit: 1000,
      windowMs: 60 * 1000, // 1 minute
      strategy: 'sliding_window'
    }
  },
  
  // Authentication - Very restrictive to prevent brute force
  'auth.operations': {
    perUser: {
      limit: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      strategy: 'sliding_window',
      message: 'Too many authentication attempts. Please try again later.'
    },
    perIP: {
      limit: 20,
      windowMs: 15 * 60 * 1000, // 15 minutes
      strategy: 'sliding_window',
      message: 'IP address has been temporarily blocked due to excessive authentication attempts.'
    }
  }
};

// ============================================
// Enhanced Rate Limiting Implementation
// ============================================

export class EnhancedRateLimiter {
  private config: EndpointConfig;
  private endpoint: string;

  constructor(endpoint: string, customConfig?: EndpointConfig) {
    this.endpoint = endpoint;
    this.config = customConfig || DEFAULT_CONFIGS[endpoint] || DEFAULT_CONFIGS['api.general'];
  }

  /**
   * Check rate limits for a request
   */
  async checkRateLimit(
    identifier: string,
    type: 'user' | 'ip' | 'global',
    skipIncrement: boolean = false
  ): Promise<RateLimitResult> {
    const config = this.getConfigForType(type);
    if (!config) {
      return { allowed: true, remaining: Infinity, resetTime: 0 };
    }

    const key = this.getRateLimitKey(identifier, type);
    const now = Date.now();
    
    if (config.strategy === 'sliding_window') {
      return await this.checkSlidingWindow(key, config, now, skipIncrement);
    } else {
      return await this.checkFixedWindow(key, config, now, skipIncrement);
    }
  }

  /**
   * Enforce rate limits for user, IP, and global limits
   */
  async enforceRateLimit(
    userId?: string,
    ipAddress?: string,
    skipIncrement: boolean = false
  ): Promise<{
    allowed: boolean;
    headers: RateLimitHeaders;
    error?: string;
  }> {
    const checks: Array<{ type: string; result: RateLimitResult; config: RateLimitConfig }> = [];

    // Check user rate limit
    if (userId && this.config.perUser) {
      const result = await this.checkRateLimit(userId, 'user', skipIncrement);
      checks.push({ type: 'user', result, config: this.config.perUser });
    }

    // Check IP rate limit
    if (ipAddress && this.config.perIP) {
      const result = await this.checkRateLimit(ipAddress, 'ip', skipIncrement);
      checks.push({ type: 'ip', result, config: this.config.perIP });
    }

    // Check global rate limit
    if (this.config.global) {
      const result = await this.checkRateLimit('global', 'global', skipIncrement);
      checks.push({ type: 'global', result, config: this.config.global });
    }

    // Find the most restrictive limit that's been exceeded
    const failedCheck = checks.find(check => !check.result.allowed);
    
    if (failedCheck) {
      // Record rate limit violation metric
      await recordMetric({
        name: 'rate_limit_exceeded',
        value: 1,
        unit: 'count',
        tags: {
          endpoint: this.endpoint,
          type: failedCheck.type,
          userId: userId || 'anonymous',
          ipAddress: ipAddress || 'unknown'
        }
      });

      // Log the rate limit violation
      await logError('rate_limit.exceeded', new Error('Rate limit exceeded'), {
        endpoint: this.endpoint,
        type: failedCheck.type,
        userId,
        ipAddress,
        remaining: failedCheck.result.remaining,
        resetTime: failedCheck.result.resetTime
      });

      return {
        allowed: false,
        headers: this.generateHeaders(failedCheck.result, failedCheck.config),
        error: failedCheck.config.message || 'Rate limit exceeded. Please try again later.'
      };
    }

    // Use the most restrictive successful check for headers
    const mostRestrictive = checks.reduce((prev, current) => 
      current.result.remaining < prev.result.remaining ? current : prev
    );

    return {
      allowed: true,
      headers: this.generateHeaders(mostRestrictive.result, mostRestrictive.config)
    };
  }

  /**
   * Generate rate limit headers
   */
  private generateHeaders(result: RateLimitResult, config: RateLimitConfig): RateLimitHeaders {
    const headers: RateLimitHeaders = {
      'X-RateLimit-Limit': config.limit.toString(),
      'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
    };

    if (result.retryAfter) {
      headers['X-RateLimit-RetryAfter'] = Math.ceil(result.retryAfter / 1000).toString();
    }

    return headers;
  }

  /**
   * Sliding window rate limiting implementation
   */
  private async checkSlidingWindow(
    key: string,
    config: RateLimitConfig,
    now: number,
    skipIncrement: boolean
  ): Promise<RateLimitResult> {
    const windowStart = now - config.windowMs;
    const ref = db.collection('rate_limits').doc(key);
    
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const data = doc.exists ? (doc.data() as any) : { requests: [] as number[] };
      
      // Filter out requests outside the current window
      const validRequests = (data.requests || []).filter((timestamp: number) => timestamp >= windowStart);
      
      // Check if we're over the limit
      if (validRequests.length >= config.limit) {
        const oldestRequest = Math.min(...validRequests);
        const retryAfter = oldestRequest + config.windowMs - now;
        
        return {
          allowed: false,
          remaining: 0,
          resetTime: oldestRequest + config.windowMs,
          retryAfter: Math.max(0, retryAfter)
        };
      }

      // Add current request if not skipping
      if (!skipIncrement) {
        validRequests.push(now);
      }

      // Update the document
      transaction.set(ref, {
        requests: validRequests,
        lastUpdated: now
      });

      const remaining = config.limit - validRequests.length;
      const nextResetTime = validRequests.length > 0 ? 
        Math.min(...validRequests) + config.windowMs : 
        now + config.windowMs;

      return {
        allowed: true,
        remaining,
        resetTime: nextResetTime
      };
    });
  }

  /**
   * Fixed window rate limiting implementation
   */
  private async checkFixedWindow(
    key: string,
    config: RateLimitConfig,
    now: number,
    skipIncrement: boolean
  ): Promise<RateLimitResult> {
    const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
    const windowEnd = windowStart + config.windowMs;
    const windowKey = `${key}:${windowStart}`;
    
    const ref = db.collection('rate_limits').doc(windowKey);
    
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const data = doc.exists ? (doc.data() as any) : { count: 0 };
      
      const currentCount = data.count || 0;
      
      if (currentCount >= config.limit) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: windowEnd,
          retryAfter: windowEnd - now
        };
      }

      // Increment count if not skipping
      if (!skipIncrement) {
        transaction.set(ref, {
          count: currentCount + 1,
          windowStart,
          windowEnd,
          lastUpdated: now
        });
      }

      return {
        allowed: true,
        remaining: config.limit - currentCount - (skipIncrement ? 0 : 1),
        resetTime: windowEnd
      };
    });
  }

  private getConfigForType(type: 'user' | 'ip' | 'global'): RateLimitConfig | undefined {
    switch (type) {
      case 'user': return this.config.perUser;
      case 'ip': return this.config.perIP;
      case 'global': return this.config.global;
      default: return undefined;
    }
  }

  private getRateLimitKey(identifier: string, type: 'user' | 'ip' | 'global'): string {
    return `${this.endpoint}:${type}:${identifier}`;
  }
}

// ============================================
// Legacy Compatibility Function
// ============================================

/**
 * Legacy function for backward compatibility
 * Uses the enhanced rate limiter internally
 */
export async function enforcePerUserRateLimit(
  uid: string,
  op: string,
  limitPerMinute: number
): Promise<void> {
  const config: EndpointConfig = {
    perUser: {
      limit: limitPerMinute,
      windowMs: 60 * 1000,
      strategy: 'sliding_window'
    }
  };

  const limiter = new EnhancedRateLimiter(op, config);
  const result = await limiter.enforceRateLimit(uid);
  
  if (!result.allowed) {
    throw new Error('RATE_LIMIT_EXCEEDED');
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract IP address from request
 */
export function extractIPAddress(req: any): string {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * Create rate limiter for specific endpoint
 */
export function createRateLimiter(endpoint: string, customConfig?: EndpointConfig): EnhancedRateLimiter {
  return new EnhancedRateLimiter(endpoint, customConfig);
}

/**
 * Middleware function for Express-style frameworks
 */
export function rateLimitMiddleware(endpoint: string, customConfig?: EndpointConfig) {
  const limiter = new EnhancedRateLimiter(endpoint, customConfig);
  
  return async (req: any, res: any, next: any) => {
    try {
      const userId = req.user?.uid;
      const ipAddress = extractIPAddress(req);
      
      const result = await limiter.enforceRateLimit(userId, ipAddress);
      
      // Add rate limit headers
      Object.entries(result.headers).forEach(([key, value]) => {
        res.set(key, value);
      });
      
      if (!result.allowed) {
        return res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: result.error,
            retryAfter: result.headers['X-RateLimit-RetryAfter']
          }
        });
      }
      
      next();
    } catch (error) {
      await logError('rate_limit.middleware_error', error, { endpoint });
      next(error);
    }
  };
}