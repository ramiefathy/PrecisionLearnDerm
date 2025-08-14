import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { logInfo, logError } from '../util/logging';
import * as fs from 'fs';
import * as path from 'path';

// Import AI agents for testing
import { generateEnhancedMCQ } from '../ai/drafting';
import { processIterativeScoring } from '../ai/scoring';

// Create mock function for testing
async function processReview(item: any, reviewId: string) {
  return {
    correctedItem: item,
    changes: ['Mock review change'],
    reviewNotes: ['Test review completed'],
    qualityMetrics: {
      medical_accuracy: 4,
      clarity: 4,
      realism: 4,
      educational_value: 4
    }
  };
}

const db = admin.firestore();

// Load knowledge base for testing
let testKnowledgeBase: Record<string, any> = {};
let testHighQualityEntries: Array<[string, any]> = [];

try {
  const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
  const kbData = fs.readFileSync(kbPath, 'utf8');
  testKnowledgeBase = JSON.parse(kbData);
  
  // Filter entities with completeness score > 65
  testHighQualityEntries = Object.entries(testKnowledgeBase)
    .filter(([key, entity]) => entity.completeness_score > 65)
    .sort((a, b) => b[1].completeness_score - a[1].completeness_score)
    .slice(0, 10); // Take top 10 for testing
    
  console.log(`Test loaded ${testHighQualityEntries.length} high-quality KB entries`);
} catch (error) {
  console.error('Failed to load KB for testing:', error);
}

export const testSimple = functions.https.onCall(async (data: any, context) => {
  try {
    return {
      success: true,
      message: 'Simple test function working',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
  } catch (error: any) {
    console.error('Error in testSimple:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// New function to test the iterative scoring pipeline 3 times
export const testIterativeScoringPipeline = functions.https.onCall(async (data: any, context) => {
  try {
    if (testHighQualityEntries.length === 0) {
      throw new Error('No high-quality KB entries available for testing');
    }

    const results = [];
    
    // Test the pipeline 3 times with different entities
    for (let i = 0; i < 3; i++) {
      const [entityName, entity] = testHighQualityEntries[i];
      
      logInfo('testing_pipeline_iteration', { 
        iteration: i + 1, 
        entityName, 
        completenessScore: entity.completeness_score 
      });
      
      try {
        // Step 1: Generate initial question
        console.log(`\n=== ITERATION ${i + 1}: Testing ${entityName} ===`);
        console.log(`Initial generation for ${entityName}...`);
        
        const initialQuestion = await generateEnhancedMCQ(entity, entityName, 0.3);
        console.log(`✓ Initial question generated with ${initialQuestion.options?.length || 0} options`);
        
        // Step 2: Review the question
        console.log(`Reviewing question for ${entityName}...`);
        const reviewResult = await processReview(initialQuestion, `test_review_${i}_${Date.now()}`);
        console.log(`✓ Question reviewed, changes: ${reviewResult.changes?.length || 0}`);
        
        // Step 3: Iterative scoring and improvement
        console.log(`Starting iterative scoring for ${entityName}...`);
        const iterativeScoringResult = await processIterativeScoring(
          reviewResult.correctedItem || initialQuestion, 
          entityName, 
          entity, 
          5
        );
        
        console.log(`✓ Iterative scoring completed:`);
        console.log(`  - Final score: ${iterativeScoringResult.finalScore}/25`);
        console.log(`  - Total iterations: ${iterativeScoringResult.totalIterations}`);
        console.log(`  - Target achieved: ${iterativeScoringResult.improvementAchieved}`);
        
        // Collect results
        results.push({
          iteration: i + 1,
          entityName,
          initialQuality: initialQuestion.qualityScore || 0,
          finalScore: iterativeScoringResult.finalScore,
          totalIterations: iterativeScoringResult.totalIterations,
          improvementAchieved: iterativeScoringResult.improvementAchieved,
          finalQuestion: {
            stem: iterativeScoringResult.finalQuestion.stem?.substring(0, 100) + '...',
            leadIn: iterativeScoringResult.finalQuestion.leadIn,
            optionsCount: iterativeScoringResult.finalQuestion.options?.length || 0,
            explanationLength: iterativeScoringResult.finalQuestion.explanation?.length || 0
          },
          scoringHistory: iterativeScoringResult.iterations.map((score: any, idx: number) => ({
            iteration: idx + 1,
            score: score.totalScore,
            qualityTier: score.qualityTier
          }))
        });
        
      } catch (error: any) {
        console.error(`✗ Error in iteration ${i + 1} for ${entityName}:`, error.message);
        results.push({
          iteration: i + 1,
          entityName,
          error: error.message,
          success: false
        });
      }
    }
    
    // Summary analysis
    const successfulTests = results.filter(r => r.success !== false);
    const averageFinalScore = successfulTests.length > 0 
      ? successfulTests.reduce((sum, r) => sum + (r.finalScore || 0), 0) / successfulTests.length 
      : 0;
    const averageIterations = successfulTests.length > 0
      ? successfulTests.reduce((sum, r) => sum + (r.totalIterations || 0), 0) / successfulTests.length
      : 0;
    const targetAchievedCount = successfulTests.filter(r => r.improvementAchieved).length;
    
    console.log(`\n=== PIPELINE TEST SUMMARY ===`);
    console.log(`Total tests: ${results.length}`);
    console.log(`Successful tests: ${successfulTests.length}`);
    console.log(`Average final score: ${averageFinalScore.toFixed(1)}/25`);
    console.log(`Average iterations: ${averageIterations.toFixed(1)}`);
    console.log(`Target score (>20) achieved: ${targetAchievedCount}/${successfulTests.length}`);
    
    return {
      success: true,
      message: 'Iterative scoring pipeline test completed',
      summary: {
        totalTests: results.length,
        successfulTests: successfulTests.length,
        averageFinalScore: Math.round(averageFinalScore * 10) / 10,
        averageIterations: Math.round(averageIterations * 10) / 10,
        targetAchievedCount,
        targetAchievedPercentage: successfulTests.length > 0 ? Math.round((targetAchievedCount / successfulTests.length) * 100) : 0
      },
      detailedResults: results,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
  } catch (error: any) {
    logError('iterative_scoring_test_error', { error: error.message });
    console.error('Error in iterative scoring pipeline test:', error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}); 