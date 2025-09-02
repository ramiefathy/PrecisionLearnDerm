/**
 * System Load Service
 * Provides real system metrics for intelligent batch sizing
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

// Initialize Firestore if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export interface SystemMetrics {
  memoryUsage: number;        // 0-1 scale (percentage of heap used)
  rssMemoryUsage: number;     // 0-1 scale (RSS memory pressure)
  activeEvaluations: number;  // 0-1 scale based on max concurrent
  apiRateUsage: number;       // 0-1 scale of Gemini API rate limit
  functionPressure: number;   // 0-1 scale based on concurrent executions
  timestamp: number;
}

export interface LoadCalculationWeights {
  memory: number;
  rssMemory: number;
  evaluations: number;
  apiRate: number;
  functionPressure: number;
}

// Configuration constants
const MAX_CONCURRENT_EVALUATIONS = 5;  // Reasonable limit for Firebase Functions
const GEMINI_RATE_LIMIT_PER_MINUTE = 50; // Conservative estimate
const MAX_RSS_MB = 2048; // 2GB limit for Firebase Functions
const METRICS_CACHE_TTL = 30000; // 30 seconds cache
const API_CALL_WINDOW = 60000; // 1 minute window for API rate tracking

// Default weights for load calculation
const DEFAULT_WEIGHTS: LoadCalculationWeights = {
  memory: 0.25,
  rssMemory: 0.20,
  evaluations: 0.30,
  apiRate: 0.20,
  functionPressure: 0.05
};

class SystemLoadService {
  private static instance: SystemLoadService;
  private metricsCache: SystemMetrics | null = null;
  private lastCacheTime: number = 0;
  private recentApiCalls: number[] = []; // Timestamps of recent API calls
  private concurrentFunctions: Set<string> = new Set();

  private constructor() {}

  static getInstance(): SystemLoadService {
    if (!SystemLoadService.instance) {
      SystemLoadService.instance = new SystemLoadService();
    }
    return SystemLoadService.instance;
  }

  /**
   * Get current system load with caching
   */
  async getCurrentSystemLoad(): Promise<number> {
    try {
      const metrics = await this.getSystemMetrics();
      return this.calculateLoadFactor(metrics);
    } catch (error) {
      logger.warn('[SYSTEM_LOAD] Could not determine system load, assuming high load', { error });
      return 0.9; // Conservative fallback
    }
  }

  /**
   * Get detailed system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const now = Date.now();
    
    // Return cached metrics if still valid
    if (this.metricsCache && (now - this.lastCacheTime) < METRICS_CACHE_TTL) {
      return this.metricsCache;
    }

    try {
      const [
        memoryMetrics,
        activeEvaluations,
        apiRateUsage,
        functionPressure
      ] = await Promise.all([
        this.getMemoryMetrics(),
        this.getActiveEvaluationsMetric(),
        this.getApiRateUsageMetric(),
        this.getFunctionPressureMetric()
      ]);

      this.metricsCache = {
        memoryUsage: memoryMetrics.heapUsage,
        rssMemoryUsage: memoryMetrics.rssUsage,
        activeEvaluations,
        apiRateUsage,
        functionPressure,
        timestamp: now
      };

      this.lastCacheTime = now;
      
      logger.info('[SYSTEM_LOAD] Metrics collected', {
        memory: Math.round(this.metricsCache.memoryUsage * 100) + '%',
        rss: Math.round(this.metricsCache.rssMemoryUsage * 100) + '%',
        evaluations: Math.round(this.metricsCache.activeEvaluations * 100) + '%',
        apiRate: Math.round(this.metricsCache.apiRateUsage * 100) + '%',
        functions: Math.round(this.metricsCache.functionPressure * 100) + '%'
      });

      return this.metricsCache;
    } catch (error) {
      logger.error('[SYSTEM_LOAD] Failed to collect metrics', { error });
      throw error;
    }
  }

  /**
   * Get memory usage metrics
   */
  private getMemoryMetrics(): { heapUsage: number; rssUsage: number } {
    const memory = process.memoryUsage();
    
    const heapUsage = memory.heapUsed / memory.heapTotal;
    const rssUsage = memory.rss / (MAX_RSS_MB * 1024 * 1024);

    return {
      heapUsage: Math.min(heapUsage, 1.0),
      rssUsage: Math.min(rssUsage, 1.0)
    };
  }

  /**
   * Get active evaluations metric
   */
  private async getActiveEvaluationsMetric(): Promise<number> {
    try {
      const activeQuery = db.collection('evaluationJobs')
        .where('status', 'in', ['pending', 'running'])
        .select(); // Only get document count, not full data

      const snapshot = await activeQuery.get();
      const activeCount = snapshot.size;
      
      return Math.min(activeCount / MAX_CONCURRENT_EVALUATIONS, 1.0);
    } catch (error) {
      logger.warn('[SYSTEM_LOAD] Could not get active evaluations count', { error });
      return 0.5; // Conservative estimate
    }
  }

  /**
   * Get API rate usage metric based on recent calls
   */
  private getApiRateUsageMetric(): number {
    const now = Date.now();
    const windowStart = now - API_CALL_WINDOW;
    
    // Clean old calls outside the window
    this.recentApiCalls = this.recentApiCalls.filter(timestamp => timestamp > windowStart);
    
    const callsInWindow = this.recentApiCalls.length;
    return Math.min(callsInWindow / GEMINI_RATE_LIMIT_PER_MINUTE, 1.0);
  }

  /**
   * Get function execution pressure
   */
  private getFunctionPressureMetric(): number {
    // This is a simplified implementation - in practice you'd track
    // concurrent function executions across the entire system
    const activeFunctions = this.concurrentFunctions.size;
    const maxConcurrent = 10; // Conservative estimate for concurrent functions
    
    return Math.min(activeFunctions / maxConcurrent, 1.0);
  }

  /**
   * Record an API call for rate tracking
   */
  recordApiCall(): void {
    this.recentApiCalls.push(Date.now());
  }

  /**
   * Track function execution start
   */
  startFunctionExecution(functionId: string): void {
    this.concurrentFunctions.add(functionId);
  }

  /**
   * Track function execution end
   */
  endFunctionExecution(functionId: string): void {
    this.concurrentFunctions.delete(functionId);
  }

  /**
   * Calculate overall load factor from metrics
   */
  private calculateLoadFactor(
    metrics: SystemMetrics, 
    weights: LoadCalculationWeights = DEFAULT_WEIGHTS
  ): number {
    const load = 
      metrics.memoryUsage * weights.memory +
      metrics.rssMemoryUsage * weights.rssMemory +
      metrics.activeEvaluations * weights.evaluations +
      metrics.apiRateUsage * weights.apiRate +
      metrics.functionPressure * weights.functionPressure;

    return Math.min(Math.max(load, 0), 1);
  }

  /**
   * Get historical load data for analysis
   */
  async getLoadHistory(hours: number = 24): Promise<SystemMetrics[]> {
    try {
      const cutoff = Date.now() - (hours * 60 * 60 * 1000);
      
      const snapshot = await db.collection('systemMetrics')
        .where('timestamp', '>', cutoff)
        .orderBy('timestamp', 'desc')
        .limit(hours * 60) // Max one record per minute
        .get();

      return snapshot.docs.map(doc => doc.data() as SystemMetrics);
    } catch (error) {
      logger.warn('[SYSTEM_LOAD] Could not fetch load history', { error });
      return [];
    }
  }

  /**
   * Store current metrics for historical analysis
   */
  async storeMetricsForHistory(): Promise<void> {
    try {
      if (!this.metricsCache) return;

      await db.collection('systemMetrics').add({
        ...this.metricsCache,
        timestamp: admin.firestore.Timestamp.now()
      });
    } catch (error) {
      // Don't throw - this is just for analysis
      logger.warn('[SYSTEM_LOAD] Could not store metrics', { error });
    }
  }

  /**
   * Clear cache to force fresh metrics
   */
  clearCache(): void {
    this.metricsCache = null;
    this.lastCacheTime = 0;
  }

  /**
   * Get load-adjusted batch size recommendation
   */
  getRecommendedBatchSize(
    baseSize: number,
    complexityFactor: number = 1.0,
    systemLoad?: number
  ): number {
    const load = systemLoad ?? 0.5; // Default if not provided
    
    // Apply load-based reduction
    let adjustedSize = baseSize;
    if (load > 0.8) adjustedSize = 1;
    else if (load > 0.6) adjustedSize = Math.min(2, baseSize);
    else if (load > 0.4) adjustedSize = Math.min(3, baseSize);

    // Apply complexity factor
    adjustedSize = Math.max(1, Math.floor(adjustedSize / complexityFactor));

    return adjustedSize;
  }
}

// Export singleton instance
export const systemLoadService = SystemLoadService.getInstance();
export default systemLoadService;