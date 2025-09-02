/**
 * Taxonomy Complexity Service
 * Maps dermatology taxonomy categories and subcategories to complexity factors
 * Used for intelligent batch sizing and load balancing
 */

import * as logger from 'firebase-functions/logger';

export interface ComplexityMapping {
  category: string;
  subcategory: string;
  complexityFactor: number;
  estimatedGenerationTime: number; // seconds
  difficulty: 'low' | 'medium' | 'high' | 'very_high';
  notes?: string;
}

export interface CategoryComplexityStats {
  category: string;
  subcategory: string;
  averageComplexity: number;
  questionCount: number;
  successRate: number;
  averageGenerationTime: number;
}

/**
 * Taxonomy-based complexity mapping
 * Factors based on:
 * - Medical complexity and specialization required
 * - Question generation difficulty
 * - Knowledge base completeness
 * - Historical performance data (when available)
 */
const COMPLEXITY_MAPPINGS: ComplexityMapping[] = [
  // Medical Dermatology - Inflammatory Dermatoses
  {
    category: 'Medical Dermatology',
    subcategory: 'Inflammatory Dermatoses',
    complexityFactor: 1.2,
    estimatedGenerationTime: 45,
    difficulty: 'medium',
    notes: 'Common conditions, well-documented, moderate complexity'
  },
  
  // Medical Dermatology - Genodermatoses (most complex)
  {
    category: 'Medical Dermatology', 
    subcategory: 'Genodermatoses (Inherited Skin Disorders)',
    complexityFactor: 2.0,
    estimatedGenerationTime: 90,
    difficulty: 'very_high',
    notes: 'Rare inherited disorders, high medical complexity'
  },

  // Surgical Dermatology - Benign Neoplasms
  {
    category: 'Surgical Dermatology',
    subcategory: 'Benign Neoplasms and Cysts', 
    complexityFactor: 1.4,
    estimatedGenerationTime: 55,
    difficulty: 'medium',
    notes: 'Surgical procedures, diagnostic imaging, moderate complexity'
  },

  // Foundational - Basic concepts (easiest)
  {
    category: 'Foundational Knowledge',
    subcategory: 'Foundational Concepts',
    complexityFactor: 0.8,
    estimatedGenerationTime: 30,
    difficulty: 'low',
    notes: 'Basic dermatology concepts, well-established knowledge'
  },

  // Foundational - Anatomy & Physiology (easy-medium)
  {
    category: 'Foundational Knowledge',
    subcategory: 'Anatomy, Physiology, and Biology',
    complexityFactor: 1.0,
    estimatedGenerationTime: 35,
    difficulty: 'low',
    notes: 'Fundamental science, straightforward concepts'
  },

  // Research & Epidemiology - Complex analysis
  {
    category: 'Research and Evidence-Based Medicine',
    subcategory: 'Core Epidemiologic Concepts and Measures',
    complexityFactor: 1.6,
    estimatedGenerationTime: 65,
    difficulty: 'high',
    notes: 'Statistical analysis, research methodology, complex reasoning'
  },

  // Pharmacology - Moderate complexity
  {
    category: 'Therapeutics and Pharmacology',
    subcategory: 'Percutaneous absorption & cutaneous PK/PD',
    complexityFactor: 1.3,
    estimatedGenerationTime: 50,
    difficulty: 'medium',
    notes: 'Drug mechanisms, pharmacokinetics, moderate medical complexity'
  }
];

// Default complexity factors for unknown categories
const DEFAULT_COMPLEXITY_FACTORS = {
  'Medical Dermatology': 1.2,
  'Surgical Dermatology': 1.3,
  'Pediatric Dermatology': 1.4,
  'Dermatopathology': 1.8,
  'Foundational Knowledge': 0.9,
  'Research and Evidence-Based Medicine': 1.5,
  'Therapeutics and Pharmacology': 1.2
};

class TaxonomyComplexityService {
  private static instance: TaxonomyComplexityService;
  private complexityCache: Map<string, ComplexityMapping> = new Map();
  private performanceHistory: Map<string, CategoryComplexityStats[]> = new Map();

  private constructor() {
    this.initializeComplexityCache();
  }

  static getInstance(): TaxonomyComplexityService {
    if (!TaxonomyComplexityService.instance) {
      TaxonomyComplexityService.instance = new TaxonomyComplexityService();
    }
    return TaxonomyComplexityService.instance;
  }

  /**
   * Initialize the complexity cache with mappings
   */
  private initializeComplexityCache(): void {
    COMPLEXITY_MAPPINGS.forEach(mapping => {
      const key = this.createKey(mapping.category, mapping.subcategory);
      this.complexityCache.set(key, mapping);
    });

    logger.info('[TAXONOMY_COMPLEXITY] Initialized complexity mappings', {
      mappingCount: COMPLEXITY_MAPPINGS.length
    });
  }

  /**
   * Get complexity factor for a taxonomy classification
   */
  getComplexityFactor(
    category: string, 
    subcategory?: string, 
    subSubcategory?: string
  ): number {
    // Try exact match first
    if (subcategory) {
      const exactKey = this.createKey(category, subcategory);
      const exactMapping = this.complexityCache.get(exactKey);
      if (exactMapping) {
        logger.info('[TAXONOMY_COMPLEXITY] Exact complexity match found', {
          category,
          subcategory,
          complexityFactor: exactMapping.complexityFactor
        });
        return exactMapping.complexityFactor;
      }
    }

    // Fall back to category-level default
    const categoryDefault = DEFAULT_COMPLEXITY_FACTORS[category as keyof typeof DEFAULT_COMPLEXITY_FACTORS];
    if (categoryDefault) {
      logger.info('[TAXONOMY_COMPLEXITY] Using category default complexity', {
        category,
        subcategory,
        complexityFactor: categoryDefault
      });
      return categoryDefault;
    }

    // Ultimate fallback
    logger.warn('[TAXONOMY_COMPLEXITY] No complexity mapping found, using default', {
      category,
      subcategory,
      subSubcategory
    });
    return 1.0;
  }

  /**
   * Get estimated generation time for a taxonomy classification
   */
  getEstimatedGenerationTime(
    category: string,
    subcategory?: string
  ): number {
    if (subcategory) {
      const key = this.createKey(category, subcategory);
      const mapping = this.complexityCache.get(key);
      if (mapping) {
        return mapping.estimatedGenerationTime;
      }
    }

    // Base time estimate by category
    const baseTimes = {
      'Medical Dermatology': 45,
      'Surgical Dermatology': 50,
      'Pediatric Dermatology': 55,
      'Dermatopathology': 70,
      'Foundational Knowledge': 35,
      'Research and Evidence-Based Medicine': 60,
      'Therapeutics and Pharmacology': 45
    };

    return baseTimes[category as keyof typeof baseTimes] || 45;
  }

  /**
   * Get difficulty level for a taxonomy classification
   */
  getDifficultyLevel(
    category: string,
    subcategory?: string
  ): 'low' | 'medium' | 'high' | 'very_high' {
    if (subcategory) {
      const key = this.createKey(category, subcategory);
      const mapping = this.complexityCache.get(key);
      if (mapping) {
        return mapping.difficulty;
      }
    }

    // Default difficulty by category
    const defaultDifficulties = {
      'Medical Dermatology': 'medium' as const,
      'Surgical Dermatology': 'medium' as const,
      'Pediatric Dermatology': 'high' as const,
      'Dermatopathology': 'very_high' as const,
      'Foundational Knowledge': 'low' as const,
      'Research and Evidence-Based Medicine': 'high' as const,
      'Therapeutics and Pharmacology': 'medium' as const
    };

    return defaultDifficulties[category as keyof typeof defaultDifficulties] || 'medium';
  }

  /**
   * Calculate optimal batch size based on taxonomy mix
   */
  calculateOptimalBatchSize(
    testCases: Array<{
      category: string;
      subcategory?: string;
      difficulty?: string;
    }>,
    maxBatchSize: number = 3
  ): number {
    if (!testCases.length) return 1;

    // Calculate average complexity factor
    const totalComplexity = testCases.reduce((sum, testCase) => {
      const complexityFactor = this.getComplexityFactor(
        testCase.category,
        testCase.subcategory
      );
      return sum + complexityFactor;
    }, 0);

    const avgComplexity = totalComplexity / testCases.length;

    // Adjust batch size based on complexity
    let batchSize = maxBatchSize;
    if (avgComplexity >= 2.0) batchSize = 1;        // Very high complexity
    else if (avgComplexity >= 1.5) batchSize = 2;   // High complexity  
    else if (avgComplexity >= 1.2) batchSize = 3;   // Medium complexity
    else batchSize = maxBatchSize;                   // Low complexity - use max

    logger.info('[TAXONOMY_COMPLEXITY] Calculated batch size', {
      testCaseCount: testCases.length,
      avgComplexity: Math.round(avgComplexity * 100) / 100,
      recommendedBatchSize: batchSize,
      maxBatchSize
    });

    return Math.max(1, Math.min(batchSize, maxBatchSize));
  }

  /**
   * Group test cases by similarity for cache efficiency
   */
  groupTestCasesByComplexity(
    testCases: Array<{
      category: string;
      subcategory?: string;
      subSubcategory?: string;
      [key: string]: any;
    }>
  ): Array<Array<typeof testCases[0]>> {
    // Group by category and subcategory for cache efficiency
    const groups = new Map<string, typeof testCases>();

    testCases.forEach(testCase => {
      const groupKey = `${testCase.category}:${testCase.subcategory || 'default'}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(testCase);
    });

    // Sort groups by complexity (easiest first)
    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const complexityA = this.getComplexityFactor(a[0].category, a[0].subcategory);
      const complexityB = this.getComplexityFactor(b[0].category, b[0].subcategory);
      return complexityA - complexityB;
    });

    logger.info('[TAXONOMY_COMPLEXITY] Grouped test cases by complexity', {
      totalTestCases: testCases.length,
      groupCount: sortedGroups.length,
      groupSizes: sortedGroups.map(g => g.length)
    });

    return sortedGroups;
  }

  /**
   * Record performance data for complexity tuning
   */
  recordPerformanceData(
    category: string,
    subcategory: string,
    generationTime: number,
    success: boolean,
    qualityScore?: number
  ): void {
    const key = this.createKey(category, subcategory);
    if (!this.performanceHistory.has(key)) {
      this.performanceHistory.set(key, []);
    }

    const history = this.performanceHistory.get(key)!;
    
    // Keep last 100 records per category/subcategory
    if (history.length >= 100) {
      history.shift();
    }

    const stats: CategoryComplexityStats = {
      category,
      subcategory,
      averageComplexity: this.getComplexityFactor(category, subcategory),
      questionCount: 1,
      successRate: success ? 1 : 0,
      averageGenerationTime: generationTime
    };

    history.push(stats);

    // Optionally adjust complexity factors based on performance trends
    this.adjustComplexityIfNeeded(key, history);
  }

  /**
   * Get all available complexity mappings
   */
  getAllComplexityMappings(): ComplexityMapping[] {
    return Array.from(this.complexityCache.values());
  }

  /**
   * Create cache key from category and subcategory
   */
  private createKey(category: string, subcategory: string): string {
    return `${category}:${subcategory}`;
  }

  /**
   * Adjust complexity factors based on performance history
   */
  private adjustComplexityIfNeeded(
    key: string, 
    history: CategoryComplexityStats[]
  ): void {
    if (history.length < 10) return; // Need minimum data

    const recent = history.slice(-10);
    const avgTime = recent.reduce((sum, stat) => sum + stat.averageGenerationTime, 0) / recent.length;
    const successRate = recent.reduce((sum, stat) => sum + stat.successRate, 0) / recent.length;

    // Auto-adjust if performance is consistently different than expected
    const mapping = this.complexityCache.get(key);
    if (mapping) {
      const timeDiff = avgTime / mapping.estimatedGenerationTime;
      
      if (timeDiff > 1.5 && successRate > 0.8) {
        // Taking much longer than expected but succeeding
        const newFactor = Math.min(mapping.complexityFactor * 1.2, 3.0);
        logger.info('[TAXONOMY_COMPLEXITY] Auto-adjusting complexity factor up', {
          key,
          oldFactor: mapping.complexityFactor,
          newFactor,
          avgTime,
          successRate
        });
        mapping.complexityFactor = newFactor;
      } else if (timeDiff < 0.7 && successRate > 0.9) {
        // Much faster than expected and high success
        const newFactor = Math.max(mapping.complexityFactor * 0.9, 0.5);
        logger.info('[TAXONOMY_COMPLEXITY] Auto-adjusting complexity factor down', {
          key,
          oldFactor: mapping.complexityFactor, 
          newFactor,
          avgTime,
          successRate
        });
        mapping.complexityFactor = newFactor;
      }
    }
  }
}

// Export singleton instance
export const taxonomyComplexityService = TaxonomyComplexityService.getInstance();
export default taxonomyComplexityService;