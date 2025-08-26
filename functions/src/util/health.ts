// src/util/health.ts
// System Health Monitoring - Moved from monitoring.ts to break circular dependency

import * as admin from 'firebase-admin';
import { logError } from './monitoring'; // Will depend on monitoring for logging errors

// Moved from monitoring.ts
interface SystemHealth {
  component: string;
  status: 'healthy' | 'degraded' | 'critical';
  latency?: number;
  errorRate?: number;
  lastCheck: number;
  details?: any;
}

// Moved from monitoring.ts
export class SystemHealthMonitor {
  private healthChecks: Map<string, SystemHealth> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  
  constructor() {
    // DO NOT start setInterval here - deferred to start() method
  }

  public start(): void {
    if (this.intervalId) return; // Prevent multiple intervals
    // Run health checks every 30 seconds
    this.intervalId = setInterval(() => this.runHealthChecks(), 30000);
    // Run initial health check on startup
    this.runHealthChecks();
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async runHealthChecks(): Promise<void> {
    const checks = [
      this.checkDatabase(),
      this.checkGeminiAPI(),
      this.checkCache()
    ];
    
    const results = await Promise.allSettled(checks);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logError('health.check_failed', result.reason, { checkIndex: index });
      }
    });
  }

  private async checkDatabase(): Promise<void> {
    const startTime = Date.now();
    const db = admin.firestore(); // Get instance locally
    
    try {
      await db.collection('health_check').doc('test').set({ 
        timestamp: admin.firestore.FieldValue.serverTimestamp() 
      });
      
      const latency = Date.now() - startTime;
      
      const health: SystemHealth = {
        component: 'database',
        status: latency > 5000 ? 'degraded' : 'healthy',
        latency,
        lastCheck: Date.now(),
        details: { readWrite: 'success' }
      };
      
      this.healthChecks.set('database', health);
      
    } catch (error: any) {
      this.healthChecks.set('database', {
        component: 'database',
        status: 'critical',
        lastCheck: Date.now(),
        details: { error: error.message }
      });
    }
  }

  private async checkGeminiAPI(): Promise<void> {
    try {
      const { config } = await import('./config');
      const hasApiKey = config.gemini.hasApiKey();
      
      const health: SystemHealth = {
        component: 'gemini_api',
        status: hasApiKey ? 'healthy' : 'critical',
        lastCheck: Date.now(),
        details: { hasApiKey, configured: hasApiKey }
      };
      
      this.healthChecks.set('gemini_api', health);
      
    } catch (error: any) {
      this.healthChecks.set('gemini_api', {
        component: 'gemini_api',
        status: 'critical',
        lastCheck: Date.now(),
        details: { error: error.message }
      });
    }
  }

  private async checkCache(): Promise<void> {
    try {
      const { getMCQCache } = await import('./enhancedCache');
      const cache = getMCQCache();
      
      const testKey = `health_check_${Date.now()}`;
      const testData = { test: true, timestamp: Date.now() };
      
      await cache.set(testKey, testData, 60000);
      const retrieved = await cache.get(testKey);
      await cache.delete(testKey);
      
      const health: SystemHealth = {
        component: 'cache_system',
        status: retrieved !== null ? 'healthy' : 'degraded',
        lastCheck: Date.now(),
        details: { 
          writeTest: 'passed',
          readTest: retrieved !== null ? 'passed' : 'failed',
          deleteTest: 'passed'
        }
      };
      
      this.healthChecks.set('cache_system', health);
      
    } catch (error: any) {
      this.healthChecks.set('cache_system', {
        component: 'cache_system',
        status: 'critical',
        lastCheck: Date.now(),
        details: { error: error.message }
      });
    }
  }

  getSystemHealth(): {
    overall: 'healthy' | 'degraded' | 'critical';
    components: SystemHealth[];
    timestamp: string;
  } {
    const components = Array.from(this.healthChecks.values());
    
    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (components.some(c => c.status === 'critical')) {
      overall = 'critical';
    } else if (components.some(c => c.status === 'degraded')) {
      overall = 'degraded';
    }
    
    return {
      overall,
      components,
      timestamp: new Date().toISOString()
    };
  }
}

// Moved from monitoring.ts
let systemHealthMonitor: SystemHealthMonitor;

// Moved from monitoring.ts
export function getSystemHealthMonitor(): SystemHealthMonitor {
  if (!systemHealthMonitor) {
    systemHealthMonitor = new SystemHealthMonitor();
  }
  return systemHealthMonitor;
}