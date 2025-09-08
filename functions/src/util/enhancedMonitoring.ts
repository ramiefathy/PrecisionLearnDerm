import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { log, LogLevel, PerformanceTimer, generateCorrelationId, recordMetric } from './monitoring';

const db = admin.firestore();

// ============================================
// Enhanced Context Management
// ============================================

export interface RequestContext {
  correlationId: string;
  operation: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  startTime: number;
  metadata: Record<string, any>;
}

export interface PerformanceMetrics {
  duration: number;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  requestSize?: number;
  responseSize?: number;
  dbOperations?: number;
  externalApiCalls?: number;
}

export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  window: number; // milliseconds
  minOccurrences: number;
}

export interface AlertConfig {
  name: string;
  description: string;
  thresholds: AlertThreshold[];
  channels: ('email' | 'webhook' | 'firestore')[];
  escalationPolicy?: {
    levels: Array<{
      delayMs: number;
      channels: ('email' | 'webhook' | 'firestore')[];
    }>;
  };
}

// ============================================
// Enhanced Request Context Manager
// ============================================

export class RequestContextManager {
  private static contexts = new Map<string, RequestContext>();
  
  static create(
    operation: string,
    options: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      endpoint?: string;
      correlationId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): RequestContext {
    const context: RequestContext = {
      correlationId: options.correlationId || generateCorrelationId(),
      operation,
      userId: options.userId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      endpoint: options.endpoint,
      startTime: Date.now(),
      metadata: options.metadata || {}
    };
    
    this.contexts.set(context.correlationId, context);
    return context;
  }
  
  static get(correlationId: string): RequestContext | undefined {
    return this.contexts.get(correlationId);
  }
  
  static update(correlationId: string, updates: Partial<RequestContext>): void {
    const context = this.contexts.get(correlationId);
    if (context) {
      Object.assign(context, updates);
    }
  }
  
  static destroy(correlationId: string): void {
    this.contexts.delete(correlationId);
  }
  
  static addMetadata(correlationId: string, key: string, value: any): void {
    const context = this.contexts.get(correlationId);
    if (context) {
      context.metadata[key] = value;
    }
  }
}

// ============================================
// Enhanced Performance Monitor
// ============================================

export class EnhancedPerformanceMonitor extends PerformanceTimer {
  private context: RequestContext;
  private checkpoints: Array<{ name: string; timestamp: number; metadata?: any }> = [];
  private initialMemory?: NodeJS.MemoryUsage;
  private initialCpu?: NodeJS.CpuUsage;

  constructor(context: RequestContext) {
    super(context.operation, context.metadata);
    this.context = context;
    this.initialMemory = process.memoryUsage();
    this.initialCpu = process.cpuUsage();
    this.checkpoint('start');
  }

  /**
   * Add a checkpoint for detailed timing analysis
   */
  checkpoint(name: string, metadata?: any): void {
    this.checkpoints.push({
      name,
      timestamp: Date.now(),
      metadata
    });
  }

  /**
   * Track database operations
   */
  trackDbOperation(operation: string, collection?: string): void {
    RequestContextManager.addMetadata(this.context.correlationId, 'dbOperations', 
      (this.context.metadata.dbOperations || 0) + 1);
    this.checkpoint(`db.${operation}`, { collection });
  }

  /**
   * Track external API calls
   */
  trackExternalCall(service: string, endpoint?: string): void {
    RequestContextManager.addMetadata(this.context.correlationId, 'externalApiCalls', 
      (this.context.metadata.externalApiCalls || 0) + 1);
    this.checkpoint(`external.${service}`, { endpoint });
  }

  /**
   * Track request/response sizes
   */
  trackRequestSize(size: number): void {
    RequestContextManager.addMetadata(this.context.correlationId, 'requestSize', size);
  }

  trackResponseSize(size: number): void {
    RequestContextManager.addMetadata(this.context.correlationId, 'responseSize', size);
  }

  /**
   * End monitoring with enhanced metrics
   */
  async endEnhanced(success: boolean = true, error?: any): Promise<PerformanceMetrics> {
    this.checkpoint('end');
    
    const endTime = Date.now();
    const duration = endTime - this.context.startTime;
    const finalMemory = process.memoryUsage();
    const finalCpu = process.cpuUsage(this.initialCpu);

    const metrics: PerformanceMetrics = {
      duration,
      memoryUsage: finalMemory,
      cpuUsage: finalCpu,
      requestSize: this.context.metadata.requestSize,
      responseSize: this.context.metadata.responseSize,
      dbOperations: this.context.metadata.dbOperations || 0,
      externalApiCalls: this.context.metadata.externalApiCalls || 0
    };

    // Calculate checkpoint durations
    const checkpointDurations: Record<string, number> = {};
    for (let i = 1; i < this.checkpoints.length; i++) {
      const current = this.checkpoints[i];
      const previous = this.checkpoints[i - 1];
      checkpointDurations[`${previous.name}_to_${current.name}`] = 
        current.timestamp - previous.timestamp;
    }

    // Log detailed performance data
    await log({
      level: success ? LogLevel.INFO : LogLevel.WARN,
      operation: `${this.context.operation}.performance_detailed`,
      correlationId: this.context.correlationId,
      userId: this.context.userId,
      duration,
      details: {
        ...this.context.metadata,
        success,
        metrics,
        checkpoints: this.checkpoints,
        checkpointDurations,
        error: error ? { message: error.message, code: error.code } : undefined
      }
    });

    // Record individual metrics
    await this.recordPerformanceMetrics(metrics, success);

    // Check for performance alerts
    await this.checkPerformanceAlerts(metrics);

    // Clean up context
    RequestContextManager.destroy(this.context.correlationId);

    return metrics;
  }

  /**
   * Record individual performance metrics
   */
  private async recordPerformanceMetrics(metrics: PerformanceMetrics, success: boolean): Promise<void> {
    const tags = {
      operation: this.context.operation,
      success: success.toString(),
      endpoint: this.context.endpoint || 'unknown',
      userId: this.context.userId || 'anonymous'
    };

    // Record duration metric
    await recordMetric({
      name: 'request_duration_ms',
      value: metrics.duration,
      unit: 'milliseconds',
      tags
    });

    // Record memory usage
    if (metrics.memoryUsage) {
      await recordMetric({
        name: 'memory_usage_mb',
        value: metrics.memoryUsage.heapUsed / 1024 / 1024,
        unit: 'megabytes',
        tags
      });
    }

    // Record CPU usage
    if (metrics.cpuUsage) {
      await recordMetric({
        name: 'cpu_usage_ms',
        value: (metrics.cpuUsage.user + metrics.cpuUsage.system) / 1000,
        unit: 'milliseconds',
        tags
      });
    }

    // Record request/response sizes
    if (metrics.requestSize) {
      await recordMetric({
        name: 'request_size_bytes',
        value: metrics.requestSize,
        unit: 'bytes',
        tags
      });
    }

    if (metrics.responseSize) {
      await recordMetric({
        name: 'response_size_bytes',
        value: metrics.responseSize,
        unit: 'bytes',
        tags
      });
    }

    // Record operation counts
    await recordMetric({
      name: 'db_operations_count',
      value: metrics.dbOperations || 0,
      unit: 'count',
      tags
    });

    await recordMetric({
      name: 'external_api_calls_count',
      value: metrics.externalApiCalls || 0,
      unit: 'count',
      tags
    });
  }

  /**
   * Check performance against alert thresholds
   */
  private async checkPerformanceAlerts(metrics: PerformanceMetrics): Promise<void> {
    const alerts = await this.getActiveAlerts();
    
    for (const alert of alerts) {
      for (const threshold of alert.thresholds) {
        const metricValue = this.getMetricValue(metrics, threshold.metric);
        if (metricValue !== undefined && this.evaluateThreshold(metricValue, threshold)) {
          await this.triggerAlert(alert, threshold, metricValue);
        }
      }
    }
  }

  private getMetricValue(metrics: PerformanceMetrics, metricName: string): number | undefined {
    switch (metricName) {
      case 'duration': return metrics.duration;
      case 'memory_usage': return metrics.memoryUsage?.heapUsed;
      case 'cpu_usage': return metrics.cpuUsage ? metrics.cpuUsage.user + metrics.cpuUsage.system : undefined;
      case 'request_size': return metrics.requestSize;
      case 'response_size': return metrics.responseSize;
      case 'db_operations': return metrics.dbOperations;
      case 'external_api_calls': return metrics.externalApiCalls;
      default: return undefined;
    }
  }

  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case 'gt': return value > threshold.value;
      case 'gte': return value >= threshold.value;
      case 'lt': return value < threshold.value;
      case 'lte': return value <= threshold.value;
      case 'eq': return value === threshold.value;
      default: return false;
    }
  }

  private async getActiveAlerts(): Promise<AlertConfig[]> {
    // In a real implementation, this would fetch from a configuration store
    // For now, return some default alert configurations
    return [
      {
        name: 'high_response_time',
        description: 'Response time exceeds 10 seconds',
        thresholds: [{
          metric: 'duration',
          operator: 'gt',
          value: 10000,
          window: 60000,
          minOccurrences: 1
        }],
        channels: ['firestore']
      },
      {
        name: 'high_memory_usage',
        description: 'Memory usage exceeds 500MB',
        thresholds: [{
          metric: 'memory_usage',
          operator: 'gt',
          value: 500 * 1024 * 1024,
          window: 60000,
          minOccurrences: 1
        }],
        channels: ['firestore']
      },
      {
        name: 'excessive_db_operations',
        description: 'Too many database operations',
        thresholds: [{
          metric: 'db_operations',
          operator: 'gt',
          value: 50,
          window: 60000,
          minOccurrences: 1
        }],
        channels: ['firestore']
      }
    ];
  }

  private async triggerAlert(alert: AlertConfig, threshold: AlertThreshold, value: number): Promise<void> {
    const alertData = {
      alertName: alert.name,
      description: alert.description,
      metric: threshold.metric,
      threshold: threshold.value,
      actualValue: value,
      operation: this.context.operation,
      correlationId: this.context.correlationId,
      userId: this.context.userId,
      timestamp: new Date().toISOString(),
      status: 'triggered'
    };

    // Store alert in Firestore
    if (alert.channels.includes('firestore')) {
      await db.collection('alerts').add({
        ...alertData,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Log critical alert
    await log({
      level: LogLevel.CRITICAL,
      operation: 'alert.triggered',
      correlationId: this.context.correlationId,
      details: alertData
    });
  }
}

// ============================================
// Enhanced Health Check System
// ============================================

export class EnhancedHealthCheck {
  static async performComprehensiveHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, any>;
    timestamp: string;
    details: Record<string, any>;
  }> {
    const checks: Record<string, any> = {};
    const details: Record<string, any> = {};

    // Firestore connectivity check
    const firestoreCheck = await this.checkFirestore();
    checks.firestore = firestoreCheck.healthy;
    details.firestore = firestoreCheck.details;

    // Gemini API check
    const geminiCheck = await this.checkGeminiAPI();
    checks.geminiApi = geminiCheck.healthy;
    details.geminiApi = geminiCheck.details;

    // Memory usage check
    const memoryCheck = await this.checkMemoryUsage();
    checks.memory = memoryCheck.healthy;
    details.memory = memoryCheck.details;

    // CPU usage check
    const cpuCheck = await this.checkCPUUsage();
    checks.cpu = cpuCheck.healthy;
    details.cpu = cpuCheck.details;

    // Recent error rate check
    const errorRateCheck = await this.checkErrorRate();
    checks.errorRate = errorRateCheck.healthy;
    details.errorRate = errorRateCheck.details;

    // Response time check
    const responseTimeCheck = await this.checkResponseTimes();
    checks.responseTime = responseTimeCheck.healthy;
    details.responseTime = responseTimeCheck.details;

    // Determine overall status
    const healthyCount = Object.values(checks).filter(v => v === true).length;
    const totalChecks = Object.keys(checks).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalChecks) {
      status = 'healthy';
    } else if (healthyCount >= totalChecks * 0.7) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    const result = {
      status,
      checks,
      timestamp: new Date().toISOString(),
      details
    };

    // Log health check result
    await log({
      level: status === 'healthy' ? LogLevel.INFO : LogLevel.WARN,
      operation: 'health.comprehensive_check',
      details: result
    });

    return result;
  }

  private static async checkFirestore(): Promise<{ healthy: boolean; details: any }> {
    try {
      const start = Date.now();
      await db.collection('health').doc('check').set({
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      const duration = Date.now() - start;
      
      return {
        healthy: duration < 5000, // 5 second threshold
        details: { responseTime: duration, status: 'connected' }
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private static async checkGeminiAPI(): Promise<{ healthy: boolean; details: any }> {
    try {
      const { config } = await import('./config');
      const hasKey = config.gemini.hasApiKey();
      
      return {
        healthy: hasKey,
        details: { configured: hasKey, status: hasKey ? 'available' : 'not_configured' }
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private static async checkMemoryUsage(): Promise<{ healthy: boolean; details: any }> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;
    
    return {
      healthy: usagePercent < 80, // 80% threshold
      details: {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        usagePercent: Math.round(usagePercent)
      }
    };
  }

  private static async checkCPUUsage(): Promise<{ healthy: boolean; details: any }> {
    // Simple CPU check - in production, you'd want more sophisticated monitoring
    const start = process.cpuUsage();
    await new Promise(resolve => setTimeout(resolve, 100));
    const end = process.cpuUsage(start);
    
    const totalUsage = (end.user + end.system) / 1000; // Convert to milliseconds
    const cpuPercent = (totalUsage / 100) * 100; // Rough calculation
    
    return {
      healthy: cpuPercent < 80, // 80% threshold
      details: {
        userTime: end.user / 1000,
        systemTime: end.system / 1000,
        totalTime: totalUsage,
        estimatedPercent: Math.round(cpuPercent)
      }
    };
  }

  private static async checkErrorRate(): Promise<{ healthy: boolean; details: any }> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const totalQuery = db.collection('logs')
        .where('timestamp', '>=', fiveMinutesAgo.toISOString())
        .limit(1000);
      
      const errorQuery = db.collection('logs')
        .where('timestamp', '>=', fiveMinutesAgo.toISOString())
        .where('level', '==', 'ERROR')
        .limit(1000);
      
      const [totalSnapshot, errorSnapshot] = await Promise.all([
        totalQuery.get(),
        errorQuery.get()
      ]);
      
      const totalCount = totalSnapshot.size;
      const errorCount = errorSnapshot.size;
      const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;
      
      return {
        healthy: errorRate < 5, // 5% error rate threshold
        details: {
          totalRequests: totalCount,
          errorCount,
          errorRatePercent: Math.round(errorRate * 100) / 100,
          period: '5 minutes'
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private static async checkResponseTimes(): Promise<{ healthy: boolean; details: any }> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const query = db.collection('metrics')
        .where('name', '==', 'request_duration_ms')
        .where('timestamp', '>=', fiveMinutesAgo)
        .limit(100);
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        return {
          healthy: true,
          details: { message: 'No recent requests to analyze' }
        };
      }
      
      const durations = snapshot.docs.map(doc => doc.data().value as number);
      durations.sort((a, b) => a - b);
      
      const p50 = durations[Math.floor(durations.length * 0.5)];
      const p95 = durations[Math.floor(durations.length * 0.95)];
      const p99 = durations[Math.floor(durations.length * 0.99)];
      const avg = durations.reduce((sum, val) => sum + val, 0) / durations.length;
      
      return {
        healthy: p95 < 10000, // 10 second p95 threshold
        details: {
          sampleCount: durations.length,
          averageMs: Math.round(avg),
          p50Ms: Math.round(p50),
          p95Ms: Math.round(p95),
          p99Ms: Math.round(p99),
          period: '5 minutes'
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}

// ============================================
// Request Payload Logger
// ============================================

export class PayloadLogger {
  private static readonly SENSITIVE_PATTERNS = [
    /password/i,
    /token/i,
    /apikey/i,
    /api[_-]?key/i,
    /secret/i,
    /authorization/i,
    /bearer/i,
    /credential/i,
    /private[_-]?key/i
  ];

  private static readonly MAX_PAYLOAD_SIZE = 10 * 1024; // 10KB

  static sanitizePayload(payload: any): any {
    if (!payload) return payload;

    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') {
        // Check for sensitive patterns in strings
        for (const pattern of this.SENSITIVE_PATTERNS) {
          if (pattern.test(obj)) {
            return '[REDACTED]';
          }
        }
        return obj.length > 1000 ? `${obj.substring(0, 1000)}...[TRUNCATED]` : obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }

      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          // Check if key indicates sensitive data
          const isSensitiveKey = this.SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
          
          if (isSensitiveKey) {
            sanitized[key] = '[REDACTED]';
          } else {
            sanitized[key] = sanitize(value);
          }
        }
        return sanitized;
      }

      return obj;
    };

    return sanitize(payload);
  }

  static async logRequest(
    correlationId: string,
    method: string,
    url: string,
    headers: any,
    body: any
  ): Promise<void> {
    const payloadString = JSON.stringify(body);
    const size = Buffer.byteLength(payloadString, 'utf8');
    
    let loggedBody = body;
    if (size > this.MAX_PAYLOAD_SIZE) {
      loggedBody = '[PAYLOAD_TOO_LARGE]';
    } else {
      loggedBody = this.sanitizePayload(body);
    }

    await log({
      level: LogLevel.DEBUG,
      operation: 'request.payload',
      correlationId,
      details: {
        method,
        url,
        headers: this.sanitizePayload(headers),
        body: loggedBody,
        payloadSize: size
      }
    });
  }

  static async logResponse(
    correlationId: string,
    statusCode: number,
    headers: any,
    body: any
  ): Promise<void> {
    const payloadString = JSON.stringify(body);
    const size = Buffer.byteLength(payloadString, 'utf8');
    
    let loggedBody = body;
    if (size > this.MAX_PAYLOAD_SIZE) {
      loggedBody = '[PAYLOAD_TOO_LARGE]';
    } else {
      loggedBody = this.sanitizePayload(body);
    }

    await log({
      level: LogLevel.DEBUG,
      operation: 'response.payload',
      correlationId,
      details: {
        statusCode,
        headers: this.sanitizePayload(headers),
        body: loggedBody,
        payloadSize: size
      }
    });
  }
}

// ============================================
// Exported Functions
// ============================================

import { withCORS } from './corsConfig';

export const comprehensiveHealthCheck = functions.https.onRequest(
  withCORS('STRICT', async (req, res) => {
    const result = await EnhancedHealthCheck.performComprehensiveHealthCheck();
    res.status(result.status === 'healthy' ? 200 : 503).json(result);
  })
);

// Classes are already exported individually above