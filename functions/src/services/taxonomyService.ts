/**
 * Taxonomy Service V2 - Lazy-loaded version
 * 
 * This version uses the knowledge base singleton to avoid deployment timeouts
 * by loading the knowledge base only when needed, not at module level.
 */

import { getKnowledgeBaseSingleton } from './knowledgeBaseSingleton';

// Use simple console logging to avoid circular dependencies
const logInfo = (message: string, data?: any) => {
  console.log(`[TaxonomyServiceV2] ${message}`, data || '');
};

const logError = (message: string, data?: any) => {
  console.error(`[TaxonomyServiceV2] ERROR: ${message}`, data || '');
};

export interface TaxonomyEntity {
  name: string;
  category: string;
  subcategory: string;
  sub_subcategory: string;
  completenessScore?: number;
  description?: string;
  [key: string]: any;
}

export interface TaxonomyStructure {
  [category: string]: {
    [subcategory: string]: {
      [subSubcategory: string]: TaxonomyEntity[];
    };
  };
}

export interface TaxonomyStats {
  totalEntities: number;
  categories: number;
  subcategories: number;
  subSubcategories: number;
  categoryDistribution: Record<string, number>;
}

class TaxonomyServiceV2 {
  private static instance: TaxonomyServiceV2;
  private taxonomyData: TaxonomyStructure | null = null;
  private entityLookup: Map<string, TaxonomyEntity> = new Map();
  private stats: TaxonomyStats | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    // Private constructor - do NOT load anything here
  }

  static getInstance(): TaxonomyServiceV2 {
    if (!TaxonomyServiceV2.instance) {
      TaxonomyServiceV2.instance = new TaxonomyServiceV2();
    }
    return TaxonomyServiceV2.instance;
  }

  /**
   * Initialize the taxonomy service by loading the knowledge base
   * This is now truly lazy - only called when needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Prevent concurrent initialization
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    try {
      logInfo('Initialization started');
      
      this.initializationPromise = this.loadKnowledgeBase();
      await this.initializationPromise;
      
      this.initialized = true;
      logInfo('Initialization completed', {
        categories: this.stats?.categories,
        totalEntities: this.stats?.totalEntities
      });
      
    } catch (error) {
      logError('Initialization failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to initialize taxonomy service: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.initializationPromise = null;
    }
  }

  private async loadKnowledgeBase(): Promise<void> {
    try {
      // Use the singleton to get TAXONOMY-ONLY data (much faster!)
      const kbSingleton = getKnowledgeBaseSingleton();
      const taxonomyData = await kbSingleton.getTaxonomyOnly();
      
      logInfo('Loading taxonomy data from singleton', {
        entityCount: taxonomyData.taxonomy?.entityCount || 0,
        categories: Object.keys(taxonomyData.taxonomy?.categories || {}).length
      });
      
      if (!taxonomyData || !taxonomyData.taxonomy || !taxonomyData.taxonomy.categories) {
        throw new Error('Invalid taxonomy format: missing categories');
      }

      // Process the taxonomy-only structure
      this.taxonomyData = {};
      this.entityLookup.clear();
      const categoryCount: Record<string, number> = {};
      let processedEntities = 0;

      // Iterate through the pre-built hierarchy
      for (const [categoryName, categoryData] of Object.entries(taxonomyData.taxonomy.categories as any)) {
        if (!this.taxonomyData[categoryName]) {
          this.taxonomyData[categoryName] = {};
        }
        
        for (const [subcategoryName, subcategoryData] of Object.entries((categoryData as any).subcategories)) {
          if (!this.taxonomyData[categoryName][subcategoryName]) {
            this.taxonomyData[categoryName][subcategoryName] = {};
          }
          
          for (const [subSubcategoryName, subSubcategoryData] of Object.entries((subcategoryData as any).subSubcategories)) {
            if (!this.taxonomyData[categoryName][subcategoryName][subSubcategoryName]) {
              this.taxonomyData[categoryName][subcategoryName][subSubcategoryName] = [];
            }
            
            // Process entities in this sub-subcategory
            for (const entity of (subSubcategoryData as any).entities) {
              const taxonomyEntity: TaxonomyEntity = {
                name: entity.name,
                category: entity.category,
                subcategory: entity.subcategory,
                sub_subcategory: entity.sub_subcategory,
                completenessScore: entity.completenessScore || 0,
                description: entity.description || '',
                entityId: entity.entityId || entity.name.toLowerCase().replace(/\s+/g, '_')
              };
              
              this.taxonomyData[categoryName][subcategoryName][subSubcategoryName].push(taxonomyEntity);
              this.entityLookup.set(entity.name, taxonomyEntity);
              processedEntities++;
            }
          }
        }
        
        categoryCount[categoryName] = (categoryData as any).count;
      }

      // Calculate statistics
      this.stats = {
        totalEntities: processedEntities,
        categories: Object.keys(this.taxonomyData).length,
        subcategories: Object.values(this.taxonomyData).reduce(
          (count, category) => count + Object.keys(category).length, 0
        ),
        subSubcategories: Object.values(this.taxonomyData).reduce(
          (count, category) => count + Object.values(category).reduce(
            (subCount, subcategory) => subCount + Object.keys(subcategory).length, 0
          ), 0
        ),
        categoryDistribution: categoryCount
      };

      this.initialized = true;
      
      logInfo('Taxonomy processed', {
        processedEntities,
        categories: this.stats.categories,
        subcategories: this.stats.subcategories,
        subSubcategories: this.stats.subSubcategories
      });

    } catch (error) {
      logError('Failed to load knowledge base', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Ensure the service is initialized before any operation
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get the complete taxonomy structure
   */
  async getTaxonomyStructure(): Promise<TaxonomyStructure> {
    await this.ensureInitialized();
    return this.taxonomyData!;
  }

  /**
   * Get taxonomy statistics
   */
  async getStats(): Promise<TaxonomyStats> {
    await this.ensureInitialized();
    return this.stats!;
  }

  /**
   * Get entity by name
   */
  async getEntity(name: string): Promise<TaxonomyEntity | undefined> {
    await this.ensureInitialized();
    return this.entityLookup.get(name);
  }

  /**
   * Get all entities in a specific category
   */
  async getEntitiesByCategory(category: string): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    const categoryData = this.taxonomyData![category];
    if (!categoryData) return [];

    const entities: TaxonomyEntity[] = [];
    for (const subcategory of Object.values(categoryData)) {
      for (const subSubcategoryEntities of Object.values(subcategory)) {
        entities.push(...subSubcategoryEntities);
      }
    }
    return entities;
  }

  /**
   * Get all entities in a specific subcategory
   */
  async getEntitiesBySubcategory(category: string, subcategory: string): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    const subcategoryData = this.taxonomyData![category]?.[subcategory];
    if (!subcategoryData) return [];

    const entities: TaxonomyEntity[] = [];
    for (const subSubcategoryEntities of Object.values(subcategoryData)) {
      entities.push(...subSubcategoryEntities);
    }
    return entities;
  }

  /**
   * Get all entities in a specific sub-subcategory
   */
  async getEntitiesBySubSubcategory(
    category: string, 
    subcategory: string, 
    subSubcategory: string
  ): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    return this.taxonomyData![category]?.[subcategory]?.[subSubcategory] || [];
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<string[]> {
    await this.ensureInitialized();
    return Object.keys(this.taxonomyData!);
  }

  /**
   * Get subcategories for a category
   */
  async getSubcategories(category: string): Promise<string[]> {
    await this.ensureInitialized();
    const categoryData = this.taxonomyData![category];
    return categoryData ? Object.keys(categoryData) : [];
  }

  /**
   * Get sub-subcategories for a subcategory
   */
  async getSubSubcategories(category: string, subcategory: string): Promise<string[]> {
    await this.ensureInitialized();
    const subcategoryData = this.taxonomyData![category]?.[subcategory];
    return subcategoryData ? Object.keys(subcategoryData) : [];
  }

  /**
   * Search entities by name (partial match)
   */
  async searchEntities(query: string): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    const lowerQuery = query.toLowerCase();
    const results: TaxonomyEntity[] = [];
    
    for (const [name, entity] of this.entityLookup.entries()) {
      if (name.toLowerCase().includes(lowerQuery)) {
        results.push(entity);
      }
    }
    
    return results;
  }

  /**
   * Get entities by taxonomy selection
   */
  async getEntitiesByTaxonomy(taxonomy: {
    categories?: string[];
    subcategories?: string[];
    entities?: string[];
  }): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    
    const entities: TaxonomyEntity[] = [];
    const entitySet = new Set<string>();
    
    if (taxonomy.entities && taxonomy.entities.length > 0) {
      // Direct entity selection
      for (const entityName of taxonomy.entities) {
        const entity = this.entityLookup.get(entityName);
        if (entity && !entitySet.has(entity.name)) {
          entities.push(entity);
          entitySet.add(entity.name);
        }
      }
    } else if (taxonomy.subcategories && taxonomy.subcategories.length > 0) {
      // Subcategory selection
      for (const subcategoryPath of taxonomy.subcategories) {
        const [category, subcategory] = subcategoryPath.split('/');
        const subcatEntities = await this.getEntitiesBySubcategory(category, subcategory);
        for (const entity of subcatEntities) {
          if (!entitySet.has(entity.name)) {
            entities.push(entity);
            entitySet.add(entity.name);
          }
        }
      }
    } else if (taxonomy.categories && taxonomy.categories.length > 0) {
      // Category selection
      for (const category of taxonomy.categories) {
        const catEntities = await this.getEntitiesByCategory(category);
        for (const entity of catEntities) {
          if (!entitySet.has(entity.name)) {
            entities.push(entity);
            entitySet.add(entity.name);
          }
        }
      }
    }
    
    return entities;
  }

  /**
   * Convert entity to database-compatible topic hierarchy
   */
  async entityToTopicHierarchy(entityName: string): Promise<any> {
    await this.ensureInitialized();
    const entity = await this.getEntity(entityName);
    
    if (!entity) {
      // Return default hierarchy for unknown entities
      return {
        category: 'medical-dermatology',
        topic: 'general',
        subtopic: 'miscellaneous',
        fullTopicId: 'medical-dermatology.general.miscellaneous'
      };
    }

    // Convert taxonomy to URL/ID-safe format
    const categoryId = entity.category.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const subcategoryId = entity.subcategory.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const subSubcategoryId = entity.sub_subcategory.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    return {
      category: categoryId,
      topic: subcategoryId,
      subtopic: subSubcategoryId,
      fullTopicId: `${categoryId}.${subcategoryId}.${subSubcategoryId}`,
      taxonomyEntity: entity.name,
      taxonomyCategory: entity.category,
      taxonomySubcategory: entity.subcategory,
      taxonomySubSubcategory: entity.sub_subcategory
    };
  }
}

// DO NOT export singleton instance directly - use getter functions
export const getTaxonomyService = () => TaxonomyServiceV2.getInstance();

// Export initialization function for Firebase Functions
export async function initializeTaxonomyService(): Promise<void> {
  const service = TaxonomyServiceV2.getInstance();
  await service.initialize();
}

// For backward compatibility with existing code that imports taxonomyService
// Create a proxy that initializes lazily on first access
const createLazyProxy = () => {
  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      const service = TaxonomyServiceV2.getInstance();
      const value = (service as any)[prop];
      
      // If it's a function, bind it to the service instance
      if (typeof value === 'function') {
        return value.bind(service);
      }
      
      return value;
    }
  };
  
  return new Proxy({}, handler);
};

export const taxonomyService = createLazyProxy();

// Types are already exported above with the interfaces