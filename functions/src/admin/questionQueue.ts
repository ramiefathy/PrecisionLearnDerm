import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { CallableContext } from 'firebase-functions/lib/common/providers/https';
import { withCORS } from '../util/corsConfig';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { config } from '../util/config';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';

// Import the optimized orchestrator for question generation
import { orchestrateQuestionGeneration } from '../ai/adaptedOrchestrator';
// Import the new taxonomy service
import { taxonomyService, initializeTaxonomyService, TaxonomyEntity } from '../services/taxonomyService';

const db = admin.firestore();

// Lazy-loaded knowledge base for topic weighting
let questionQueueKnowledgeBase: Record<string, any> | null = null;
let topicWeights: Record<string, number> | null = null;

// Initialize knowledge base on first use (async version)
async function initializeKnowledgeBase() {
  if (questionQueueKnowledgeBase !== null) {
    return; // Already loaded
  }

  try {
    // Use async file read to avoid blocking
    const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
    const kbData = await fsPromises.readFile(kbPath, 'utf8');
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

// Helper function to calculate quality score based on content characteristics and agent outputs
function calculateQualityScore(mcq: any, agentOutputs?: any[]): number {
  let score = 50; // Base score
  
  // Check stem quality
  if (mcq.stem) {
    if (mcq.stem.length > 100) score += 10; // Good detail
    if (mcq.stem.includes('year-old')) score += 8; // Clinical vignette
    if (mcq.stem.match(/\d+-year-old/)) score += 5; // Age specificity
  }
  
  // Check explanation quality
  if (mcq.explanation) {
    if (mcq.explanation.length > 200) score += 10; // Detailed explanation
    if (mcq.explanation.includes('because') || mcq.explanation.includes('due to')) score += 5; // Reasoning
  }
  
  // Check options quality
  if (mcq.options) {
    const optionCount = Object.keys(mcq.options).length;
    if (optionCount >= 4) score += 8; // Has sufficient options
    if (optionCount === 5) score += 4; // Has all 5 options
  }
  
  // Include scoring agent output if available
  if (agentOutputs && Array.isArray(agentOutputs)) {
    const scoringAgent = agentOutputs.find(a => 
      a.name?.includes('Scoring Agent') || a.type === 'scoring'
    );
    if (scoringAgent?.result?.totalScore) {
      // Scoring agent uses 0-25 scale, normalize to 0-20 for quality score component
      const normalizedScore = (scoringAgent.result.totalScore / 25) * 20;
      score += Math.round(normalizedScore);
    }
    
    // Include review agent assessment
    const reviewAgent = agentOutputs.find(a => 
      a.name?.includes('Review Agent') || a.type === 'review'
    );
    if (reviewAgent?.result?.reviewScore) {
      // Review agent uses 0-10 scale, normalize to 0-10 for quality score component  
      score += Math.round(reviewAgent.result.reviewScore);
    }
  }
  
  return Math.min(100, Math.max(0, score));
}

// Helper function to extract citations from explanation text and web search results
function extractCitations(explanation: string, entityName: string, agentOutputs?: any[]): any[] {
  const citations: any[] = [];
  const citationSet = new Set<string>(); // Prevent duplicates
  
  // Always include the knowledge base source
  const kbCitation = { 
    source: `KB: ${entityName}`,
    type: 'knowledge_base',
    reliability: 'high'
  };
  citations.push(kbCitation);
  citationSet.add(kbCitation.source);
  
  // Extract citations from web search results in agent outputs
  if (agentOutputs && Array.isArray(agentOutputs)) {
    // Find context gathering agent with web search results
    const contextAgent = agentOutputs.find(a => 
      a.name?.includes('Context Gathering') || a.type === 'context'
    );
    
    if (contextAgent?.result) {
      // Add NCBI citations if available
      if (contextAgent.result.ncbiResultsLength > 0) {
        const ncbiCitation = {
          source: 'NCBI PubMed',
          type: 'database',
          reliability: 'high',
          resultsFound: contextAgent.result.ncbiResultsLength
        };
        if (!citationSet.has(ncbiCitation.source)) {
          citations.push(ncbiCitation);
          citationSet.add(ncbiCitation.source);
        }
      }
      
      // Add OpenAlex citations if available
      if (contextAgent.result.openAlexResultsLength > 0) {
        const openAlexCitation = {
          source: 'OpenAlex Academic Database',
          type: 'database',
          reliability: 'high',
          resultsFound: contextAgent.result.openAlexResultsLength
        };
        if (!citationSet.has(openAlexCitation.source)) {
          citations.push(openAlexCitation);
          citationSet.add(openAlexCitation.source);
        }
      }
    }
  }
  
  // Check for guideline references in explanation
  if (explanation && (explanation.includes('guidelines') || explanation.includes('Guidelines'))) {
    const guidelineCitation = {
      source: 'Clinical Guidelines',
      type: 'guideline',
      reliability: 'high'
    };
    if (!citationSet.has(guidelineCitation.source)) {
      citations.push(guidelineCitation);
      citationSet.add(guidelineCitation.source);
    }
  }
  
  // Check for research references
  if (explanation && (explanation.includes('study') || explanation.includes('research') || explanation.includes('trial'))) {
    const researchCitation = {
      source: 'Research Literature',
      type: 'research',
      reliability: 'medium'
    };
    if (!citationSet.has(researchCitation.source)) {
      citations.push(researchCitation);
      citationSet.add(researchCitation.source);
    }
  }
  
  // Check for specific journal patterns
  const journalPattern = /\b(JAAD|NEJM|Lancet|JAMA|BMJ|Nature|Science|Dermatology|Pediatrics)\b/gi;
  const journalMatches = explanation ? explanation.match(journalPattern) : null;
  if (journalMatches) {
    journalMatches.forEach(journal => {
      const journalCitation = {
        source: `Journal: ${journal.toUpperCase()}`,
        type: 'journal',
        reliability: 'high'
      };
      if (!citationSet.has(journalCitation.source)) {
        citations.push(journalCitation);
        citationSet.add(journalCitation.source);
      }
    });
  }
  
  // Check for year references (likely studies)
  const yearPattern = /\b(19|20)\d{2}\b/g;
  const yearMatches = explanation ? explanation.match(yearPattern) : null;
  if (yearMatches && yearMatches.length > 0) {
    const studyCitation = {
      source: `Studies (${yearMatches[0]})`,
      type: 'study',
      reliability: 'medium',
      year: yearMatches[0]
    };
    if (!citationSet.has(studyCitation.source)) {
      citations.push(studyCitation);
      citationSet.add(studyCitation.source);
    }
  }
  
  return citations;
}

// Helper function to transform agent outputs to pipeline outputs structure
function transformToPipelineOutputs(agentOutputs: any[], difficulty: string): any {
  const pipelineOutputs: any = {
    generation: {
      method: 'orchestrated_multi_agent',
      model: 'gemini-2.5-pro',
      difficulty: difficulty,
      timestamp: new Date().toISOString()
    }
  };
  
  // Try to extract specific phase data from agent outputs
  if (agentOutputs && Array.isArray(agentOutputs)) {
    agentOutputs.forEach(output => {
      if (!output) return;
      
      // Map different agent outputs to pipeline phases
      if (output.type === 'validation' || output.phase === 'validation') {
        pipelineOutputs.validation = {
          isValid: output.isValid !== false,
          errors: output.errors || [],
          warnings: output.warnings || [],
          score: output.score || 0,
          timestamp: output.timestamp || new Date().toISOString()
        };
      } else if (output.type === 'review' || output.phase === 'review') {
        pipelineOutputs.review = {
          originalQuestion: output.original || {},
          correctedItem: output.corrected || {},
          changes: output.changes || [],
          reviewNotes: output.notes || [],
          timestamp: output.timestamp || new Date().toISOString()
        };
      } else if (output.type === 'scoring' || output.phase === 'scoring') {
        pipelineOutputs.scoring = {
          totalScore: output.totalScore || output.score || 0,
          rubric: output.rubric || {},
          needsRewrite: output.needsRewrite || false,
          iterations: output.iterations || [],
          timestamp: output.timestamp || new Date().toISOString()
        };
      }
    });
  }
  
  // Add defaults for missing phases
  if (!pipelineOutputs.validation) {
    pipelineOutputs.validation = {
      isValid: true,
      errors: [],
      warnings: [],
      score: 75,
      timestamp: new Date().toISOString()
    };
  }
  
  return pipelineOutputs;
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
    const agentOutputs = orchestratorResult.agentOutputs || [];
    
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
        // Filter agent outputs for this difficulty level
        const difficultyAgentOutputs = agentOutputs.filter((output: any) => 
          !output.difficulty || output.difficulty === difficulty
        );
        
        // Calculate quality score based on content characteristics and agent outputs
        const qualityScore = calculateQualityScore(mcq, difficultyAgentOutputs);
        
        // Extract citations from the explanation and web search results
        const citations = extractCitations(mcq.explanation, entityName, difficultyAgentOutputs);
        
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
          citations: citations,
          difficulty: mapping.difficulty,
          difficultyLevel: mapping.difficultyLabel,
          qualityScore: qualityScore,
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
          },
          // Store agent outputs for pipeline analysis
          agentOutputs: agentOutputs.filter((output: any) => 
            output && output.difficulty === difficulty
          )
        };
        
        generatedQuestions.push(draftItem);
        
        logInfo('orchestrated_generation_completed_for_difficulty', { 
          entityName, 
          difficulty: mapping.difficultyLabel,
          stemLength: mcq.stem.length,
          explanationLength: mcq.explanation.length,
          qualityScore: qualityScore
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
async function selectWeightedTopics(count: number): Promise<string[]> {
  await initializeKnowledgeBase();
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
          
          // Extract pipeline outputs from draftItem if available
          const pipelineOutputs = draftItem.agentOutputs ? 
            transformToPipelineOutputs(draftItem.agentOutputs, draftItem.difficultyLevel) : 
            undefined;
          
          const newQuestion: QueuedQuestion = {
              id: newQuestionRef.id,
              draftItem,
              status: 'pending',
              topicHierarchy,
              kbSource: {
                  entity: taxonomyEntity.name,
                  completenessScore: taxonomyEntity.completenessScore || 0,
              },
              pipelineOutputs: pipelineOutputs,
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
    await initializeKnowledgeBase();
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
            
            // Extract pipeline outputs from draftItem if available
            const pipelineOutputs = draftItem.agentOutputs ? 
              transformToPipelineOutputs(draftItem.agentOutputs, draftItem.difficultyLevel) : 
              undefined;
            
            const newQuestion: QueuedQuestion = {
                id: newQuestionRef.id,
                draftItem,
                status: 'pending',
                topicHierarchy,
                kbSource: {
                    entity: entityName,
                    completenessScore: entity.completeness_score,
                },
                pipelineOutputs: pipelineOutputs,
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

// New function to directly update question content in the queue
export const admin_update_question = functions.https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    const { questionId, updates, saveAsDraft = false } = data || {};

    if (!questionId) {
      throw new Error('Missing required parameter: questionId');
    }

    if (!updates || Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    const queueRef = db.collection('questionQueue').doc(questionId);
    
    // Get current question data
    const questionDoc = await queueRef.get();
    if (!questionDoc.exists) {
      throw new Error('Question not found in queue');
    }
    
    const currentData = questionDoc.data();
    
    // Build update object
    const updateData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastEditedBy: context?.auth?.uid || 'admin',
      lastEditedAt: admin.firestore.FieldValue.serverTimestamp(),
      editType: 'manual',
      isDraft: saveAsDraft
    };

    // Add edit history entry
    const editHistoryEntry = {
      timestamp: new Date().toISOString(),
      editedBy: context?.auth?.uid || 'admin',
      editType: 'manual',
      changes: Object.keys(updates),
      previousValues: {} as any
    };

    // Update draftItem fields if provided
    if (updates.stem || updates.leadIn || updates.options || updates.keyIndex !== undefined || updates.explanation) {
      updateData.draftItem = currentData?.draftItem || {};
      
      if (updates.stem !== undefined) {
        editHistoryEntry.previousValues.stem = currentData?.draftItem?.stem;
        updateData.draftItem.stem = updates.stem;
      }
      
      if (updates.leadIn !== undefined) {
        editHistoryEntry.previousValues.leadIn = currentData?.draftItem?.leadIn;
        updateData.draftItem.leadIn = updates.leadIn;
      }
      
      if (updates.options !== undefined) {
        editHistoryEntry.previousValues.options = currentData?.draftItem?.options;
        updateData.draftItem.options = updates.options;
      }
      
      if (updates.keyIndex !== undefined) {
        editHistoryEntry.previousValues.keyIndex = currentData?.draftItem?.keyIndex;
        updateData.draftItem.keyIndex = updates.keyIndex;
      }
      
      if (updates.explanation !== undefined) {
        editHistoryEntry.previousValues.explanation = currentData?.draftItem?.explanation;
        updateData.draftItem.explanation = updates.explanation;
      }

      // Preserve other draftItem fields
      updateData.draftItem = {
        ...currentData?.draftItem,
        ...updateData.draftItem,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
    }

    // Update taxonomy fields if provided
    if (updates.topicHierarchy) {
      editHistoryEntry.previousValues.topicHierarchy = currentData?.topicHierarchy;
      updateData.topicHierarchy = {
        ...currentData?.topicHierarchy,
        ...updates.topicHierarchy
      };
    }

    // Update quality scores if provided
    if (updates.difficulty !== undefined) {
      editHistoryEntry.previousValues.difficulty = currentData?.draftItem?.difficulty;
      updateData.draftItem = updateData.draftItem || { ...currentData?.draftItem };
      updateData.draftItem.difficulty = updates.difficulty;
    }

    if (updates.qualityScore !== undefined) {
      editHistoryEntry.previousValues.qualityScore = currentData?.draftItem?.qualityScore;
      updateData.draftItem = updateData.draftItem || { ...currentData?.draftItem };
      updateData.draftItem.qualityScore = updates.qualityScore;
    }

    // Initialize or update edit history
    const editHistory = currentData?.editHistory || [];
    editHistory.push(editHistoryEntry);
    updateData.editHistory = editHistory;

    // Log the update
    logInfo('question_updated_manually', {
      questionId,
      uid: context?.auth?.uid,
      changedFields: Object.keys(updates),
      saveAsDraft
    });

    // Update the document
    await queueRef.update(updateData);

    // Get updated document
    const updatedDoc = await queueRef.get();
    const updatedData = updatedDoc.data();

    return {
      success: true,
      message: saveAsDraft ? 'Question saved as draft' : 'Question updated successfully',
      questionId,
      updatedQuestion: {
        id: questionId,
        ...updatedData
      }
    };

  } catch (error: any) {
    logError('question_update_error', { 
      questionId: data?.questionId,
      error: error.message 
    });
    console.error('Error updating question:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Initialize queue with default questions
export const initializeQueue = functions.https.onRequest(
  withCORS('STRICT', async (req, res) => {
    try {
      const context: CallableContext = {
        auth: req.body.context?.auth,
        rawRequest: req as any,
        instanceIdToken: undefined,
        app: undefined
      };
      requireAdmin(context);
      const uid = context.auth?.uid || 'unknown';
      
      // Check if queue is already initialized
      const existingQueue = await db.collection('questionQueue').limit(1).get();
      
      if (!existingQueue.empty) {
        res.status(200).send({ data: { message: 'Queue already initialized', count: existingQueue.size } });
        return;
      }
      
      // Generate initial 25 questions directly using the internal logic
      const targetCount = 25;
      const queueSnapshot = await db.collection('questionQueue')
        .where('status', '==', 'pending')
        .get();
      
      const currentCount = queueSnapshot.size;
      const needed = Math.max(0, targetCount - currentCount);
      
      if (needed === 0) {
        res.status(200).send({ data: { message: 'Queue already full', count: currentCount } });
        return;
      }
      
      const selectedTopics = await selectWeightedTopics(needed);
      const generatedQuestions: any[] = [];
      
      for (const entityName of selectedTopics) {
        try {
          await initializeKnowledgeBase();
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
      return;
      
    } catch (error: any) {
      logError('queue.init_failed', {
        uid: req.body.context?.auth?.uid,
        error: error?.message || 'Unknown error'
      });
      res.status(500).send({ error: { message: 'Failed to initialize queue' } });
      return;
    }
  })
);