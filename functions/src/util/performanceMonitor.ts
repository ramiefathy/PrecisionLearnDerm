/**
 * Performance Monitoring and Quality Metrics Tracking
 * Provides comprehensive monitoring for AI pipeline optimization results
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { logInfo, logError } from './logging';
import { getCacheMetrics } from './sharedCache';

const db = admin.firestore();

interface PerformanceMetrics {
  timestamp: number;
  operationType: 'question_generation' | 'context_gathering' | 'validation' | 'web_search';
  pipelineVersion: 'legacy' | 'optimized' | 'unified';
  
  // Timing metrics
  timing: {
    totalDurationMs: number;
    phases: {
      contextGathering?: number;
      generation?: number;
      validation?: number;
      refinement?: number;
      caching?: number;
    };
  };
  
  // Quality metrics
  quality: {
    finalScore: number;
    refinementCycles: number;
    validationsPassed: number;
    cacheHitRate: number;
  };
  
  // Resource utilization
  resources: {
    apiCallsTotal: number;
    apiCallsCached: number;
    memoryUsageMB?: number;
    kbEntriesProcessed: number;
  };
  
  // Business metrics
  business: {
    topicId: string;
    difficulty: string;
    questionGenerated: boolean;
    errorOccurred: boolean;
    errorMessage?: string;
  };
}

interface PerformanceComparison {
  metric: string;
  legacy: number;
  optimized: number;
  improvement: number;
  improvementPercent: number;
  unit: string;
}

interface QualityTrends {
  period: string;
  averageScore: number;
  questionCount: number;
  successRate: number;
  averageGenerationTime: number;
  cacheHitRate: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private activeOperations = new Map<string, { startTime: number; metadata: any }>();
  
  private constructor() {}
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start tracking a performance operation
   */
  startOperation(
    operationId: string, 
    type: PerformanceMetrics['operationType'],
    metadata: any = {}
  ): void {
    this.activeOperations.set(operationId, {
      startTime: Date.now(),
      metadata: { type, ...metadata }
    });
  }

  /**
   * Complete tracking and record metrics
   */
  async completeOperation(
    operationId: string,
    result: {
      success: boolean;
      quality?: any;
      resources?: any;
      phases?: any;
      error?: string;
    }
  ): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      console.warn(`No active operation found for ID: ${operationId}`);
      return;
    }

    const totalDuration = Date.now() - operation.startTime;
    this.activeOperations.delete(operationId);

    // Get current cache metrics
    const cacheMetrics = getCacheMetrics();
    
    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      operationType: operation.metadata.type,
      pipelineVersion: operation.metadata.pipelineVersion || 'legacy',
      
      timing: {
        totalDurationMs: totalDuration,
        phases: result.phases || {}
      },
      
      quality: {
        finalScore: result.quality?.totalScore || 0,
        refinementCycles: result.quality?.refinementCycles || 0,
        validationsPassed: result.quality?.validationsPassed || 0,
        cacheHitRate: cacheMetrics.cache.hitRate
      },
      
      resources: {
        apiCallsTotal: result.resources?.apiCallsTotal || 0,
        apiCallsCached: result.resources?.apiCallsCached || 0,
        memoryUsageMB: result.resources?.memoryUsageMB,
        kbEntriesProcessed: result.resources?.kbEntriesProcessed || 0
      },
      
      business: {
        topicId: operation.metadata.topicId || 'unknown',
        difficulty: operation.metadata.difficulty || 'unknown',
        questionGenerated: result.success,
        errorOccurred: !result.success,
        errorMessage: result.error
      }
    };

    // Store metrics in Firestore
    try {
      await db.collection('performanceMetrics').add(metrics);
      
      // Log important metrics for real-time monitoring
      logInfo('performance.operation_completed', {
        operationId,
        operationType: metrics.operationType,
        durationMs: totalDuration,
        success: result.success,
        qualityScore: metrics.quality.finalScore,
        cacheHitRate: metrics.quality.cacheHitRate,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logError('performance.metrics_storage_failed', {
        error: error instanceof Error ? error.message : String(error),
        operationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get performance comparison between legacy and optimized pipelines
   */
  async getPerformanceComparison(
    timeRangeHours: number = 24
  ): Promise<PerformanceComparison[]> {
    const cutoffTime = Date.now() - (timeRangeHours * 60 * 60 * 1000);
    
    try {
      const metricsSnapshot = await db.collection('performanceMetrics')
        .where('timestamp', '>=', cutoffTime)
        .where('operationType', '==', 'question_generation')
        .get();

      const legacyMetrics: PerformanceMetrics[] = [];
      const optimizedMetrics: PerformanceMetrics[] = [];

      metricsSnapshot.docs.forEach(doc => {
        const metric = doc.data() as PerformanceMetrics;
        if (metric.pipelineVersion === 'legacy') {
          legacyMetrics.push(metric);
        } else if (metric.pipelineVersion === 'optimized' || metric.pipelineVersion === 'unified') {
          optimizedMetrics.push(metric);
        }
      });

      const comparisons: PerformanceComparison[] = [];

      // Average generation time comparison
      const legacyAvgTime = this.calculateAverage(legacyMetrics.map(m => m.timing.totalDurationMs));
      const optimizedAvgTime = this.calculateAverage(optimizedMetrics.map(m => m.timing.totalDurationMs));
      
      if (legacyAvgTime > 0 && optimizedAvgTime > 0) {
        comparisons.push({
          metric: 'Average Generation Time',
          legacy: legacyAvgTime,
          optimized: optimizedAvgTime,
          improvement: legacyAvgTime - optimizedAvgTime,
          improvementPercent: ((legacyAvgTime - optimizedAvgTime) / legacyAvgTime) * 100,
          unit: 'ms'
        });
      }

      // Quality score comparison
      const legacyAvgQuality = this.calculateAverage(legacyMetrics.map(m => m.quality.finalScore));
      const optimizedAvgQuality = this.calculateAverage(optimizedMetrics.map(m => m.quality.finalScore));
      
      if (legacyAvgQuality > 0 && optimizedAvgQuality > 0) {
        comparisons.push({
          metric: 'Average Quality Score',
          legacy: legacyAvgQuality,
          optimized: optimizedAvgQuality,
          improvement: optimizedAvgQuality - legacyAvgQuality,
          improvementPercent: ((optimizedAvgQuality - legacyAvgQuality) / legacyAvgQuality) * 100,
          unit: 'points'
        });
      }

      // API calls comparison
      const legacyAvgAPICalls = this.calculateAverage(legacyMetrics.map(m => m.resources.apiCallsTotal));
      const optimizedAvgAPICalls = this.calculateAverage(optimizedMetrics.map(m => m.resources.apiCallsTotal));
      
      if (legacyAvgAPICalls > 0 && optimizedAvgAPICalls > 0) {
        comparisons.push({
          metric: 'API Calls per Question',
          legacy: legacyAvgAPICalls,
          optimized: optimizedAvgAPICalls,
          improvement: legacyAvgAPICalls - optimizedAvgAPICalls,
          improvementPercent: ((legacyAvgAPICalls - optimizedAvgAPICalls) / legacyAvgAPICalls) * 100,
          unit: 'calls'
        });
      }

      return comparisons;
      
    } catch (error) {
      logError('performance.comparison_failed', {
        error: error instanceof Error ? error.message : String(error),
        timeRangeHours,
        timestamp: new Date().toISOString()
      });
      return [];
    }
  }

  /**
   * Get quality trends over time
   */
  async getQualityTrends(days: number = 7): Promise<QualityTrends[]> {
    const trends: QualityTrends[] = [];
    
    try {
      for (let i = days - 1; i >= 0; i--) {
        const dayStart = Date.now() - (i * 24 * 60 * 60 * 1000);
        const dayEnd = dayStart + (24 * 60 * 60 * 1000);
        
        const dayMetricsSnapshot = await db.collection('performanceMetrics')
          .where('timestamp', '>=', dayStart)
          .where('timestamp', '<', dayEnd)
          .where('operationType', '==', 'question_generation')
          .get();

        const dayMetrics = dayMetricsSnapshot.docs.map(doc => doc.data() as PerformanceMetrics);
        
        if (dayMetrics.length > 0) {
          const successfulMetrics = dayMetrics.filter(m => m.business.questionGenerated);
          
          trends.push({
            period: new Date(dayStart).toISOString().split('T')[0],
            averageScore: this.calculateAverage(successfulMetrics.map(m => m.quality.finalScore)),
            questionCount: dayMetrics.length,
            successRate: (successfulMetrics.length / dayMetrics.length) * 100,
            averageGenerationTime: this.calculateAverage(dayMetrics.map(m => m.timing.totalDurationMs)),
            cacheHitRate: this.calculateAverage(dayMetrics.map(m => m.quality.cacheHitRate)) * 100
          });
        }
      }
      
    } catch (error) {
      logError('performance.trends_failed', {
        error: error instanceof Error ? error.message : String(error),
        days,
        timestamp: new Date().toISOString()
      });
    }
    
    return trends;
  }

  /**
   * Get real-time performance dashboard data
   */
  async getDashboardMetrics(): Promise<{
    current: any;
    comparisons: PerformanceComparison[];
    trends: QualityTrends[];
    alerts: string[];
  }> {
    const [currentMetrics, comparisons, trends] = await Promise.all([
      this.getCurrentMetrics(),
      this.getPerformanceComparison(24),
      this.getQualityTrends(7)
    ]);

    const alerts = this.generatePerformanceAlerts(currentMetrics, comparisons);

    return {
      current: currentMetrics,
      comparisons,
      trends,
      alerts
    };
  }

  /**
   * Helper methods
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  private async getCurrentMetrics(): Promise<any> {
    const cacheMetrics = getCacheMetrics();
    const recentCutoff = Date.now() - (60 * 60 * 1000); // Last hour
    
    const recentMetricsSnapshot = await db.collection('performanceMetrics')
      .where('timestamp', '>=', recentCutoff)
      .get();

    const recentMetrics = recentMetricsSnapshot.docs.map(doc => doc.data() as PerformanceMetrics);
    
    return {
      cache: cacheMetrics,
      recent: {
        operationCount: recentMetrics.length,
        averageGenerationTime: this.calculateAverage(recentMetrics.map(m => m.timing.totalDurationMs)),
        averageQualityScore: this.calculateAverage(recentMetrics.map(m => m.quality.finalScore)),
        successRate: recentMetrics.filter(m => m.business.questionGenerated).length / recentMetrics.length * 100
      }
    };
  }

  private generatePerformanceAlerts(currentMetrics: any, comparisons: PerformanceComparison[]): string[] {
    const alerts: string[] = [];
    
    // Cache hit rate alert
    if (currentMetrics.cache.cache.hitRate < 0.3) {
      alerts.push('Low cache hit rate detected - consider warming cache or optimizing cache keys');
    }
    
    // Performance regression alert
    const timeComparison = comparisons.find(c => c.metric === 'Average Generation Time');
    if (timeComparison && timeComparison.improvementPercent < 30) {
      alerts.push('Performance improvement below target - optimization may need tuning');
    }
    
    // Quality degradation alert
    const qualityComparison = comparisons.find(c => c.metric === 'Average Quality Score');
    if (qualityComparison && qualityComparison.improvementPercent < 0) {
      alerts.push('Quality score regression detected - review pipeline changes');
    }
    
    return alerts;
  }
}

/**
 * Firebase function endpoints for performance monitoring
 */
export const getPerformanceDashboard = functions.https.onCall(async (data, context) => {
  try {
    const monitor = PerformanceMonitor.getInstance();
    const dashboard = await monitor.getDashboardMetrics();
    return { success: true, data: dashboard };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

export const getPerformanceComparison = functions.https.onCall(async (data, context) => {
  try {
    const monitor = PerformanceMonitor.getInstance();
    const timeRangeHours = data?.timeRangeHours || 24;
    const comparison = await monitor.getPerformanceComparison(timeRangeHours);
    return { success: true, data: comparison };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();