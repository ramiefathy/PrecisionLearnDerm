/**
 * Unified Knowledge Base Singleton
 * 
 * This singleton provides lazy-loaded, shared access to the knowledge base
 * across all functions, preventing multiple loads and deployment timeouts.
 * 
 * Key features:
 * - Lazy initialization (only loads when first accessed)
 * - Shared instance across all functions in the same container
 * - In-memory caching with TTL
 * - Firestore persistence as primary source
 * - Fallback to local file if Firestore unavailable
 * - Thread-safe initialization with promises
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Simple console logging to avoid circular dependencies
const log = (level: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  if (level === 'error') {
    console.error(`[${timestamp}] [KBSingleton] ${message}`, data || '');
  } else {
    console.log(`[${timestamp}] [KBSingleton] [${level}] ${message}`, data || '');
  }
};

interface KnowledgeBaseData {
  entities: any[];
  metadata?: {
    version?: string;
    lastUpdated?: string;
    entityCount?: number;
  };
}

interface TaxonomyOnlyData {
  taxonomy: {
    version: string;
    lastUpdated: string;
    entityCount: number;
    categories: any;
  };
  metadata: {
    source: string;
    purpose: string;
    fileSize?: string;
  };
}

interface CachedKnowledgeBase {
  data: KnowledgeBaseData;
  loadedAt: number;
  ttl: number;
}

class KnowledgeBaseSingleton {
  private static instance: KnowledgeBaseSingleton;
  private cache: CachedKnowledgeBase | null = null;
  private taxonomyCache: { data: TaxonomyOnlyData; loadedAt: number; ttl: number } | null = null;
  private loadingPromise: Promise<KnowledgeBaseData> | null = null;
  private taxonomyLoadingPromise: Promise<TaxonomyOnlyData> | null = null;
  private initialized = false;
  
  // Cache TTL: 1 hour in production, 5 minutes in development
  private readonly CACHE_TTL = process.env.NODE_ENV === 'production' 
    ? 60 * 60 * 1000  // 1 hour
    : 5 * 60 * 1000;  // 5 minutes
  
  // Firestore collection names
  private readonly SYSTEM_COLLECTION = 'system';
  private readonly KB_DOCUMENT = 'knowledgeBase';
  
  private constructor() {
    // Private constructor to enforce singleton pattern
  }
  
  static getInstance(): KnowledgeBaseSingleton {
    if (!KnowledgeBaseSingleton.instance) {
      KnowledgeBaseSingleton.instance = new KnowledgeBaseSingleton();
      log('info', 'Knowledge base singleton instance created');
    }
    return KnowledgeBaseSingleton.instance;
  }
  
  /**
   * Get taxonomy-only data (lightweight, fast loading)
   */
  async getTaxonomyOnly(forceRefresh = false): Promise<TaxonomyOnlyData> {
    try {
      // Check cache first
      if (!forceRefresh && this.taxonomyCache) {
        const age = Date.now() - this.taxonomyCache.loadedAt;
        if (age < this.taxonomyCache.ttl) {
          log('info', 'Using cached taxonomy data', {
            age: Math.round(age / 1000) + 's',
            ttl: Math.round(this.taxonomyCache.ttl / 1000) + 's'
          });
          return this.taxonomyCache.data;
        }
      }
      
      // Prevent concurrent loads
      if (this.taxonomyLoadingPromise && !forceRefresh) {
        log('info', 'Taxonomy already loading, waiting for completion');
        return await this.taxonomyLoadingPromise;
      }
      
      // Start new load
      log('info', 'Starting taxonomy load', { forceRefresh });
      this.taxonomyLoadingPromise = this.loadTaxonomyOnly();
      
      try {
        const data = await this.taxonomyLoadingPromise;
        
        // Update cache
        this.taxonomyCache = {
          data,
          loadedAt: Date.now(),
          ttl: this.CACHE_TTL
        };
        
        log('info', 'Taxonomy loaded and cached', {
          entityCount: data.taxonomy?.entityCount || 0,
          categories: Object.keys(data.taxonomy?.categories || {}).length
        });
        
        return data;
      } finally {
        this.taxonomyLoadingPromise = null;
      }
      
    } catch (error) {
      log('error', 'Failed to get taxonomy', error);
      // Return minimal fallback
      return this.getFallbackTaxonomy();
    }
  }
  
  /**
   * Load taxonomy-only file
   */
  private async loadTaxonomyOnly(): Promise<TaxonomyOnlyData> {
    // Try Firestore first
    try {
      const db = admin.firestore();
      const doc = await db
        .collection(this.SYSTEM_COLLECTION)
        .doc('taxonomyOnly')
        .get();
      
      if (doc.exists) {
        const data = doc.data() as TaxonomyOnlyData;
        log('info', 'Taxonomy loaded from Firestore');
        return data;
      }
    } catch (error) {
      log('warn', 'Firestore taxonomy load failed', error);
    }
    
    // Try file system
    try {
      const taxonomyPath = path.join(__dirname, '../kb/taxonomyOnly.json');
      if (fs.existsSync(taxonomyPath)) {
        const rawData = fs.readFileSync(taxonomyPath, 'utf-8');
        const data = JSON.parse(rawData) as TaxonomyOnlyData;
        log('info', 'Taxonomy loaded from file', {
          fileSize: (rawData.length / 1024).toFixed(2) + ' KB'
        });
        return data;
      }
    } catch (error) {
      log('warn', 'File system taxonomy load failed', error);
    }
    
    return this.getFallbackTaxonomy();
  }
  
  /**
   * Get fallback taxonomy structure
   */
  private getFallbackTaxonomy(): TaxonomyOnlyData {
    return {
      taxonomy: {
        version: '1.0.0-fallback',
        lastUpdated: new Date().toISOString(),
        entityCount: 3,
        categories: {
          'Neoplasms': {
            count: 1,
            subcategories: {
              'Malignant': {
                count: 1,
                subSubcategories: {
                  'Melanocytic': {
                    count: 1,
                    entities: [{
                      name: 'Melanoma',
                      category: 'Neoplasms',
                      subcategory: 'Malignant',
                      sub_subcategory: 'Melanocytic',
                      completenessScore: 85
                    }]
                  }
                }
              }
            }
          },
          'Inflammatory': {
            count: 2,
            subcategories: {
              'Papulosquamous': {
                count: 1,
                subSubcategories: {
                  'Chronic': {
                    count: 1,
                    entities: [{
                      name: 'Psoriasis',
                      category: 'Inflammatory',
                      subcategory: 'Papulosquamous',
                      sub_subcategory: 'Chronic',
                      completenessScore: 80
                    }]
                  }
                }
              },
              'Follicular': {
                count: 1,
                subSubcategories: {
                  'Common': {
                    count: 1,
                    entities: [{
                      name: 'Acne Vulgaris',
                      category: 'Inflammatory',
                      subcategory: 'Follicular',
                      sub_subcategory: 'Common',
                      completenessScore: 75
                    }]
                  }
                }
              }
            }
          }
        }
      },
      metadata: {
        source: 'fallback',
        purpose: 'minimal_taxonomy'
      }
    };
  }
  
  /**
   * Get the knowledge base data with lazy loading
   */
  async getKnowledgeBase(forceRefresh = false): Promise<KnowledgeBaseData> {
    try {
      // Check cache first (unless force refresh)
      if (!forceRefresh && this.cache) {
        const age = Date.now() - this.cache.loadedAt;
        if (age < this.cache.ttl) {
          log('info', 'Using cached knowledge base', {
            age: Math.round(age / 1000) + 's',
            ttl: Math.round(this.cache.ttl / 1000) + 's'
          });
          return this.cache.data;
        }
      }
      
      // Prevent concurrent loads - reuse existing promise if loading
      if (this.loadingPromise && !forceRefresh) {
        log('info', 'Knowledge base already loading, waiting for completion');
        return await this.loadingPromise;
      }
      
      // Start new load
      log('info', 'Starting knowledge base load', { forceRefresh });
      this.loadingPromise = this.loadKnowledgeBase();
      
      try {
        const data = await this.loadingPromise;
        
        // Update cache
        this.cache = {
          data,
          loadedAt: Date.now(),
          ttl: this.CACHE_TTL
        };
        
        this.initialized = true;
        log('info', 'Knowledge base loaded and cached', {
          entityCount: data.entities?.length || 0,
          cacheExpiry: new Date(Date.now() + this.CACHE_TTL).toISOString()
        });
        
        return data;
      } finally {
        // Clear loading promise
        this.loadingPromise = null;
      }
      
    } catch (error) {
      log('error', 'Failed to get knowledge base', error);
      
      // Return minimal fallback data
      return this.getFallbackKnowledgeBase();
    }
  }
  
  /**
   * Load knowledge base from Firestore or file system
   */
  private async loadKnowledgeBase(): Promise<KnowledgeBaseData> {
    // Try Firestore first
    try {
      const data = await this.loadFromFirestore();
      if (data) {
        return data;
      }
    } catch (error) {
      log('warn', 'Firestore load failed, trying file system', error);
    }
    
    // Try file system as fallback
    try {
      const data = await this.loadFromFile();
      if (data) {
        // Optionally save to Firestore for next time
        this.saveToFirestore(data).catch(err => 
          log('warn', 'Failed to save KB to Firestore', err)
        );
        return data;
      }
    } catch (error) {
      log('warn', 'File system load failed', error);
    }
    
    // Return fallback if all else fails
    return this.getFallbackKnowledgeBase();
  }
  
  /**
   * Load from Firestore
   */
  private async loadFromFirestore(): Promise<KnowledgeBaseData | null> {
    try {
      const db = admin.firestore();
      const doc = await db
        .collection(this.SYSTEM_COLLECTION)
        .doc(this.KB_DOCUMENT)
        .get();
      
      if (doc.exists) {
        const data = doc.data() as KnowledgeBaseData;
        log('info', 'Knowledge base loaded from Firestore', {
          entityCount: data.entities?.length || 0,
          version: data.metadata?.version
        });
        return data;
      }
      
      log('warn', 'Knowledge base document not found in Firestore');
      return null;
      
    } catch (error) {
      log('error', 'Firestore load error', error);
      return null;
    }
  }
  
  /**
   * Load from file system (fallback)
   */
  private async loadFromFile(): Promise<KnowledgeBaseData | null> {
    try {
      const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
      
      if (!fs.existsSync(kbPath)) {
        log('warn', 'Knowledge base file not found', { path: kbPath });
        return null;
      }
      
      const rawData = fs.readFileSync(kbPath, 'utf-8');
      const data = JSON.parse(rawData) as KnowledgeBaseData;
      
      log('info', 'Knowledge base loaded from file', {
        entityCount: data.entities?.length || 0,
        fileSize: rawData.length
      });
      
      return data;
      
    } catch (error) {
      log('error', 'File load error', error);
      return null;
    }
  }
  
  /**
   * Save to Firestore for persistence
   */
  private async saveToFirestore(data: KnowledgeBaseData): Promise<void> {
    try {
      const db = admin.firestore();
      await db
        .collection(this.SYSTEM_COLLECTION)
        .doc(this.KB_DOCUMENT)
        .set({
          ...data,
          metadata: {
            ...data.metadata,
            savedAt: admin.firestore.FieldValue.serverTimestamp(),
            savedBy: 'KnowledgeBaseSingleton'
          }
        });
      
      log('info', 'Knowledge base saved to Firestore');
    } catch (error) {
      log('error', 'Failed to save to Firestore', error);
      throw error;
    }
  }
  
  /**
   * Get minimal fallback knowledge base
   */
  private getFallbackKnowledgeBase(): KnowledgeBaseData {
    log('warn', 'Using fallback knowledge base');
    
    return {
      entities: [
        {
          id: 'melanoma',
          name: 'Melanoma',
          taxonomy: {
            name: 'Melanoma',
            category: 'Neoplasms',
            subcategory: 'Malignant',
            sub_subcategory: 'Melanocytic'
          },
          description: 'A serious form of skin cancer',
          completeness_score: 85
        },
        {
          id: 'psoriasis',
          name: 'Psoriasis',
          taxonomy: {
            name: 'Psoriasis',
            category: 'Inflammatory',
            subcategory: 'Papulosquamous',
            sub_subcategory: 'Chronic'
          },
          description: 'Chronic autoimmune skin condition',
          completeness_score: 80
        },
        {
          id: 'acne',
          name: 'Acne Vulgaris',
          taxonomy: {
            name: 'Acne Vulgaris',
            category: 'Inflammatory',
            subcategory: 'Follicular',
            sub_subcategory: 'Common'
          },
          description: 'Common skin condition affecting sebaceous glands',
          completeness_score: 75
        }
      ],
      metadata: {
        version: '1.0.0-fallback',
        lastUpdated: new Date().toISOString(),
        entityCount: 3
      }
    };
  }
  
  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache = null;
    this.initialized = false;
    log('info', 'Knowledge base cache cleared');
  }
  
  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { initialized: boolean; cached: boolean; age?: number; ttl?: number } {
    if (!this.cache) {
      return { initialized: this.initialized, cached: false };
    }
    
    const age = Date.now() - this.cache.loadedAt;
    return {
      initialized: this.initialized,
      cached: true,
      age: Math.round(age / 1000),
      ttl: Math.round(this.cache.ttl / 1000)
    };
  }
}

// Export singleton instance getter (not the instance itself)
export const getKnowledgeBaseSingleton = () => KnowledgeBaseSingleton.getInstance();

// Export types for type safety
export type { KnowledgeBaseData, TaxonomyOnlyData };