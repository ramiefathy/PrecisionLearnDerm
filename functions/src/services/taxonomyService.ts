import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logError } from '../util/logging';

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

class TaxonomyService {
  private static instance: TaxonomyService;
  private taxonomyData: TaxonomyStructure | null = null;
  private entityLookup: Map<string, TaxonomyEntity> = new Map();
  private stats: TaxonomyStats | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): TaxonomyService {
    if (!TaxonomyService.instance) {
      TaxonomyService.instance = new TaxonomyService();
    }
    return TaxonomyService.instance;
  }

  /**
   * Initialize the taxonomy service by loading the knowledge base
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logInfo('taxonomy_service_init_started', {});
      
      // Add timeout protection for initialization
      const initWithTimeout = this.loadKnowledgeBase();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Taxonomy service initialization timeout (30s)')), 30000)
      );
      
      await Promise.race([initWithTimeout, timeout]);
      
    } catch (error) {
      logError('taxonomy_service_init_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to initialize taxonomy service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadKnowledgeBase(): Promise<void> {
    try {
      
      // Load the knowledge base file from kb directory
      const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
      const backupPath = path.join(__dirname, '../../../GraphRAG/knowledgeBaseUpdating/backups/kb_backup_20250824_015634.json');
      
      logInfo('taxonomy_service_debug_paths', {
        kbPath,
        backupPath,
        kbExists: fs.existsSync(kbPath),
        backupExists: fs.existsSync(backupPath),
        cwd: process.cwd(),
        dirname: __dirname
      });
      
      let kbData: any;
      let rawData: string;
      let filePath: string;
      
      if (!fs.existsSync(kbPath)) {
        // Fallback to backup file if main file doesn't exist
        if (!fs.existsSync(backupPath)) {
          logError('taxonomy_service_no_files', {
            kbPath,
            backupPath,
            kbExists: fs.existsSync(kbPath),
            backupExists: fs.existsSync(backupPath)
          });
          throw new Error(`Knowledge base file not found at: ${kbPath} or ${backupPath}`);
        }
        filePath = backupPath;
        rawData = await fs.promises.readFile(backupPath, 'utf8');
        logInfo('taxonomy_service_using_backup', { filePath, dataLength: rawData.length });
      } else {
        filePath = kbPath;
        rawData = await fs.promises.readFile(kbPath, 'utf8');
        logInfo('taxonomy_service_using_main', { filePath, dataLength: rawData.length });
      }
      
      try {
        kbData = JSON.parse(rawData);
        logInfo('taxonomy_service_json_parsed', { 
          success: true, 
          filePath,
          dataLength: rawData.length,
          objectType: typeof kbData,
          topLevelKeys: Object.keys(kbData).slice(0, 10)
        });
      } catch (parseError) {
        logError('taxonomy_service_json_parse_error', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          filePath,
          dataLength: rawData.length,
          firstChars: rawData.slice(0, 100)
        });
        throw new Error(`Failed to parse knowledge base JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      // Debug logging for knowledge base structure
      logInfo('taxonomy_service_debug_kb_structure', {
        hasEntities: !!kbData.entities,
        entitiesType: typeof kbData.entities,
        isArray: Array.isArray(kbData.entities),
        topLevelKeys: Object.keys(kbData).slice(0, 10),
        kbDataType: typeof kbData,
        fileSize: JSON.stringify(kbData).length
      });

      if (!kbData.entities || !Array.isArray(kbData.entities)) {
        logError('taxonomy_service_invalid_format', {
          hasEntities: !!kbData.entities,
          entitiesType: typeof kbData.entities,
          isArray: Array.isArray(kbData.entities),
          topLevelKeys: Object.keys(kbData)
        });
        throw new Error('Invalid knowledge base format: missing entities array');
      }

      // Process entities and build taxonomy structure
      this.taxonomyData = {};
      this.entityLookup.clear();
      const categoryCount: Record<string, number> = {};

      let processedEntities = 0;
      let skippedEntities = 0;

      for (const entity of kbData.entities) {
        if (!entity.taxonomy || !entity.taxonomy.name) {
          skippedEntities++;
          continue;
        }

        const tax = entity.taxonomy;
        const category = tax.category || 'Unknown';
        const subcategory = tax.subcategory || 'General';
        const subSubcategory = tax.sub_subcategory || 'General';
        const name = tax.name;

        // Skip meta categories
        if (category === 'Taxonomy' || category === 'Hubs') {
          skippedEntities++;
          continue;
        }

        // Create taxonomy entity
        const taxonomyEntity: TaxonomyEntity = {
          name,
          category,
          subcategory,
          sub_subcategory: subSubcategory,
          completenessScore: entity.completeness_score || 0,
          description: entity.description || '',
          entityId: entity.id || name.toLowerCase().replace(/\s+/g, '_'),
          originalEntity: entity
        };

        // Build hierarchical structure
        if (!this.taxonomyData[category]) {
          this.taxonomyData[category] = {};
        }
        if (!this.taxonomyData[category][subcategory]) {
          this.taxonomyData[category][subcategory] = {};
        }
        if (!this.taxonomyData[category][subcategory][subSubcategory]) {
          this.taxonomyData[category][subcategory][subSubcategory] = [];
        }

        this.taxonomyData[category][subcategory][subSubcategory].push(taxonomyEntity);
        this.entityLookup.set(name, taxonomyEntity);
        
        categoryCount[category] = (categoryCount[category] || 0) + 1;
        processedEntities++;
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

      logInfo('taxonomy_service_init_completed', {
        processedEntities,
        skippedEntities,
        categories: this.stats.categories,
        subcategories: this.stats.subcategories,
        subSubcategories: this.stats.subSubcategories
      });

    } catch (error) {
      logError('taxonomy_service_load_knowledge_base_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
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
  async getEntitiesBySubSubcategory(category: string, subcategory: string, subSubcategory: string): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    return this.taxonomyData![category]?.[subcategory]?.[subSubcategory] || [];
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<string[]> {
    await this.ensureInitialized();
    return Object.keys(this.taxonomyData!).sort();
  }

  /**
   * Get all subcategories for a category
   */
  async getSubcategories(category: string): Promise<string[]> {
    await this.ensureInitialized();
    const categoryData = this.taxonomyData![category];
    if (!categoryData) return [];
    return Object.keys(categoryData).sort();
  }

  /**
   * Get all sub-subcategories for a category and subcategory
   */
  async getSubSubcategories(category: string, subcategory: string): Promise<string[]> {
    await this.ensureInitialized();
    const subcategoryData = this.taxonomyData![category]?.[subcategory];
    if (!subcategoryData) return [];
    return Object.keys(subcategoryData).sort();
  }

  /**
   * Search entities by name (partial match)
   */
  async searchEntities(query: string, limit: number = 50): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    const results: TaxonomyEntity[] = [];
    const queryLower = query.toLowerCase();

    for (const entity of this.entityLookup.values()) {
      if (entity.name.toLowerCase().includes(queryLower)) {
        results.push(entity);
        if (results.length >= limit) break;
      }
    }

    // Sort by completeness score descending
    return results.sort((a, b) => (b.completenessScore || 0) - (a.completenessScore || 0));
  }

  /**
   * Get high-quality entities (completeness score > threshold)
   */
  async getHighQualityEntities(threshold: number = 65): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    const entities: TaxonomyEntity[] = [];
    
    for (const entity of this.entityLookup.values()) {
      if ((entity.completenessScore || 0) > threshold) {
        entities.push(entity);
      }
    }

    return entities.sort((a, b) => (b.completenessScore || 0) - (a.completenessScore || 0));
  }

  /**
   * Get entity counts for UI display
   */
  async getEntityCounts(): Promise<Record<string, number>> {
    await this.ensureInitialized();
    const counts: Record<string, number> = {};
    
    // Count entities at each level
    for (const [categoryName, categoryData] of Object.entries(this.taxonomyData!)) {
      let categoryCount = 0;
      
      for (const [subcategoryName, subcategoryData] of Object.entries(categoryData)) {
        let subcategoryCount = 0;
        
        for (const [subSubcategoryName, entities] of Object.entries(subcategoryData)) {
          const subSubcategoryCount = entities.length;
          counts[`${categoryName}::${subcategoryName}::${subSubcategoryName}`] = subSubcategoryCount;
          subcategoryCount += subSubcategoryCount;
        }
        
        counts[`${categoryName}::${subcategoryName}`] = subcategoryCount;
        categoryCount += subcategoryCount;
      }
      
      counts[categoryName] = categoryCount;
    }
    
    return counts;
  }

  /**
   * Get weighted entity selection for question generation
   */
  async getWeightedEntitySelection(count: number, category?: string, subcategory?: string): Promise<TaxonomyEntity[]> {
    await this.ensureInitialized();
    
    let entities: TaxonomyEntity[];
    if (category && subcategory) {
      entities = await this.getEntitiesBySubcategory(category, subcategory);
    } else if (category) {
      entities = await this.getEntitiesByCategory(category);
    } else {
      entities = await this.getHighQualityEntities();
    }

    if (entities.length === 0) return [];

    // Weight entities by completeness score
    const totalWeight = entities.reduce((sum, entity) => sum + (entity.completenessScore || 0), 0);
    const selected: TaxonomyEntity[] = [];
    const used = new Set<string>();

    for (let i = 0; i < count && selected.length < entities.length; i++) {
      let random = Math.random() * totalWeight;
      let selectedEntity: TaxonomyEntity | null = null;

      for (const entity of entities) {
        if (used.has(entity.name)) continue;
        
        random -= (entity.completenessScore || 0);
        if (random <= 0) {
          selectedEntity = entity;
          break;
        }
      }

      if (selectedEntity) {
        selected.push(selectedEntity);
        used.add(selectedEntity.name);
      } else if (entities.length > used.size) {
        // Fallback: pick first unused entity
        const availableEntities = entities.filter(e => !used.has(e.name));
        if (availableEntities.length > 0) {
          selected.push(availableEntities[0]);
          used.add(availableEntities[0].name);
        }
      }
    }

    return selected;
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

  /**
   * Ensure the service is initialized (async lazy loading)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.taxonomyData) {
      return;
    }

    // If initialization is already in progress, wait for it
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    // Start initialization
    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }
}

// Export singleton instance
export const taxonomyService = TaxonomyService.getInstance();

// Export initialization function for Firebase Functions
export async function initializeTaxonomyService(): Promise<void> {
  await taxonomyService.initialize();
}