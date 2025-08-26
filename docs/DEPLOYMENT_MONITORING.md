# Deployment and Monitoring Guide

**Version**: 2.0  
**Last Updated**: 2025-08-15  
**Status**: Production Operations Guide

## Overview

This guide provides comprehensive procedures for deploying, monitoring, and maintaining the PrecisionLearnDerm AI pipeline in production environments. It covers deployment strategies, health monitoring, performance optimization, and incident response procedures.

## Deployment Procedures

### Pre-Deployment Checklist

#### Code Quality Verification
```bash
# 1. Run TypeScript compilation check
npm run build

# 2. Execute unit tests
npm run test

# 3. Validate function signatures
npm run lint

# 4. Security audit
npm audit --audit-level=high

# 5. Check bundle size
npm run analyze
```

#### Configuration Validation
```bash
# 1. Verify API keys are configured
firebase functions:secrets:access GEMINI_API_KEY

# 2. Check Firestore rules
firebase firestore:rules:get

# 3. Validate function configurations
firebase functions:config:get

# 4. Test local emulators
firebase emulators:start --only functions,firestore
```

#### Quality Assurance Testing
```bash
# 1. Test enhanced pipeline
curl -X POST "http://localhost:5001/dermassist-ai-1zyic/us-central1/test_enhanced_pipeline" \
  -H "Content-Type: application/json" \
  -d '{"topicIds": ["psoriasis"], "difficulty": 0.5}'

# 2. Validate medical accuracy
node scripts/test-medical-accuracy.js

# 3. Performance benchmarking
node scripts/performance-test.js
```

### Deployment Strategy

#### Staging Environment Deployment
```bash
# 1. Deploy to staging first
firebase use staging
firebase deploy --only functions

# 2. Run integration tests against staging
npm run test:integration:staging

# 3. Performance testing
npm run test:performance:staging

# 4. Medical accuracy validation
npm run test:medical:staging
```

#### Production Deployment
```bash
# 1. Switch to production project
firebase use production

# 2. Deploy functions with secrets
firebase deploy --only functions

# 3. Deploy Firestore rules and indexes
firebase deploy --only firestore:rules,firestore:indexes

# 4. Verify deployment
firebase functions:list

# 5. Run post-deployment tests
npm run test:production:smoke
```

#### Zero-Downtime Deployment
```bash
# 1. Deploy new version alongside existing
firebase functions:shell

# 2. Gradually route traffic to new version
# (Firebase handles this automatically for Cloud Functions)

# 3. Monitor error rates and performance

# 4. Rollback if necessary
firebase functions:delete FUNCTION_NAME --force
```

### Environment Configuration

#### Development Environment
```typescript
// functions/src/config/development.ts
export const developmentConfig = {
  gemini: {
    model: 'gemini-2.5-pro',
    temperature: 0.8,
    maxTokens: 3072
  },
  quality: {
    targetScore: 15,        // Lower threshold for development
    strictMode: false,      // Faster generation
    maxIterations: 2        // Limited iterations
  },
  monitoring: {
    enableDetailedLogs: true,
    performanceTracking: true,
    errorReporting: true
  }
};
```

#### Staging Environment
```typescript
// functions/src/config/staging.ts
export const stagingConfig = {
  gemini: {
    model: 'gemini-2.5-pro',
    temperature: 0.75,
    maxTokens: 3072
  },
  quality: {
    targetScore: 18,        // Production-like threshold
    strictMode: true,       // Full validation
    maxIterations: 5        // Complete iterations
  },
  monitoring: {
    enableDetailedLogs: true,
    performanceTracking: true,
    errorReporting: true,
    alerting: false         // No alerts in staging
  }
};
```

#### Production Environment
```typescript
// functions/src/config/production.ts
export const productionConfig = {
  gemini: {
    model: 'gemini-2.5-pro',
    temperature: 0.75,
    maxTokens: 3072
  },
  quality: {
    targetScore: 18,        // Standard production threshold
    strictMode: true,       // Full validation
    maxIterations: 5        // Complete quality assurance
  },
  monitoring: {
    enableDetailedLogs: false,    // Performance optimization
    performanceTracking: true,
    errorReporting: true,
    alerting: true,               // Enable production alerts
    metricsCollection: true
  }
};
```

## Health Monitoring

### System Health Endpoints

#### Basic Health Check
```typescript
export const systemHealth = functions.https.onRequest(async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0',
    services: {
      firebase: await checkFirebaseHealth(),
      gemini: await checkGeminiHealth(),
      knowledgeBase: await checkKnowledgeBaseHealth(),
      database: await checkDatabaseHealth()
    },
    metrics: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
  };
  
  const overallHealth = Object.values(healthCheck.services).every(service => 
    (service as any).status === 'healthy'
  );
  
  res.status(overallHealth ? 200 : 503).json({
    ...healthCheck,
    status: overallHealth ? 'healthy' : 'degraded'
  });
});
```

#### Detailed Health Assessment
```typescript
async function checkFirebaseHealth(): Promise<ServiceHealth> {
  try {
    const testDoc = await db.collection('system').doc('health').get();
    return {
      status: 'healthy',
      responseTime: Date.now() - testDoc.readTime.toMillis(),
      details: 'Firestore connection successful'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      details: 'Firestore connection failed'
    };
  }
}

async function checkGeminiHealth(): Promise<ServiceHealth> {
  try {
    const startTime = Date.now();
    const testPrompt = "Test connection";
    await callGeminiAPI(testPrompt);
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      details: 'Gemini API connection successful'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      details: 'Gemini API connection failed'
    };
  }
}
```

### Performance Monitoring

#### Real-Time Metrics Collection
```typescript
interface PerformanceMetrics {
  functionName: string;
  timestamp: number;
  executionTime: number;
  memoryUsed: number;
  success: boolean;
  qualityScore?: number;
  errorType?: string;
}

class MetricsCollector {
  private metrics: PerformanceMetrics[] = [];
  
  recordExecution(
    functionName: string,
    executionTime: number,
    success: boolean,
    additionalMetrics?: Partial<PerformanceMetrics>
  ) {
    const metric: PerformanceMetrics = {
      functionName,
      timestamp: Date.now(),
      executionTime,
      memoryUsed: process.memoryUsage().heapUsed,
      success,
      ...additionalMetrics
    };
    
    this.metrics.push(metric);
    
    // Send to monitoring service
    this.sendToMonitoring(metric);
    
    // Clean up old metrics
    this.cleanupMetrics();
  }
  
  private async sendToMonitoring(metric: PerformanceMetrics) {
    // Send to Firebase Analytics, Google Cloud Monitoring, or other service
    await db.collection('metrics').add(metric);
  }
  
  private cleanupMetrics() {
    // Keep only last 1000 metrics in memory
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }
  
  getAverageExecutionTime(functionName: string, timeWindow: number = 3600000): number {
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = this.metrics.filter(m => 
      m.functionName === functionName && m.timestamp > cutoff && m.success
    );
    
    if (recentMetrics.length === 0) return 0;
    
    const totalTime = recentMetrics.reduce((sum, m) => sum + m.executionTime, 0);
    return totalTime / recentMetrics.length;
  }
  
  getSuccessRate(functionName: string, timeWindow: number = 3600000): number {
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = this.metrics.filter(m => 
      m.functionName === functionName && m.timestamp > cutoff
    );
    
    if (recentMetrics.length === 0) return 1;
    
    const successCount = recentMetrics.filter(m => m.success).length;
    return successCount / recentMetrics.length;
  }
}

const metricsCollector = new MetricsCollector();
```

#### Quality Metrics Tracking
```typescript
interface QualityMetrics {
  averageQualityScore: number;
  medicalAccuracyRate: number;
  structurePassRate: number;
  abdComplianceRate: number;
  topPerformingTopics: string[];
  improvementOpportunities: string[];
}

class QualityTracker {
  async collectDailyMetrics(): Promise<QualityMetrics> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const metrics = await db.collection('metrics')
      .where('timestamp', '>=', yesterday.getTime())
      .where('qualityScore', '>', 0)
      .get();
    
    const qualityScores = metrics.docs.map(doc => doc.data().qualityScore);
    const averageQualityScore = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    
    return {
      averageQualityScore,
      medicalAccuracyRate: await this.calculateAccuracyRate(metrics),
      structurePassRate: await this.calculateStructurePassRate(metrics),
      abdComplianceRate: await this.calculateABDComplianceRate(metrics),
      topPerformingTopics: await this.getTopPerformingTopics(metrics),
      improvementOpportunities: await this.getImprovementOpportunities(metrics)
    };
  }
  
  private async calculateAccuracyRate(metrics: FirebaseFirestore.QuerySnapshot): Promise<number> {
    // Implementation for calculating medical accuracy rate
    return 0.94; // Placeholder
  }
}
```

### Alerting System

#### Critical Alert Conditions
```typescript
interface AlertCondition {
  name: string;
  condition: (metrics: PerformanceMetrics[]) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldown: number; // Minutes before re-alerting
}

const alertConditions: AlertCondition[] = [
  {
    name: 'High Error Rate',
    condition: (metrics) => {
      const recentMetrics = metrics.filter(m => 
        Date.now() - m.timestamp < 5 * 60 * 1000 // Last 5 minutes
      );
      const errorRate = recentMetrics.filter(m => !m.success).length / recentMetrics.length;
      return errorRate > 0.1; // More than 10% errors
    },
    severity: 'critical',
    cooldown: 15
  },
  {
    name: 'Slow Response Time',
    condition: (metrics) => {
      const avgTime = metricsCollector.getAverageExecutionTime('ai_generate_enhanced_mcq', 10 * 60 * 1000);
      return avgTime > 5000; // More than 5 seconds
    },
    severity: 'medium',
    cooldown: 30
  },
  {
    name: 'Low Quality Scores',
    condition: (metrics) => {
      const recentQualityScores = metrics
        .filter(m => m.qualityScore && Date.now() - m.timestamp < 30 * 60 * 1000)
        .map(m => m.qualityScore);
      
      if (recentQualityScores.length === 0) return false;
      
      const avgQuality = recentQualityScores.reduce((sum, score) => sum + score!, 0) / recentQualityScores.length;
      return avgQuality < 15; // Below minimum threshold
    },
    severity: 'high',
    cooldown: 60
  }
];
```

#### Alert Notification System
```typescript
class AlertManager {
  private lastAlertTimes = new Map<string, number>();
  
  async checkAndSendAlerts(metrics: PerformanceMetrics[]) {
    for (const alert of alertConditions) {
      if (this.shouldSkipAlert(alert)) continue;
      
      if (alert.condition(metrics)) {
        await this.sendAlert(alert, metrics);
        this.lastAlertTimes.set(alert.name, Date.now());
      }
    }
  }
  
  private shouldSkipAlert(alert: AlertCondition): boolean {
    const lastAlert = this.lastAlertTimes.get(alert.name);
    if (!lastAlert) return false;
    
    const cooldownMs = alert.cooldown * 60 * 1000;
    return Date.now() - lastAlert < cooldownMs;
  }
  
  private async sendAlert(alert: AlertCondition, metrics: PerformanceMetrics[]) {
    const alertData = {
      alert: alert.name,
      severity: alert.severity,
      timestamp: new Date().toISOString(),
      metrics: this.summarizeMetrics(metrics),
      actions: this.getRecommendedActions(alert)
    };
    
    // Send to monitoring service (e.g., PagerDuty, Slack, email)
    await this.notifyOperations(alertData);
    
    // Log alert
    await logError('Alert triggered', alertData);
  }
  
  private getRecommendedActions(alert: AlertCondition): string[] {
    switch (alert.name) {
      case 'High Error Rate':
        return [
          'Check Gemini API status',
          'Verify Firebase connectivity',
          'Review recent deployments',
          'Check error logs for patterns'
        ];
      case 'Slow Response Time':
        return [
          'Check Gemini API latency',
          'Monitor Firebase function cold starts',
          'Review memory usage patterns',
          'Consider scaling function instances'
        ];
      case 'Low Quality Scores':
        return [
          'Review recent knowledge base changes',
          'Check medical accuracy validation rules',
          'Examine generation parameters',
          'Validate example questions used in prompts'
        ];
      default:
        return ['Investigate system status', 'Review recent changes'];
    }
  }
}
```

## Performance Optimization

### Function Performance Tuning

#### Memory and Timeout Configuration
```typescript
// High-performance configuration for production
export const optimizedGeneration = functions
  .runWith({
    memory: '2GB',
    timeoutSeconds: 300,
    maxInstances: 100,
    minInstances: 5  // Keep warm instances
  })
  .https.onCall(async (data, context) => {
    // Function implementation
  });
```

#### Caching Strategy
```typescript
interface CacheEntry {
  question: any;
  timestamp: number;
  qualityScore: number;
  accessCount: number;
}

class QuestionCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 60 * 60 * 1000; // 1 hour
  private readonly MAX_SIZE = 1000;
  
  generateCacheKey(topicId: string, difficulty: number): string {
    return `${topicId}_${Math.round(difficulty * 10)}`;
  }
  
  async get(topicId: string, difficulty: number): Promise<any | null> {
    const key = this.generateCacheKey(topicId, difficulty);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    // Update access count
    entry.accessCount++;
    return entry.question;
  }
  
  async set(topicId: string, difficulty: number, question: any, qualityScore: number) {
    // Only cache high-quality questions
    if (qualityScore < 20) return;
    
    const key = this.generateCacheKey(topicId, difficulty);
    
    // Clean up cache if at max size
    if (this.cache.size >= this.MAX_SIZE) {
      this.evictLeastUsed();
    }
    
    this.cache.set(key, {
      question,
      timestamp: Date.now(),
      qualityScore,
      accessCount: 0
    });
  }
  
  private evictLeastUsed() {
    let leastUsedKey = '';
    let leastAccessCount = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < leastAccessCount) {
        leastAccessCount = entry.accessCount;
        leastUsedKey = key;
      }
    }
    
    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }
}

const questionCache = new QuestionCache();
```

#### Batch Processing Optimization
```typescript
export const batchGeneration = functions
  .runWith({
    memory: '4GB',
    timeoutSeconds: 540 // 9 minutes
  })
  .https.onCall(async (data: { requests: any[] }, context) => {
    const { requests } = data;
    
    // Process in parallel batches
    const batchSize = 5;
    const results = [];
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(request => 
        processGenerationRequest(request).catch(error => ({ error: error.message }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return { success: true, results };
  });
```

### Database Optimization

#### Firestore Index Management
```javascript
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "metrics",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "functionName", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "questions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "topicIds", "arrayConfig": "CONTAINS" },
        { "fieldPath": "qualityScore", "order": "DESCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

#### Query Optimization
```typescript
// Efficient query patterns
class OptimizedQueries {
  async getHighQualityQuestions(topicId: string, limit: number = 10) {
    // Use composite index for efficient filtering
    return db.collection('questions')
      .where('topicIds', 'array-contains', topicId)
      .where('qualityScore', '>=', 20)
      .orderBy('qualityScore', 'desc')
      .limit(limit)
      .get();
  }
  
  async getRecentMetrics(functionName: string, hours: number = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    
    return db.collection('metrics')
      .where('functionName', '==', functionName)
      .where('timestamp', '>=', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();
  }
}
```

## Incident Response

### Incident Classification

#### Severity Levels
| Level | Description | Response Time | Examples |
|-------|------------|---------------|----------|
| **P1 - Critical** | System completely down | 15 minutes | Total service outage, data loss |
| **P2 - High** | Major functionality impaired | 1 hour | High error rates, slow responses |
| **P3 - Medium** | Minor functionality issues | 4 hours | Quality degradation, minor bugs |
| **P4 - Low** | Cosmetic or enhancement | 24 hours | UI issues, feature requests |

#### Incident Response Playbook

##### P1 - Critical Incident Response
```bash
# 1. Immediate Assessment (0-15 minutes)
# Check system status
curl "https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/systemHealth"

# Check Firebase Functions status
firebase functions:list

# Review error logs
firebase functions:log

# 2. Emergency Mitigation (15-30 minutes)
# Enable fallback mode
firebase functions:config:set system.fallback_mode=true
firebase deploy --only functions:config

# Scale down if needed
firebase functions:config:set system.max_instances=10

# 3. Root Cause Analysis (30-60 minutes)
# Analyze error patterns
# Check recent deployments
# Verify external dependencies

# 4. Resolution and Recovery (60+ minutes)
# Implement fix
# Deploy to staging first
# Gradual production rollout
# Monitor metrics closely
```

##### P2 - High Priority Response
```bash
# 1. Investigation (0-60 minutes)
# Collect performance metrics
# Analyze error patterns
# Check resource utilization

# 2. Temporary Mitigation
# Adjust quality thresholds if needed
# Increase timeout values
# Enable additional logging

# 3. Permanent Fix
# Develop and test solution
# Deploy during maintenance window
# Update monitoring thresholds
```

### Recovery Procedures

#### Database Recovery
```bash
# 1. Backup current state
firebase firestore:export gs://your-backup-bucket/backup-$(date +%Y%m%d-%H%M%S)

# 2. Restore from backup if needed
firebase firestore:import gs://your-backup-bucket/backup-TIMESTAMP

# 3. Validate data integrity
node scripts/validate-data-integrity.js
```

#### Function Recovery
```bash
# 1. Rollback to previous version
firebase functions:delete FUNCTION_NAME
firebase deploy --only functions:FUNCTION_NAME

# 2. Verify functionality
npm run test:production:smoke

# 3. Monitor for stability
watch -n 30 'curl -s "https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/systemHealth" | jq .status'
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily Tasks
- [ ] Review system health dashboard
- [ ] Check error logs for new issues
- [ ] Monitor quality metrics
- [ ] Verify backup completion

#### Weekly Tasks
- [ ] Analyze performance trends
- [ ] Review and update quality thresholds
- [ ] Clean up old logs and metrics
- [ ] Update security patches

#### Monthly Tasks
- [ ] Comprehensive security audit
- [ ] Performance optimization review
- [ ] Knowledge base quality assessment
- [ ] Cost optimization analysis

### Automated Maintenance
```typescript
// Daily maintenance function
export const dailyMaintenance = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('America/Los_Angeles')
  .onRun(async (context) => {
    await performDailyMaintenance();
  });

async function performDailyMaintenance() {
  // Clean up old metrics
  await cleanupOldMetrics();
  
  // Generate quality report
  await generateDailyQualityReport();
  
  // Update cache statistics
  await updateCacheStatistics();
  
  // Validate system health
  await validateSystemHealth();
}
```

This comprehensive deployment and monitoring guide ensures reliable operation of the PrecisionLearnDerm AI pipeline with proactive monitoring, automated alerting, and efficient incident response procedures.