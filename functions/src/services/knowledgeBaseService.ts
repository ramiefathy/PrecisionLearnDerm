/**
 * Centralized Knowledge Base Service
 * 
 * Provides a serverless-compatible way to access the knowledge base.
 * Replaces file system dependency with Firestore storage.
 * Includes in-memory caching and fallback mechanisms.
 */

import * as admin from 'firebase-admin';
import { logInfo, logError } from '../util/logging';

const db = admin.firestore();

// Knowledge base cache with TTL
interface KnowledgeBaseCache {
  data: any;
  loadedAt: number;
  ttl: number; // Time to live in milliseconds
}

// Global cache instance (safe because it's read-only data)
let knowledgeBaseCache: KnowledgeBaseCache | null = null;

// Default TTL: 1 hour
const DEFAULT_TTL = 60 * 60 * 1000;

// Fallback minimal knowledge base for emergency use
const FALLBACK_KNOWLEDGE_BASE = {
  entities: {
    melanoma: {
      name: 'Melanoma',
      description: 'A serious form of skin cancer that develops from melanocytes',
      symptoms: 'Asymmetric moles, irregular borders, color variation, diameter >6mm, evolving lesions',
      treatment: 'Surgical excision, immunotherapy, targeted therapy, radiation therapy',
      diagnosis: 'Dermoscopy, biopsy, staging with imaging',
      differentials: ['Atypical nevus', 'Seborrheic keratosis', 'Blue nevus'],
      completeness_score: 85
    },
    psoriasis: {
      name: 'Psoriasis',
      description: 'A chronic autoimmune skin condition causing rapid skin cell proliferation',
      symptoms: 'Red, scaly plaques, nail changes, joint pain, itching',
      treatment: 'Topical corticosteroids, phototherapy, systemic immunosuppressants, biologics',
      diagnosis: 'Clinical examination, skin biopsy if needed',
      differentials: ['Eczema', 'Seborrheic dermatitis', 'Pityriasis rosea'],
      completeness_score: 80
    },
    acne: {
      name: 'Acne Vulgaris',
      description: 'A common skin condition involving sebaceous glands and hair follicles',
      symptoms: 'Comedones, papules, pustules, nodules, cysts, scarring',
      treatment: 'Topical retinoids, benzoyl peroxide, antibiotics, isotretinoin',
      diagnosis: 'Clinical examination, assessment of lesion types',
      differentials: ['Rosacea', 'Folliculitis', 'Perioral dermatitis'],
      completeness_score: 75
    }
  },
  metadata: {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    source: 'fallback',
    entityCount: 3
  }
};

/**
 * Load knowledge base from Firestore
 */
async function loadFromFirestore(): Promise<any> {
  try {
    logInfo('Loading knowledge base from Firestore...', {});
    
    // Try to load from a dedicated knowledge base collection
    const kbDoc = await db.collection('system').doc('knowledgeBase').get();
    
    if (kbDoc.exists) {
      const data = kbDoc.data();
      logInfo('Knowledge base loaded from Firestore', {
        entityCount: Object.keys(data?.entities || {}).length,
        version: data?.metadata?.version
      });
      return data;
    }
    
    // If not found in system collection, try to build from entities collection
    logInfo('Knowledge base document not found, attempting to build from entities...', {});
    
    const entitiesSnapshot = await db.collection('entities').limit(100).get();
    
    if (!entitiesSnapshot.empty) {
      const entities: any = {};
      
      entitiesSnapshot.forEach(doc => {
        entities[doc.id] = {
          ...doc.data(),
          id: doc.id
        };
      });
      
      const knowledgeBase = {
        entities,
        metadata: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          source: 'entities_collection',
          entityCount: Object.keys(entities).length
        }
      };
      
      logInfo('Knowledge base built from entities collection', {
        entityCount: Object.keys(entities).length
      });
      
      // Cache it in Firestore for future use
      await saveToFirestore(knowledgeBase);
      
      return knowledgeBase;
    }
    
    logInfo('No entities found in Firestore', { level: 'warning' });
    return null;
    
  } catch (error) {
    logError('Failed to load knowledge base from Firestore', { error });
    return null;
  }
}

/**
 * Save knowledge base to Firestore
 */
async function saveToFirestore(knowledgeBase: any): Promise<void> {
  try {
    await db.collection('system').doc('knowledgeBase').set({
      ...knowledgeBase,
      metadata: {
        ...knowledgeBase.metadata,
        savedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });
    
    logInfo('Knowledge base saved to Firestore', {
      entityCount: Object.keys(knowledgeBase.entities || {}).length
    });
  } catch (error) {
    logError('Failed to save knowledge base to Firestore', { error });
  }
}

/**
 * Get knowledge base with caching and fallback
 */
export async function getKnowledgeBase(forceRefresh: boolean = false): Promise<any> {
  try {
    // Check cache first
    if (!forceRefresh && knowledgeBaseCache) {
      const now = Date.now();
      const age = now - knowledgeBaseCache.loadedAt;
      
      if (age < knowledgeBaseCache.ttl) {
        logInfo('Using cached knowledge base', { 
          age: Math.round(age / 1000), 
          ttl: Math.round(knowledgeBaseCache.ttl / 1000) 
        });
        return knowledgeBaseCache.data;
      }
    }
    
    // Try to load from Firestore
    const knowledgeBase = await loadFromFirestore();
    
    if (knowledgeBase) {
      // Update cache
      knowledgeBaseCache = {
        data: knowledgeBase,
        loadedAt: Date.now(),
        ttl: DEFAULT_TTL
      };
      
      return knowledgeBase;
    }
    
    // Use fallback if Firestore fails
    logInfo('Using fallback knowledge base', { level: 'warning' });
    
    // Cache the fallback too
    knowledgeBaseCache = {
      data: FALLBACK_KNOWLEDGE_BASE,
      loadedAt: Date.now(),
      ttl: DEFAULT_TTL / 2 // Shorter TTL for fallback
    };
    
    return FALLBACK_KNOWLEDGE_BASE;
    
  } catch (error) {
    logError('Critical error in getKnowledgeBase', { error });
    
    // Return fallback as last resort
    return FALLBACK_KNOWLEDGE_BASE;
  }
}

/**
 * Get a specific entity from the knowledge base
 */
export async function getEntity(entityName: string): Promise<any> {
  const kb = await getKnowledgeBase();
  
  // Try exact match first
  if (kb.entities[entityName]) {
    return kb.entities[entityName];
  }
  
  // Try case-insensitive match
  const lowerName = entityName.toLowerCase();
  for (const [key, entity] of Object.entries(kb.entities)) {
    if (key.toLowerCase() === lowerName) {
      return entity;
    }
  }
  
  // Try partial match
  for (const [key, entity] of Object.entries(kb.entities)) {
    if (key.toLowerCase().includes(lowerName) || lowerName.includes(key.toLowerCase())) {
      return entity;
    }
  }
  
  return null;
}

/**
 * Get random entities from the knowledge base
 */
export async function getRandomEntities(count: number = 1): Promise<any[]> {
  const kb = await getKnowledgeBase();
  const entities = Object.values(kb.entities);
  
  if (entities.length === 0) {
    return [];
  }
  
  // Shuffle and pick
  const shuffled = entities.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, entities.length));
}

/**
 * Search entities by criteria
 */
export async function searchEntities(criteria: {
  minCompleteness?: number;
  maxCompleteness?: number;
  hasSymptoms?: boolean;
  hasTreatment?: boolean;
  hasDifferentials?: boolean;
}): Promise<any[]> {
  const kb = await getKnowledgeBase();
  const entities = Object.values(kb.entities);
  
  return entities.filter((entity: any) => {
    if (criteria.minCompleteness && entity.completeness_score < criteria.minCompleteness) {
      return false;
    }
    
    if (criteria.maxCompleteness && entity.completeness_score > criteria.maxCompleteness) {
      return false;
    }
    
    if (criteria.hasSymptoms && !entity.symptoms) {
      return false;
    }
    
    if (criteria.hasTreatment && !entity.treatment) {
      return false;
    }
    
    if (criteria.hasDifferentials && (!entity.differentials || entity.differentials.length === 0)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Initialize knowledge base (called on cold start)
 */
export async function initializeKnowledgeBase(): Promise<void> {
  try {
    logInfo('Initializing knowledge base service...', {});
    await getKnowledgeBase(true); // Force refresh on initialization
    logInfo('Knowledge base service initialized successfully', {});
  } catch (error) {
    logError('Failed to initialize knowledge base service', { error });
  }
}

/**
 * Clear the cache (useful for testing or manual refresh)
 */
export function clearKnowledgeBaseCache(): void {
  knowledgeBaseCache = null;
  logInfo('Knowledge base cache cleared', {});
}