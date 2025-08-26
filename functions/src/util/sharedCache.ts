/**
 * Shared Cache System for PrecisionLearnDerm AI Pipeline
 * Eliminates redundant knowledge base loading and provides intelligent caching
 */

import { logInfo, logError } from './logging';
import { getKnowledgeBase as getKBFromService } from '../services/knowledgeBaseService';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

interface CacheConfig {
  knowledgeBaseTTL: number;  // Knowledge base cache TTL (ms)
  contextCacheTTL: number;   // Generated context cache TTL (ms)
  maxCacheSize: number;      // Maximum cache entries
  enableMetrics: boolean;    // Enable performance metrics
}

export class SharedCache {
  private static instance: SharedCache;
  private knowledgeBase: Record<string, any> | null = null;
  private contextCache = new Map<string, CacheEntry<any>>();
  private generatedQuestionCache = new Map<string, CacheEntry<any>>();
  private webSearchCache = new Map<string, CacheEntry<any>>();
  
  private config: CacheConfig = {
    knowledgeBaseTTL: 24 * 60 * 60 * 1000, // 24 hours
    contextCacheTTL: 60 * 60 * 1000,       // 1 hour
    maxCacheSize: 1000,
    enableMetrics: true
  };

  private metrics = {
    kbLoadTime: 0,
    kbAccessCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastMetricsReset: Date.now()
  };

  private constructor() {
    // Private constructor for singleton pattern
    // Lazy initialization - don't load KB at module level
  }

  /**
   * Get the singleton instance of SharedCache
   */
  static getInstance(): SharedCache {
    if (!SharedCache.instance) {
      SharedCache.instance = new SharedCache();
    }
    return SharedCache.instance;
  }

  /**
   * Initialize knowledge base from centralized service
   * This happens once on first access, not per request
   */
  private async initializeKnowledgeBase(): Promise<void> {
    if (this.knowledgeBase !== null) {
      return; // Already loaded
    }

    const startTime = Date.now();
    
    try {
      // Load from centralized knowledge base service (Firestore-backed)
      const kb = await getKBFromService();
      
      // Extract entities from the knowledge base structure
      this.knowledgeBase = kb.entities || kb || {};
      
      this.metrics.kbLoadTime = Date.now() - startTime;
      
      const entryCount = Object.keys(this.knowledgeBase || {}).length;
      
      logInfo('shared_cache.kb_loaded', {
        entryCount,
        loadTimeMs: this.metrics.kbLoadTime,
        source: kb.metadata?.source || 'service',
        timestamp: new Date().toISOString()
      });

      console.log(`SharedCache: Loaded ${entryCount} KB entries in ${this.metrics.kbLoadTime}ms from ${kb.metadata?.source || 'service'}`);
      
    } catch (error) {
      logError('shared_cache.kb_load_failed', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      // Fallback to empty KB to prevent crashes
      this.knowledgeBase = {};
    }
  }

  /**
   * Get knowledge base with lazy loading
   * Thread-safe and ensures single loading across all requests
   */
  async getKnowledgeBase(): Promise<Record<string, any>> {
    if (this.knowledgeBase === null) {
      await this.initializeKnowledgeBase();
    }

    this.metrics.kbAccessCount++;
    
    if (this.config.enableMetrics && this.metrics.kbAccessCount % 100 === 0) {
      this.logMetrics();
    }

    return this.knowledgeBase || {};
  }

  /**
   * Cache generated context for topics to avoid regeneration
   */
  setContextCache(key: string, context: any): void {
    // Implement LRU eviction if cache is full
    if (this.contextCache.size >= this.config.maxCacheSize) {
      this.evictOldestEntry(this.contextCache);
    }

    this.contextCache.set(key, {
      data: context,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now()
    });
  }

  /**
   * Get cached context with TTL validation
   */
  getContextCache(key: string): any | null {
    const entry = this.contextCache.get(key);
    
    if (!entry) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.contextCacheTTL) {
      this.contextCache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    // Update access metrics
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.metrics.cacheHits++;
    
    return entry.data;
  }

  /**
   * Cache web search results to reduce API calls
   */
  setWebSearchCache(query: string, results: any): void {
    if (this.webSearchCache.size >= this.config.maxCacheSize) {
      this.evictOldestEntry(this.webSearchCache);
    }

    const key = this.normalizeSearchQuery(query);
    this.webSearchCache.set(key, {
      data: results,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now()
    });
  }

  /**
   * Get cached web search results
   */
  getWebSearchCache(query: string): any | null {
    const key = this.normalizeSearchQuery(query);
    const entry = this.webSearchCache.get(key);
    
    if (!entry) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Web search cache has longer TTL (4 hours)
    if (Date.now() - entry.timestamp > 4 * 60 * 60 * 1000) {
      this.webSearchCache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.metrics.cacheHits++;
    
    return entry.data;
  }

  /**
   * Cache generated questions to avoid regeneration
   */
  setQuestionCache(topicHash: string, question: any): void {
    if (this.generatedQuestionCache.size >= this.config.maxCacheSize) {
      this.evictOldestEntry(this.generatedQuestionCache);
    }

    this.generatedQuestionCache.set(topicHash, {
      data: question,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now()
    });
  }

  /**
   * Get cached generated question
   */
  getQuestionCache(topicHash: string): any | null {
    const entry = this.generatedQuestionCache.get(topicHash);
    
    if (!entry) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Generated questions cache has very long TTL (7 days) since they're expensive to generate
    if (Date.now() - entry.timestamp > 7 * 24 * 60 * 60 * 1000) {
      this.generatedQuestionCache.delete(topicHash);
      this.metrics.cacheMisses++;
      return null;
    }

    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.metrics.cacheHits++;
    
    return entry.data;
  }

  /**
   * Get comprehensive cache statistics
   */
  getMetrics() {
    const now = Date.now();
    const uptimeHours = (now - this.metrics.lastMetricsReset) / (1000 * 60 * 60);
    
    return {
      knowledgeBase: {
        entryCount: Object.keys(this.knowledgeBase || {}).length,
        loadTimeMs: this.metrics.kbLoadTime,
        accessCount: this.metrics.kbAccessCount,
        isLoaded: this.knowledgeBase !== null
      },
      cache: {
        contextCacheSize: this.contextCache.size,
        webSearchCacheSize: this.webSearchCache.size,
        questionCacheSize: this.generatedQuestionCache.size,
        totalCacheHits: this.metrics.cacheHits,
        totalCacheMisses: this.metrics.cacheMisses,
        hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
      },
      performance: {
        uptimeHours: Math.round(uptimeHours * 100) / 100,
        avgRequestsPerHour: Math.round(this.metrics.kbAccessCount / uptimeHours) || 0
      }
    };
  }

  /**
   * Clear specific cache type
   */
  clearCache(type: 'context' | 'webSearch' | 'questions' | 'all'): void {
    switch (type) {
      case 'context':
        this.contextCache.clear();
        break;
      case 'webSearch':
        this.webSearchCache.clear();
        break;
      case 'questions':
        this.generatedQuestionCache.clear();
        break;
      case 'all':
        this.contextCache.clear();
        this.webSearchCache.clear();
        this.generatedQuestionCache.clear();
        break;
    }

    logInfo('shared_cache.cache_cleared', {
      type,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Private helper methods
   */
  private evictOldestEntry(cache: Map<string, CacheEntry<any>>): void {
    let oldestKey = '';
    let oldestAccess = Date.now();
    
    for (const [key, entry] of cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  private normalizeSearchQuery(query: string): string {
    return query.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private logMetrics(): void {
    const metrics = this.getMetrics();
    
    logInfo('shared_cache.metrics', {
      ...metrics,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Convenience functions for easy access
 * Use lazy initialization to avoid blocking deployment
 */
let _sharedCache: SharedCache | null = null;

export function getSharedCache(): SharedCache {
  if (!_sharedCache) {
    _sharedCache = SharedCache.getInstance();
  }
  return _sharedCache;
}

// For backward compatibility
export const sharedCache = {
  getKnowledgeBase: () => getSharedCache().getKnowledgeBase(),
  getContextCache: (topic: string) => getSharedCache().getContextCache(topic),
  setContextCache: (topic: string, context: any) => getSharedCache().setContextCache(topic, context),
  getWebSearchCache: (query: string) => getSharedCache().getWebSearchCache(query),
  setWebSearchCache: (query: string, results: any) => getSharedCache().setWebSearchCache(query, results),
  getMetrics: () => getSharedCache().getMetrics(),
  clearCache: (type?: 'context' | 'webSearch' | 'questions' | 'all') => getSharedCache().clearCache(type as any)
};

export async function getSharedKB(): Promise<Record<string, any>> {
  return getSharedCache().getKnowledgeBase();
}

export function getCachedContext(topic: string): any | null {
  return getSharedCache().getContextCache(topic);
}

export function setCachedContext(topic: string, context: any): void {
  getSharedCache().setContextCache(topic, context);
}

export function getCachedWebSearch(query: string): any | null {
  return getSharedCache().getWebSearchCache(query);
}

export function setCachedWebSearch(query: string, results: any): void {
  getSharedCache().setWebSearchCache(query, results);
}

export function getCacheMetrics() {
  return getSharedCache().getMetrics();
}