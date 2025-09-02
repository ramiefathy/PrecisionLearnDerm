/**
 * Timeout Wrapper Utility
 * Provides robust timeout handling for promise-based operations
 * Compatible with deprecated @google/generative-ai SDK
 * Prepared for future migration to Vertex AI SDK
 */

import * as logger from 'firebase-functions/logger';

/**
 * Custom error class for timeout operations
 */
export class TimeoutError extends Error {
  constructor(
    message: string, 
    public readonly timeoutMs: number,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Wraps a promise with a timeout
 * Uses Promise.race pattern for compatibility with deprecated SDK
 */
export function withTimeout<T>(
  promise: Promise<T>, 
  ms: number, 
  operation?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    let settled = false;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, timeoutReject) => {
      timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          const error = new TimeoutError(
            `${operation || 'Operation'} timed out after ${ms}ms`, 
            ms,
            operation
          );
          logger.error('[TIMEOUT]', {
            operation,
            timeoutMs: ms,
            error: error.message
          });
          timeoutReject(error);
        }
      }, ms);
    });

    // Race between actual promise and timeout
    Promise.race([promise, timeoutPromise])
      .then(value => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve(value);
        }
      })
      .catch(error => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}

/**
 * Creates a cascading timeout handler for nested operations
 * Ensures proper buffer between layers
 */
export function createCascadingTimeout(
  parentTimeoutMs: number,
  bufferMs: number = 20000
): number {
  const childTimeout = parentTimeoutMs - bufferMs;
  
  if (childTimeout <= 0) {
    logger.warn('[TIMEOUT_CASCADE] Insufficient timeout buffer', {
      parentTimeout: parentTimeoutMs,
      buffer: bufferMs,
      calculated: childTimeout
    });
    // Return at least 10 seconds for child operation
    return Math.max(10000, parentTimeoutMs / 2);
  }
  
  return childTimeout;
}

/**
 * AbortController pattern for future Vertex AI migration
 * Provides cancellable operations with cleanup
 */
export function createAbortableTimeout(ms: number): {
  signal: AbortSignal;
  clear: () => void;
  abort: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    logger.info('[ABORT_TIMEOUT] Operation aborted after timeout', { ms });
  }, ms);
  
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeout);
    },
    abort: () => {
      clearTimeout(timeout);
      controller.abort();
    }
  };
}

/**
 * Retry wrapper with exponential backoff
 * Handles transient failures and timeouts
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    timeoutMs?: number;
    operationName?: string;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    timeoutMs,
    operationName = 'Operation',
    shouldRetry = (error) => {
      // Retry on timeout and specific errors
      if (error instanceof TimeoutError) return true;
      if (error.code === 'ECONNRESET') return true;
      if (error.code === 'ETIMEDOUT') return true;
      if (error.status === 429) return true; // Rate limit
      if (error.status === 503) return true; // Service unavailable
      if (error.status >= 500 && error.status < 600) return true; // Generic server errors
      return false;
    }
  } = options;

  let lastError: any;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[RETRY] Attempt ${attempt + 1}/${maxRetries + 1} for ${operationName}`);
      
      // Wrap with timeout if specified
      if (timeoutMs) {
        return await withTimeout(operation(), timeoutMs, operationName);
      }
      
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < maxRetries && shouldRetry(error)) {
        logger.warn(`[RETRY] ${operationName} failed, retrying after ${delayMs}ms`, {
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Exponential backoff
        delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
      } else {
        // No more retries or error is not retryable
        break;
      }
    }
  }

  logger.error(`[RETRY] ${operationName} failed after ${maxRetries + 1} attempts`, {
    error: lastError instanceof Error ? lastError.message : String(lastError)
  });
  
  throw lastError;
}

/**
 * Monitors operation duration and logs performance metrics
 */
export async function withPerformanceMonitoring<T>(
  operation: () => Promise<T>,
  operationName: string,
  warnThresholdMs: number = 5000
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    if (duration > warnThresholdMs) {
      logger.warn(`[PERFORMANCE] ${operationName} took ${duration}ms (threshold: ${warnThresholdMs}ms)`);
    } else {
      logger.info(`[PERFORMANCE] ${operationName} completed in ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[PERFORMANCE] ${operationName} failed after ${duration}ms`, {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}