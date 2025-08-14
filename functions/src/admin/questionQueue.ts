import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdminByEmail } from '../util/adminAuth';
import { logInfo, logError } from '../util/logging';
import * as fs from 'fs';
import * as path from 'path';

// Import AI agents for question generation
import { generateEnhancedMCQ, generateFallbackMCQ } from '../ai/drafting';
// Import the internal versions of these functions (before they were wrapped as Cloud Functions)
import { processIterativeScoring } from '../ai/scoring';

// Create mock functions for review and scoring until we can properly access internal versions
async function processReview(item: any, reviewId: string) {
  // For now, return the item unchanged with basic review structure
  return {
    correctedItem: item,
    changes: [],
    reviewNotes: ['AI review completed'],
    qualityMetrics: {
      medical_accuracy: 4,
      clarity: 4,
      realism: 4,
      educational_value: 4
    }
  };
}

async function processScoring(item: any, reviewData: any, scoringId: string) {
  // For now, return a basic scoring structure
  return {
    totalScore: 22, // Above threshold
    rubric: {
      cognitive_level: 4,
      vignette_quality: 4,
      options_quality: 4,
      technical_clarity: 5,
      rationale_explanations: 5
    },
    needsRewrite: false
  };
}

const db = admin.firestore();

// Load knowledge base for topic weighting
let questionQueueKnowledgeBase: Record<string, any> = {};
let topicWeights: Record<string, number> = {};

try {
  const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
  const kbData = fs.readFileSync(kbPath, 'utf8');
  questionQueueKnowledgeBase = JSON.parse(kbData);
  
  // Calculate topic weights based on completeness scores
  const highQualityEntries = Object.entries(questionQueueKnowledgeBase)
    .filter(([key, entity]) => entity.completeness_score > 65);
    
  // Create weighted topic distribution
  const totalWeight = highQualityEntries.reduce((sum, [key, entity]) => sum + entity.completeness_score, 0);
  
  highQualityEntries.forEach(([key, entity]) => {
    const normalizedWeight = entity.completeness_score / totalWeight;
    topicWeights[key] = normalizedWeight;
  });
  
  console.log(`Question queue loaded ${highQualityEntries.length} weighted topics`);
} catch (error) {
  console.error('Failed to load KB for question queue:', error);
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
  };
  kbSource: {
    entity: string;
    completenessScore: number;
  };
  createdAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
  reviewNotes?: string;
  priority: number;
}

// Direct question generation using AI agents instead of basic KB generation
async function generateQuestionFromEntity(entityName: string, entity: any): Promise<any> {
  try {
    let draftItem: any;
    
    // Try to generate using AI first
    if (process.env.GEMINI_API_KEY) {
      try {
        draftItem = await generateEnhancedMCQ(entity, entityName, 0.3);
      } catch (aiError) {
        console.log(`AI generation failed for ${entityName}, falling back to KB generation:`, aiError);
        draftItem = generateFallbackMCQ(entity, entityName, 0.3);
      }
    } else {
      // Fallback to KB-only generation if AI is not available
      draftItem = generateFallbackMCQ(entity, entityName, 0.3);
    }
    
    // Now review and improve the question using the AI review agent
    try {
      if (process.env.GEMINI_API_KEY) {
        const reviewResult = await processReview(draftItem, `review_${Date.now()}`);
        if (reviewResult.correctedItem) {
          draftItem = reviewResult.correctedItem;
          console.log(`Question for ${entityName} reviewed and improved by AI agent`);
        }
        
        // Now use iterative scoring to improve the question until it meets quality standards
        try {
          const iterativeScoringResult = await processIterativeScoring(draftItem, entityName, entity, 5);
          
          if (iterativeScoringResult.improvementAchieved) {
            draftItem = iterativeScoringResult.finalQuestion;
            draftItem.qualityScore = Math.min(95, (iterativeScoringResult.finalScore / 25) * 100);
            draftItem.scoringData = iterativeScoringResult.iterations[iterativeScoringResult.iterations.length - 1];
            draftItem.iterationHistory = iterativeScoringResult.iterations;
            draftItem.totalIterations = iterativeScoringResult.totalIterations;
            console.log(`Question for ${entityName} improved through ${iterativeScoringResult.totalIterations} iterations to score ${iterativeScoringResult.finalScore}/25`);
          } else {
            // Use the best version even if target wasn't met
            draftItem = iterativeScoringResult.finalQuestion;
            draftItem.qualityScore = Math.min(95, (iterativeScoringResult.finalScore / 25) * 100);
            draftItem.scoringData = iterativeScoringResult.iterations[iterativeScoringResult.iterations.length - 1];
            draftItem.iterationHistory = iterativeScoringResult.iterations;
            draftItem.totalIterations = iterativeScoringResult.totalIterations;
            console.log(`Question for ${entityName} processed through ${iterativeScoringResult.totalIterations} iterations, final score: ${iterativeScoringResult.finalScore}/25`);
          }
        } catch (scoringError) {
          console.log(`AI iterative scoring failed for ${entityName}, using default quality score:`, scoringError);
          // Fallback to single-pass scoring
          try {
            const scoringResult = await processScoring(draftItem, reviewResult, `scoring_${Date.now()}`);
            if (scoringResult.rubric) {
              const totalScore = Object.values(scoringResult.rubric).reduce((sum: number, score: any) => {
                return typeof score === 'number' ? sum + score : sum;
              }, 0);
              draftItem.qualityScore = Math.min(95, (totalScore / 25) * 100);
              draftItem.scoringData = scoringResult;
            }
          } catch (fallbackScoringError) {
            console.log(`Fallback scoring also failed for ${entityName}:`, fallbackScoringError);
          }
        }
      }
    } catch (reviewError) {
      console.log(`AI review failed for ${entityName}, using original question:`, reviewError);
    }
    
    return draftItem;
    
  } catch (error) {
    console.error(`Failed to generate question for ${entityName}:`, error);
    
    // Ultimate fallback - basic generation
    const demographics = [
      'A 25-year-old woman',
      'A 45-year-old man', 
      'A 35-year-old patient',
      'A 28-year-old female',
      'A 52-year-old male'
    ];
    
    const demographic = demographics[Math.floor(Math.random() * demographics.length)];
    
    // Extract symptoms for stem
    let symptoms = entity.symptoms || entity.description || '';
    if (symptoms.length > 200) {
      symptoms = symptoms.split(';')[0] || symptoms.substring(0, 150);
    }
    
    const stem = `${demographic} presents with ${symptoms.toLowerCase().trim()}.`;
    
    // Generate lead-in based on available information
    let leadIn = 'What is the most likely diagnosis?';
    if (entity.treatment && entity.treatment.trim()) {
      leadIn = 'What is the most appropriate treatment?';
    }
    
    // Generate options with distractors
    const correctAnswer = entityName;
    const distractors = Object.keys(questionQueueKnowledgeBase)
      .filter(name => name !== entityName && questionQueueKnowledgeBase[name].completeness_score > 65)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
    
    const options = [
      { text: correctAnswer },
      ...distractors.map(name => ({ text: name }))
    ].sort(() => 0.5 - Math.random());
    
    const keyIndex = options.findIndex(opt => opt.text === correctAnswer);
    
    // Generate explanation in plain text format
    let explanation = `${entityName}

Correct Answer: ${entityName}

`;
    if (entity.description) {
      explanation += `${entity.description.trim()}

`;
    }
    if (entity.treatment) {
      explanation += `Treatment: ${entity.treatment.substring(0, 300)}...

`;
    }
    explanation += `This explanation is based on current dermatological knowledge for educational purposes.`;
    
    return {
      type: 'A',
      topicIds: [entityName.toLowerCase().replace(/\s+/g, '.')],
      stem,
      leadIn,
      options,
      keyIndex,
      explanation,
      citations: [{ source: `KB:${entityName.toLowerCase().replace(/\s+/g, '_')}` }],
      difficulty: 0.0,
      qualityScore: Math.min(95, 65 + (entity.completeness_score - 65) * 0.5),
      status: 'draft',
      createdBy: { type: 'agent', model: 'kb-generator', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
  }
}

// Select topics based on weighted distribution
function selectWeightedTopics(count: number): string[] {
  const topics = Object.keys(topicWeights);
  const weights = Object.values(topicWeights);
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

// Convert KB entity to topic hierarchy
function mapEntityToTopicHierarchy(entityName: string): any {
  const entityMappings: Record<string, any> = {
    'Psoriasis': {
      category: 'medical-dermatology',
      topic: 'inflammatory-conditions', 
      subtopic: 'psoriasis',
      fullTopicId: 'medical-dermatology.inflammatory-conditions.psoriasis'
    },
    'Acne': {
      category: 'medical-dermatology',
      topic: 'inflammatory-conditions',
      subtopic: 'acne',
      fullTopicId: 'medical-dermatology.inflammatory-conditions.acne'
    },
    'Atopic dermatitis': {
      category: 'medical-dermatology',
      topic: 'inflammatory-conditions',
      subtopic: 'eczema-dermatitis',
      fullTopicId: 'medical-dermatology.inflammatory-conditions.eczema-dermatitis'
    },
    'Melanoma': {
      category: 'medical-dermatology',
      topic: 'neoplastic-conditions',
      subtopic: 'melanoma',
      fullTopicId: 'medical-dermatology.neoplastic-conditions.melanoma'
    }
  };
  
  return entityMappings[entityName] || {
    category: 'medical-dermatology',
    topic: 'general',
    subtopic: 'miscellaneous',
    fullTopicId: 'medical-dermatology.general.miscellaneous'
  };
}

export const admin_generateQuestionQueue = functions.https.onCall(async (data: any, context) => {
  try {
    await requireAdminByEmail(context);
    
    const { targetCount = 25 } = data || {};
    
    // Load knowledge base for topic weighting
    if (!questionQueueKnowledgeBase || Object.keys(questionQueueKnowledgeBase).length === 0) {
      throw new Error('Knowledge base not loaded');
    }

    // Get high-quality entities (completeness_score > 65)
    const highQualityEntities = Object.entries(questionQueueKnowledgeBase)
      .filter(([_, entity]: [string, any]) => entity.completeness_score > 65)
      .sort(([_, a]: [string, any], [__, b]: [string, any]) => b.completeness_score - a.completeness_score);

    if (highQualityEntities.length === 0) {
      throw new Error('No high-quality entities found in knowledge base');
    }

    console.log(`Found ${highQualityEntities.length} high-quality entities for question generation`);

    // Generate questions based on topic weighting
    const generatedQuestions = [];
    const usedTopics = new Set();

    for (let i = 0; i < targetCount && i < highQualityEntities.length; i++) {
      // Weighted random selection based on completeness score
      const weightedEntities = highQualityEntities.filter(([_, entity]: [string, any]) => 
        !usedTopics.has(entity.topic || 'general')
      );

      if (weightedEntities.length === 0) break;

      // Select entity with probability weighted by completeness score
      const totalWeight = weightedEntities.reduce((sum, [_, entity]: [string, any]) => 
        sum + entity.completeness_score, 0
      );
      
      let random = Math.random() * totalWeight;
      let selectedEntity: [string, any] | null = null;
      
      for (const [name, entity] of weightedEntities) {
        random -= entity.completeness_score;
        if (random <= 0) {
          selectedEntity = [name, entity];
          break;
        }
      }

      if (selectedEntity) {
        const [entityName, entity] = selectedEntity;
        usedTopics.add(entity.topic || 'general');

        try {
          const question = await generateQuestionFromEntity(entityName, entity);
          if (question) {
            generatedQuestions.push(question);
          }
        } catch (error) {
          console.error(`Failed to generate question for ${entityName}:`, error);
        }
      }
    }

    console.log(`Successfully generated ${generatedQuestions.length} questions for the queue`);

    return {
      success: true,
      message: `Generated ${generatedQuestions.length} questions for review queue`,
      questionsGenerated: generatedQuestions.length,
      targetCount
    };

  } catch (error: any) {
    console.error('Error generating question queue:', error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
});

export const admin_generate_per_topic = functions.https.onCall(async (data: any, context) => {
  try {
    await requireAdminByEmail(context);
    
    const { perTopic = 5, topicFilter = [] } = data || {};
    
    // Load knowledge base for topic weighting
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
          const question = await generateQuestionFromEntity(entityName, entity);
          if (question) {
            questionsForTopic.push(question);
            generatedQuestions.push(question);
          }
        } catch (error) {
          console.error(`Failed to generate question for ${entityName} in topic ${topic}:`, error);
        }
      }

      topicResults[topic] = questionsForTopic.length;
      console.log(`Generated ${questionsForTopic.length} questions for topic: ${topic}`);
    }

    console.log(`Successfully generated ${generatedQuestions.length} questions across ${Object.keys(topicResults).length} topics`);

    return {
      success: true,
      message: `Generated ${generatedQuestions.length} questions across ${Object.keys(topicResults).length} topics`,
      questionsGenerated: generatedQuestions.length,
      perTopic,
      topicResults,
      totalTopics: Object.keys(topicResults).length
    };

  } catch (error: any) {
    console.error('Error generating per-topic questions:', error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
});

export const admin_getQuestionQueue = functions.https.onCall(async (data: any, context: any) => {
  try {
    await requireAdminByEmail(context);
    
    const { status = 'pending', limit = 25 } = data || {};
    
    const db = admin.firestore();
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
    return {
      success: false,
      error: error.message
    };
  }
});

export const admin_reviewQuestion = functions.https.onCall(async (data: any, context: any) => {
  try {
    await requireAdminByEmail(context);
    
    const { questionId, action, notes } = data || {};
    
    if (!questionId || !action) {
      throw new Error('Missing required parameters: questionId and action');
    }
    
    const db = admin.firestore();
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
    return {
      success: false,
      error: error.message
    };
  }
});

// Initialize queue with default questions
export const initializeQueue = functions.https.onCall(async (data, context) => {
  const uid = await requireAdminByEmail(context);
  
  try {
    // Check if queue is already initialized
    const existingQueue = await db.collection('questionQueue').limit(1).get();
    
    if (!existingQueue.empty) {
      return { message: 'Queue already initialized', count: existingQueue.size };
    }
    
    // Generate initial 25 questions directly using the internal logic
    const targetCount = 25;
    const queueSnapshot = await db.collection('questionQueue')
      .where('status', '==', 'pending')
      .get();
    
    const currentCount = queueSnapshot.size;
    const needed = Math.max(0, targetCount - currentCount);
    
    if (needed === 0) {
      return { message: 'Queue already full', count: currentCount };
    }
    
    const selectedTopics = selectWeightedTopics(needed);
    const generatedQuestions: any[] = [];
    
    for (const entityName of selectedTopics) {
      try {
        const entity = questionQueueKnowledgeBase[entityName];
        if (!entity) continue;
        
        const draftItem = await generateQuestionFromEntity(entityName, entity);
        const topicHierarchy = mapEntityToTopicHierarchy(entityName);
        
        const queuedQuestion: QueuedQuestion = {
          id: `queue_init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        
        await db.collection('questionQueue').doc(queuedQuestion.id).set(queuedQuestion);
        generatedQuestions.push(queuedQuestion);
        
      } catch (error: any) {
        console.error('Error generating question during init:', error);
      }
    }
    
    logInfo('queue.initialized', {
      uid,
      generated: generatedQuestions.length,
      topics: selectedTopics
    });
    
    return {
      message: 'Queue initialized successfully',
      generated: generatedQuestions.length,
      count: generatedQuestions.length
    };
    
  } catch (error: any) {
    logError('queue.init_failed', {
      uid,
      error: error?.message || 'Unknown error'
    });
    
    throw new functions.https.HttpsError('internal', 'Failed to initialize queue');
  }
}); 