import { log, logError as monitoringLogError, LogLevel, generateCorrelationId } from './monitoring';

/**
 * Legacy logging functions - now use the new monitoring system
 * These are kept for backward compatibility
 */

export async function logInfo(op: string, details: unknown): Promise<void> {
  await log({
    level: LogLevel.INFO,
    operation: op,
    details: typeof details === 'object' ? details as Record<string, any> : { value: details },
    correlationId: generateCorrelationId()
  });
}

export async function logError(op: string, details: unknown): Promise<void> {
  if (details instanceof Error) {
    await monitoringLogError(op, details);
  } else {
    await log({
      level: LogLevel.ERROR,
      operation: op,
      details: typeof details === 'object' ? details as Record<string, any> : { value: details },
      correlationId: generateCorrelationId()
    });
  }
}

// Re-export monitoring utilities for new code
export { 
  log,
  LogLevel,
  PerformanceTimer,
  withMonitoring,
  recordMetric,
  generateCorrelationId
} from './monitoring';
