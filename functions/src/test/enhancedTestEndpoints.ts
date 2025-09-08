/**
 * Test endpoints for the enhanced AI pipeline
 * These endpoints handle CORS and don't require authentication
 */

import * as functions from 'firebase-functions';
// REMOVED: pipelineEnhanced.ts was deleted - using optimizedOrchestrator instead
// import { runEnhancedPipeline } from '../ai/pipelineEnhanced';
import { generateQuestionsOptimized } from '../ai/optimizedOrchestrator';
import { generateEnhancedMCQ } from '../ai/drafting';
import { config } from '../util/config';
import { withCORS } from '../util/corsConfig';

/**
 * Test endpoint for enhanced pipeline with detailed output
 * DISABLED IN PRODUCTION for security
 */
export const test_enhanced_pipeline = functions.https.onRequest(
  withCORS('STRICT', async (req, res) => {
    // SECURITY: Disable in production
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: 'Test endpoints not available in production'
      });
      return;
    }
  
  const data = req.body;
  
  try {
    console.log('TEST: Enhanced pipeline called with:', JSON.stringify(data, null, 2));
    
    const { topicIds, difficulty = 0.5, useAI = true, strictMode = false } = data;
    
    if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'topicIds array is required'
      });
      return;
    }
    
    // Run the enhanced pipeline
    const topic = Array.isArray(topicIds) ? topicIds[0] : topicIds; // Use first topic
    const result = await generateQuestionsOptimized(
      topic,
      ['Basic'], // difficulties
      true, // enableCaching
      false, // useStreaming  
      undefined, // userId
      false // enableProgress
    );
    
    // Extract the Basic question from the result
    const question = result.Basic;
    
    res.json({
      success: !!question,
      question: question,
      quality: question ? 85 : 0, // Mock quality score
      iterations: 1,
      improvements: [],
      error: question ? undefined : 'No question generated',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('TEST: Enhanced pipeline error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error) || 'Pipeline failed',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * Test endpoint for standard generation with agent visibility
 * DISABLED IN PRODUCTION for security
 */
export const test_generate_with_details = functions.https.onRequest(
  withCORS('STRICT', async (req, res) => {
    // SECURITY: Disable in production
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: 'Test endpoints not available in production'
      });
      return;
    }
  
  const data = req.body;
  
  try {
    const { topicIds, difficulty = 0.5, useAI = true } = data;
    
    if (!topicIds || !Array.isArray(topicIds)) {
      res.status(400).json({
        success: false,
        error: 'topicIds array is required'
      });
      return;
    }
    
    // Step 1: Generate
    console.log('TEST: Starting generation...');
    const startGen = Date.now();
    
    let question;
    let generationMethod;
    
    if (useAI && config.gemini.hasApiKey()) {
      // Load knowledge base
      const fs = require('fs');
      const path = require('path');
      const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
      const kbData = fs.readFileSync(kbPath, 'utf8');
      const knowledgeBase = JSON.parse(kbData);
      
      // Find relevant entity
      const relevantEntities = Object.entries(knowledgeBase)
        .filter(([name, entity]: [string, any]) => {
          return topicIds.some((topicId: string) => 
            name.toLowerCase().includes(topicId.toLowerCase())
          );
        })
        .filter(([_, entity]: [string, any]) => entity.completeness_score > 65);
      
      if (relevantEntities.length > 0) {
        const [entityName, entity] = relevantEntities[0];
        // generateEnhancedMCQ expects (topic, context, difficulty)
        const context = JSON.stringify(entity); // Convert entity to context string
        question = await generateEnhancedMCQ(String(entityName), context, difficulty);
        generationMethod = 'ai-enhanced';
      } else {
        throw new Error(`No relevant entities found for topics: ${topicIds.join(', ')}`);
      }
    } else {
      throw new Error('AI generation is required but API key is not available. No fallback generation allowed.');
    }
    
    const genTime = Date.now() - startGen;
    
    // Step 2: Validate
    const validation = validateQuestionStructure(question);
    
    // Step 3: Medical accuracy check
    const accuracy = await checkMedicalAccuracy(question);
    
    // Step 4: Review (mock for testing)
    const review = {
      changes: [],
      reviewNotes: ['Test review completed'],
      qualityMetrics: {
        medical_accuracy: accuracy.confidence,
        clarity: validation.score / 100,
        realism: 0.8,
        educational_value: 0.85
      }
    };
    
    // Step 5: Score
    const scoring = {
      totalScore: Math.round((validation.score / 100) * 25),
      qualityLevel: validation.score >= 80 ? 'High' : validation.score >= 60 ? 'Medium' : 'Low',
      breakdown: {
        structure: validation.score / 100,
        accuracy: accuracy.confidence,
        overall: (validation.score / 100 + accuracy.confidence) / 2
      }
    };
    
    res.json({
      success: true,
      question,
      agentOutputs: {
        generation: {
          method: generationMethod,
          time: genTime,
          topicIds,
          difficulty
        },
        validation,
        accuracy,
        review,
        scoring
      },
      metadata: {
        totalTime: genTime,
        generationMethod
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('TEST: Generation with details error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}));

// Helper functions for validation and accuracy checking
function validateQuestionStructure(question: any): any {
  const result = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[],
    score: 100
  };
  
  // Check stem
  if (!question.stem) {
    result.errors.push('Missing stem');
    result.isValid = false;
    result.score -= 25;
  } else if (question.stem.length < 50) {
    result.warnings.push('Stem too short');
    result.score -= 10;
  }
  
  // Check lead-in
  if (!question.leadIn) {
    result.errors.push('Missing lead-in');
    result.isValid = false;
    result.score -= 20;
  }
  
  // Check options
  if (!question.options || question.options.length !== 5) {
    result.errors.push('Must have exactly 5 options');
    result.isValid = false;
    result.score -= 30;
  } else {
    const correctCount = question.options.filter((o: any) => o.isCorrect).length;
    if (correctCount !== 1) {
      result.errors.push(`Must have exactly 1 correct option (found ${correctCount})`);
      result.isValid = false;
      result.score -= 25;
    }
  }
  
  // Check explanation
  if (!question.explanation) {
    result.warnings.push('Missing explanation');
    result.score -= 15;
  }
  
  result.score = Math.max(0, result.score);
  return result;
}

async function checkMedicalAccuracy(question: any): Promise<any> {
  const check = {
    isAccurate: true,
    issues: [] as string[],
    suggestions: [] as string[],
    confidence: 1.0
  };
  
  // Basic checks
  const stem = question.stem?.toLowerCase() || '';
  const correctOption = question.options?.find((o: any) => o.isCorrect);
  
  if (!correctOption) {
    check.isAccurate = false;
    check.issues.push('No correct answer identified');
    check.confidence = 0;
    return check;
  }
  
  // Check for common medical inconsistencies
  if (stem.includes('melanoma') && correctOption.text.toLowerCase().includes('benign')) {
    check.issues.push('Melanoma is malignant, not benign');
    check.isAccurate = false;
  }
  
  if (stem.includes('psoriasis') && correctOption.text.toLowerCase().includes('contagious')) {
    check.issues.push('Psoriasis is not contagious');
    check.isAccurate = false;
  }
  
  // Check distractor quality
  const distractors = question.options?.filter((o: any) => !o.isCorrect) || [];
  const genericDistractors = distractors.filter((d: any) => 
    d.text.toLowerCase().includes('none of the above') ||
    d.text.toLowerCase().includes('all of the above')
  );
  
  if (genericDistractors.length > 0) {
    check.issues.push('Generic distractors detected');
    check.suggestions.push('Use specific, plausible alternatives');
  }
  
  check.confidence = Math.max(0, 1 - (check.issues.length * 0.25));
  
  return check;
}
