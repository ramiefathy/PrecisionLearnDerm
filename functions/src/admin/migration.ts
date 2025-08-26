import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { taxonomyService, initializeTaxonomyService } from '../services/taxonomyService';

const db = admin.firestore();

// Migrate existing questions to include taxonomy information
export const admin_migrateTaxonomy = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes for migration
    memory: '1GB'
  })
  .https.onCall(async (data, context) => {
    requireAdmin(context);

    try {
      const { dryRun = true, batchSize = 100 } = data || {};

      logInfo('taxonomy_migration_started', { dryRun, batchSize });

      // Initialize taxonomy service
      await initializeTaxonomyService();

      // Get all questions that need taxonomy migration
      const questionsQuery = db.collection('items')
        .where('taxonomyCategory', '==', null)
        .limit(batchSize);

      const questionsSnapshot = await questionsQuery.get();

      if (questionsSnapshot.empty) {
        return {
          success: true,
          message: 'No questions need taxonomy migration',
          processed: 0,
          updated: 0
        };
      }

      let processed = 0;
      let updated = 0;
      const updates: any[] = [];

      for (const questionDoc of questionsSnapshot.docs) {
        const questionData = questionDoc.data();
        processed++;

        try {
          // Extract topic/entity information from existing question data
          const possibleEntityName = await extractEntityFromQuestion(questionData);
          
          if (possibleEntityName) {
            // Try to find this entity in the taxonomy
            const taxonomyEntity = await taxonomyService.getEntity(possibleEntityName);
            
            if (taxonomyEntity) {
              const topicHierarchy = await taxonomyService.entityToTopicHierarchy(possibleEntityName);
              
              const taxonomyUpdate = {
                taxonomyCategory: taxonomyEntity.category,
                taxonomySubcategory: taxonomyEntity.subcategory,
                taxonomySubSubcategory: taxonomyEntity.sub_subcategory,
                taxonomyEntity: taxonomyEntity.name,
                topicHierarchy,
                taxonomyMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
                taxonomyMigratedFrom: possibleEntityName
              };

              if (!dryRun) {
                await questionDoc.ref.update(taxonomyUpdate);
              }

              updates.push({
                questionId: questionDoc.id,
                originalTopic: questionData.topic || 'unknown',
                extractedEntity: possibleEntityName,
                assignedCategory: taxonomyEntity.category,
                assignedSubcategory: taxonomyEntity.subcategory,
                assignedSubSubcategory: taxonomyEntity.sub_subcategory,
                assignedEntity: taxonomyEntity.name
              });

              updated++;
            } else {
              // Entity not found in taxonomy - log for manual review
              logInfo('taxonomy_migration_entity_not_found', {
                questionId: questionDoc.id,
                extractedEntity: possibleEntityName,
                originalTopic: questionData.topic
              });
            }
          }
        } catch (error) {
          logError('taxonomy_migration_question_failed', {
            questionId: questionDoc.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logInfo('taxonomy_migration_completed', {
        dryRun,
        processed,
        updated,
        batchSize
      });

      return {
        success: true,
        message: dryRun 
          ? `Migration simulation complete - would update ${updated} of ${processed} questions` 
          : `Successfully migrated ${updated} of ${processed} questions`,
        processed,
        updated,
        dryRun,
        updates: dryRun ? updates.slice(0, 10) : undefined, // Return sample updates for dry run
        hasMore: questionsSnapshot.size === batchSize
      };

    } catch (error: any) {
      logError('taxonomy_migration_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// Extract potential entity name from question data
async function extractEntityFromQuestion(questionData: any): Promise<string | null> {
  // Try to extract entity from various fields in order of preference
  
  // 1. Check if there's already a topic field that matches an entity
  if (questionData.topic && typeof questionData.topic === 'string') {
    const topic = questionData.topic.trim();
    
    // Check if topic directly matches an entity
    const entity = await taxonomyService.getEntity(topic);
    if (entity) {
      return topic;
    }

    // Try variations (capitalize, clean up)
    const variations = [
      topic.charAt(0).toUpperCase() + topic.slice(1).toLowerCase(),
      topic.replace(/[_-]/g, ' '),
      topic.replace(/\s+/g, ' ').trim()
    ];

    for (const variation of variations) {
      const entity = await taxonomyService.getEntity(variation);
      if (entity) {
        return variation;
      }
    }
  }

  // 2. Check topicIds array
  if (questionData.topicIds && Array.isArray(questionData.topicIds)) {
    for (const topicId of questionData.topicIds) {
      if (typeof topicId === 'string') {
        // Convert topicId format (e.g., "psoriasis.treatment") to entity name
        const entityName = topicId.split('.')[0].replace(/[_-]/g, ' ');
        const capitalizedEntity = entityName.charAt(0).toUpperCase() + entityName.slice(1);
        
        const entity = await taxonomyService.getEntity(capitalizedEntity);
        if (entity) {
          return capitalizedEntity;
        }
      }
    }
  }

  // 3. Try to extract from question stem using pattern matching
  if (questionData.stem && typeof questionData.stem === 'string') {
    const commonEntityPatterns = [
      // Look for diagnostic patterns
      /(?:diagnosis|diagnose|condition|disease).*?([\w\s]{3,25})/i,
      // Look for treatment patterns  
      /(?:treatment|therapy|medication).*?for\s+([\w\s]{3,25})/i,
      // Look for "patient with X" patterns
      /patient.*?(?:with|has|presents with)\s+([\w\s]{3,25})/i
    ];

    for (const pattern of commonEntityPatterns) {
      const match = questionData.stem.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        
        // Try to find this in taxonomy
        const entity = await taxonomyService.getEntity(candidate);
        if (entity) {
          return candidate;
        }

        // Try capitalized version
        const capitalized = candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
        const capitalizedEntity = await taxonomyService.getEntity(capitalized);
        if (capitalizedEntity) {
          return capitalized;
        }
      }
    }
  }

  // 4. Search through high-quality entities for partial matches
  const highQualityEntities = await taxonomyService.getHighQualityEntities(65);
  
  if (questionData.stem) {
    const stemLower = questionData.stem.toLowerCase();
    
    // Look for entities mentioned in the question stem
    for (const entity of highQualityEntities.slice(0, 50)) { // Check top 50 entities
      if (stemLower.includes(entity.name.toLowerCase())) {
        return entity.name;
      }
    }
  }

  return null;
}

// Get migration status and statistics
export const admin_getTaxonomyMigrationStatus = functions.https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    await initializeTaxonomyService();

    // Count total questions
    const totalQuestionsSnapshot = await db.collection('items').get();
    const totalQuestions = totalQuestionsSnapshot.size;

    // Count questions with taxonomy
    const migratedSnapshot = await db.collection('items')
      .where('taxonomyCategory', '!=', null)
      .get();
    const migratedQuestions = migratedSnapshot.size;

    // Count questions without taxonomy
    const unmirgratedQuestions = totalQuestions - migratedQuestions;

    // Get category distribution of migrated questions
    const categoryDistribution: Record<string, number> = {};
    migratedSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const category = data.taxonomyCategory;
      if (category) {
        categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
      }
    });

    return {
      success: true,
      totalQuestions,
      migratedQuestions,
      unmirgratedQuestions,
      migrationPercentage: totalQuestions > 0 ? Math.round((migratedQuestions / totalQuestions) * 100) : 0,
      categoryDistribution
    };

  } catch (error: any) {
    console.error('Error getting migration status:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get sample questions that would be affected by migration
export const admin_getTaxonomyMigrationPreview = functions.https.onCall(async (data, context) => {
  requireAdmin(context);

  try {
    const { limit = 10 } = data || {};

    await initializeTaxonomyService();

    // Get sample questions without taxonomy
    const questionsSnapshot = await db.collection('items')
      .where('taxonomyCategory', '==', null)
      .limit(limit)
      .get();

    const preview: any[] = [];

    for (const questionDoc of questionsSnapshot.docs) {
      const questionData = questionDoc.data();
      const possibleEntityName = await extractEntityFromQuestion(questionData);
      
      let taxonomyPreview = null;
      if (possibleEntityName) {
        const taxonomyEntity = await taxonomyService.getEntity(possibleEntityName);
        if (taxonomyEntity) {
          taxonomyPreview = {
            category: taxonomyEntity.category,
            subcategory: taxonomyEntity.subcategory,
            subSubcategory: taxonomyEntity.sub_subcategory,
            entity: taxonomyEntity.name,
            completenessScore: taxonomyEntity.completenessScore
          };
        }
      }

      preview.push({
        id: questionDoc.id,
        originalTopic: questionData.topic || 'unknown',
        stem: questionData.stem ? questionData.stem.substring(0, 200) + '...' : '',
        extractedEntity: possibleEntityName,
        taxonomyPreview,
        wouldUpdate: !!taxonomyPreview
      });
    }

    return {
      success: true,
      preview,
      totalPreviewable: questionsSnapshot.size
    };

  } catch (error: any) {
    console.error('Error getting migration preview:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});