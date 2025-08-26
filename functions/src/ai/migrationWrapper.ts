/**
 * Migration Wrapper Factory - Backward Compatibility Layer
 * Creates routing functions between old multi-agent system and new direct generator
 * Supports shadow mode testing and gradual rollout
 */

import * as functions from 'firebase-functions';
import { getSystemServices } from '../config/initialization';
import { logInfo, logError } from '../util/logging';
import { requireAuth } from '../util/auth';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface ShadowResult {
  primary: any;
  shadow: any;
  comparison: {
    responseTimeDiff: number;
    qualityScoreDiff?: number;
    success: { primary: boolean; shadow: boolean };
    errors: { primary?: string; shadow?: string };
  };
}

// Factory configuration interface
interface MigrationWrapperConfig {
  legacyImplementation: (data: any, context: functions.https.CallableContext) => Promise<any>;
  newImplementation: (data: any, context: functions.https.CallableContext) => Promise<any>;
  timeoutSeconds?: number;
  memory?: '256MB' | '512MB' | '1GB' | '2GB' | '4GB' | '8GB';
}

/**
 * Factory function to create migration wrapper with specific implementations
 */
export function createMigrationWrapper(config: MigrationWrapperConfig) {
  return functions
    .runWith({
      timeoutSeconds: config.timeoutSeconds || 300, // Default 5 minutes
      memory: config.memory || '1GB' // Default 1GB for compatibility
    })
    .https.onCall(async (data, context) => {
      const startTime = Date.now();
      
      try {
        requireAuth(context);
        const userId = context.auth?.uid;
        
        // Initialize system services
        const services = await getSystemServices();
        
        logInfo('migration_wrapper_request', {
          userId,
          data: {
            topicIds: data.topicIds,
            difficulty: data.difficulty,
            useAI: data.useAI
          },
          timestamp: new Date().toISOString(),
          servicesInitialized: services.initialized
        });

        // Get feature flag configuration
        let migrationMode = 'legacy'; // Default fallback
        let rolloutPercentage = 0;
        
        if (services.flagManager) {
          try {
            const directGeneratorFlag = await services.flagManager.isEnabled('direct_mcq_generator', userId, {
              userRole: await getUserRole(services.firestore, userId),
              region: getRegionFromContext(context),
              version: getClientVersion(data)
            });
            
            const shadowModeFlag = await services.flagManager.isEnabled('shadow_mode_testing', userId);
            
            // Determine migration mode
            if (shadowModeFlag && !directGeneratorFlag) {
              migrationMode = 'shadow';
            } else if (directGeneratorFlag) {
              migrationMode = 'rollout';
              rolloutPercentage = 100; // For now, if enabled, use 100%
            }
          } catch (flagError: any) {
            logError('feature_flag_evaluation_failed', flagError);
            // Continue with legacy mode as fallback
          }
        }

        // Route based on migration mode
        switch (migrationMode) {
          case 'shadow':
            return await runShadowMode(data, context, config, services, startTime);
            
          case 'rollout':
            return await runRolloutMode(data, context, config, services, startTime, rolloutPercentage);
            
          default: // legacy
            return await runLegacyMode(data, context, config, services, startTime);
        }

      } catch (error: any) {
        const responseTime = Date.now() - startTime;
        
        logError('migration_wrapper_error', error);

        // Final fallback to legacy system
        try {
          logInfo('attempting_final_fallback', { userId: context.auth?.uid });
          return await config.legacyImplementation(data, context);
        } catch (fallbackError: any) {
          logError('final_fallback_failed', fallbackError);
          
          throw new functions.https.HttpsError('internal', 
            `All systems failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`
          );
        }
      }
    });
}

/**
 * Run legacy mode - route all traffic to existing system
 */
async function runLegacyMode(
  data: any,
  context: functions.https.CallableContext,
  config: MigrationWrapperConfig,
  services: any,
  startTime: number
): Promise<any> {
  const userId = context.auth?.uid;
  
  logInfo('routing_to_legacy_system', { userId });
  
  if (services.monitoring.metrics) {
    services.monitoring.metrics.recordMCQGeneration({
      operation: 'legacy_mcq_generation',
      responseTime: 0,
      success: false,
      model: 'legacy-orchestrator',
      userId,
      cacheHit: false
    });
  }
  
  try {
    const result = await config.legacyImplementation(data, context);
    const responseTime = Date.now() - startTime;
    
    if (services.monitoring.metrics) {
      services.monitoring.metrics.recordMCQGeneration({
        operation: 'legacy_mcq_generation',
        responseTime,
        success: true,
        model: 'legacy-orchestrator', 
        userId,
        cacheHit: false
      });
    }
    
    logInfo('legacy_system_success', {
      userId,
      responseTime
    });
    
    return result;
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    if (services.monitoring.metrics) {
      services.monitoring.metrics.recordMCQGeneration({
        operation: 'legacy_mcq_generation',
        responseTime,
        success: false,
        model: 'legacy-orchestrator',
        userId,
        cacheHit: false
      });
    }
    
    throw error;
  }
}

/**
 * Run rollout mode - route percentage of traffic to new system with fallback
 */
async function runRolloutMode(
  data: any,
  context: functions.https.CallableContext,
  config: MigrationWrapperConfig,
  services: any,
  startTime: number,
  rolloutPercentage: number
): Promise<any> {
  const userId = context.auth?.uid;
  
  // For now, if rollout is enabled, use new system (can add percentage logic later)
  logInfo('routing_to_new_system', { userId, rolloutPercentage });
  
  try {
    const result = await config.newImplementation(data, context);
    const responseTime = Date.now() - startTime;
    
    if (services.monitoring.metrics) {
      services.monitoring.metrics.recordMCQGeneration({
        operation: 'direct_mcq_generation',
        responseTime,
        success: true,
        model: 'direct-generator',
        userId,
        cacheHit: false,
        qualityScore: result.question?.qualityScore
      });
    }
    
    logInfo('new_system_success', {
      userId,
      responseTime,
      qualityScore: result.question?.qualityScore
    });
    
    return result;
  } catch (newSystemError: any) {
    // Fallback to legacy system on new system failure
    logError('new_system_failed_fallback_to_legacy', newSystemError);
    
    try {
      const result = await config.legacyImplementation(data, context);
      const responseTime = Date.now() - startTime;
      
      if (services.monitoring.metrics) {
        services.monitoring.metrics.recordMCQGeneration({
          operation: 'legacy_mcq_generation_fallback',
          responseTime,
          success: true,
          model: 'legacy-orchestrator',
          userId,
          cacheHit: false
        });
      }
      
      // Log the fallback event for monitoring
      if (services.firestore) {
        services.firestore.collection('migration_fallbacks').add({
          userId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          newSystemError: newSystemError.message,
          fallbackSuccess: true,
          responseTime
        });
      }
      
      return result;
    } catch (fallbackError: any) {
      logError('fallback_also_failed', fallbackError);
      throw newSystemError; // Throw original new system error
    }
  }
}

/**
 * Run shadow mode - execute both systems, return legacy result, log comparison
 */
async function runShadowMode(
  data: any,
  context: functions.https.CallableContext,
  config: MigrationWrapperConfig,
  services: any,
  startTime: number
): Promise<any> {
  const userId = context.auth?.uid;
  
  logInfo('shadow_mode_started', { userId });

  // Run both systems in parallel
  const [legacyResult, newResult] = await Promise.allSettled([
    config.legacyImplementation(data, context),
    config.newImplementation(data, context)
  ]);

  const responseTime = Date.now() - startTime;

  // Analyze results
  const comparison = compareShadowResults(legacyResult, newResult);
  
  // Log comparison data
  if (services.firestore) {
    await logShadowComparison(services.firestore, {
      userId,
      topic: data.topicIds?.[0] || data.topic || 'unknown',
      responseTime,
      comparison,
      timestamp: new Date()
    });
  }

  // Record metrics for both systems
  if (services.monitoring.metrics) {
    // Legacy system metrics
    services.monitoring.metrics.recordMCQGeneration({
      operation: 'legacy_mcq_generation_shadow',
      responseTime: responseTime,
      success: legacyResult.status === 'fulfilled',
      model: 'legacy-orchestrator',
      userId,
      cacheHit: false
    });

    // New system metrics (if successful)
    if (newResult.status === 'fulfilled') {
      services.monitoring.metrics.recordMCQGeneration({
        operation: 'direct_mcq_generation_shadow',
        responseTime: responseTime,
        success: true,
        model: 'direct-generator',
        userId,
        cacheHit: false,
        qualityScore: newResult.value?.question?.qualityScore
      });
    }
  }

  // Return legacy result (shadow mode always returns legacy)
  if (legacyResult.status === 'fulfilled') {
    return legacyResult.value;
  } else if (newResult.status === 'fulfilled') {
    // If legacy failed but new succeeded, return new result
    logInfo('shadow_mode_legacy_failed_using_new', { userId });
    return newResult.value;
  } else {
    throw new Error('Both systems failed in shadow mode');
  }
}

/**
 * Compare results from both systems
 */
function compareShadowResults(
  primaryResult: PromiseSettledResult<any>,
  shadowResult: PromiseSettledResult<any>
): ShadowResult['comparison'] {
  const comparison: ShadowResult['comparison'] = {
    responseTimeDiff: 0,
    success: {
      primary: primaryResult.status === 'fulfilled',
      shadow: shadowResult.status === 'fulfilled'
    },
    errors: {}
  };

  if (primaryResult.status === 'rejected') {
    comparison.errors.primary = primaryResult.reason.message;
  }

  if (shadowResult.status === 'rejected') {
    comparison.errors.shadow = shadowResult.reason.message;
  }

  // Compare response times if both succeeded
  if (primaryResult.status === 'fulfilled' && shadowResult.status === 'fulfilled') {
    const primaryTime = primaryResult.value.metadata?.generationTime || 0;
    const shadowTime = shadowResult.value.metadata?.generationTime || 0;
    comparison.responseTimeDiff = shadowTime - primaryTime;

    // Compare quality scores if available
    const primaryQuality = primaryResult.value.question?.qualityScore || 
                          primaryResult.value.qualityScore || 0;
    const shadowQuality = shadowResult.value.question?.qualityScore || 0;
    
    if (primaryQuality && shadowQuality) {
      comparison.qualityScoreDiff = shadowQuality - primaryQuality;
    }
  }

  return comparison;
}

/**
 * Log shadow mode comparison data
 */
async function logShadowComparison(
  firestore: admin.firestore.Firestore,
  data: {
    userId?: string;
    topic: string;
    responseTime: number;
    comparison: ShadowResult['comparison'];
    timestamp: Date;
  }
): Promise<void> {
  try {
    await firestore.collection('shadow_mode_comparisons').add({
      ...data,
      timestamp: admin.firestore.Timestamp.fromDate(data.timestamp)
    });
  } catch (error: any) {
    logError('shadow_comparison_logging_failed', {
      topic: data.topic,
      error: error.message
    });
  }
}

/**
 * Get user role for feature flag evaluation
 */
async function getUserRole(
  firestore: admin.firestore.Firestore,
  userId?: string
): Promise<string> {
  if (!userId) return 'anonymous';
  
  try {
    const userDoc = await firestore.collection('users').doc(userId).get();
    return userDoc.exists ? userDoc.data()?.role || 'user' : 'user';
  } catch (error) {
    return 'user';
  }
}

/**
 * Get region from request context
 */
function getRegionFromContext(context: functions.https.CallableContext): string {
  return process.env.FUNCTION_REGION || 'us-central1';
}

/**
 * Get client version from request data
 */
function getClientVersion(data: any): string {
  return data._clientVersion || data.version || '1.0.0';
}

/**
 * Health check endpoint for migration system
 */
export const migrationHealthCheck = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    try {
      const userId = context.auth?.uid || 'anonymous';
      const services = await getSystemServices();
      
      // Test feature flag evaluation
      let directGeneratorFlag = false;
      let shadowModeFlag = false;
      
      if (services.flagManager) {
        try {
          directGeneratorFlag = await services.flagManager.isEnabled('direct_mcq_generator', userId);
          shadowModeFlag = await services.flagManager.isEnabled('shadow_mode_testing', userId);
        } catch (error) {
          logError('health_check_flag_evaluation_failed', error);
        }
      }
      
      return {
        healthy: services.initialized,
        timestamp: new Date().toISOString(),
        flags: {
          directGenerator: directGeneratorFlag,
          shadowMode: shadowModeFlag
        },
        services: {
          firestore: !!services.firestore,
          flagManager: !!services.flagManager,
          caches: {
            mcq: !!services.caches.mcq,
            context: !!services.caches.context,
            template: !!services.caches.template
          },
          monitoring: {
            metrics: !!services.monitoring.metrics,
            alerts: !!services.monitoring.alerts,
            health: !!services.monitoring.health
          }
        },
        version: '1.0.0'
      };

    } catch (error: any) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });