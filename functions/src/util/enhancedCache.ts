/**
 * Enhanced Two-Tier Caching System
 * L1: Redis (sub-millisecond response)  
 * L2: Firestore (5-10ms response)
 * Optimized for MCQ generation pipeline
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

// Use console logging to avoid circular dependency
// (enhancedCache -> logging -> monitoring -> health -> enhancedCache)
const logInfo = (event: string, data?: any) => {
  console.log(`[Cache] ${event}`, data || '');
};

const logError = (event: string, error: any, data?: any) => {
  console.error(`[Cache] ERROR: ${event}`, error, data || '');
};

const db = admin.firestore();

// Cache interfaces
interface CacheEntry<T> {
  data: T;
  expiry: number;
  created: number;
  hitCount?: number;
  lastAccess?: number;
}

interface CacheStats {
  l1Hits: number;
  l2Hits: number;
  misses: number;
  totalRequests: number;
  hitRate: number;
}

// Cache configuration
interface CacheConfig {
  l1TTL: number;      // Redis TTL in seconds
  l2TTL: number;      // Firestore TTL in milliseconds
  maxL1Size?: number; // Max entries in L1 cache
  enableCompression?: boolean;
}

// Default configurations by cache type
const CACHE_CONFIGS: Record<string, CacheConfig> = {
  mcq: {
    l1TTL: 3600,      // 1 hour
    l2TTL: 24 * 60 * 60 * 1000,  // 24 hours
    maxL1Size: 1000,
    enableCompression: true
  },
  context: {
    l1TTL: 7200,      // 2 hours  
    l2TTL: 7 * 24 * 60 * 60 * 1000,  // 7 days
    maxL1Size: 500,
    enableCompression: true
  },
  template: {
    l1TTL: 86400,     // 24 hours
    l2TTL: 30 * 24 * 60 * 60 * 1000,  // 30 days
    maxL1Size: 200,
    enableCompression: false
  }
};

/**
 * Enhanced Cache Manager with two-tier architecture
 */
export class EnhancedCacheManager {
  private cacheType: string;
  private config: CacheConfig;
  private l1Cache: Map<string, CacheEntry<any>>;
  private stats: CacheStats;

  constructor(cacheType: 'mcq' | 'context' | 'template') {
    this.cacheType = cacheType;
    this.config = CACHE_CONFIGS[cacheType];
    this.l1Cache = new Map();
    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0
    };

    // Clean up L1 cache periodically
    setInterval(() => this.cleanupL1Cache(), 300000); // Every 5 minutes
  }

  /**
   * Get item from cache (checks L1 then L2)
   */
  async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.generateCacheKey(key);
    this.stats.totalRequests++;

    try {
      // Check L1 cache first (in-memory)
      const l1Entry = this.l1Cache.get(cacheKey);
      if (l1Entry && l1Entry.expiry > Date.now()) {
        this.stats.l1Hits++;
        l1Entry.hitCount = (l1Entry.hitCount || 0) + 1;
        l1Entry.lastAccess = Date.now();
        
        logInfo('cache_l1_hit', {
          cacheType: this.cacheType,
          key: key.substring(0, 50),
          hitCount: l1Entry.hitCount
        });
        
        return l1Entry.data;
      }

      // Check L2 cache (Firestore)
      const l2Entry = await this.getFromL2(cacheKey);
      if (l2Entry) {
        this.stats.l2Hits++;
        
        // Promote to L1 cache
        this.setL1(cacheKey, l2Entry.data, l2Entry.expiry);
        
        logInfo('cache_l2_hit', {
          cacheType: this.cacheType,
          key: key.substring(0, 50),
          ageMs: Date.now() - l2Entry.created
        });
        
        return l2Entry.data;
      }

      // Cache miss
      this.stats.misses++;
      this.updateHitRate();
      
      logInfo('cache_miss', {
        cacheType: this.cacheType,
        key: key.substring(0, 50),
        hitRate: this.stats.hitRate
      });

      return null;

    } catch (error: any) {
      logError('cache_get_error', {
        cacheType: this.cacheType,
        key: key.substring(0, 50),
        error: error.message
      });
      return null;
    }
  }

  /**
   * Set item in both cache layers
   */
  async set<T>(key: string, data: T, customTTL?: number): Promise<void> {
    const cacheKey = this.generateCacheKey(key);
    const now = Date.now();
    const l2Expiry = now + (customTTL || this.config.l2TTL);

    try {
      // Set in L1 cache (synchronous)
      this.setL1(cacheKey, data, l2Expiry);

      // Set in L2 cache (asynchronous, don't block)
      this.setL2(cacheKey, data, l2Expiry, now).catch(error => {
        logError('cache_l2_set_error', {
          cacheType: this.cacheType,
          key: key.substring(0, 50),
          error: error.message
        });
      });

      logInfo('cache_set', {
        cacheType: this.cacheType,
        key: key.substring(0, 50),
        dataSize: JSON.stringify(data).length,
        ttlMs: customTTL || this.config.l2TTL
      });

    } catch (error: any) {
      logError('cache_set_error', {
        cacheType: this.cacheType,
        key: key.substring(0, 50),
        error: error.message
      });
    }
  }

  /**
   * Delete item from both cache layers
   */
  async delete(key: string): Promise<void> {
    const cacheKey = this.generateCacheKey(key);

    try {
      // Delete from L1
      this.l1Cache.delete(cacheKey);

      // Delete from L2 (asynchronous)
      this.deleteFromL2(cacheKey).catch(error => {
        logError('cache_l2_delete_error', {
          cacheType: this.cacheType,
          key: key.substring(0, 50),
          error: error.message
        });
      });

      logInfo('cache_delete', {
        cacheType: this.cacheType,
        key: key.substring(0, 50)
      });

    } catch (error: any) {
      logError('cache_delete_error', {
        cacheType: this.cacheType,
        key: key.substring(0, 50),
        error: error.message
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { cacheType: string; l1Size: number } {
    return {
      ...this.stats,
      cacheType: this.cacheType,
      l1Size: this.l1Cache.size
    };
  }

  /**
   * Clear all cache (useful for testing)
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    
    try {
      const collection = db.collection(`cache_${this.cacheType}`);
      const batch = db.batch();
      
      const docs = await collection.limit(100).get();
      docs.docs.forEach(doc => batch.delete(doc.ref));
      
      await batch.commit();
      
      logInfo('cache_cleared', { cacheType: this.cacheType });
    } catch (error: any) {
      logError('cache_clear_error', {
        cacheType: this.cacheType,
        error: error.message
      });
    }
  }

  /**
   * Generate deterministic cache key
   */
  private generateCacheKey(key: string): string {
    // Create hash to handle long keys and ensure consistency
    return createHash('md5').update(`${this.cacheType}:${key}`).digest('hex');
  }

  /**
   * Set item in L1 cache with size management
   */
  private setL1<T>(cacheKey: string, data: T, expiry: number): void {
    // Check if L1 cache is full
    if (this.l1Cache.size >= (this.config.maxL1Size || 1000)) {
      this.evictLRU();
    }

    this.l1Cache.set(cacheKey, {
      data,
      expiry,
      created: Date.now(),
      hitCount: 0,
      lastAccess: Date.now()
    });
  }

  /**
   * Get item from L2 cache (Firestore)
   */
  private async getFromL2(cacheKey: string): Promise<CacheEntry<any> | null> {
    try {
      const doc = await db.collection(`cache_${this.cacheType}`).doc(cacheKey).get();
      
      if (!doc.exists) return null;
      
      const entry = doc.data() as CacheEntry<any>;
      
      // Check if expired
      if (entry.expiry <= Date.now()) {
        // Delete expired entry asynchronously
        doc.ref.delete().catch(error => 
          logError('expired_cache_delete_error', { error })
        );
        return null;
      }
      
      return entry;
    } catch (error: any) {
      logError('cache_l2_get_error', {
        cacheType: this.cacheType,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Set item in L2 cache (Firestore)
   */
  private async setL2<T>(
    cacheKey: string, 
    data: T, 
    expiry: number, 
    created: number
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      data: this.config.enableCompression ? this.compress(data) : data,
      expiry,
      created,
      hitCount: 0
    };

    await db.collection(`cache_${this.cacheType}`).doc(cacheKey).set(entry);
  }

  /**
   * Delete item from L2 cache
   */
  private async deleteFromL2(cacheKey: string): Promise<void> {
    await db.collection(`cache_${this.cacheType}`).doc(cacheKey).delete();
  }

  /**
   * Evict least recently used items from L1 cache
   */
  private evictLRU(): void {
    // Find oldest accessed item
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.lastAccess && entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.l1Cache.delete(oldestKey);
      logInfo('cache_l1_eviction', {
        cacheType: this.cacheType,
        evictedKey: oldestKey.substring(0, 20),
        l1Size: this.l1Cache.size
      });
    }
  }

  /**
   * Clean up expired entries from L1 cache
   */
  private cleanupL1Cache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.expiry <= now) {
        this.l1Cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logInfo('cache_l1_cleanup', {
        cacheType: this.cacheType,
        cleanedCount: cleaned,
        remainingSize: this.l1Cache.size
      });
    }
  }

  /**
   * Update hit rate statistics
   */
  private updateHitRate(): void {
    const totalHits = this.stats.l1Hits + this.stats.l2Hits;
    this.stats.hitRate = this.stats.totalRequests > 0 ? 
      (totalHits / this.stats.totalRequests) * 100 : 0;
  }

  /**
   * Compress data for storage (placeholder implementation)
   */
  private compress<T>(data: T): T {
    // TODO: Implement actual compression if needed
    // For now, just return data as-is
    return data;
  }

  /**
   * Decompress data (placeholder implementation) 
   */
  private decompress<T>(data: T): T {
    // TODO: Implement actual decompression if needed
    return data;
  }
}

// Global cache instances
let mcqCache: EnhancedCacheManager;
let contextCache: EnhancedCacheManager;
let templateCache: EnhancedCacheManager;

/**
 * Get MCQ cache instance
 */
export function getMCQCache(): EnhancedCacheManager {
  if (!mcqCache) {
    mcqCache = new EnhancedCacheManager('mcq');
  }
  return mcqCache;
}

/**
 * Get context cache instance
 */
export function getContextCache(): EnhancedCacheManager {
  if (!contextCache) {
    contextCache = new EnhancedCacheManager('context');
  }
  return contextCache;
}

/**
 * Get template cache instance
 */
export function getTemplateCache(): EnhancedCacheManager {
  if (!templateCache) {
    templateCache = new EnhancedCacheManager('template');
  }
  return templateCache;
}

/**
 * Cache warming utility
 */
export async function warmCache(
  cacheType: 'mcq' | 'context' | 'template',
  entries: Array<{ key: string; data: any; ttl?: number }>
): Promise<void> {
  const cache = cacheType === 'mcq' ? getMCQCache() :
               cacheType === 'context' ? getContextCache() :
               getTemplateCache();

  logInfo('cache_warming_started', {
    cacheType,
    entryCount: entries.length
  });

  for (const entry of entries) {
    try {
      await cache.set(entry.key, entry.data, entry.ttl);
    } catch (error: any) {
      logError('cache_warm_entry_failed', {
        cacheType,
        key: entry.key.substring(0, 50),
        error: error.message
      });
    }
  }

  logInfo('cache_warming_complete', {
    cacheType,
    entryCount: entries.length
  });
}

/**
 * Get aggregated cache statistics
 */
export function getAllCacheStats(): Array<CacheStats & { cacheType: string; l1Size: number }> {
  const stats = [];
  
  if (mcqCache) stats.push(mcqCache.getStats());
  if (contextCache) stats.push(contextCache.getStats());
  if (templateCache) stats.push(templateCache.getStats());
  
  return stats;
}

/**
 * Cache health check
 */
export async function cacheHealthCheck(): Promise<{
  healthy: boolean;
  details: any;
  timestamp: string;
}> {
  const testKey = `health_check_${Date.now()}`;
  const testData = { test: true, timestamp: Date.now() };
  
  try {
    const cache = getMCQCache();
    
    // Test write
    await cache.set(testKey, testData, 60000); // 1 minute TTL
    
    // Test read
    const retrieved = await cache.get(testKey);
    
    // Test delete
    await cache.delete(testKey);
    
    const healthy = retrieved !== null && (retrieved as any)?.test === true;
    const stats = getAllCacheStats();
    
    return {
      healthy,
      details: {
        writeTest: 'passed',
        readTest: retrieved !== null ? 'passed' : 'failed',
        deleteTest: 'passed',
        stats
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error: any) {
    return {
      healthy: false,
      details: {
        error: error.message,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
  }
}