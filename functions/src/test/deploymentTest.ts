/**
 * Minimal deployment test to verify Review Agent V2 can be deployed
 */

import * as functions from 'firebase-functions';

// Simple test function that doesn't import anything problematic
export const testDeployment = functions.https.onCall(async (data, context) => {
  console.log('[DeploymentTest] Function called', { 
    hasAuth: !!context.auth,
    dataKeys: Object.keys(data || {})
  });
  
  return {
    success: true,
    message: 'Deployment test successful',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown'
  };
});

// Test that Review Agent V2 can be imported
export const testReviewV2Import = functions.https.onCall(async (data, context) => {
  try {
    console.log('[TestReviewV2] Starting import test');
    
    // Dynamic import to avoid module-level loading
    const { performReviewInternal } = await import('../ai/reviewAgentV2');
    
    console.log('[TestReviewV2] Import successful');
    
    // Test with a simple MCQ
    const testMCQ = {
      stem: 'Test question',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 'A',
      explanation: 'Test explanation'
    };
    
    const result = await performReviewInternal(testMCQ);
    
    return {
      success: true,
      message: 'Review Agent V2 import and execution successful',
      reviewResult: result
    };
    
  } catch (error) {
    console.error('[TestReviewV2] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});