/**
 * Concurrent Executor with Race Condition Protection
 * 
 * Provides safe concurrent execution with:
 * - Individual operation timeouts
 * - Error isolation between operations
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Resource pooling and rate limiting
 */

import { logInfo, logError } from './logging';

export interface ConcurrentOperation<T> {
  name: string;
  operation: () => Promise<T>;
  timeout?: number;
  retries?: number;
  required?: boolean;
  fallback?: () => T;
}

export interface ConcurrentResult<T> {
  name: string;
  status: 'success' | 'failed' | 'timeout' | 'fallback';
  result?: T;
  error?: Error;
  duration: number;
  retryCount: number;
}

export interface ConcurrentExecutorOptions {
  maxConcurrency?: number;
  defaultTimeout?: number;
  defaultRetries?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTime?: number;
  enableMetrics?: boolean;
}

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

// Global circuit breaker states per operation type
const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Execute operations concurrently with proper error isolation
 */
export async function executeConcurrently<T>(
  operations: ConcurrentOperation<T>[],
  options: ConcurrentExecutorOptions = {}
): Promise<ConcurrentResult<T>[]> {
  const {
    maxConcurrency = 10,
    defaultTimeout = 30000,
    defaultRetries = 2,
    circuitBreakerThreshold = 5,
    circuitBreakerResetTime = 60000,
    enableMetrics = true
  } = options;

  const startTime = Date.now();

  // Check circuit breakers
  const allowedOperations = operations.filter(op => {
    const breaker = circuitBreakers.get(op.name);
    if (breaker?.isOpen) {
      const timeSinceFailure = Date.now() - breaker.lastFailureTime;
      if (timeSinceFailure < circuitBreakerResetTime) {
        logInfo(`Circuit breaker OPEN for ${op.name}, skipping operation`, { level: 'warning' });
        return false;
      } else {
        // Reset circuit breaker
        breaker.isOpen = false;
        breaker.failures = 0;
      }
    }
    return true;
  });

  // Execute operations with concurrency control
  const results: ConcurrentResult<T>[] = [];
  const executing: Promise<void>[] = [];

  for (const operation of allowedOperations) {
    const promise = executeWithRetry(operation, {
      timeout: operation.timeout || defaultTimeout,
      retries: operation.retries || defaultRetries
    }).then(result => {
      results.push(result);
      updateCircuitBreaker(operation.name, result.status === 'success', circuitBreakerThreshold);
    });

    executing.push(promise);

    // Control concurrency
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      executing.splice(0, executing.length - maxConcurrency + 1);
    }
  }

  // Wait for all remaining operations
  await Promise.allSettled(executing);

  // Add results for skipped operations
  for (const operation of operations) {
    if (!allowedOperations.includes(operation)) {
      results.push({
        name: operation.name,
        status: 'failed',
        error: new Error('Circuit breaker open'),
        duration: 0,
        retryCount: 0
      });
    }
  }

  if (enableMetrics) {
    logMetrics(results, Date.now() - startTime);
  }

  return results;
}

/**
 * Execute a single operation with retry logic
 */
async function executeWithRetry<T>(
  operation: ConcurrentOperation<T>,
  config: { timeout: number; retries: number }
): Promise<ConcurrentResult<T>> {
  const startTime = Date.now();
  let lastError: Error | undefined;
  let retryCount = 0;

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      // Add exponential backoff for retries
      if (attempt > 0) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await sleep(backoffMs);
        retryCount++;
      }

      // Execute with timeout
      const result = await withTimeout(
        operation.operation(),
        config.timeout,
        `Operation ${operation.name} timed out after ${config.timeout}ms`
      );

      return {
        name: operation.name,
        status: 'success',
        result,
        duration: Date.now() - startTime,
        retryCount
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      logInfo(`Operation ${operation.name} failed (attempt ${attempt + 1}/${config.retries + 1})`, {
        level: 'warning',
        error: lastError.message
      });

      // If this was the last attempt, try fallback
      if (attempt === config.retries) {
        if (operation.fallback) {
          try {
            const fallbackResult = operation.fallback();
            return {
              name: operation.name,
              status: 'fallback',
              result: fallbackResult,
              duration: Date.now() - startTime,
              retryCount
            };
          } catch (fallbackError) {
            lastError = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
          }
        }
      }
    }
  }

  // All attempts failed
  return {
    name: operation.name,
    status: 'failed',
    error: lastError,
    duration: Date.now() - startTime,
    retryCount
  };
}

/**
 * Execute operation with timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Update circuit breaker state
 */
function updateCircuitBreaker(operationName: string, success: boolean, threshold: number = 5): void {
  let breaker = circuitBreakers.get(operationName);
  
  if (!breaker) {
    breaker = {
      failures: 0,
      lastFailureTime: 0,
      isOpen: false
    };
    circuitBreakers.set(operationName, breaker);
  }

  if (success) {
    // Reset on success
    breaker.failures = 0;
  } else {
    // Increment failures
    breaker.failures++;
    breaker.lastFailureTime = Date.now();
    
    // Open circuit if threshold reached
    if (breaker.failures >= threshold) {
      breaker.isOpen = true;
      logError(`circuit_breaker.opened`, { 
        operationName, 
        failures: breaker.failures,
        threshold 
      });
    }
  }
}

/**
 * Log execution metrics
 */
function logMetrics<T>(results: ConcurrentResult<T>[], totalDuration: number): void {
  const stats = {
    total: results.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    timedOut: results.filter(r => r.status === 'timeout').length,
    fallbacks: results.filter(r => r.status === 'fallback').length,
    totalDuration,
    averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
    totalRetries: results.reduce((sum, r) => sum + r.retryCount, 0)
  };

  logInfo('Concurrent execution completed', stats);
}

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute operations with mutual exclusion (mutex)
 */
export class Mutex {
  private locked = false;
  private waiters: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise(resolve => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }
}

/**
 * Semaphore for limiting concurrent access
 */
export class Semaphore {
  private permits: number;
  private waiters: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      next?.();
    } else {
      this.permits++;
    }
  }

  async withPermit<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }
}