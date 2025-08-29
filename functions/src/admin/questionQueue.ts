import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import cors from 'cors';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { config } from '../util/config';
import * as fs from 'fs';
import * as path from 'path';

// Import the optimized orchestrator for question generation
import { orchestrateQuestionGeneration } from '../ai/adaptedOrchestrator';
// Import the new taxonomy service
import { taxonomyService, initializeTaxonomyService, TaxonomyEntity } from '../services/taxonomyService';

const db = admin.firestore();

// Lazy-loaded knowledge base for topic weighting
let questionQueueKnowledgeBase: Record<string, any> | null = null;
let topicWeights: Record<string, number> | null = null;

// Initialize knowledge base on first use
function initializeKnowledgeBase() {
  if (questionQueueKnowledgeBase !== null) {
    return; // Already loaded
  }

  try {
    const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
    const kbData = fs.readFileSync(kbPath, 'utf8');
    questionQueueKnowledgeBase = JSON.parse(kbData);
    
    // Calculate topic weights based on completeness scores
    const highQualityEntries = Object.entries(questionQueueKnowledgeBase!)
      .filter(([key, entity]) => entity.completeness_score > 65);
      
    // Create weighted topic distribution
    const totalWeight = highQualityEntries.reduce((sum, [key, entity]) => sum + entity.completeness_score, 0);
    
    topicWeights = {};
    highQualityEntries.forEach(([key, entity]) => {
      const normalizedWeight = entity.completeness_score / totalWeight;
      topicWeights![key] = normalizedWeight;
    });
    
    console.log(`Question queue loaded ${highQualityEntries.length} weighted topics`);
  } catch (error) {
    console.error('Failed to load KB for question queue:', error);
    questionQueueKnowledgeBase = {};
    topicWeights = {};
  }
}

interface QueuedQuestion {
  id: string;
  draftItem: any;
  status: 'pending' | 'approved' | 'rejected';
  topicHierarchy: {
    category: string;
    topic: string;
    subtopic: string;
    fullTopicId: string;
    // New taxonomy fields
    taxonomyEntity?: string;
    taxonomyCategory?: string;
    taxonomySubcategory?: string;
    taxonomySubSubcategory?: string;
  };
  kbSource: {
    entity: string;
    completenessScore: number;
  };
  pipelineOutputs?: {
    generation?: {
      method: string;
      model?: string;
      prompt?: string;
      rawOutput?: any;
      timestamp: string;
    };
    validation?: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
      score: number;
      timestamp: string;
    };
    review?: {
      originalQuestion: any;
      correctedItem?: any;
      changes: string[];
      reviewNotes: string[];
      qualityMetrics?: any;
      timestamp: string;
    };
    scoring?: {
      totalScore: number;
      rubric: any;
      needsRewrite: boolean;
      iterations?: any[];
      timestamp: string;
    };
  };
  createdAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
  reviewNotes?: string;
  priority: number;
}

// Generate questions of all three difficulty levels using the real orchestrator with search and multi-agent pipeline
async function generateQuestionFromEntity(entityName: string, entity: any): Promise<any[]> {
  try {
    logInfo('orchestrated_generation_started', { entityName, difficulties: ['Basic', 'Advanced', 'Very Difficult'] });
    
    // Use the orchestrator to generate all three difficulty levels in parallel
    const orchestratorResult = await orchestrateQuestionGeneration(entityName, ['Basic', 'Advanced', 'Very Difficult']);
    const results = orchestratorResult.questions;
    
    const generatedQuestions: any[] = [];
    const difficultyMappings = {
      'Basic': { difficulty: 0.3, difficultyLabel: 'Basic' },
      'Advanced': { difficulty: 0.6, difficultyLabel: 'Advanced' },
      'Very Difficult': { difficulty: 0.9, difficultyLabel: 'Very Difficult' }
    };
    
    // Process each difficulty level that was successfully generated
    for (const [difficulty, mapping] of Object.entries(difficultyMappings)) {
      const mcq = results[difficulty as keyof typeof results];
      
      if (mcq) {
        // Convert to the format expected by questionQueue
        const draftItem = {
          type: 'A',
          topicIds: [entityName.toLowerCase().replace(/\s+/g, '.')],
          stem: mcq.stem,
          leadIn: 'What is the most likely diagnosis?',
          options: [
            { text: mcq.options.A },
            { text: mcq.options.B },
            { text: mcq.options.C },
            { text: mcq.options.D }
          ],
          keyIndex: ['A', 'B', 'C', 'D'].indexOf(mcq.correctAnswer),
          explanation: mcq.explanation,
          citations: [{ source: `RESEARCH:${entityName}` }],
          difficulty: mapping.difficulty,
          difficultyLevel: mapping.difficultyLabel,
          qualityScore: 85, // High quality from orchestrator
          status: 'draft',
          aiGenerated: true,
          createdBy: { 
            type: 'agent', 
            model: 'orchestrated-multi-agent-pipeline', 
            at: admin.firestore.FieldValue.serverTimestamp() 
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          pipelineMetadata: {
            method: 'orchestrated_multi_agent',
            includesWebSearch: true,
            includesReview: true,
            includesScoring: true,
            includesValidation: true,
            difficulty: mapping.difficultyLabel
          }
        };
        
        generatedQuestions.push(draftItem);
        
        logInfo('orchestrated_generation_completed_for_difficulty', { 
          entityName, 
          difficulty: mapping.difficultyLabel,
          stemLength: mcq.stem.length,
          explanationLength: mcq.explanation.length 
        });
      } else {
        logInfo('orchestrated_generation_failed_for_difficulty', { 
          entityName, 
          difficulty: mapping.difficultyLabel
        });
      }
    }

    logInfo('orchestrated_generation_completed', { 
      entityName, 
      totalGenerated: generatedQuestions.length,
      difficulties: generatedQuestions.map(q => q.difficultyLevel)
    });
    
    return generatedQuestions;
    
  } catch (error) {
    console.error(`Failed to generate question for ${entityName}:`, error);
    logError('orchestrated_generation_failed', { entityName, error: error instanceof Error ? error.message : String(error) });
    
    // No fallback - throw error to properly fail the operation
    throw new Error(`Question generation failed for ${entityName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Select topics based on weighted distribution
function selectWeightedTopics(count: number): string[] {
  initializeKnowledgeBase();
  const topics = Object.keys(topicWeights || {});
  const weights = Object.values(topicWeights || {});
  const selected: string[] = [];
  
  if (topics.length === 0) return [];
  
  // Convert to cumulative distribution
  const cumulative = weights.reduce((acc, weight, index) => {
    acc.push((acc[index - 1] || 0) + weight);
    return acc;
  }, [] as number[]);
  
  for (let i = 0; i < count; i++) {
    const random = Math.random();
    const selectedIndex = cumulative.findIndex(cum => random <= cum);
    const topic = topics[selectedIndex] || topics[0];
    
    if (!selected.includes(topic)) {
      selected.push(topic);
    }
  }
  
  return selected;
}

// Convert KB entity to topic hierarchy using taxonomy service
async function mapEntityToTopicHierarchy(entityName: string): Promise<any> {
  try {
    // Ensure taxonomy service is initialized
    await initializeTaxonomyService();
    
    // Use the taxonomy service to get proper hierarchy
    return taxonomyService.entityToTopicHierarchy(entityName);
  } catch (error) {
    logError('taxonomy_mapping_failed', { entityName, error: error instanceof Error ? error.message : String(error) });
    
    // Fallback to default hierarchy
    return {
      category: 'medical-dermatology',
      topic: 'general',
      subtopic: 'miscellaneous',
      fullTopicId: 'medical-dermatology.general.miscellaneous',
      taxonomyEntity: entityName,
      taxonomyCategory: 'Medical Dermatology',
      taxonomySubcategory: 'General',
      taxonomySubSubcategory: 'General'
    };
  }
}

const corsHandler = cors({ origin: true });

export const admin_generateQuestionQueue = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes for batch generation
    memory: '1GB'
  })
  .https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    const { targetCount = 25, category, subcategory } = data || {};

    // Initialize taxonomy service
    await initializeTaxonomyService();

    // Get high-quality entities using taxonomy service
    const highQualityEntities = await taxonomyService.getHighQualityEntities(65);

    if (highQualityEntities.length === 0) {
      throw new Error('No high-quality entities found in knowledge base');
    }

    console.log(`Found ${highQualityEntities.length} high-quality entities for question generation`);

    // Generate questions using weighted entity selection
    const selectedEntities = await taxonomyService.getWeightedEntitySelection(targetCount, category, subcategory);
    const generatedQuestions = [];

    for (const taxonomyEntity of selectedEntities) {
      try {
        const draftItems = await generateQuestionFromEntity(taxonomyEntity.name, taxonomyEntity);
        const topicHierarchy = await mapEntityToTopicHierarchy(taxonomyEntity.name);
        
        // Create a separate queue entry for each difficulty level
        for (const draftItem of draftItems) {
          const newQuestionRef = db.collection('questionQueue').doc();
          const newQuestion: QueuedQuestion = {
              id: newQuestionRef.id,
              draftItem,
              status: 'pending',
              topicHierarchy,
              kbSource: {
                  entity: taxonomyEntity.name,
                  completenessScore: taxonomyEntity.completenessScore || 0,
              },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              priority: taxonomyEntity.completenessScore || 0,
          };
          await newQuestionRef.set(newQuestion);
          generatedQuestions.push(newQuestion);
        }
      } catch (error) {
        console.error(`Failed to generate questions for ${taxonomyEntity.name}:`, error);
      }
    }

    console.log(`Successfully generated ${generatedQuestions.length} questions for the queue`);

    return { 
      success: true, 
      message: `Generated ${generatedQuestions.length} questions for review queue`, 
      generated: generatedQuestions.length, 
      targetCount 
    };
  } catch (error: any) {
    console.error('Error generating question queue:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get taxonomy structure for the admin interface
export const admin_getTaxonomy = functions.https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    // Initialize taxonomy service
    await initializeTaxonomyService();

    const structure = await taxonomyService.getTaxonomyStructure();
    const stats = await taxonomyService.getStats();
    const categories = await taxonomyService.getCategories();
    const entityCounts = await taxonomyService.getEntityCounts();

    return {
      success: true,
      structure,
      stats,
      categories,
      entityCounts,
      message: 'Taxonomy loaded successfully'
    };
  } catch (error: any) {
    console.error('Error getting taxonomy:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get entities for a specific category/subcategory
export const admin_getTaxonomyEntities = functions.https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    const { category, subcategory, subSubcategory, limit = 100 } = data || {};

    if (!category) {
      throw new Error('Category is required');
    }

    // Initialize taxonomy service
    await initializeTaxonomyService();

    let entities: TaxonomyEntity[] = [];

    if (subSubcategory) {
      entities = await taxonomyService.getEntitiesBySubSubcategory(category, subcategory, subSubcategory);
    } else if (subcategory) {
      entities = await taxonomyService.getEntitiesBySubcategory(category, subcategory);
    } else {
      entities = await taxonomyService.getEntitiesByCategory(category);
    }

    // Limit and sort by completeness score
    const limitedEntities = entities
      .sort((a, b) => (b.completenessScore || 0) - (a.completenessScore || 0))
      .slice(0, limit);

    return {
      success: true,
      entities: limitedEntities,
      count: limitedEntities.length,
      totalInCategory: entities.length,
      category,
      subcategory,
      subSubcategory
    };
  } catch (error: any) {
    console.error('Error getting taxonomy entities:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const admin_generate_per_topic = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes for per-topic generation
    memory: '1GB'
  })
  .https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    const { perTopic = 5, topicFilter = [] } = data || {};

    // Initialize and load knowledge base for topic weighting
    initializeKnowledgeBase();
    if (!questionQueueKnowledgeBase || Object.keys(questionQueueKnowledgeBase).length === 0) {
      throw new Error('Knowledge base not loaded');
    }

    // Get high-quality entities (completeness_score > 65)
    const highQualityEntities = Object.entries(questionQueueKnowledgeBase)
      .filter(([_, entity]: [string, any]) => entity.completeness_score > 65);

    if (highQualityEntities.length === 0) {
      throw new Error('No high-quality entities found in knowledge base');
    }

    console.log(`Found ${highQualityEntities.length} high-quality entities for per-topic generation`);

    // Group entities by topic
    const topicGroups: { [key: string]: Array<[string, any]> } = {};
    
    highQualityEntities.forEach(([name, entity]) => {
      const topic = entity.topic || 'general';
      if (!topicGroups[topic]) {
        topicGroups[topic] = [];
      }
      topicGroups[topic].push([name, entity]);
    });

    // Filter topics if specified
    const targetTopics = topicFilter.length > 0 
      ? Object.keys(topicGroups).filter(topic => topicFilter.includes(topic))
      : Object.keys(topicGroups);

    console.log(`Generating ${perTopic} questions for ${targetTopics.length} topics`);

    const generatedQuestions = [];
    const topicResults: { [key: string]: number } = {};

    for (const topic of targetTopics) {
      const entities = topicGroups[topic];
      if (!entities || entities.length === 0) continue;

      // Sort entities by completeness score for better quality
      entities.sort(([_, a], [__, b]) => b.completeness_score - a.completeness_score);

      const questionsForTopic = [];
      const usedEntities = new Set();

      for (let i = 0; i < perTopic && i < entities.length; i++) {
        // Find unused entity with highest completeness score
        const availableEntities = entities.filter(([name, _]) => !usedEntities.has(name));
        if (availableEntities.length === 0) break;

        const [entityName, entity] = availableEntities[0];
        usedEntities.add(entityName);

        try {
          const draftItems = await generateQuestionFromEntity(entityName, entity);
          const topicHierarchy = await mapEntityToTopicHierarchy(entityName);
          
          // Create a separate queue entry for each difficulty level
          for (const draftItem of draftItems) {
            const newQuestionRef = db.collection('questionQueue').doc();
            const newQuestion: QueuedQuestion = {
                id: newQuestionRef.id,
                draftItem,
                status: 'pending',
                topicHierarchy,
                kbSource: {
                    entity: entityName,
                    completenessScore: entity.completeness_score,
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                priority: entity.completeness_score,
            };
            await newQuestionRef.set(newQuestion);
            questionsForTopic.push(newQuestion);
            generatedQuestions.push(newQuestion);
          }
        } catch (error) {
          console.error(`Failed to generate questions for ${entityName} in topic ${topic}:`, error);
        }
      }

      topicResults[topic] = questionsForTopic.length;
      console.log(`Generated ${questionsForTopic.length} questions for topic: ${topic}`);
    }

    console.log(`Successfully generated ${generatedQuestions.length} questions across ${Object.keys(topicResults).length} topics`);

    return {
      success: true,
      message: `Generated ${generatedQuestions.length} questions across ${Object.keys(topicResults).length} topics`,
      totalGenerated: generatedQuestions.length,
      perTopic,
      topicResults,
      totalTopics: Object.keys(topicResults).length
    };
  } catch (error: any) {
    console.error('Error generating per-topic questions:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const admin_getQuestionQueue = functions.https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    const { status = 'pending', limit = 25 } = data || {};

    const queueRef = db.collection('questionQueue');
    
    let query: any = queueRef;
    
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    
    query = query.orderBy('createdAt', 'desc').limit(limit);
    
    const snapshot = await query.get();
    const questions = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      success: true,
      questions,
      count: questions.length,
      status,
      limit
    };
  } catch (error: any) {
    console.error('Error getting question queue:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const admin_reviewQuestion = functions.https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    const { questionId, action, notes } = data || {};

    if (!questionId || !action) {
      throw new Error('Missing required parameters: questionId and action');
    }
    
    const queueRef = db.collection('questionQueue').doc(questionId);
    const itemsRef = db.collection('items');
    
    const questionDoc = await queueRef.get();
    if (!questionDoc.exists) {
      throw new Error('Question not found in queue');
    }
    
    const questionData = questionDoc.data();
    
    if (action === 'approve') {
      // Move to main question bank
      const itemData: any = {
        ...questionData,
        status: 'active',
        reviewedBy: context?.auth?.uid || 'admin',
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNotes: notes || '',
        queueId: questionId
      };
      
      // Remove queue-specific fields if they exist
      if ('queueStatus' in itemData) delete itemData.queueStatus;
      if ('queueCreatedAt' in itemData) delete itemData.queueCreatedAt;
      
      const newItemRef = await itemsRef.add(itemData);
      
      // Update queue status
      await queueRef.update({
        status: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNotes: notes || '',
        movedToItemId: newItemRef.id
      });
      
      return {
        success: true,
        message: 'Question approved and moved to question bank',
        itemId: newItemRef.id
      };
      
    } else if (action === 'reject') {
      // Mark as rejected
      await queueRef.update({
        status: 'rejected',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNotes: notes || ''
      });
      
      return {
        success: true,
        message: 'Question rejected',
        questionId
      };
      
    } else if (action === 'revise') {
      // Mark for revision
      await queueRef.update({
        status: 'needs_revision',
        revisionRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminNotes: notes || ''
      });
      
      return {
        success: true,
        message: 'Question marked for revision',
        questionId
      };
      
    } else {
      throw new Error('Invalid action. Must be approve, reject, or revise');
    }

  } catch (error: any) {
    console.error('Error reviewing question:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Initialize queue with default questions
export const initializeQueue = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const context = { 
        auth: req.body.context?.auth,
        rawRequest: req,
        instanceIdToken: undefined,
        app: undefined
      };
      requireAdmin(context);
      const uid = context.auth?.uid || 'unknown';
      
      // Check if queue is already initialized
      const existingQueue = await db.collection('questionQueue').limit(1).get();
      
      if (!existingQueue.empty) {
        return res.status(200).send({ data: { message: 'Queue already initialized', count: existingQueue.size } });
      }
      
      // Generate initial 25 questions directly using the internal logic
      const targetCount = 25;
      const queueSnapshot = await db.collection('questionQueue')
        .where('status', '==', 'pending')
        .get();
      
      const currentCount = queueSnapshot.size;
      const needed = Math.max(0, targetCount - currentCount);
      
      if (needed === 0) {
        return res.status(200).send({ data: { message: 'Queue already full', count: currentCount } });
      }
      
      const selectedTopics = selectWeightedTopics(needed);
      const generatedQuestions: any[] = [];
      
      for (const entityName of selectedTopics) {
        try {
          initializeKnowledgeBase();
          const entity = questionQueueKnowledgeBase ? questionQueueKnowledgeBase[entityName] : null;
          if (!entity) continue;
          
          const draftItems = await generateQuestionFromEntity(entityName, entity);
          const topicHierarchy = await mapEntityToTopicHierarchy(entityName);
          
          // Create a separate queue entry for each difficulty level
          for (const draftItem of draftItems) {
            const newQuestionRef = db.collection('questionQueue').doc();
            const queuedQuestion: QueuedQuestion = {
              id: newQuestionRef.id,
              draftItem,
              status: 'pending',
              topicHierarchy,
              kbSource: {
                entity: entityName,
                completenessScore: entity.completeness_score
              },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              priority: entity.completeness_score
            };
            
            await newQuestionRef.set(queuedQuestion);
            generatedQuestions.push(queuedQuestion);
          }
          
        } catch (error: any) {
          console.error('Error generating question during init:', error);
        }
      }
      
      logInfo('queue.initialized', {
        uid,
        generated: generatedQuestions.length,
        topics: selectedTopics
      });
      
      res.status(200).send({
        data: {
          message: 'Queue initialized successfully',
          generated: generatedQuestions.length,
          count: generatedQuestions.length
        }
      });
      
    } catch (error: any) {
      logError('queue.init_failed', {
        uid: req.body.context?.auth?.uid,
        error: error?.message || 'Unknown error'
      });
      res.status(500).send({ error: { message: 'Failed to initialize queue' } });
    }
  });
}); 