import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import * as fs from 'fs';
import * as path from 'path';
import { getSharedKB } from '../util/sharedCache';

// Knowledge base loaded via shared cache
let knowledgeBase: Record<string, any> = {};
let highQualityEntries: Array<{ key: string; entity: any }> = [];

// Initialize knowledge base asynchronously
async function initializeKB() {
  try {
    knowledgeBase = await getSharedKB();
    
    // Filter entities with completeness score > 65
    highQualityEntries = Object.entries(knowledgeBase)
      .filter(([key, entity]) => entity.completeness_score > 65)
      .map(([key, entity]) => ({ key, entity }));
      
    console.log(`Loaded ${Object.keys(knowledgeBase).length} total KB entries, ${highQualityEntries.length} high-quality entries`);
  } catch (error) {
    console.error('Failed to load knowledge base via shared cache:', error);
  }
}

// Lazy initialization - will be called on first search
let initialized = false;

interface KBSearchResult {
  entityName: string;
  relevanceScore: number;
  content: {
    description: string;
    symptoms: string;
    treatment: string;
    diagnosis: string;
    causes: string;
    prognosis: string;
    complications: string;
    prevention: string;
  };
  completenessScore: number;
  anchor: string;
}

function calculateRelevance(query: string, entity: any, entityName: string): number {
  const queryLower = query.toLowerCase();
  const nameLower = entityName.toLowerCase();
  
  let score = 0;
  
  // Exact name match gets highest score
  if (nameLower === queryLower) {
    score += 100;
  }
  // Name contains query
  else if (nameLower.includes(queryLower)) {
    score += 80;
  }
  // Query contains name (partial match)
  else if (queryLower.includes(nameLower)) {
    score += 60;
  }
  
  // Check description
  if (entity.description && entity.description.toLowerCase().includes(queryLower)) {
    score += 40;
  }
  
  // Check symptoms
  if (entity.symptoms && entity.symptoms.toLowerCase().includes(queryLower)) {
    score += 35;
  }
  
  // Check treatment
  if (entity.treatment && entity.treatment.toLowerCase().includes(queryLower)) {
    score += 30;
  }
  
  // Check diagnosis
  if (entity.diagnosis && entity.diagnosis.toLowerCase().includes(queryLower)) {
    score += 25;
  }
  
  // Check causes
  if (entity.causes && entity.causes.toLowerCase().includes(queryLower)) {
    score += 20;
  }
  
  // Boost score based on completeness
  score += (entity.completeness_score / 100) * 20;
  
  // Keyword matching for dermatology terms
  const dermatologyKeywords = [
    'acne', 'psoriasis', 'eczema', 'dermatitis', 'melanoma', 'basal cell', 'squamous cell',
    'tinea', 'fungal', 'bacterial', 'viral', 'rash', 'lesion', 'plaque', 'papule', 'pustule',
    'vesicle', 'bulla', 'macule', 'nodule', 'tumor', 'cyst', 'ulcer', 'erosion', 'scale',
    'hyperkeratosis', 'hyperpigmentation', 'hypopigmentation', 'erythema', 'pruritus', 'itch'
  ];
  
  for (const keyword of dermatologyKeywords) {
    if (queryLower.includes(keyword) && 
        (nameLower.includes(keyword) || 
         entity.description?.toLowerCase().includes(keyword) ||
         entity.symptoms?.toLowerCase().includes(keyword))) {
      score += 15;
    }
  }
  
  return score;
}

function formatEntityContent(entity: any): KBSearchResult['content'] {
  return {
    description: entity.description || '',
    symptoms: entity.symptoms || '',
    treatment: entity.treatment || '',
    diagnosis: entity.diagnosis || '',
    causes: entity.causes || '',
    prognosis: entity.prognosis || '',
    complications: entity.complications || '',
    prevention: entity.prevention || ''
  };
}

export const kbSearch = functions.https.onCall(async (data: any, context) => {
  try {
    requireAuth(context);
    const { q: query, topicIds } = data || {};
    
    if (!query || typeof query !== 'string') {
      throw new Error('Query parameter is required and must be a string');
    }
    
    // Initialize knowledge base if not already done
    if (!initialized) {
      await initializeKB();
      initialized = true;
    }
    
    // Check if KB loaded successfully
    if (!knowledgeBase || Object.keys(knowledgeBase).length === 0) {
      try {
        const kbPath = path.join(__dirname, 'knowledgeBase.json');
        const kbContent = fs.readFileSync(kbPath, 'utf8');
        knowledgeBase = JSON.parse(kbContent);
        console.log(`Loaded ${Object.keys(knowledgeBase).length} entities for search`);
      } catch (error) {
        console.error('Failed to load knowledge base:', error);
        throw new Error('Knowledge base not available');
      }
    }
    
    // Filter by topic IDs if specified
    let searchableEntities = Object.entries(knowledgeBase);
    
    if (topicIds && Array.isArray(topicIds) && topicIds.length > 0) {
      searchableEntities = searchableEntities.filter(([name, entity]: [string, any]) => {
        return topicIds.some(topicId => {
          const topicLower = topicId.toLowerCase();
          const entityNameLower = name.toLowerCase();
          const entityDescLower = (entity.description || '').toLowerCase();
          const entityTopicLower = (entity.topic || '').toLowerCase();
          
          return entityNameLower.includes(topicLower) ||
                 entityDescLower.includes(topicLower) ||
                 entityTopicLower.includes(topicLower);
        });
      });
    }
    
    // Perform search
    const results = searchableEntities
      .map(([name, entity]: [string, any]) => {
        const relevance = calculateRelevance(query, name, entity);
        return {
          name,
          entity,
          relevance
        };
      })
      .filter(result => result.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20); // Limit to top 20 results
    
    return {
      success: true,
      results: results.map(r => ({
        name: r.name,
        entity: r.entity,
        relevance: r.relevance
      })),
      count: results.length,
      query,
      topicIds: topicIds || []
    };
    
  } catch (error: any) {
    console.error('Error in KB search:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
