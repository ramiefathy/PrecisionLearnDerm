/**
 * Hybrid Pipeline Router
 * Intelligently routes MCQ generation requests to the optimal pipeline
 * Based on request characteristics, performance metrics, and resource availability
 */

import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { requireAuth } from '../util/auth';
import { generateBoardStyleMCQ } from './boardStyleGeneration';
import { generateQuestionsOptimized } from './optimizedOrchestrator';
import { getSystemHealthMonitor } from '../util/health';
import { getMCQCache } from '../util/enhancedCache';
import { GEMINI_API_KEY } from '../util/config';

// Pipeline performance metrics (UPDATED from evaluation results)
const PIPELINE_METRICS = {
  boardStyle: {
    avgLatency: 8500, // 8.5 seconds (confirmed)
    successRate: 1.00, // 100% (updated from evaluation)
    costPerRequest: 0.02, // Estimated cost
    bestFor: ['single', 'fast', 'clinical-vignette', 'board-prep'],
    maxComplexity: 'medium'
  },
  optimizedOrchestrator: {
    avgLatency: 23700, // 23.7 seconds (updated from evaluation)
    successRate: 0.80, // 80% (updated from evaluation)
    costPerRequest: 0.08, // Higher due to multiple agents
    bestFor: ['batch', 'research-backed', 'comprehensive', 'multi-difficulty'],
    maxComplexity: 'high'
  },
  fallback: {
    // Simple direct generation as emergency fallback
    avgLatency: 5000,
    successRate: 0.50,
    costPerRequest: 0.01,
    bestFor: ['emergency', 'simple'],
    maxComplexity: 'low'
  }
};

// Request characteristics for routing decision
interface RouteRequest {
  topic: string;
  difficulties?: string[];
  urgency?: 'low' | 'normal' | 'high';
  quality?: 'basic' | 'standard' | 'premium';
  features?: {
    needsResearch?: boolean;
    needsCitations?: boolean;
    needsReview?: boolean;
    boardStyle?: boolean;
  };
  userId?: string;
  forceRoute?: 'boardStyle' | 'orchestrator' | 'auto';
}

// Routing decision result
interface RouteDecision {
  pipeline: 'boardStyle' | 'orchestrator' | 'fallback';
  reason: string;
  estimatedLatency: number;
  estimatedSuccessRate: number;
  cacheKey?: string;
}

/**
 * Analyze request characteristics and system state to determine optimal pipeline
 */
async function analyzeAndRoute(request: RouteRequest): Promise<RouteDecision> {
  const startTime = Date.now();
  
  // Check if user forced a specific route
  if (request.forceRoute && request.forceRoute !== 'auto') {
    logger.info('[ROUTER] Using forced route', { 
      pipeline: request.forceRoute,
      userId: request.userId 
    });
    return {
      pipeline: request.forceRoute === 'boardStyle' ? 'boardStyle' : 'orchestrator',
      reason: `User forced ${request.forceRoute} pipeline`,
      estimatedLatency: PIPELINE_METRICS[request.forceRoute === 'boardStyle' ? 'boardStyle' : 'optimizedOrchestrator'].avgLatency,
      estimatedSuccessRate: PIPELINE_METRICS[request.forceRoute === 'boardStyle' ? 'boardStyle' : 'optimizedOrchestrator'].successRate
    };
  }
  
  // Check cache first
  const cache = getMCQCache();
  const cacheKey = `hybrid_${request.topic}_${JSON.stringify(request.difficulties || [])}`;
  const cachedResult = await cache.get(cacheKey);
  
  if (cachedResult) {
    logger.info('[ROUTER] Cache hit, returning cached result', { cacheKey });
    return {
      pipeline: 'fallback', // Use fallback to indicate cache hit
      reason: 'Cached result available',
      estimatedLatency: 10, // Near instant
      estimatedSuccessRate: 1.0,
      cacheKey
    };
  }
  
  // Get system health metrics
  const healthMonitor = getSystemHealthMonitor();
  const systemHealth = healthMonitor.getSystemHealth();
  
  // Scoring factors for each pipeline
  let boardStyleScore = 0;
  let orchestratorScore = 0;
  
  // 1. Urgency factor (TUNED: Increased boardStyle weight based on 100% success rate)
  if (request.urgency === 'high') {
    boardStyleScore += 40; // Strongly prefer faster pipeline (was 30)
  } else if (request.urgency === 'low') {
    orchestratorScore += 15; // Can afford comprehensive approach (was 20)
  }
  
  // 2. Quality requirements
  if (request.quality === 'premium') {
    orchestratorScore += 25; // Higher quality from multi-agent
  } else if (request.quality === 'basic') {
    boardStyleScore += 15; // Simple generation sufficient
  }
  
  // 3. Feature requirements
  if (request.features) {
    if (request.features.needsResearch) orchestratorScore += 30;
    if (request.features.needsCitations) orchestratorScore += 25;
    if (request.features.needsReview) orchestratorScore += 20;
    if (request.features.boardStyle) boardStyleScore += 40;
  }
  
  // 4. Batch vs single generation
  const difficultyCount = request.difficulties?.length || 1;
  if (difficultyCount > 1) {
    orchestratorScore += 20; // Better for batch
  } else {
    boardStyleScore += 15; // Optimized for single
  }
  
  // 5. Topic complexity analysis
  const complexTopics = ['differential diagnosis', 'pathophysiology', 'rare diseases', 'complex management'];
  const isComplex = complexTopics.some(ct => request.topic.toLowerCase().includes(ct));
  if (isComplex) {
    orchestratorScore += 15;
  } else {
    boardStyleScore += 10;
  }
  
  // 6. System resource availability (TUNED: Increased weight for boardStyle)
  if (systemHealth.overall === 'critical' || systemHealth.overall === 'degraded') {
    boardStyleScore += 30; // Strongly prefer lighter pipeline under stress (was 20)
  }
  
  // 7. Historical success rate for this topic type
  // (Could integrate with monitoring data in production)
  
  // 8. Time of day / load balancing
  const hour = new Date().getHours();
  const isPeakHours = hour >= 9 && hour <= 17; // Business hours
  if (isPeakHours) {
    boardStyleScore += 5; // Slightly prefer faster during peak
  }
  
  // Make routing decision
  let decision: RouteDecision;
  
  if (boardStyleScore > orchestratorScore && boardStyleScore > 40) {
    decision = {
      pipeline: 'boardStyle',
      reason: `Board style optimal (score: ${boardStyleScore} vs ${orchestratorScore})`,
      estimatedLatency: PIPELINE_METRICS.boardStyle.avgLatency,
      estimatedSuccessRate: PIPELINE_METRICS.boardStyle.successRate,
      cacheKey
    };
  } else if (orchestratorScore > boardStyleScore && orchestratorScore > 40) {
    decision = {
      pipeline: 'orchestrator',
      reason: `Orchestrator optimal (score: ${orchestratorScore} vs ${boardStyleScore})`,
      estimatedLatency: PIPELINE_METRICS.optimizedOrchestrator.avgLatency * difficultyCount,
      estimatedSuccessRate: PIPELINE_METRICS.optimizedOrchestrator.successRate,
      cacheKey
    };
  } else {
    // Tie or low scores - use heuristics
    if (difficultyCount === 1 && !request.features?.needsResearch) {
      decision = {
        pipeline: 'boardStyle',
        reason: 'Default to board style for single generation',
        estimatedLatency: PIPELINE_METRICS.boardStyle.avgLatency,
        estimatedSuccessRate: PIPELINE_METRICS.boardStyle.successRate,
        cacheKey
      };
    } else {
      decision = {
        pipeline: 'orchestrator',
        reason: 'Default to orchestrator for comprehensive generation',
        estimatedLatency: PIPELINE_METRICS.optimizedOrchestrator.avgLatency * difficultyCount,
        estimatedSuccessRate: PIPELINE_METRICS.optimizedOrchestrator.successRate,
        cacheKey
      };
    }
  }
  
  // Log routing decision
  logger.info('[ROUTER] Routing decision made', {
    decision,
    scores: { boardStyle: boardStyleScore, orchestrator: orchestratorScore },
    analysisTime: Date.now() - startTime
  });
  
  return decision;
}

/**
 * Execute the selected pipeline with proper error handling and fallback
 */
async function executePipeline(
  decision: RouteDecision,
  request: RouteRequest,
  isFallbackAttempt: boolean = false
): Promise<any> {
  const startTime = Date.now();
  
  try {
    let result: any;
    
    switch (decision.pipeline) {
      case 'boardStyle':
        // Generate single MCQ using board style
        const difficulty = request.difficulties?.[0] || 'medium';
        result = await generateBoardStyleMCQ(
          request.topic,
          difficulty as 'easy' | 'medium' | 'hard',
          undefined // focusArea
        );
        
        // Wrap in expected format
        result = {
          questions: { [difficulty]: result },
          savedIds: {},
          topic: request.topic,
          pipeline: 'boardStyle',
          latency: Date.now() - startTime
        };
        break;
        
      case 'orchestrator':
        // Use optimized orchestrator for batch generation
        const difficulties = request.difficulties || ['Basic', 'Advanced', 'Very Difficult'];
        const orchestratorResult = await generateQuestionsOptimized(
          request.topic,
          difficulties as any,
          true, // useCache
          true, // useStreaming
          request.userId
        );
        
        result = {
          ...orchestratorResult,
          pipeline: 'orchestrator',
          latency: Date.now() - startTime
        };
        break;
        
      case 'fallback':
        // Cache-based fallback only
        if (decision.cacheKey) {
          const cache = getMCQCache();
          const cached = await cache.get(decision.cacheKey);
          if (cached) {
            return {
              ...cached,
              fromCache: true,
              pipeline: 'cache',
              latency: Date.now() - startTime
            };
          }
        }
        
        // No fallback implementation - this should never be reached
        // as 'fallback' is only used when cache hit is detected
        throw new Error('Cache fallback failed - no cached result found');
        
      default:
        throw new Error(`Unknown pipeline: ${decision.pipeline}`);
    }
    
    // Cache successful result
    if (result && decision.cacheKey) {
      const cache = getMCQCache();
      await cache.set(decision.cacheKey, result, 3600); // 1 hour TTL
    }
    
    // Log success metrics
    logger.info('[ROUTER] Pipeline execution successful', {
      pipeline: decision.pipeline,
      latency: Date.now() - startTime,
      topic: request.topic
    });
    
    return result;
    
  } catch (error) {
    logger.error('[ROUTER] Pipeline execution failed', {
      pipeline: decision.pipeline,
      error: error instanceof Error ? error.message : String(error),
      topic: request.topic,
      isFallback: isFallbackAttempt
    });
    
    // ONLY attempt fallback if this is the primary attempt
    if (!isFallbackAttempt && decision.pipeline !== 'fallback') {
      logger.info('[ROUTER] Attempting fallback pipeline');
      
      // Try the other pipeline
      const fallbackPipeline = decision.pipeline === 'boardStyle' ? 'orchestrator' : 'boardStyle';
      const fallbackDecision: RouteDecision = {
        pipeline: fallbackPipeline,
        reason: `Fallback after ${decision.pipeline} failure`,
        estimatedLatency: 30000,
        estimatedSuccessRate: 0.5
      };
      
      // Pass `true` to prevent further fallbacks
      return executePipeline(fallbackDecision, request, true);
    }
    
    // If this was already a fallback, or if the pipeline is 'fallback', throw
    throw error;
  }
}

/**
 * Main hybrid router function
 */
export async function routeHybridGeneration(request: RouteRequest): Promise<any> {
  const startTime = Date.now();
  
  try {
    // Analyze request and determine optimal route
    const decision = await analyzeAndRoute(request);
    
    // Execute selected pipeline
    const result = await executePipeline(decision, request);
    
    // Add routing metadata
    return {
      ...result,
      routing: {
        decision: decision.pipeline,
        reason: decision.reason,
        totalLatency: Date.now() - startTime
      }
    };
    
  } catch (error) {
    logger.error('[ROUTER] Hybrid routing failed completely', {
      error: error instanceof Error ? error.message : String(error),
      request
    });
    throw error;
  }
}

/**
 * Firebase Cloud Function for hybrid routing
 */
export const hybridGenerateMCQ = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '2GB',
    secrets: ['GEMINI_API_KEY']
  })
  .https.onCall(async (data, context) => {
    try {
      requireAuth(context);
      
      const request: RouteRequest = {
        topic: data.topic,
        difficulties: data.difficulties,
        urgency: data.urgency || 'normal',
        quality: data.quality || 'standard',
        features: data.features || {},
        userId: context.auth?.uid,
        forceRoute: data.forceRoute || 'auto'
      };
      
      if (!request.topic) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Topic is required'
        );
      }
      
      const result = await routeHybridGeneration(request);
      
      return {
        success: true,
        ...result
      };
      
    } catch (error: any) {
      logger.error('[HYBRID_FUNCTION] Failed', { error });
      throw new functions.https.HttpsError(
        'internal',
        error.message || 'Generation failed'
      );
    }
  });