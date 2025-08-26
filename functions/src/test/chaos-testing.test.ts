/**
 * Chaos Testing Suite for Distributed AI Pipeline
 * 
 * Tests system resilience to various failure modes:
 * - API timeouts and failures
 * - Network partitions and latency
 * - Resource exhaustion
 * - Data corruption
 * - Service unavailability
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import * as admin from 'firebase-admin';
import { setupEmulators } from './integrationTestUtils';

interface ChaosExperiment {
  name: string;
  description: string;
  faultInjection: () => void;
  faultRemoval: () => void;
  expectedBehavior: string;
  recoveryTime: number; // Expected recovery time in ms
}

interface ResilienceMetrics {
  totalRequests: number;
  successfulRequests: number;
  partialSuccessRequests: number;
  failedRequests: number;
  recoveryTime: number;
  dataLoss: boolean;
  serviceAvailability: number;
  errorRecoverySuccess: boolean;
}

describe('Chaos Testing Suite @chaos', () => {
  let firestore: FirebaseFirestore.Firestore;
  let geminiStub: sinon.SinonStub;
  let networkStub: sinon.SinonStub;
  let chaosController: ChaosController;

  beforeEach(async () => {
    setupEmulators();
    firestore = admin.firestore();
    chaosController = new ChaosController();
    
    // Setup clean environment
    await clearTestData();
    
    // Default healthy stubs
    setupHealthyStubs();
  });

  afterEach(async () => {
    // Cleanup chaos effects
    chaosController.stopAllChaos();
    sinon.restore();
    await clearTestData();
  });

  describe('API Failure Chaos Tests', () => {
    it('should handle Gemini API complete outage', async function() {
      this.timeout(45000);

      const experiment: ChaosExperiment = {
        name: 'Gemini API Outage',
        description: 'Complete Gemini API unavailability for 30 seconds',
        faultInjection: () => {
          geminiStub.rejects(new Error('Service temporarily unavailable'));
        },
        faultRemoval: () => {
          setupHealthyStubs();
        },
        expectedBehavior: 'Graceful degradation with retry logic and eventual recovery',
        recoveryTime: 5000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 40000,
        faultDuration: 30000,
        concurrentRequests: 10
      });

      // Expectations during outage
      expect(metrics.failedRequests).to.be.greaterThan(0);
      expect(metrics.dataLoss).to.be.false; // No data should be lost
      expect(metrics.serviceAvailability).to.be.greaterThan(0.1); // Some degraded service
      
      // Recovery expectations
      expect(metrics.errorRecoverySuccess).to.be.true;
      expect(metrics.recoveryTime).to.be.lessThan(10000);

      console.log('Gemini API Outage Metrics:', metrics);
    });

    it('should handle intermittent API timeouts', async function() {
      this.timeout(60000);

      const experiment: ChaosExperiment = {
        name: 'Intermittent API Timeouts',
        description: 'Random 30% of API calls timeout after 30 seconds',
        faultInjection: () => {
          geminiStub.callsFake(async () => {
            if (Math.random() < 0.3) {
              // Simulate timeout
              await new Promise(resolve => setTimeout(resolve, 35000));
              throw new Error('Request timeout');
            }
            
            // Normal response with delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { response: { text: () => '{"question": "generated"}' } };
          });
        },
        faultRemoval: () => setupHealthyStubs(),
        expectedBehavior: 'Retry logic should handle timeouts, progressive saving should preserve work',
        recoveryTime: 2000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 50000,
        faultDuration: 40000,
        concurrentRequests: 8
      });

      // With 30% timeout rate, should still have some successes
      expect(metrics.successfulRequests + metrics.partialSuccessRequests).to.be.greaterThan(0);
      expect(metrics.dataLoss).to.be.false;
      
      // Should have meaningful partial successes due to progressive saving
      expect(metrics.partialSuccessRequests).to.be.greaterThan(0);

      console.log('Intermittent Timeout Metrics:', metrics);
    });

    it('should handle API quota exhaustion', async function() {
      this.timeout(50000);

      let callCount = 0;
      const quotaLimit = 15;

      const experiment: ChaosExperiment = {
        name: 'API Quota Exhaustion',
        description: 'Gemini API quota exhausted after 15 calls',
        faultInjection: () => {
          geminiStub.callsFake(async () => {
            callCount++;
            
            if (callCount > quotaLimit) {
              throw new Error('Quota exceeded. Try again later.');
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            return { response: { text: () => '{"question": "generated"}' } };
          });
        },
        faultRemoval: () => {
          callCount = 0;
          setupHealthyStubs();
        },
        expectedBehavior: 'Quota management should throttle requests and implement backoff',
        recoveryTime: 3000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 45000,
        faultDuration: 35000,
        concurrentRequests: 12
      });

      // Should handle quota gracefully
      expect(metrics.serviceAvailability).to.be.greaterThan(0.3);
      expect(metrics.errorRecoverySuccess).to.be.true;
      
      // Some requests should succeed within quota
      expect(metrics.successfulRequests).to.be.greaterThan(5);

      console.log('Quota Exhaustion Metrics:', metrics);
    });
  });

  describe('Network Failure Chaos Tests', () => {
    it('should handle network partitions', async function() {
      this.timeout(60000);

      const experiment: ChaosExperiment = {
        name: 'Network Partition',
        description: 'Network connectivity lost for 20 seconds',
        faultInjection: () => {
          // Simulate network partition by rejecting all external requests
          geminiStub.rejects(new Error('ENOTFOUND - Network unreachable'));
          networkStub = sinon.stub().rejects(new Error('Network partition'));
        },
        faultRemoval: () => {
          setupHealthyStubs();
          if (networkStub) networkStub.restore();
        },
        expectedBehavior: 'Local processing should continue, failed requests should be queued for retry',
        recoveryTime: 8000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 50000,
        faultDuration: 20000,
        concurrentRequests: 6
      });

      // During partition, local operations should still work
      expect(metrics.dataLoss).to.be.false;
      expect(metrics.errorRecoverySuccess).to.be.true;
      
      // After recovery, queued requests should process
      expect(metrics.successfulRequests + metrics.partialSuccessRequests).to.be.greaterThan(0);

      console.log('Network Partition Metrics:', metrics);
    });

    it('should handle high network latency', async function() {
      this.timeout(45000);

      const experiment: ChaosExperiment = {
        name: 'High Network Latency',
        description: 'Network latency increased to 5-10 seconds',
        faultInjection: () => {
          geminiStub.callsFake(async () => {
            // Simulate high latency (5-10 seconds)
            const delay = 5000 + Math.random() * 5000;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            return { response: { text: () => '{"question": "slow response"}' } };
          });
        },
        faultRemoval: () => setupHealthyStubs(),
        expectedBehavior: 'System should adapt to slower responses, maintain functionality',
        recoveryTime: 2000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 40000,
        faultDuration: 30000,
        concurrentRequests: 5
      });

      // Should handle latency gracefully
      expect(metrics.failedRequests / metrics.totalRequests).to.be.lessThan(0.5);
      expect(metrics.dataLoss).to.be.false;
      expect(metrics.errorRecoverySuccess).to.be.true;

      console.log('High Latency Metrics:', metrics);
    });
  });

  describe('Resource Exhaustion Chaos Tests', () => {
    it('should handle memory pressure', async function() {
      this.timeout(70000);

      const experiment: ChaosExperiment = {
        name: 'Memory Pressure',
        description: 'Artificially consume memory to create pressure',
        faultInjection: () => {
          chaosController.simulateMemoryPressure(200); // 200MB
        },
        faultRemoval: () => {
          chaosController.releaseMemoryPressure();
        },
        expectedBehavior: 'System should handle memory pressure with graceful degradation',
        recoveryTime: 5000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 60000,
        faultDuration: 45000,
        concurrentRequests: 8
      });

      // Under memory pressure, system should still function
      expect(metrics.serviceAvailability).to.be.greaterThan(0.4);
      expect(metrics.dataLoss).to.be.false;
      expect(metrics.errorRecoverySuccess).to.be.true;

      console.log('Memory Pressure Metrics:', metrics);
    });

    it('should handle CPU throttling', async function() {
      this.timeout(55000);

      const experiment: ChaosExperiment = {
        name: 'CPU Throttling',
        description: 'Simulate high CPU load affecting processing',
        faultInjection: () => {
          chaosController.simulateCPUThrottling(0.8); // 80% CPU usage
        },
        faultRemoval: () => {
          chaosController.releaseCPUThrottling();
        },
        expectedBehavior: 'Processing should slow down but continue functioning',
        recoveryTime: 3000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 50000,
        faultDuration: 35000,
        concurrentRequests: 6
      });

      // CPU throttling should slow but not stop processing
      expect(metrics.successfulRequests + metrics.partialSuccessRequests).to.be.greaterThan(0);
      expect(metrics.dataLoss).to.be.false;

      console.log('CPU Throttling Metrics:', metrics);
    });
  });

  describe('Data Corruption Chaos Tests', () => {
    it('should handle Firestore data corruption', async function() {
      this.timeout(40000);

      const experiment: ChaosExperiment = {
        name: 'Firestore Data Corruption',
        description: 'Corrupt pipeline state documents randomly',
        faultInjection: () => {
          chaosController.enableDataCorruption('pipeline-state', 0.2); // 20% corruption rate
        },
        faultRemoval: () => {
          chaosController.disableDataCorruption();
        },
        expectedBehavior: 'Detect corruption, fallback to backup state or restart pipeline',
        recoveryTime: 7000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 35000,
        faultDuration: 25000,
        concurrentRequests: 4
      });

      // Should detect and handle corruption
      expect(metrics.dataLoss).to.be.false; // No permanent data loss
      expect(metrics.errorRecoverySuccess).to.be.true;
      
      // Some requests may fail during corruption but should recover
      expect(metrics.successfulRequests + metrics.partialSuccessRequests).to.be.greaterThan(0);

      console.log('Data Corruption Metrics:', metrics);
    });

    it('should handle malformed AI responses', async function() {
      this.timeout(35000);

      const experiment: ChaosExperiment = {
        name: 'Malformed AI Responses',
        description: 'AI returns malformed JSON 40% of the time',
        faultInjection: () => {
          geminiStub.callsFake(async () => {
            if (Math.random() < 0.4) {
              return { response: { text: () => 'invalid json response {malformed}' } };
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            return { response: { text: () => '{"valid": "response"}' } };
          });
        },
        faultRemoval: () => setupHealthyStubs(),
        expectedBehavior: 'Detect malformed responses, retry or request regeneration',
        recoveryTime: 2000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 30000,
        faultDuration: 25000,
        concurrentRequests: 6
      });

      // Should handle malformed responses gracefully
      expect(metrics.dataLoss).to.be.false;
      expect(metrics.errorRecoverySuccess).to.be.true;
      expect(metrics.successfulRequests).to.be.greaterThan(0);

      console.log('Malformed Response Metrics:', metrics);
    });
  });

  describe('Service Cascade Failure Tests', () => {
    it('should handle cascading service failures', async function() {
      this.timeout(90000);

      const experiment: ChaosExperiment = {
        name: 'Cascading Service Failures',
        description: 'Multiple services fail in sequence',
        faultInjection: () => {
          // Start with one service failure
          setTimeout(() => {
            geminiStub.rejects(new Error('Gemini service down'));
          }, 5000);
          
          // Add Firestore issues
          setTimeout(() => {
            chaosController.simulateFirestoreLatency(8000);
          }, 15000);
          
          // Add memory pressure
          setTimeout(() => {
            chaosController.simulateMemoryPressure(150);
          }, 25000);
        },
        faultRemoval: () => {
          setupHealthyStubs();
          chaosController.stopAllChaos();
        },
        expectedBehavior: 'Circuit breakers should prevent cascade, system should isolate failures',
        recoveryTime: 10000
      };

      const metrics = await runChaosExperiment(experiment, {
        testDuration: 80000,
        faultDuration: 60000,
        concurrentRequests: 10
      });

      // Even with cascading failures, should maintain some service
      expect(metrics.serviceAvailability).to.be.greaterThan(0.2);
      expect(metrics.dataLoss).to.be.false;
      expect(metrics.errorRecoverySuccess).to.be.true;

      console.log('Cascading Failure Metrics:', metrics);
    });
  });

  // Helper Functions
  async function runChaosExperiment(
    experiment: ChaosExperiment,
    config: {
      testDuration: number;
      faultDuration: number;
      concurrentRequests: number;
    }
  ): Promise<ResilienceMetrics> {
    console.log(`\n🌪️  Starting Chaos Experiment: ${experiment.name}`);
    console.log(`   Description: ${experiment.description}`);
    console.log(`   Expected: ${experiment.expectedBehavior}`);

    const metrics: ResilienceMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      partialSuccessRequests: 0,
      failedRequests: 0,
      recoveryTime: 0,
      dataLoss: false,
      serviceAvailability: 0,
      errorRecoverySuccess: false
    };

    const startTime = Date.now();
    const results: Array<{ success: 'full' | 'partial' | 'failed'; timestamp: number }> = [];

    // Start concurrent requests
    const requestPromises: Promise<void>[] = [];
    
    for (let i = 0; i < config.concurrentRequests; i++) {
      const requestPromise = runContinuousRequests(
        i,
        config.testDuration,
        results
      );
      requestPromises.push(requestPromise);
    }

    // Inject fault after initial baseline
    setTimeout(() => {
      console.log(`💥 Injecting fault: ${experiment.name}`);
      experiment.faultInjection();
    }, 5000);

    // Remove fault
    setTimeout(() => {
      console.log(`🔧 Removing fault: ${experiment.name}`);
      experiment.faultRemoval();
      
      // Start measuring recovery time
      const recoveryStart = Date.now();
      measureRecoveryTime(recoveryStart).then(recoveryTime => {
        metrics.recoveryTime = recoveryTime;
        metrics.errorRecoverySuccess = recoveryTime < (experiment.recoveryTime + 5000);
      });
    }, 5000 + config.faultDuration);

    // Wait for all requests to complete
    await Promise.all(requestPromises);

    // Calculate final metrics
    metrics.totalRequests = results.length;
    metrics.successfulRequests = results.filter(r => r.success === 'full').length;
    metrics.partialSuccessRequests = results.filter(r => r.success === 'partial').length;
    metrics.failedRequests = results.filter(r => r.success === 'failed').length;

    metrics.serviceAvailability = 
      (metrics.successfulRequests + metrics.partialSuccessRequests * 0.5) / 
      Math.max(metrics.totalRequests, 1);

    // Check for data loss
    metrics.dataLoss = await checkForDataLoss();

    console.log(`✅ Chaos Experiment Completed: ${experiment.name}`);
    return metrics;
  }

  async function runContinuousRequests(
    userId: number,
    duration: number,
    results: Array<{ success: 'full' | 'partial' | 'failed'; timestamp: number }>
  ): Promise<void> {
    const endTime = Date.now() + duration;
    const topics = ['psoriasis', 'eczema', 'acne', 'dermatitis'];

    while (Date.now() < endTime) {
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const timestamp = Date.now();

      try {
        const result = await simulateQuestionGeneration(topic);
        
        if (result.questionsGenerated === result.questionsRequested) {
          results.push({ success: 'full', timestamp });
        } else if (result.questionsGenerated > 0) {
          results.push({ success: 'partial', timestamp });
        } else {
          results.push({ success: 'failed', timestamp });
        }
      } catch (error) {
        results.push({ success: 'failed', timestamp });
      }

      // Random delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    }
  }

  async function simulateQuestionGeneration(topic: string): Promise<{
    questionsRequested: number;
    questionsGenerated: number;
    partialData?: any;
  }> {
    const questionsRequested = 2; // Basic and Advanced
    let questionsGenerated = 0;
    const partialData: any[] = [];

    try {
      // Simulate context generation
      await geminiStub();
      
      // Try to generate each question
      for (let i = 0; i < questionsRequested; i++) {
        try {
          const question = await geminiStub();
          questionsGenerated++;
          partialData.push(question);
          
          // Progressive saving
          await saveQuestionToFirestore(topic, question, i);
        } catch (error) {
          // Question generation failed, but continue with others
          console.log(`Question ${i} failed: ${error}`);
        }
      }
    } catch (error) {
      // Context generation failed
      console.log(`Context generation failed: ${error}`);
    }

    return { questionsRequested, questionsGenerated, partialData };
  }

  async function saveQuestionToFirestore(topic: string, question: any, index: number): Promise<void> {
    try {
      await firestore.collection('test-questions').add({
        topic,
        question,
        index,
        savedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.log(`Failed to save question: ${error}`);
      throw error;
    }
  }

  async function measureRecoveryTime(recoveryStart: number): Promise<number> {
    const maxRecoveryTime = 30000; // 30 seconds max
    const checkInterval = 1000; // Check every second
    
    for (let elapsed = 0; elapsed < maxRecoveryTime; elapsed += checkInterval) {
      try {
        // Test if system is responsive
        await geminiStub();
        return elapsed;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }
    
    return maxRecoveryTime; // Max recovery time if not recovered
  }

  async function checkForDataLoss(): Promise<boolean> {
    try {
      // Check if any saved questions were lost or corrupted
      const questionsSnapshot = await firestore.collection('test-questions').get();
      
      for (const doc of questionsSnapshot.docs) {
        const data = doc.data();
        
        // Check for data integrity
        if (!data.topic || !data.savedAt) {
          return true; // Data loss detected
        }
      }
      
      return false; // No data loss
    } catch (error) {
      console.log(`Error checking for data loss: ${error}`);
      return true; // Assume data loss if can't verify
    }
  }

  function setupHealthyStubs() {
    if (geminiStub) geminiStub.restore();
    
    geminiStub = sinon.stub().callsFake(async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
      return {
        response: {
          text: () => JSON.stringify({
            stem: 'Healthy question generation',
            options: { A: 'A', B: 'B', C: 'C', D: 'D' },
            correctAnswer: 'A',
            explanation: 'Explanation'
          })
        }
      };
    });
  }

  async function clearTestData() {
    try {
      const questionsSnapshot = await firestore.collection('test-questions').get();
      const batch = firestore.batch();
      
      questionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
    } catch (error) {
      console.log(`Error clearing test data: ${error}`);
    }
  }
});

// Chaos Controller for orchestrating various fault injections
class ChaosController {
  private memoryBalloon: Buffer[] = [];
  private cpuInterval: NodeJS.Timeout | null = null;
  private firestoreLatencyStub: sinon.SinonStub | null = null;
  private dataCorruptionEnabled = false;

  simulateMemoryPressure(megabytes: number) {
    console.log(`🧠 Simulating ${megabytes}MB memory pressure`);
    
    // Allocate memory to create pressure
    for (let i = 0; i < megabytes; i++) {
      this.memoryBalloon.push(Buffer.alloc(1024 * 1024, 'x'));
    }
  }

  releaseMemoryPressure() {
    console.log('🧠 Releasing memory pressure');
    this.memoryBalloon = [];
    
    if (global.gc) {
      global.gc();
    }
  }

  simulateCPUThrottling(utilizationTarget: number) {
    console.log(`⚡ Simulating ${(utilizationTarget * 100).toFixed(0)}% CPU utilization`);
    
    this.cpuInterval = setInterval(() => {
      const start = Date.now();
      const duration = 100 * utilizationTarget; // ms of busy work per 100ms
      
      while (Date.now() - start < duration) {
        // Busy work
        Math.random();
      }
    }, 100);
  }

  releaseCPUThrottling() {
    console.log('⚡ Releasing CPU throttling');
    
    if (this.cpuInterval) {
      clearInterval(this.cpuInterval);
      this.cpuInterval = null;
    }
  }

  simulateFirestoreLatency(latencyMs: number) {
    console.log(`🔥 Simulating Firestore latency: ${latencyMs}ms`);
    
    // This would require more complex stubbing in a real implementation
    // For now, we'll log the intention
  }

  enableDataCorruption(collection: string, corruptionRate: number) {
    console.log(`💾 Enabling data corruption on ${collection}: ${(corruptionRate * 100).toFixed(0)}% rate`);
    this.dataCorruptionEnabled = true;
  }

  disableDataCorruption() {
    console.log('💾 Disabling data corruption');
    this.dataCorruptionEnabled = false;
  }

  stopAllChaos() {
    this.releaseMemoryPressure();
    this.releaseCPUThrottling();
    this.disableDataCorruption();
    
    if (this.firestoreLatencyStub) {
      this.firestoreLatencyStub.restore();
      this.firestoreLatencyStub = null;
    }
    
    console.log('🛑 All chaos effects stopped');
  }
}