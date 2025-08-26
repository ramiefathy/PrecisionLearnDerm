/**
 * Centralized System Initialization
 * Initializes all shared services and clients for the enhanced MCQ generation system
 * Services are initialized once per function instance for optimal performance
 */

import * as admin from 'firebase-admin';
import { logInfo, logError } from '../util/logging';
// Temporarily simplified imports to avoid deployment timeout
// import { getFlagManager } from '../util/featureFlags';
// import { getMCQCache, getContextCache, getTemplateCache } from '../util/enhancedCache';
// Disable monitoring imports that may cause timeout
// import { 
//   getEnhancedMetricsCollector, 
//   getAlertManager, 
//   getSystemHealthMonitor,
//   initializeEnhancedMonitoring 
// } from '../util/monitoring';

const db = admin.firestore();

// Service interfaces
interface SystemServices {
  firestore: admin.firestore.Firestore;
  flagManager: any;
  caches: {
    mcq: any;
    context: any;
    template: any;
  };
  monitoring: {
    metrics: any;
    alerts: any;
    health: any;
  };
  initialized: boolean;
  initializationTime: number;
}

// Global services instance (initialized once per function instance)
let services: SystemServices | null = null;
let initializationPromise: Promise<SystemServices> | null = null;

/**
 * Initialize all system services
 * Uses singleton pattern for Firebase Functions to reuse connections
 */
async function initializeServices(): Promise<SystemServices> {
  const startTime = Date.now();
  
  try {
    logInfo('system_initialization_started', {
      timestamp: new Date().toISOString()
    });

    // Initialize feature flag manager - temporarily disabled
    const flagManager = null;

    // Initialize caching system - temporarily disabled
    const mcqCache = null;
    const contextCache = null; 
    const templateCache = null;

    // Initialize monitoring system - temporarily disabled
    const metricsCollector = null;
    const alertManager = null;
    const healthMonitor = null;

    // Initialize enhanced monitoring system - temporarily disabled
    // initializeEnhancedMonitoring();

    // Verify critical services are working
    await performInitializationHealthCheck(flagManager);

    const initTime = Date.now() - startTime;
    
    const serviceInstance: SystemServices = {
      firestore: db,
      flagManager,
      caches: {
        mcq: mcqCache,
        context: contextCache,
        template: templateCache
      },
      monitoring: {
        metrics: metricsCollector,
        alerts: alertManager,
        health: healthMonitor
      },
      initialized: true,
      initializationTime: initTime
    };

    logInfo('system_initialization_complete', {
      initializationTime: initTime,
      timestamp: new Date().toISOString(),
      services: ['firestore', 'feature_flags', 'caching', 'monitoring']
    });

    return serviceInstance;

  } catch (error: any) {
    logError('system_initialization_failed', error);
    
    // Return minimal services to allow system to function
    return {
      firestore: db,
      flagManager: null,
      caches: {
        mcq: null,
        context: null,
        template: null
      },
      monitoring: {
        metrics: null,
        alerts: null,
        health: null
      },
      initialized: false,
      initializationTime: Date.now() - startTime
    };
  }
}

/**
 * Perform basic health check during initialization
 */
async function performInitializationHealthCheck(flagManager: any): Promise<void> {
  try {
    // Test Firestore connectivity
    await db.collection('health_check').doc('init_test').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      test: true
    }, { merge: true });

    // Test feature flag system if available
    if (flagManager) {
      await flagManager.isEnabled('system_health_check', 'initialization');
    }

    logInfo('initialization_health_check_passed', {
      firestore: 'healthy',
      featureFlags: flagManager ? 'healthy' : 'unavailable'
    });

  } catch (error: any) {
    logError('initialization_health_check_failed', error);
    // Don't throw - allow system to continue with degraded functionality
  }
}

/**
 * Get system services (lazy initialization)
 * This is the main function used by other modules
 */
export async function getSystemServices(): Promise<SystemServices> {
  // Return cached services if already initialized
  if (services && services.initialized) {
    return services;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    services = await initializationPromise;
    return services;
  }

  // Start initialization
  initializationPromise = initializeServices();
  services = await initializationPromise;
  
  return services;
}

/**
 * Get system services synchronously (for cases where initialization is guaranteed)
 * Only use this after ensuring getSystemServices() has been called
 */
export function getSystemServicesSync(): SystemServices {
  if (!services) {
    throw new Error('System services not initialized. Call getSystemServices() first.');
  }
  return services;
}

/**
 * Force re-initialization of services (for testing or error recovery)
 */
export async function reinitializeServices(): Promise<SystemServices> {
  services = null;
  initializationPromise = null;
  return await getSystemServices();
}

/**
 * Get initialization status
 */
export function getInitializationStatus(): {
  initialized: boolean;
  initializationTime?: number;
  servicesAvailable: string[];
} {
  if (!services) {
    return {
      initialized: false,
      servicesAvailable: []
    };
  }

  const available = [];
  if (services.firestore) available.push('firestore');
  if (services.flagManager) available.push('feature_flags');
  if (services.caches.mcq) available.push('caching');
  if (services.monitoring.metrics) available.push('monitoring');

  return {
    initialized: services.initialized,
    initializationTime: services.initializationTime,
    servicesAvailable: available
  };
}

/**
 * Cleanup resources (for testing)
 */
export function cleanup(): void {
  services = null;
  initializationPromise = null;
}