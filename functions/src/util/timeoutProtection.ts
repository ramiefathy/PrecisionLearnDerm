/**
 * Timeout Protection Utilities
 * Prevents hanging Promise.all operations that cause function timeouts
 */

import { logError, logInfo } from './logging';

export interface TimeoutConfig {
  operationTimeout: number;     // Timeout for individual operations (ms)
  totalTimeout: number;         // Total timeout for batch operations (ms)
  enableGracefulDegradation: boolean;  // Allow partial results
}

export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  operationTimeout: 120000,      // 2 minutes per AI agent (per user guidance: "Give it 2 minutes!")
  totalTimeout: 300000,         // 5 minutes total for all operations
  enableGracefulDegradation: true
};

/**
 * Wraps a promise with timeout protection
 * Prevents hanging operations that never resolve/reject
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`);
        (error as any).isTimeout = true;
        (error as any).operationName = operationName;
        (error as any).timeoutMs = timeoutMs;
        
        logError('timeout.operation_exceeded', {
          operationName,
          timeoutMs,
          timestamp: new Date().toISOString()
        });
        
        reject(error);
      }, timeoutMs);
    })
  ]);
}

/**
 * Executes multiple promises with individual timeouts and graceful degradation
 * Allows partial success instead of complete failure
 */
export async function executeWithTimeoutProtection<T>(
  operations: Array<{
    name: string;
    promise: Promise<T>;
    required?: boolean;  // If false, failure won't stop other operations
  }>,
  config: Partial<TimeoutConfig> = {}
): Promise<{
  results: Array<{ name: string; result?: T; error?: Error; timedOut?: boolean }>;
  totalSuccessful: number;
  totalFailed: number;
}> {
  const finalConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  const startTime = Date.now();
  
  logInfo('timeout.batch_operation_started', {
    operationCount: operations.length,
    config: finalConfig,
    timestamp: new Date().toISOString()
  });

  // Wrap each operation with timeout protection
  const protectedOperations = operations.map(op => ({
    name: op.name,
    required: op.required ?? true,
    promise: withTimeout(op.promise, finalConfig.operationTimeout, op.name)
      .then(result => ({ name: op.name, result, success: true }))
      .catch(error => ({ 
        name: op.name, 
        error, 
        success: false,
        timedOut: error.isTimeout || false
      }))
  }));

  // Execute all operations with total timeout protection
  const batchPromise = Promise.allSettled(
    protectedOperations.map(op => op.promise)
  );

  const totalTimeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Batch operation exceeded total timeout of ${finalConfig.totalTimeout}ms`));
    }, finalConfig.totalTimeout);
  });

  try {
    const settled = await Promise.race([batchPromise, totalTimeoutPromise]);
    
    const results = settled.map(result => {
      if (result.status === 'fulfilled') {
        const value = result.value as any;
        return {
          name: value.name,
          result: value.result,
          error: value.error,
          timedOut: value.timedOut
        };
      } else {
        return {
          name: 'unknown',
          error: new Error('Operation rejected'),
          timedOut: false
        };
      }
    });

    const successful = results.filter(r => r.result !== undefined).length;
    const failed = results.length - successful;
    const timedOut = results.filter(r => r.timedOut).length;

    const totalTime = Date.now() - startTime;
    
    logInfo('timeout.batch_operation_completed', {
      totalTime,
      totalOperations: operations.length,
      successful,
      failed,
      timedOut,
      timestamp: new Date().toISOString()
    });

    // Check if we have enough successful operations
    const requiredOperations = operations.filter(op => op.required !== false);
    const successfulRequired = results.filter(r => 
      r.result !== undefined && 
      requiredOperations.some(req => req.name === r.name)
    ).length;

    if (successfulRequired === 0 && requiredOperations.length > 0) {
      throw new Error(`All required operations failed or timed out`);
    }

    return {
      results,
      totalSuccessful: successful,
      totalFailed: failed
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    logError('timeout.batch_operation_failed', {
      error: error instanceof Error ? error.message : String(error),
      totalTime,
      operationCount: operations.length,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
}

/**
 * Specialized timeout protection for AI agent operations
 * Handles the specific case of parallel AI processing that was causing timeouts
 */
export async function executeAIAgentsWithTimeout<T>(
  agents: Array<{
    name: string;
    operation: () => Promise<T>;
    required?: boolean;
  }>,
  config: Partial<TimeoutConfig> = {}
): Promise<{
  results: { [agentName: string]: T };
  errors: { [agentName: string]: Error };
  timeouts: string[];
}> {
  const operations = agents.map(agent => ({
    name: agent.name,
    promise: agent.operation(),
    required: agent.required
  }));

  const batchResult = await executeWithTimeoutProtection(operations, config);
  
  const results: { [agentName: string]: T } = {};
  const errors: { [agentName: string]: Error } = {};
  const timeouts: string[] = [];

  batchResult.results.forEach(result => {
    if (result.result !== undefined) {
      results[result.name] = result.result;
    } else if (result.error) {
      errors[result.name] = result.error;
      if (result.timedOut) {
        timeouts.push(result.name);
      }
    }
  });

  return { results, errors, timeouts };
}

/**
 * Circuit breaker pattern for operations that frequently fail
 * Prevents repeated calls to failing services
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private maxFailures = 5,
    private timeoutMs = 60000  // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker is OPEN for ${operationName}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.maxFailures) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}