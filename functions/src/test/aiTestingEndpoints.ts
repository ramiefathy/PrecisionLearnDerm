import * as functions from 'firebase-functions';
import { generateEnhancedMCQ, generateFallbackMCQ } from '../ai/drafting';

// Testing versions of AI functions that don't require authentication
// These are specifically for local testing and development

export const test_generate_question = functions.https.onRequest(async (req, res) => {
  // Enable CORS for all origins
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
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
    
    if (useAI && process.env.GEMINI_API_KEY) {
      console.log('TEST: Using AI generation with topics:', topicIds);
      result = await generateEnhancedMCQ(topicIds, difficultyTarget);
    } else {
      console.log('TEST: Using fallback generation');
      result = await generateFallbackMCQ(topicIds[0], difficultyTarget);
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
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export const test_review_question = functions.https.onRequest(async (req, res) => {
  // Enable CORS for all origins
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
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
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export const test_score_question = functions.https.onRequest(async (req, res) => {
  // Enable CORS for all origins
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
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
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}); 