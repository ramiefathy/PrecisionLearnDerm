/**
 * Firestore Schema Initialization for Enhanced MCQ System
 * Sets up feature flags, monitoring collections, and default configurations
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAuth } from '../util/auth';
import { logInfo, logError } from '../util/logging';

const db = admin.firestore();

/**
 * Initialize Enhanced MCQ System Database Schema
 * Creates collections and default configurations for the new system
 */
export const initializeEnhancedSchema = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '512MB'
  })
  .https.onCall(async (data, context) => {
    try {
      requireAuth(context);
      
      // Only allow admin users to initialize schema
      const userRecord = await admin.auth().getUser(context.auth!.uid);
      const userDoc = await db.collection('users').doc(context.auth!.uid).get();
      const userRole = userDoc.exists ? userDoc.data()?.role : 'user';
      
      if (userRole !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 
          'Only admin users can initialize database schema');
      }

      logInfo('schema_initialization_started', {
        userId: context.auth?.uid,
        userEmail: userRecord.email
      });

      const results = {
        featureFlags: await initializeFeatureFlags(),
        monitoring: await initializeMonitoringCollections(),
        caching: await initializeCachingCollections(),
        migration: await initializeMigrationCollections()
      };

      logInfo('schema_initialization_completed', {
        userId: context.auth?.uid,
        results
      });

      return {
        success: true,
        message: 'Enhanced MCQ system schema initialized successfully',
        details: results,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      logError('schema_initialization_failed', error);

      throw new functions.https.HttpsError('internal', 
        `Schema initialization failed: ${error.message}`);
    }
  });

/**
 * Initialize Feature Flag System
 */
async function initializeFeatureFlags(): Promise<{
  created: number;
  flags: string[];
}> {
  const batch = db.batch();
  const flagsCollection = db.collection('feature_flags');
  
  // Default feature flags for the enhanced MCQ system
  const defaultFlags = [
    {
      id: 'direct_mcq_generator',
      name: 'Direct MCQ Generator',
      description: 'Enable new single-pass MCQ generation system',
      enabled: false,
      rolloutPercentage: 0,
      conditions: {
        userRoles: ['admin'], // Start with admin-only
        regions: ['us-central1'],
        minVersion: '1.0.0'
      },
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system-initialization'
      }
    },
    {
      id: 'shadow_mode_testing',
      name: 'Shadow Mode Testing',
      description: 'Run both old and new systems in parallel for A/B testing',
      enabled: false,
      rolloutPercentage: 0,
      conditions: {
        userRoles: ['admin', 'tester'],
        regions: ['us-central1'],
        minVersion: '1.0.0'
      },
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system-initialization'
      }
    },
    {
      id: 'enhanced_caching',
      name: 'Enhanced Two-Tier Caching',
      description: 'Enable L1/L2 caching system for improved performance',
      enabled: true, // Can be enabled by default as it's backward compatible
      rolloutPercentage: 100,
      conditions: {
        userRoles: ['admin', 'user'],
        regions: ['us-central1'],
        minVersion: '1.0.0'
      },
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system-initialization'
      }
    },
    {
      id: 'enhanced_monitoring',
      name: 'Enhanced Monitoring and Metrics',
      description: 'Enable detailed metrics collection and alerting',
      enabled: true, // Safe to enable by default
      rolloutPercentage: 100,
      conditions: {
        userRoles: ['admin', 'user'],
        regions: ['us-central1'],
        minVersion: '1.0.0'
      },
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system-initialization'
      }
    }
  ];

  let created = 0;
  const flagNames: string[] = [];

  for (const flag of defaultFlags) {
    const flagRef = flagsCollection.doc(flag.id);
    const existingFlag = await flagRef.get();
    
    if (!existingFlag.exists) {
      batch.set(flagRef, flag);
      created++;
      flagNames.push(flag.name);
    }
  }

  await batch.commit();

  return { created, flags: flagNames };
}

/**
 * Initialize Monitoring Collections
 */
async function initializeMonitoringCollections(): Promise<{
  collections: string[];
  indexes: string[];
}> {
  const collections = [
    'mcq_generation_metrics',
    'system_alerts',
    'performance_metrics',
    'cache_statistics'
  ];

  const batch = db.batch();

  // Create initial documents to establish collections
  for (const collectionName of collections) {
    const initRef = db.collection(collectionName).doc('_init');
    batch.set(initRef, {
      initialized: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      description: `Initialized ${collectionName} collection for enhanced MCQ system`
    }, { merge: true });
  }

  await batch.commit();

  // Note: Firestore indexes need to be created via Firebase console or CLI
  const requiredIndexes = [
    'mcq_generation_metrics: userId, timestamp DESC',
    'system_alerts: severity, timestamp DESC',
    'performance_metrics: operation, timestamp DESC'
  ];

  return {
    collections,
    indexes: requiredIndexes
  };
}

/**
 * Initialize Caching Collections  
 */
async function initializeCachingCollections(): Promise<{
  collections: string[];
}> {
  const collections = [
    'cache_mcq',
    'cache_context', 
    'cache_template'
  ];

  const batch = db.batch();

  // Create initial documents to establish collections
  for (const collectionName of collections) {
    const initRef = db.collection(collectionName).doc('_init');
    batch.set(initRef, {
      initialized: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      description: `Initialized ${collectionName} collection for two-tier caching`
    }, { merge: true });
  }

  await batch.commit();

  return { collections };
}

/**
 * Initialize Migration Collections
 */
async function initializeMigrationCollections(): Promise<{
  collections: string[];
}> {
  const collections = [
    'shadow_mode_comparisons',
    'migration_fallbacks',
    'migration_monitoring'
  ];

  const batch = db.batch();

  // Create initial documents to establish collections
  for (const collectionName of collections) {
    const initRef = db.collection(collectionName).doc('_init');
    batch.set(initRef, {
      initialized: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      description: `Initialized ${collectionName} collection for migration tracking`
    }, { merge: true });
  }

  await batch.commit();

  return { collections };
}

/**
 * Check Schema Status - Verify all collections and flags are properly set up
 */
export const checkSchemaStatus = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    try {
      const results = {
        featureFlags: await checkFeatureFlags(),
        collections: await checkCollections(),
        timestamp: new Date().toISOString()
      };

      return {
        success: true,
        schemaReady: results.featureFlags.ready && results.collections.ready,
        details: results
      };

    } catch (error: any) {
      logError('schema_status_check_failed', error);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

/**
 * Check if feature flags are properly configured
 */
async function checkFeatureFlags(): Promise<{
  ready: boolean;
  flags: Array<{ id: string; enabled: boolean; rolloutPercentage: number }>;
}> {
  const requiredFlags = [
    'direct_mcq_generator',
    'shadow_mode_testing', 
    'enhanced_caching',
    'enhanced_monitoring'
  ];

  const flags = [];
  let allPresent = true;

  for (const flagId of requiredFlags) {
    try {
      const flagDoc = await db.collection('feature_flags').doc(flagId).get();
      if (flagDoc.exists) {
        const data = flagDoc.data();
        flags.push({
          id: flagId,
          enabled: data?.enabled || false,
          rolloutPercentage: data?.rolloutPercentage || 0
        });
      } else {
        allPresent = false;
        flags.push({
          id: flagId,
          enabled: false,
          rolloutPercentage: 0
        });
      }
    } catch (error) {
      allPresent = false;
    }
  }

  return {
    ready: allPresent,
    flags
  };
}

/**
 * Check if required collections exist
 */
async function checkCollections(): Promise<{
  ready: boolean;
  collections: Array<{ name: string; exists: boolean }>;
}> {
  const requiredCollections = [
    'feature_flags',
    'mcq_generation_metrics',
    'system_alerts', 
    'cache_mcq',
    'cache_context',
    'cache_template',
    'shadow_mode_comparisons',
    'migration_fallbacks'
  ];

  const collections = [];
  let allExist = true;

  for (const collectionName of requiredCollections) {
    try {
      const docs = await db.collection(collectionName).limit(1).get();
      const exists = !docs.empty;
      
      collections.push({
        name: collectionName,
        exists
      });
      
      if (!exists) {
        allExist = false;
      }
    } catch (error) {
      allExist = false;
      collections.push({
        name: collectionName,
        exists: false
      });
    }
  }

  return {
    ready: allExist,
    collections
  };
}

/**
 * Enable Direct MCQ Generator (Admin function)
 */
export const enableDirectGenerator = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    try {
      requireAuth(context);
      
      // Only allow admin users
      const userDoc = await db.collection('users').doc(context.auth!.uid).get();
      const userRole = userDoc.exists ? userDoc.data()?.role : 'user';
      
      if (userRole !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 
          'Only admin users can enable the direct generator');
      }

      const { rolloutPercentage = 100 } = data;

      await db.collection('feature_flags').doc('direct_mcq_generator').update({
        enabled: true,
        rolloutPercentage: Math.min(Math.max(rolloutPercentage, 0), 100),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth?.uid
      });

      logInfo('direct_generator_enabled', {
        userId: context.auth?.uid,
        rolloutPercentage
      });

      return {
        success: true,
        message: `Direct MCQ Generator enabled with ${rolloutPercentage}% rollout`,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      logError('enable_direct_generator_failed', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Enable Shadow Mode Testing (Admin function)
 */
export const enableShadowMode = functions
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB'
  })
  .https.onCall(async (data, context) => {
    try {
      requireAuth(context);
      
      // Only allow admin users
      const userDoc = await db.collection('users').doc(context.auth!.uid).get();
      const userRole = userDoc.exists ? userDoc.data()?.role : 'user';
      
      if (userRole !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 
          'Only admin users can enable shadow mode');
      }

      await db.collection('feature_flags').doc('shadow_mode_testing').update({
        enabled: true,
        rolloutPercentage: 100, // Shadow mode can be 100% when enabled
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth?.uid
      });

      logInfo('shadow_mode_enabled', {
        userId: context.auth?.uid
      });

      return {
        success: true,
        message: 'Shadow Mode Testing enabled',
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      logError('enable_shadow_mode_failed', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });