import * as functions from 'firebase-functions';
import { generateEnhancedMCQ } from '../ai/drafting';
import { config } from '../util/config';
import { withCORS } from '../util/corsConfig';
import { getSharedKB } from '../util/sharedCache';

// Testing versions of AI functions that don't require authentication
// These are specifically for local testing and development
// DISABLED IN PRODUCTION for security

export const test_generate_question = functions.https.onRequest(
  withCORS('TEST', async (req, res) => {
    // SECURITY: Disable in production
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: 'Test endpoints not available in production'
      });
      return;
    }
  
  const data = req.body.data || req.body;
  try {
    console.log('TEST: AI Generate MCQ called with data:', JSON.stringify(data, null, 2));
    
    const { topicIds, difficultyTarget, useAI = true } = data || {};
    
    if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
      throw new Error('Missing required parameter: topicIds (array)');
    }
    
    let result;
    
    if (useAI && config.gemini.hasApiKey()) {
      console.log('TEST: Using AI generation with topics:', topicIds);
      
      // Fetch entity from knowledge base
      const kb = await getSharedKB();
      const searchTerm = topicIds[0]; // Use first topic
      
      // Search in the knowledge base for relevant entities
      const relevantEntities: Array<[string, any]> = [];
      for (const [key, value] of Object.entries(kb)) {
        if (key.toLowerCase().includes(searchTerm.toLowerCase())) {
          relevantEntities.push([key, value]);
        }
      }
      
      if (relevantEntities.length === 0) {
        throw new Error(`No knowledge base entries found for topic: ${searchTerm}`);
      }
      
      const [entityName, entity] = relevantEntities[0];
      console.log(`TEST: Found entity "${entityName}" for topic "${searchTerm}"`);
      
      // Generate MCQ with correct parameters
      result = await generateEnhancedMCQ(entity, entityName, difficultyTarget);
    } else {
      throw new Error('TEST: AI generation is required but API key is not available. No fallback generation allowed.');
    }
    
    console.log('TEST: Generation completed successfully');
    res.json({
      success: true,
      data: result,
      source: useAI ? 'ai' : 'fallback',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('TEST: Error in ai_generate_mcq:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}));

export const test_review_question = functions.https.onRequest(
  withCORS('TEST', async (req, res) => {
    // SECURITY: Disable in production
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: 'Test endpoints not available in production'
      });
      return;
    }
  
  const data = req.body.data || req.body;
  try {
    console.log('TEST: AI Review MCQ called with data:', JSON.stringify(data, null, 2));
    
    const { item } = data || {};
    
    if (!item) {
      throw new Error('Missing required parameter: item');
    }
    
    // For testing, return a mock review result
    const mockReview = {
      correctedItem: {
        ...item,
        reviewApplied: true,
        lastModified: new Date().toISOString()
      },
      changes: [
        'Improved medical terminology precision',
        'Enhanced distractors for better discrimination',
        'Clarified clinical scenario'
      ],
      reviewNotes: [
        'Medical accuracy verified',
        'Question stem is clear and unambiguous',
        'All answer choices are plausible',
        'Correct answer is definitively correct'
      ],
      qualityMetrics: {
        medical_accuracy: 4.5,
        clarity: 4.2,
        realism: 4.8,
        educational_value: 4.6
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('TEST: Review completed successfully');
    res.json({
      success: true,
      data: mockReview,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('TEST: Error in ai_review_mcq:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}));

export const test_score_question = functions.https.onRequest(
  withCORS('TEST', async (req, res) => {
    // SECURITY: Disable in production
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: 'Test endpoints not available in production'
      });
      return;
    }
  
  const data = req.body.data || req.body;
  try {
    console.log('TEST: AI Score MCQ called with data:', JSON.stringify(data, null, 2));
    
    const { item } = data || {};
    
    if (!item) {
      throw new Error('Missing required parameter: item');
    }
    
    // For testing, return a mock scoring result
    const mockScoring = {
      scores: {
        medical_accuracy: 4.7,
        question_quality: 4.3,
        difficulty_appropriateness: 4.5,
        board_exam_relevance: 4.6,
        overall_score: 4.5
      },
      feedback: {
        strengths: [
          'Clinically relevant scenario',
          'Appropriate difficulty level',
          'Clear question stem',
          'Plausible distractors'
        ],
        improvements: [
          'Could include more specific dermatological terminology',
          'Consider adding visual elements reference'
        ]
      },
      recommendations: {
        approved: true,
        needsRevision: false,
        reasonForDecision: 'Question meets quality standards for board exam preparation'
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('TEST: Scoring completed successfully');
    res.json({
      success: true,
      data: mockScoring,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('TEST: Error in ai_score_mcq:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
})); 