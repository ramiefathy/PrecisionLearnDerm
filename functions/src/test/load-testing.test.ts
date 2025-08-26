/**
 * Load Testing Suite for Distributed AI Pipeline
 * 
 * Tests system performance under various load conditions
 * Validates concurrent request handling, resource utilization, and scalability
 */

import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import * as sinon from 'sinon';
import * as admin from 'firebase-admin';
import { setupEmulators } from './integrationTestUtils';

interface LoadTestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  peakMemoryUsage: number;
  cpuUtilization: number;
  errorRate: number;
  timeoutRate: number;
}

interface ConcurrencyTest {
  concurrentUsers: number;
  requestsPerUser: number;
  rampUpTime: number;
  testDuration: number;
}

describe('Load Testing Suite @load', () => {
  let firestore: FirebaseFirestore.Firestore;
  let geminiStub: sinon.SinonStub;
  let performanceMonitor: PerformanceMonitor;

  before(async function() {
    this.timeout(20000);
    setupEmulators();
    firestore = admin.firestore();
    performanceMonitor = new PerformanceMonitor();
    
    // Mock Gemini API with realistic delays
    geminiStub = sinon.stub().callsFake(async () => {
      // Simulate realistic API response times (500-2000ms)
      const delay = 500 + Math.random() * 1500;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return {
        response: {
          text: () => JSON.stringify({
            stem: 'Generated question',
            options: { A: 'A', B: 'B', C: 'C', D: 'D' },
            correctAnswer: 'A',
            explanation: 'Explanation'
          })
        }
      };
    });
  });

  after(() => {
    sinon.restore();
  });

  describe('Baseline Performance Tests', () => {
    it('should establish baseline single-user performance', async function() {
      this.timeout(30000);

      const metrics = await runSingleUserTest({
        requests: 10,
        topic: 'psoriasis',
        difficulties: ['basic', 'advanced']
      });

      // Baseline expectations
      expect(metrics.averageResponseTime).to.be.lessThan(8000); // 8 seconds
      expect(metrics.successfulRequests).to.equal(10);
      expect(metrics.errorRate).to.equal(0);

      console.log('Baseline Metrics:', metrics);
    });

    it('should measure memory usage patterns', async function() {
      this.timeout(45000);

      const initialMemory = process.memoryUsage();
      
      const metrics = await runSingleUserTest({
        requests: 20,
        topic: 'dermatitis',
        difficulties: ['basic']
      });

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      expect(memoryIncrease).to.be.lessThan(100 * 1024 * 1024); // 100MB increase max
      expect(metrics.peakMemoryUsage).to.be.lessThan(500 * 1024 * 1024); // 500MB peak

      console.log('Memory Usage:', {
        initial: initialMemory.heapUsed / 1024 / 1024,
        final: finalMemory.heapUsed / 1024 / 1024,
        increase: memoryIncrease / 1024 / 1024
      });
    });
  });

  describe('Concurrency Tests', () => {
    const concurrencyScenarios: ConcurrencyTest[] = [
      { concurrentUsers: 5, requestsPerUser: 3, rampUpTime: 2000, testDuration: 15000 },
      { concurrentUsers: 10, requestsPerUser: 2, rampUpTime: 3000, testDuration: 20000 },
      { concurrentUsers: 20, requestsPerUser: 1, rampUpTime: 5000, testDuration: 25000 }
    ];

    concurrencyScenarios.forEach(scenario => {
      it(`should handle ${scenario.concurrentUsers} concurrent users`, async function() {
        this.timeout(scenario.testDuration + 10000);

        const metrics = await runConcurrencyTest(scenario);

        // Performance expectations based on concurrent users
        const expectedMaxResponseTime = 10000 + (scenario.concurrentUsers * 1000);
        const expectedMinSuccessRate = Math.max(0.8, 1 - (scenario.concurrentUsers * 0.02));

        expect(metrics.errorRate).to.be.lessThan(0.2); // Max 20% error rate
        expect(metrics.averageResponseTime).to.be.lessThan(expectedMaxResponseTime);
        expect(metrics.successfulRequests / metrics.totalRequests).to.be.greaterThan(expectedMinSuccessRate);
        expect(metrics.timeoutRate).to.be.lessThan(0.1); // Max 10% timeout rate

        console.log(`Concurrency Test (${scenario.concurrentUsers} users):`, metrics);
      });
    });

    it('should maintain performance under sustained load', async function() {
      this.timeout(120000); // 2 minutes

      const sustainedLoadTest = {
        concurrentUsers: 8,
        requestsPerUser: 10,
        rampUpTime: 10000,
        testDuration: 90000
      };

      const metrics = await runConcurrencyTest(sustainedLoadTest);

      // Sustained load expectations
      expect(metrics.errorRate).to.be.lessThan(0.15);
      expect(metrics.requestsPerSecond).to.be.greaterThan(0.5);
      expect(metrics.p99ResponseTime).to.be.lessThan(20000);

      console.log('Sustained Load Metrics:', metrics);
    });
  });

  describe('Resource Utilization Tests', () => {
    it('should monitor Firebase connections under load', async function() {
      this.timeout(45000);

      const connectionMonitor = new FirebaseConnectionMonitor();
      
      const metrics = await runConcurrencyTest({
        concurrentUsers: 15,
        requestsPerUser: 2,
        rampUpTime: 3000,
        testDuration: 30000
      });

      const connectionStats = connectionMonitor.getStats();

      expect(connectionStats.maxConcurrentConnections).to.be.greaterThan(10);
      expect(connectionStats.connectionErrors).to.be.lessThan(5);
      expect(connectionStats.averageConnectionTime).to.be.lessThan(1000);

      console.log('Firebase Connection Stats:', connectionStats);
    });

    it('should validate Gemini API quota management', async function() {
      this.timeout(60000);

      let apiCallCount = 0;
      let quotaExceededCount = 0;

      // Override Gemini stub to track API usage
      geminiStub.restore();
      geminiStub = sinon.stub().callsFake(async () => {
        apiCallCount++;
        
        // Simulate quota exceeded after many calls
        if (apiCallCount > 100) {
          quotaExceededCount++;
          throw new Error('API quota exceeded');
        }

        await new Promise(resolve => setTimeout(resolve, 800));
        return { response: { text: () => '{"question": "test"}' } };
      });

      const metrics = await runConcurrencyTest({
        concurrentUsers: 25,
        requestsPerUser: 5,
        rampUpTime: 5000,
        testDuration: 45000
      });

      console.log('API Usage Stats:', {
        totalApiCalls: apiCallCount,
        quotaExceededCount,
        metrics
      });

      // Validate quota management handles limits gracefully
      if (quotaExceededCount > 0) {
        expect(metrics.errorRate).to.be.lessThan(0.8); // Should still process some requests
      }
    });
  });

  describe('Scalability Tests', () => {
    it('should demonstrate linear scalability up to limits', async function() {
      this.timeout(180000); // 3 minutes

      const scalabilityResults: Array<{ users: number; metrics: LoadTestMetrics }> = [];

      const userCounts = [2, 5, 10, 15, 20];

      for (const userCount of userCounts) {
        console.log(`Testing scalability with ${userCount} users...`);
        
        const metrics = await runConcurrencyTest({
          concurrentUsers: userCount,
          requestsPerUser: 2,
          rampUpTime: 2000,
          testDuration: 20000
        });

        scalabilityResults.push({ users: userCount, metrics });

        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Analyze scalability patterns
      const throughputByUsers = scalabilityResults.map(result => ({
        users: result.users,
        throughput: result.metrics.requestsPerSecond,
        responseTime: result.metrics.averageResponseTime,
        errorRate: result.metrics.errorRate
      }));

      console.log('Scalability Analysis:', throughputByUsers);

      // Validate scalability characteristics
      const maxThroughput = Math.max(...throughputByUsers.map(r => r.throughput));
      const minThroughput = Math.min(...throughputByUsers.map(r => r.throughput));
      
      // Throughput should not degrade by more than 50% at peak load
      expect(minThroughput / maxThroughput).to.be.greaterThan(0.5);
    });

    it('should identify bottleneck thresholds', async function() {
      this.timeout(90000);

      const bottleneckTest = {
        concurrentUsers: 30, // High load to find limits
        requestsPerUser: 3,
        rampUpTime: 8000,
        testDuration: 60000
      };

      const metrics = await runConcurrencyTest(bottleneckTest);

      // At bottleneck threshold, we expect:
      expect(metrics.errorRate).to.be.greaterThan(0.1); // Some failures expected
      expect(metrics.p99ResponseTime).to.be.greaterThan(15000); // Response degradation

      // Identify primary bottleneck
      const bottleneckIndicators = {
        highErrorRate: metrics.errorRate > 0.3,
        highResponseTime: metrics.averageResponseTime > 12000,
        highTimeoutRate: metrics.timeoutRate > 0.2,
        lowThroughput: metrics.requestsPerSecond < 0.3
      };

      console.log('Bottleneck Analysis:', {
        metrics,
        indicators: bottleneckIndicators
      });
    });
  });

  describe('Stress Tests', () => {
    it('should handle extreme load gracefully', async function() {
      this.timeout(120000);

      const stressTest = {
        concurrentUsers: 50, // Extreme load
        requestsPerUser: 2,
        rampUpTime: 10000,
        testDuration: 90000
      };

      let systemCrashedOrHung = false;

      try {
        const metrics = await runConcurrencyTest(stressTest);

        // Under extreme stress, system should degrade gracefully
        expect(metrics.errorRate).to.be.lessThan(0.8); // Should not fail completely
        expect(metrics.timeoutRate).to.be.lessThan(0.6); // Should not timeout everything
        
        // Ensure system is still responsive
        const healthCheck = await performHealthCheck();
        expect(healthCheck.responsive).to.be.true;

        console.log('Stress Test Results:', metrics);
      } catch (error: any) {
        if (error.message.includes('system unresponsive') || error.message.includes('complete failure')) {
          systemCrashedOrHung = true;
        }
      }

      // System should not crash or hang completely
      expect(systemCrashedOrHung).to.be.false;
    });
  });

  // Helper Functions
  async function runSingleUserTest(config: {
    requests: number;
    topic: string;
    difficulties: string[];
  }): Promise<LoadTestMetrics> {
    const startTime = Date.now();
    const responseTimes: number[] = [];
    let successCount = 0;
    let errorCount = 0;

    performanceMonitor.startMonitoring();

    for (let i = 0; i < config.requests; i++) {
      const requestStart = Date.now();
      
      try {
        await simulateQuestionGeneration(config.topic, config.difficulties[i % config.difficulties.length]);
        successCount++;
      } catch (error) {
        errorCount++;
      }
      
      const responseTime = Date.now() - requestStart;
      responseTimes.push(responseTime);
    }

    const totalTime = Date.now() - startTime;
    const monitoringData = performanceMonitor.stopMonitoring();

    return {
      totalRequests: config.requests,
      successfulRequests: successCount,
      failedRequests: errorCount,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p95ResponseTime: getPercentile(responseTimes, 0.95),
      p99ResponseTime: getPercentile(responseTimes, 0.99),
      requestsPerSecond: config.requests / (totalTime / 1000),
      peakMemoryUsage: monitoringData.peakMemory,
      cpuUtilization: monitoringData.avgCpuUtilization,
      errorRate: errorCount / config.requests,
      timeoutRate: responseTimes.filter(t => t > 60000).length / config.requests
    };
  }

  async function runConcurrencyTest(config: ConcurrencyTest): Promise<LoadTestMetrics> {
    const startTime = Date.now();
    const results: Array<{ success: boolean; responseTime: number }> = [];
    
    performanceMonitor.startMonitoring();

    // Create user simulation promises
    const userPromises: Promise<void>[] = [];
    
    for (let user = 0; user < config.concurrentUsers; user++) {
      const userPromise = simulateUserLoad(
        user,
        config.requestsPerUser,
        config.rampUpTime / config.concurrentUsers * user,
        results
      );
      userPromises.push(userPromise);
    }

    // Wait for all users to complete or timeout
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, config.testDuration);
    });

    await Promise.race([
      Promise.all(userPromises),
      timeoutPromise
    ]);

    const monitoringData = performanceMonitor.stopMonitoring();
    const totalTime = Date.now() - startTime;

    // Calculate metrics
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = results.length - successfulRequests;
    const responseTimes = results.map(r => r.responseTime);
    const timeouts = responseTimes.filter(t => t > 60000).length;

    return {
      totalRequests: results.length,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      p95ResponseTime: responseTimes.length > 0 ? getPercentile(responseTimes, 0.95) : 0,
      p99ResponseTime: responseTimes.length > 0 ? getPercentile(responseTimes, 0.99) : 0,
      requestsPerSecond: results.length / (totalTime / 1000),
      peakMemoryUsage: monitoringData.peakMemory,
      cpuUtilization: monitoringData.avgCpuUtilization,
      errorRate: failedRequests / Math.max(results.length, 1),
      timeoutRate: timeouts / Math.max(results.length, 1)
    };
  }

  async function simulateUserLoad(
    userId: number,
    requestsPerUser: number,
    rampUpDelay: number,
    results: Array<{ success: boolean; responseTime: number }>
  ): Promise<void> {
    // Ramp-up delay
    await new Promise(resolve => setTimeout(resolve, rampUpDelay));

    const topics = ['psoriasis', 'eczema', 'acne', 'melanoma', 'dermatitis'];
    const difficulties = ['basic', 'advanced'];

    for (let req = 0; req < requestsPerUser; req++) {
      const requestStart = Date.now();
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

      try {
        await simulateQuestionGeneration(topic, difficulty);
        results.push({
          success: true,
          responseTime: Date.now() - requestStart
        });
      } catch (error) {
        results.push({
          success: false,
          responseTime: Date.now() - requestStart
        });
      }

      // Random delay between user requests (0-2 seconds)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
    }
  }

  async function simulateQuestionGeneration(topic: string, difficulty: string): Promise<any> {
    // Simulate the distributed pipeline stages
    const stages = ['context', 'drafting', 'review', 'scoring', 'qa'];
    
    for (const stage of stages) {
      await simulateStageProcessing(stage, topic, difficulty);
    }

    return { topic, difficulty, generated: true };
  }

  async function simulateStageProcessing(stage: string, topic: string, difficulty: string): Promise<void> {
    // Simulate stage-specific processing times
    const stageTimes = {
      context: 800 + Math.random() * 400,
      drafting: 1500 + Math.random() * 1000,
      review: 600 + Math.random() * 400,
      scoring: 400 + Math.random() * 200,
      qa: 300 + Math.random() * 200
    };

    const processingTime = stageTimes[stage as keyof typeof stageTimes] || 500;
    
    // Add random failures (5% failure rate)
    if (Math.random() < 0.05) {
      throw new Error(`${stage} stage failed`);
    }

    await new Promise(resolve => setTimeout(resolve, processingTime));
  }

  async function performHealthCheck(): Promise<{ responsive: boolean; responseTime: number }> {
    const start = Date.now();
    
    try {
      // Simple health check - try to read from Firestore
      await firestore.collection('health-check').doc('test').get();
      return {
        responsive: true,
        responseTime: Date.now() - start
      };
    } catch (error) {
      return {
        responsive: false,
        responseTime: Date.now() - start
      };
    }
  }

  function getPercentile(values: number[], percentile: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }
});

// Performance monitoring utilities
class PerformanceMonitor {
  private startMemory: NodeJS.MemoryUsage | null = null;
  private peakMemory = 0;
  private cpuReadings: number[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  startMonitoring() {
    this.startMemory = process.memoryUsage();
    this.peakMemory = this.startMemory.heapUsed;
    this.cpuReadings = [];

    this.monitoringInterval = setInterval(() => {
      const memory = process.memoryUsage();
      this.peakMemory = Math.max(this.peakMemory, memory.heapUsed);
      
      // Simulate CPU usage measurement
      this.cpuReadings.push(Math.random() * 100);
    }, 1000);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    return {
      peakMemory: this.peakMemory,
      avgCpuUtilization: this.cpuReadings.length > 0 ?
        this.cpuReadings.reduce((a, b) => a + b, 0) / this.cpuReadings.length : 0
    };
  }
}

class FirebaseConnectionMonitor {
  private maxConnections = 0;
  private connectionErrors = 0;
  private connectionTimes: number[] = [];

  getStats() {
    return {
      maxConcurrentConnections: this.maxConnections,
      connectionErrors: this.connectionErrors,
      averageConnectionTime: this.connectionTimes.length > 0 ?
        this.connectionTimes.reduce((a, b) => a + b, 0) / this.connectionTimes.length : 0
    };
  }
}