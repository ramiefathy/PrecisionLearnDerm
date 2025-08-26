/**
 * Feature Flag System for Progressive Migration
 * Enables safe rollout of new MCQ generation system
 * Supports percentage-based rollouts, user overrides, and instant rollback
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { logInfo, logError } from './logging';

const db = admin.firestore();

// Feature flag interfaces
interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  userOverrides: {
    enabled: string[];   // User IDs that should have feature enabled
    disabled: string[];  // User IDs that should have feature disabled
  };
  conditions: {
    startDate?: Date;
    endDate?: Date;
    regions?: string[];
    userRoles?: string[];
    minVersion?: string;
  };
  metadata: {
    description: string;
    owner: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  };
}

interface FlagEvaluation {
  enabled: boolean;
  reason: string;
  flagVersion: number;
  timestamp: number;
  userId?: string;
}

interface RolloutStats {
  flagName: string;
  totalEvaluations: number;
  enabledCount: number;
  disabledCount: number;
  rolloutPercentage: number;
  actualPercentage: number;
  userOverrides: number;
  conditionFailures: number;
  errorRate: number;
  lastUpdated: Date;
}

/**
 * Feature Flag Manager
 */
export class FeatureFlagManager {
  private flagCache: Map<string, { flag: FeatureFlag; expiry: number }> = new Map();
  private readonly cacheTimeout = 60000; // 1 minute

  /**
   * Check if a feature is enabled for a user
   */
  async isEnabled(
    flagName: string,
    userId?: string,
    context?: {
      userRole?: string;
      region?: string;
      version?: string;
    }
  ): Promise<FlagEvaluation> {
    try {
      const flag = await this.getFlag(flagName);
      
      if (!flag) {
        return {
          enabled: false,
          reason: 'Flag not found',
          flagVersion: 0,
          timestamp: Date.now()
        };
      }

      // Check if flag is globally disabled
      if (!flag.enabled) {
        return {
          enabled: false,
          reason: 'Flag globally disabled',
          flagVersion: flag.metadata.version,
          timestamp: Date.now(),
          userId
        };
      }

      // Check explicit user overrides first
      if (userId) {
        if (flag.userOverrides.enabled.includes(userId)) {
          this.recordEvaluation(flagName, true, 'user_override_enabled', userId);
          return {
            enabled: true,
            reason: 'User override - enabled',
            flagVersion: flag.metadata.version,
            timestamp: Date.now(),
            userId
          };
        }
        
        if (flag.userOverrides.disabled.includes(userId)) {
          this.recordEvaluation(flagName, false, 'user_override_disabled', userId);
          return {
            enabled: false,
            reason: 'User override - disabled',
            flagVersion: flag.metadata.version,
            timestamp: Date.now(),
            userId
          };
        }
      }

      // Check time-based conditions
      const now = new Date();
      if (flag.conditions.startDate && now < flag.conditions.startDate) {
        this.recordEvaluation(flagName, false, 'before_start_date', userId);
        return {
          enabled: false,
          reason: 'Before start date',
          flagVersion: flag.metadata.version,
          timestamp: Date.now(),
          userId
        };
      }
      
      if (flag.conditions.endDate && now > flag.conditions.endDate) {
        this.recordEvaluation(flagName, false, 'after_end_date', userId);
        return {
          enabled: false,
          reason: 'After end date',
          flagVersion: flag.metadata.version,
          timestamp: Date.now(),
          userId
        };
      }

      // Check region conditions
      if (flag.conditions.regions && context?.region && 
          !flag.conditions.regions.includes(context.region)) {
        this.recordEvaluation(flagName, false, 'region_mismatch', userId);
        return {
          enabled: false,
          reason: 'Region not in allowed list',
          flagVersion: flag.metadata.version,
          timestamp: Date.now(),
          userId
        };
      }

      // Check user role conditions
      if (flag.conditions.userRoles && context?.userRole && 
          !flag.conditions.userRoles.includes(context.userRole)) {
        this.recordEvaluation(flagName, false, 'role_mismatch', userId);
        return {
          enabled: false,
          reason: 'User role not in allowed list',
          flagVersion: flag.metadata.version,
          timestamp: Date.now(),
          userId
        };
      }

      // Check version conditions
      if (flag.conditions.minVersion && context?.version && 
          this.compareVersions(context.version, flag.conditions.minVersion) < 0) {
        this.recordEvaluation(flagName, false, 'version_too_low', userId);
        return {
          enabled: false,
          reason: 'Version below minimum required',
          flagVersion: flag.metadata.version,
          timestamp: Date.now(),
          userId
        };
      }

      // Check rollout percentage
      const shouldEnable = this.shouldEnableForUser(userId || 'anonymous', flagName, flag.rolloutPercentage);
      const reason = shouldEnable ? 'rollout_percentage' : 'rollout_percentage_excluded';
      
      this.recordEvaluation(flagName, shouldEnable, reason, userId);
      
      return {
        enabled: shouldEnable,
        reason,
        flagVersion: flag.metadata.version,
        timestamp: Date.now(),
        userId
      };

    } catch (error: any) {
      logError('feature_flag_evaluation_error', {
        flagName,
        userId,
        error: error.message
      });

      return {
        enabled: false,
        reason: `Evaluation error: ${error.message}`,
        flagVersion: 0,
        timestamp: Date.now(),
        userId
      };
    }
  }

  /**
   * Get feature flag configuration
   */
  public async getFlag(flagName: string): Promise<FeatureFlag | null> {
    // Check cache first
    const cached = this.flagCache.get(flagName);
    if (cached && cached.expiry > Date.now()) {
      return cached.flag;
    }

    try {
      const doc = await db.collection('feature_flags').doc(flagName).get();
      
      if (!doc.exists) {
        return null;
      }

      const flag = doc.data() as FeatureFlag;
      
      // Convert Firestore timestamps to Date objects
      if (flag.conditions.startDate) {
        flag.conditions.startDate = (flag.conditions.startDate as any).toDate();
      }
      if (flag.conditions.endDate) {
        flag.conditions.endDate = (flag.conditions.endDate as any).toDate();
      }
      flag.metadata.createdAt = (flag.metadata.createdAt as any).toDate();
      flag.metadata.updatedAt = (flag.metadata.updatedAt as any).toDate();

      // Cache the flag
      this.flagCache.set(flagName, {
        flag,
        expiry: Date.now() + this.cacheTimeout
      });

      return flag;
    } catch (error: any) {
      logError('feature_flag_fetch_error', {
        flagName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Determine if user should be in rollout based on percentage
   */
  private shouldEnableForUser(userId: string, flagName: string, percentage: number): boolean {
    if (percentage === 0) return false;
    if (percentage === 100) return true;

    // Create deterministic hash from userId and flagName
    const hash = createHash('md5')
      .update(`${userId}:${flagName}`)
      .digest('hex');
    
    // Convert first 8 hex characters to integer
    const hashInt = parseInt(hash.substring(0, 8), 16);
    
    // Calculate percentage (0-99)
    const userPercentile = hashInt % 100;
    
    return userPercentile < percentage;
  }

  /**
   * Compare version strings (simple semantic versioning)
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }

  /**
   * Record flag evaluation for analytics
   */
  private recordEvaluation(
    flagName: string, 
    enabled: boolean, 
    reason: string, 
    userId?: string
  ): void {
    // Record asynchronously to not block flag evaluation
    this.recordEvaluationAsync(flagName, enabled, reason, userId)
      .catch(error => {
        logError('flag_evaluation_recording_error', {
          flagName,
          error: error.message
        });
      });
  }

  /**
   * Async evaluation recording
   */
  private async recordEvaluationAsync(
    flagName: string,
    enabled: boolean,
    reason: string,
    userId?: string
  ): Promise<void> {
    const evaluation = {
      flagName,
      enabled,
      reason,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('flag_evaluations').add(evaluation);
  }

  /**
   * Clear flag cache (useful for testing)
   */
  clearCache(): void {
    this.flagCache.clear();
  }
}

// Global instance
let flagManager: FeatureFlagManager;

/**
 * Get feature flag manager instance
 */
export function getFlagManager(): FeatureFlagManager {
  if (!flagManager) {
    flagManager = new FeatureFlagManager();
  }
  return flagManager;
}

/**
 * Convenience function to check if direct MCQ generator should be used
 */
export async function shouldUseDirectGenerator(userId?: string, context?: any): Promise<boolean> {
  const evaluation = await getFlagManager().isEnabled('direct_mcq_generator', userId, context);
  return evaluation.enabled;
}

/**
 * Convenience function to check shadow mode
 */
export async function shouldUseShadowMode(userId?: string, context?: any): Promise<boolean> {
  const evaluation = await getFlagManager().isEnabled('shadow_mode_testing', userId, context);
  return evaluation.enabled;
}

/**
 * Create or update a feature flag
 */
export async function createOrUpdateFlag(flag: Omit<FeatureFlag, 'metadata'> & {
  metadata?: Partial<Pick<FeatureFlag['metadata'], 'description' | 'owner'>>
}): Promise<void> {
  const now = new Date();
  
  try {
    const existingDoc = await db.collection('feature_flags').doc(flag.name).get();
    const existingFlag = existingDoc.exists ? existingDoc.data() as FeatureFlag : null;
    
    const updatedFlag: FeatureFlag = {
      ...flag,
      metadata: {
        description: flag.metadata?.description || '',
        owner: flag.metadata?.owner || 'system',
        createdAt: existingFlag?.metadata.createdAt || now,
        updatedAt: now,
        version: (existingFlag?.metadata.version || 0) + 1
      }
    };

    await db.collection('feature_flags').doc(flag.name).set(updatedFlag);
    
    // Clear cache to force refresh
    getFlagManager().clearCache();
    
    logInfo('feature_flag_updated', {
      flagName: flag.name,
      version: updatedFlag.metadata.version,
      rolloutPercentage: flag.rolloutPercentage
    });

  } catch (error: any) {
    logError('feature_flag_update_error', {
      flagName: flag.name,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get rollout statistics for a flag
 */
export async function getFlagStats(flagName: string, hoursBack: number = 24): Promise<RolloutStats | null> {
  try {
    const since = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    
    const evaluations = await db.collection('flag_evaluations')
      .where('flagName', '==', flagName)
      .where('timestamp', '>=', since)
      .get();

    if (evaluations.empty) {
      return null;
    }

    let enabledCount = 0;
    let userOverrides = 0;
    let conditionFailures = 0;
    const uniqueUsers = new Set<string>();

    evaluations.docs.forEach(doc => {
      const data = doc.data();
      if (data.enabled) enabledCount++;
      if (data.reason.includes('override')) userOverrides++;
      if (data.reason.includes('mismatch') || data.reason.includes('too_low')) conditionFailures++;
      if (data.userId) uniqueUsers.add(data.userId);
    });

    const flag = await getFlagManager().getFlag(flagName);
    
    return {
      flagName,
      totalEvaluations: evaluations.size,
      enabledCount,
      disabledCount: evaluations.size - enabledCount,
      rolloutPercentage: flag?.rolloutPercentage || 0,
      actualPercentage: Math.round((enabledCount / evaluations.size) * 100),
      userOverrides,
      conditionFailures,
      errorRate: 0, // TODO: Calculate based on evaluation errors
      lastUpdated: new Date()
    };

  } catch (error: any) {
    logError('flag_stats_error', {
      flagName,
      error: error.message
    });
    return null;
  }
}

/**
 * Initialize default feature flags for MCQ system
 */
export async function initializeDefaultFlags(): Promise<void> {
  const defaultFlags: Array<Omit<FeatureFlag, 'metadata'> & {
    metadata?: Partial<Pick<FeatureFlag['metadata'], 'description' | 'owner'>>
  }> = [
    {
      name: 'direct_mcq_generator',
      enabled: true,
      rolloutPercentage: 0, // Start at 0%, increase gradually
      userOverrides: {
        enabled: [], // Add admin user IDs here
        disabled: []
      },
      conditions: {
        userRoles: ['admin', 'tester'] // Initially only for admins/testers
      },
      metadata: {
        description: 'Enable new direct MCQ generator replacing multi-agent pipeline',
        owner: 'engineering'
      }
    },
    {
      name: 'shadow_mode_testing',
      enabled: true,
      rolloutPercentage: 10, // Test on 10% of traffic
      userOverrides: {
        enabled: [],
        disabled: []
      },
      conditions: {},
      metadata: {
        description: 'Run new generator in shadow mode alongside old system',
        owner: 'engineering'
      }
    },
    {
      name: 'citation_validation',
      enabled: true,
      rolloutPercentage: 100, // Enable for all once direct generator is used
      userOverrides: {
        enabled: [],
        disabled: []
      },
      conditions: {},
      metadata: {
        description: 'Enable citation-based validation for generated questions',
        owner: 'medical_team'
      }
    },
    {
      name: 'enhanced_caching',
      enabled: true,
      rolloutPercentage: 100, // Safe to enable for all
      userOverrides: {
        enabled: [],
        disabled: []
      },
      conditions: {},
      metadata: {
        description: 'Enable two-tier caching system',
        owner: 'engineering'
      }
    }
  ];

  for (const flag of defaultFlags) {
    try {
      await createOrUpdateFlag(flag);
    } catch (error: any) {
      logError('default_flag_creation_error', {
        flagName: flag.name,
        error: error.message
      });
    }
  }

  logInfo('default_flags_initialized', {
    flagCount: defaultFlags.length
  });
}

/**
 * Emergency disable flag (instant rollback)
 */
export async function emergencyDisable(flagName: string, reason: string): Promise<void> {
  try {
    await db.collection('feature_flags').doc(flagName).update({
      enabled: false,
      rolloutPercentage: 0,
      'metadata.updatedAt': new Date(),
      'metadata.version': admin.firestore.FieldValue.increment(1)
    });

    // Clear cache immediately
    getFlagManager().clearCache();

    // Log emergency disable
    await db.collection('flag_emergencies').add({
      flagName,
      reason,
      disabledAt: admin.firestore.FieldValue.serverTimestamp(),
      disabledBy: 'system'
    });

    logError('emergency_flag_disable', {
      flagName,
      reason
    });

  } catch (error: any) {
    logError('emergency_disable_error', {
      flagName,
      reason,
      error: error.message
    });
    throw error;
  }
}