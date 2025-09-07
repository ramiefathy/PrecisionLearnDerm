import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getSystemHealthMonitor } from './health';

// Ensure Firebase Admin SDK is initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ============================================
// Structured Logging
// ============================================

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  operation: string;
  userId?: string;
  itemId?: string;
  duration?: number;
  details: Record<string, any>;
  error?: string;
  stackTrace?: string;
  correlationId?: string;
}

/**
 * Generate a correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log a structured entry
 */
export async function log(entry: Partial<LogEntry>): Promise<void> {
  const fullEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: entry.level || LogLevel.INFO,
    operation: entry.operation || 'unknown',
    details: entry.details || {},
    ...entry
  };

  // Console log for Cloud Functions logging
  const logMethod = getConsoleMethod(fullEntry.level);
  logMethod(JSON.stringify(fullEntry));

  // Also store in Firestore for persistence and querying
  try {
    const logDocument: any = {
      ...fullEntry
    };
    
    // Try serverTimestamp, fallback to regular timestamp
    try {
      logDocument.createdAt = admin.firestore.FieldValue.serverTimestamp();
    } catch (tsError) {
      logDocument.createdAt = new Date();
    }
    
    await db.collection('logs').add(logDocument);
  } catch (error) {
    console.error('Failed to persist log entry:', error);
  }
}

function getConsoleMethod(level: LogLevel): (...args: any[]) => void {
  switch (level) {
    case LogLevel.DEBUG:
      return console.debug;
    case LogLevel.INFO:
      return console.info;
    case LogLevel.WARN:
      return console.warn;
    case LogLevel.ERROR:
    case LogLevel.CRITICAL:
      return console.error;
    default:
      return console.log;
  }
}

// ============================================
// Performance Monitoring
// ============================================

export class PerformanceTimer {
  private startTime: number;
  private operation: string;
  private metadata: Record<string, any>;

  constructor(operation: string, metadata: Record<string, any> = {}) {
    this.startTime = Date.now();
    this.operation = operation;
    this.metadata = metadata;
  }

  async end(success: boolean = true, additionalData: Record<string, any> = {}): Promise<void> {
    const duration = Date.now() - this.startTime;
    
    await log({
      level: success ? LogLevel.INFO : LogLevel.WARN,
      operation: `${this.operation}.performance`,
      duration,
      details: {
        ...this.metadata,
        ...additionalData,
        success
      }
    });

    // Alert if operation is slow
    if (duration > 5000) { // 5 seconds
      await log({
        level: LogLevel.WARN,
        operation: `${this.operation}.slow`,
        duration,
        details: {
          threshold: 5000,
          ...this.metadata
        }
      });
    }
  }
}

// ============================================
// Error Tracking
// ============================================

/**
 * Safely serialize error objects for Firestore storage
 * Fixes "Input is not a plain JavaScript object" errors
 */
function serializeError(error: any): { message: string; stack?: string; [key: string]: any } {
  if (error instanceof Error) {
    const serialized: any = {
      message: error.message,
      name: error.name
    };
    
    if (error.stack) {
      serialized.stack = error.stack;
    }
    
    // Include any additional properties
    Object.getOwnPropertyNames(error).forEach(key => {
      if (key !== 'message' && key !== 'stack' && key !== 'name') {
        try {
          const value = (error as any)[key];
          if (typeof value !== 'function') {
            serialized[key] = value;
          }
        } catch (e) {
          // Skip properties that can't be accessed
        }
      }
    });
    
    return serialized;
  }
  
  if (typeof error === 'object' && error !== null) {
    try {
      // Try to serialize as-is first
      JSON.stringify(error);
      return error;
    } catch (e) {
      // If serialization fails, extract safe properties
      const serialized: any = {};
      for (const key in error) {
        try {
          const value = error[key];
          if (typeof value !== 'function' && typeof value !== 'symbol') {
            serialized[key] = value;
          }
        } catch (e) {
          // Skip problematic properties
        }
      }
      return { message: String(error), ...serialized };
    }
  }
  
  return { message: String(error) };
}

export async function logError(
  operation: string,
  error: any,
  context: Record<string, any> = {}
): Promise<void> {
  const serializedError = serializeError(error);
  
  const errorEntry: Partial<LogEntry> = {
    level: LogLevel.ERROR,
    operation,
    error: serializedError.message,
    stackTrace: serializedError.stack,
    details: {
      ...context,
      errorDetails: serializedError
    }
  };

  await log(errorEntry);

  // For critical errors, also create an alert
  if (error.critical || context.critical) {
    await createAlert(operation, error, context);
  }
}

export async function logCritical(
  operation: string,
  message: string,
  context: Record<string, any> = {}
): Promise<void> {
  await log({
    level: LogLevel.CRITICAL,
    operation,
    error: message,
    details: context
  });

  await createAlert(operation, new Error(message), context);
}

async function createAlert(
  operation: string,
  error: any,
  context: Record<string, any>
): Promise<void> {
  try {
    const serializedError = serializeError(error);
    
    await db.collection('alerts').add({
      operation,
      error: serializedError.message,
      stackTrace: serializedError.stack,
      errorDetails: serializedError,
      context,
      status: 'open',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (alertError) {
    console.error('Failed to create alert:', alertError);
  }
}

// ============================================
// Metrics Collection
// ============================================

export interface Metric {
  name: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
}

export async function recordMetric(metric: Metric): Promise<void> {
  try {
    await db.collection('metrics').add({
      ...metric,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to record metric:', error);
  }
}

// ============================================
// Request Tracking Middleware
// ============================================

export function withMonitoring<T extends (...args: any[]) => Promise<any>>(
  operation: string,
  handler: T
): T {
  return (async (...args: any[]) => {
    const correlationId = generateCorrelationId();
    const timer = new PerformanceTimer(operation, { correlationId });
    
    try {
      // Log request
      await log({
        level: LogLevel.INFO,
        operation: `${operation}.start`,
        correlationId,
        details: {
          args: args.length > 0 ? args[0] : undefined
        }
      });

      // Execute handler
      const result = await handler(...args);

      // Log success
      await log({
        level: LogLevel.INFO,
        operation: `${operation}.success`,
        correlationId,
        details: {
          resultSize: JSON.stringify(result).length
        }
      });

      await timer.end(true);
      return result;

    } catch (error: any) {
      // Log failure
      await logError(`${operation}.error`, error, {
        correlationId,
        args: args.length > 0 ? args[0] : undefined
      });

      await timer.end(false, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }) as T;
}

// ============================================
// Health Check
// ============================================

export async function performHealthCheck(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, boolean>;
  timestamp: string;
}> {
  const checks: Record<string, boolean> = {};
  
  // Check Firestore connectivity
  try {
    await db.collection('health').doc('check').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    checks.firestore = true;
  } catch {
    checks.firestore = false;
  }

  // Check if Gemini API key is configured
  try {
    const { config } = await import('./config');
    checks.geminiApi = config.gemini.hasApiKey();
  } catch {
    checks.geminiApi = false;
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every(v => v === true);
  const anyHealthy = Object.values(checks).some(v => v === true);
  
  const status = allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'unhealthy';

  const result: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
    timestamp: string;
  } = {
    status,
    checks,
    timestamp: new Date().toISOString()
  };

  // Log health check result
  await log({
    level: status === 'healthy' ? LogLevel.INFO : LogLevel.WARN,
    operation: 'health.check',
    details: result
  });

  return result;
}

// ============================================
// Exported Functions
// ============================================

export const healthCheck = functions.https.onRequest(async (req, res) => {
  const result = await performHealthCheck();
  res.status(result.status === 'healthy' ? 200 : 503).json(result);
});

export const getMetrics = functions.https.onCall(async (data, context) => {
  // Require admin
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }

  const { startTime, endTime, operation } = data || {};
  
  let query: any = db.collection('metrics');
  
  if (startTime) {
    query = query.where('timestamp', '>=', new Date(startTime));
  }
  if (endTime) {
    query = query.where('timestamp', '<=', new Date(endTime));
  }
  if (operation) {
    query = query.where('name', '==', operation);
  }
  
  const snapshot = await query.limit(1000).get();
  const metrics = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  }));

  return { metrics, count: metrics.length };
});

export const getLogs = functions.https.onCall(async (data, context) => {
  // Require admin
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Admin access required'
    );
  }

  const { level, operation, userId, startTime, endTime, limit = 100 } = data || {};

  let query: any = db.collection('logs');

  if (level) {
    query = query.where('level', '==', level);
  }
  if (operation) {
    query = query.where('operation', '==', operation);
  }
  if (userId) {
    query = query.where('userId', '==', userId);
  }
  if (startTime) {
    query = query.where('createdAt', '>=', startTime);
  }
  if (endTime) {
    query = query.where('createdAt', '<=', endTime);
  }

  query = query.orderBy('createdAt', 'desc').limit(limit);
  
  const snapshot = await query.get();
  const logs = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  }));

  return { logs, count: logs.length };
});

// ============================================
// Enhanced Monitoring System
// ============================================

interface AlertThreshold {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

interface Alert {
  id: string;
  threshold: AlertThreshold;
  triggeredAt: number;
  currentValue: number;
  message: string;
  acknowledged: boolean;
  resolvedAt?: number;
}


/**
 * Enhanced Metrics Collector for MCQ Generation System
 */
export class EnhancedMetricsCollector {
  private metricsBuffer: Array<{
    operation: string;
    responseTime: number;
    success: boolean;
    model: string;
    timestamp: number;
    userId?: string;
    metadata?: any;
  }> = [];
  private readonly bufferSize = 1000;
  private lastFlush = Date.now();
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    // DO NOT start setInterval here - deferred to start() method
    // Constructor should be free of side effects for Firebase deployment
  }

  public start(): void {
    if (this.intervalId) return; // Prevent multiple intervals
    // Flush metrics every 30 seconds
    this.intervalId = setInterval(() => this.flushMetrics(), 30000);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Record MCQ generation performance
   */
  recordMCQGeneration({
    operation,
    responseTime,
    success,
    model,
    userId,
    cacheHit,
    qualityScore
  }: {
    operation: string;
    responseTime: number;
    success: boolean;
    model: string;
    userId?: string;
    cacheHit?: boolean;
    qualityScore?: number;
  }): void {
    this.metricsBuffer.push({
      operation,
      responseTime,
      success,
      model,
      userId,
      timestamp: Date.now(),
      metadata: {
        cacheHit,
        qualityScore,
        category: 'mcq_generation'
      }
    });

    if (this.metricsBuffer.length >= this.bufferSize) {
      this.flushMetrics();
    }
  }

  /**
   * Record validation performance
   */
  recordValidation({
    responseTime,
    success,
    citationCount,
    overallSupported,
    confidence,
    needsReview
  }: {
    responseTime: number;
    success: boolean;
    citationCount: number;
    overallSupported: boolean;
    confidence: number;
    needsReview: boolean;
  }): void {
    this.metricsBuffer.push({
      operation: 'citation_validation',
      responseTime,
      success,
      model: 'gemini-2.5-flash',
      timestamp: Date.now(),
      metadata: {
        citationCount,
        overallSupported,
        confidence,
        needsReview,
        category: 'validation'
      }
    });
  }

  /**
   * Flush metrics to Firestore
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const batch = db.batch();
    const metricsToFlush = this.metricsBuffer.splice(0);
    const flushTime = Date.now();

    try {
      // Store aggregated metrics by minute
      const aggregated = this.aggregateMetrics(metricsToFlush);
      
      for (const [key, stats] of Object.entries(aggregated)) {
        const docRef = db.collection('performance_metrics').doc(key);
        batch.set(docRef, {
          ...stats,
          aggregatedAt: flushTime
        }, { merge: true });
      }

      await batch.commit();

      await log({
        level: LogLevel.INFO,
        operation: 'metrics.flushed',
        details: {
          count: metricsToFlush.length,
          aggregatedGroups: Object.keys(aggregated).length
        }
      });

    } catch (error: any) {
      await logError('metrics.flush_failed', error, {
        metricsCount: metricsToFlush.length
      });
      
      // Put metrics back if flush failed
      this.metricsBuffer.unshift(...metricsToFlush);
    }
  }

  /**
   * Aggregate metrics by operation and time window
   */
  private aggregateMetrics(metrics: any[]): Record<string, any> {
    const aggregated: Record<string, any> = {};
    
    for (const metric of metrics) {
      // Create key: operation_model_minute
      const minute = Math.floor(metric.timestamp / 60000) * 60000;
      const key = `${metric.operation}_${metric.model}_${minute}`;
      
      if (!aggregated[key]) {
        aggregated[key] = {
          operation: metric.operation,
          model: metric.model,
          timeWindow: new Date(minute),
          count: 0,
          successCount: 0,
          totalResponseTime: 0,
          minResponseTime: Infinity,
          maxResponseTime: 0
        };
      }
      
      const stats = aggregated[key];
      stats.count++;
      if (metric.success) stats.successCount++;
      stats.totalResponseTime += metric.responseTime;
      stats.minResponseTime = Math.min(stats.minResponseTime, metric.responseTime);
      stats.maxResponseTime = Math.max(stats.maxResponseTime, metric.responseTime);
    }
    
    // Calculate averages and rates
    for (const stats of Object.values(aggregated)) {
      const s = stats as any;
      s.avgResponseTime = s.totalResponseTime / s.count;
      s.successRate = s.successCount / s.count;
      s.errorRate = 1 - s.successRate;
    }
    
    return aggregated;
  }

  /**
   * Get current metrics summary
   */
  getCurrentMetrics(): any {
    const now = Date.now();
    const recentMetrics = this.metricsBuffer.filter(m => now - m.timestamp < 300000); // 5 minutes
    
    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        avgResponseTime: 0,
        errorRate: 0,
        timeWindow: '5 minutes'
      };
    }
    
    const successCount = recentMetrics.filter(m => m.success).length;
    const totalResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    
    return {
      totalRequests: recentMetrics.length,
      successRate: successCount / recentMetrics.length,
      avgResponseTime: totalResponseTime / recentMetrics.length,
      errorRate: (recentMetrics.length - successCount) / recentMetrics.length,
      timeWindow: '5 minutes'
    };
  }
}

/**
 * Alert Management System
 */
export class AlertManager {
  private activeAlerts: Map<string, Alert> = new Map();
  private thresholds: AlertThreshold[] = [];
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDefaultThresholds();
    // DO NOT start setInterval here - deferred to start() method
  }

  public start(): void {
    if (this.intervalId) return; // Prevent multiple intervals
    // Check thresholds every minute
    this.intervalId = setInterval(() => this.checkThresholds(), 60000);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Initialize default alert thresholds
   */
  private initializeDefaultThresholds(): void {
    this.thresholds = [
      {
        metric: 'avg_response_time',
        operator: '>',
        value: 30000, // 30 seconds
        severity: 'high',
        enabled: true
      },
      {
        metric: 'error_rate',
        operator: '>',
        value: 0.1, // 10%
        severity: 'medium',
        enabled: true
      },
      {
        metric: 'success_rate',
        operator: '<',
        value: 0.9, // 90%
        severity: 'high',
        enabled: true
      },
      {
        metric: 'validation_confidence',
        operator: '<',
        value: 70,
        severity: 'medium',
        enabled: true
      }
    ];
  }

  /**
   * Check all thresholds against current metrics
   */
  private async checkThresholds(): Promise<void> {
    try {
      const metrics = await this.getCurrentSystemMetrics();
      
      for (const threshold of this.thresholds.filter(t => t.enabled)) {
        const currentValue = metrics[threshold.metric];
        if (currentValue === undefined) continue;
        
        const triggered = this.evaluateThreshold(currentValue, threshold);
        const alertId = `${threshold.metric}_${threshold.severity}`;
        
        if (triggered && !this.activeAlerts.has(alertId)) {
          // New alert
          const alert: Alert = {
            id: alertId,
            threshold,
            triggeredAt: Date.now(),
            currentValue,
            message: this.generateAlertMessage(threshold, currentValue),
            acknowledged: false
          };
          
          this.activeAlerts.set(alertId, alert);
          await this.sendAlert(alert);
          
        } else if (!triggered && this.activeAlerts.has(alertId)) {
          // Alert resolved
          const alert = this.activeAlerts.get(alertId)!;
          alert.resolvedAt = Date.now();
          await this.resolveAlert(alert);
          this.activeAlerts.delete(alertId);
        }
      }
      
    } catch (error: any) {
      await logError('threshold.check_failed', error);
    }
  }

  /**
   * Evaluate if threshold is triggered
   */
  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case '>': return value > threshold.value;
      case '<': return value < threshold.value;
      case '>=': return value >= threshold.value;
      case '<=': return value <= threshold.value;
      case '==': return value === threshold.value;
      case '!=': return value !== threshold.value;
      default: return false;
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(threshold: AlertThreshold, currentValue: number): string {
    const metricName = threshold.metric.replace('_', ' ').toUpperCase();
    return `${metricName} is ${currentValue} (threshold: ${threshold.operator} ${threshold.value})`;
  }

  /**
   * Send alert notification
   */
  private async sendAlert(alert: Alert): Promise<void> {
    try {
      // Store alert in Firestore
      await db.collection('system_alerts').add({
        ...alert,
        triggeredAt: new Date(alert.triggeredAt)
      });
      
      await logCritical('system.alert_triggered', alert.message, {
        alertId: alert.id,
        severity: alert.threshold.severity,
        currentValue: alert.currentValue
      });
      
    } catch (error: any) {
      await logError('alert.send_failed', error, { alertId: alert.id });
    }
  }

  /**
   * Resolve alert
   */
  private async resolveAlert(alert: Alert): Promise<void> {
    try {
      const alertsQuery = await db.collection('system_alerts')
        .where('id', '==', alert.id)
        .where('resolvedAt', '==', null)
        .limit(1)
        .get();
      
      if (!alertsQuery.empty) {
        const doc = alertsQuery.docs[0];
        await doc.ref.update({ 
          resolvedAt: new Date(alert.resolvedAt!),
          resolved: true
        });
      }
      
      await log({
        level: LogLevel.INFO,
        operation: 'system.alert_resolved',
        details: {
          alertId: alert.id,
          duration: alert.resolvedAt! - alert.triggeredAt
        }
      });
      
    } catch (error: any) {
      await logError('alert.resolve_failed', error, { alertId: alert.id });
    }
  }

  /**
   * Get current system metrics for threshold evaluation
   */
  private async getCurrentSystemMetrics(): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {};
    
    try {
      // Get recent performance data
      const recentMetrics = await db.collection('performance_metrics')
        .where('timeWindow', '>=', new Date(Date.now() - 300000)) // 5 minutes
        .get();
      
      if (!recentMetrics.empty) {
        const data = recentMetrics.docs.map(doc => doc.data());
        
        // Calculate weighted averages
        const totalCount = data.reduce((sum, d) => sum + (d.count || 0), 0);
        const totalSuccess = data.reduce((sum, d) => sum + (d.successCount || 0), 0);
        const totalResponseTime = data.reduce((sum, d) => sum + (d.totalResponseTime || 0), 0);
        
        if (totalCount > 0) {
          metrics.avg_response_time = totalResponseTime / totalCount;
          metrics.success_rate = totalSuccess / totalCount;
          metrics.error_rate = 1 - metrics.success_rate;
        }
      }
      
      // Get validation metrics
      const validationStats = await this.getValidationStats();
      if (validationStats.totalValidations > 0) {
        metrics.validation_confidence = validationStats.averageConfidence;
        metrics.validation_success_rate = validationStats.autoApproved / validationStats.totalValidations;
      }
      
    } catch (error: any) {
      await logError('system.metrics_fetch_failed', error);
    }
    
    return metrics;
  }

  /**
   * Get validation statistics
   */
  private async getValidationStats(): Promise<any> {
    const since = new Date(Date.now() - 3600000); // 1 hour
    
    try {
      const validationLogs = await db.collection('validation_logs')
        .where('timestamp', '>=', since)
        .get();
      
      if (validationLogs.empty) {
        return {
          totalValidations: 0,
          autoApproved: 0,
          needingReview: 0,
          averageConfidence: 0
        };
      }
      
      const data = validationLogs.docs.map(doc => doc.data());
      
      return {
        totalValidations: data.length,
        autoApproved: data.filter(d => d.result?.overallSupported && !d.result?.needsHumanReview).length,
        needingReview: data.filter(d => d.result?.needsHumanReview).length,
        averageConfidence: data.reduce((sum, d) => sum + (d.result?.confidence || 0), 0) / data.length
      };
    } catch (error: any) {
      await logError('validation.stats_failed', error);
      return {
        totalValidations: 0,
        autoApproved: 0,
        needingReview: 0,
        averageConfidence: 0
      };
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      
      const alertsQuery = await db.collection('system_alerts')
        .where('id', '==', alertId)
        .limit(1)
        .get();
      
      if (!alertsQuery.empty) {
        const doc = alertsQuery.docs[0];
        await doc.ref.update({ 
          acknowledged: true,
          acknowledgedBy: userId,
          acknowledgedAt: new Date()
        });
      }
      
      await log({
        level: LogLevel.INFO,
        operation: 'alert.acknowledged',
        details: { alertId, userId }
      });
    }
  }
}


// Global instances
let enhancedMetricsCollector: EnhancedMetricsCollector;
let alertManager: AlertManager;

/**
 * Get enhanced metrics collector instance
 */
export function getEnhancedMetricsCollector(): EnhancedMetricsCollector {
  if (!enhancedMetricsCollector) {
    enhancedMetricsCollector = new EnhancedMetricsCollector();
  }
  return enhancedMetricsCollector;
}

/**
 * Get alert manager instance
 */
export function getAlertManager(): AlertManager {
  if (!alertManager) {
    alertManager = new AlertManager();
  }
  return alertManager;
}


/**
 * Cloud Function: Get system dashboard data
 */
export const getSystemDashboard = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    try {
      // Require admin authentication
      if (!context.auth?.token?.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
      }

      const collector = getEnhancedMetricsCollector();
      const alertMgr = getAlertManager();
      const healthMon = getSystemHealthMonitor();

      const [currentMetrics, activeAlerts, systemHealth] = await Promise.all([
        Promise.resolve(collector.getCurrentMetrics()),
        Promise.resolve(alertMgr.getActiveAlerts()),
        Promise.resolve(healthMon.getSystemHealth())
      ]);

      return {
        success: true,
        data: {
          metrics: currentMetrics,
          alerts: activeAlerts,
          health: systemHealth,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: any) {
      await logError('dashboard.request_failed', error, {
        userId: context.auth?.uid
      });

      throw new functions.https.HttpsError('internal', 
        `Dashboard request failed: ${error.message}`
      );
    }
  });

/**
 * Cloud Function: Acknowledge alert
 */
export const acknowledgeSystemAlert = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    try {
      if (!context.auth?.token?.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
      }

      const { alertId } = data;
      if (!alertId) {
        throw new functions.https.HttpsError('invalid-argument', 'alertId is required');
      }

      const alertMgr = getAlertManager();
      await alertMgr.acknowledgeAlert(alertId, context.auth.uid);

      return {
        success: true,
        message: 'Alert acknowledged successfully'
      };

    } catch (error: any) {
      await logError('alert.acknowledge_failed', error, {
        alertId: data?.alertId,
        userId: context.auth?.uid
      });

      throw new functions.https.HttpsError('internal', 
        `Failed to acknowledge alert: ${error.message}`
      );
    }
  });

/**
 * Initialize enhanced monitoring system
 */
export function initializeEnhancedMonitoring(): void {
  // Initialize all monitoring components
  const collector = getEnhancedMetricsCollector();
  const alertMgr = getAlertManager();
  const healthMon = getSystemHealthMonitor();

  // Start their background processes
  collector.start();
  alertMgr.start();
  healthMon.start();

  log({
    level: LogLevel.INFO,
    operation: 'monitoring.system_initialized',
    details: {
      timestamp: new Date().toISOString(),
      components: ['metrics_collector', 'alert_manager', 'health_monitor'],
      background_processes: 'started'
    }
  });
}

/**
 * Helper function to record MCQ generation metrics from other modules
 */
export function recordMCQMetrics(data: {
  operation: string;
  responseTime: number;
  success: boolean;
  model: string;
  userId?: string;
  cacheHit?: boolean;
  qualityScore?: number;
}): void {
  const collector = getEnhancedMetricsCollector();
  collector.recordMCQGeneration(data);
}

/**
 * Helper function to record validation metrics from other modules
 */
export function recordValidationMetrics(data: {
  responseTime: number;
  success: boolean;
  citationCount: number;
  overallSupported: boolean;
  confidence: number;
  needsReview: boolean;
}): void {
  const collector = getEnhancedMetricsCollector();
  collector.recordValidation(data);
}
