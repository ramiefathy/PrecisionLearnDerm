/**
 * Review Agent V2 - Clean, Self-Contained Implementation
 * 
 * Design Principles:
 * 1. Minimal dependencies
 * 2. Direct API calls
 * 3. Built-in retry logic
 * 4. Clear error reporting
 * 5. No external utility dependencies
 */

import * as functions from 'firebase-functions';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { getGeminiApiKey, GEMINI_API_KEY, config } from '../util/config';

interface ReviewRequest {
  question: {
    stem?: string;
    leadIn?: string;
    options: Array<{ text: string; correct?: boolean }>;
    correctAnswer?: number;
    explanation?: string;
    taxonomy?: string[];
  };
}

interface ReviewResponse {
  success: boolean;
  data?: {
    score: number;
    feedback: string;
    suggestions: string[];
    medicalAccuracy: number;
    clarity: number;
    clinicalRealism: number;
    educationalValue: number;
    corrections?: Array<{
      field: string;
      issue: string;
      suggestion: string;
    }>;
  };
  error?: string;
  debugInfo?: {
    stage: string;
    details: string;
    timestamp: string;
  };
}

/**
 * Simple logging utility - self-contained
 */
function log(level: 'info' | 'error' | 'warn', stage: string, message: string, details?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    stage,
    message,
    details: details ? JSON.stringify(details) : undefined
  };
  
  if (level === 'error') {
    console.error(`[ReviewAgentV2] ${stage}: ${message}`, details);
  } else {
    console.log(`[ReviewAgentV2] ${stage}: ${message}`, details);
  }
  
  return logEntry;
}

/**
 * Initialize Gemini client with minimal, robust configuration
 */
function initializeGeminiClient(): { success: boolean; client?: any; error?: string } {
  try {
    log('info', 'client_init', 'Initializing Gemini client');
    
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      const error = 'GEMINI_API_KEY not configured';
      log('error', 'client_init', error);
      return { success: false, error };
    }
    
    // Correct API initialization - GoogleGenAI constructor takes options object with apiKey
    const client = new GoogleGenAI({ apiKey });
    log('info', 'client_init', 'Gemini client initialized successfully');
    
    return { success: true, client };
  } catch (error) {
    const errorMsg = `Failed to initialize Gemini client: ${error}`;
    log('error', 'client_init', errorMsg, error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Generate review prompt - focused on core medical review criteria
 */
function generateReviewPrompt(question: ReviewRequest['question']): string {
  return `You are a medical education expert reviewing a dermatology multiple-choice question.

QUESTION TO REVIEW:
${JSON.stringify(question, null, 2)}

Evaluate this question on:
1. Medical accuracy (current evidence-based practice)
2. Clinical realism (realistic patient presentations)
3. Content clarity (clear, unambiguous language)
4. Educational value (appropriate difficulty, meaningful learning)

RESPONSE FORMAT (return exactly this structure):
OVERALL_SCORE: [0-10 numeric score]
MEDICAL_ACCURACY: [0-10 score]
CLARITY: [0-10 score]
CLINICAL_REALISM: [0-10 score]
EDUCATIONAL_VALUE: [0-10 score]
FEEDBACK: [Brief overall assessment]
SUGGESTIONS: [Bulleted list of specific improvements needed]
CORRECTIONS: [Any specific corrections needed, format as "Field: Issue - Suggestion"]`;
}

/**
 * Parse structured review response
 */
function parseReviewResponse(text: string): { success: boolean; data?: any; error?: string } {
  try {
    log('info', 'response_parse', 'Parsing review response', { textLength: text.length });
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const result: any = {
      suggestions: [],
      corrections: []
    };
    
    let currentSection = '';
    
    for (const line of lines) {
      if (line.startsWith('OVERALL_SCORE:')) {
        result.score = parseFloat(line.split(':')[1].trim()) || 0;
      } else if (line.startsWith('MEDICAL_ACCURACY:')) {
        result.medicalAccuracy = parseFloat(line.split(':')[1].trim()) || 0;
      } else if (line.startsWith('CLARITY:')) {
        result.clarity = parseFloat(line.split(':')[1].trim()) || 0;
      } else if (line.startsWith('CLINICAL_REALISM:')) {
        result.clinicalRealism = parseFloat(line.split(':')[1].trim()) || 0;
      } else if (line.startsWith('EDUCATIONAL_VALUE:')) {
        result.educationalValue = parseFloat(line.split(':')[1].trim()) || 0;
      } else if (line.startsWith('FEEDBACK:')) {
        result.feedback = line.split(':').slice(1).join(':').trim();
        currentSection = 'FEEDBACK';
      } else if (line.startsWith('SUGGESTIONS:')) {
        currentSection = 'SUGGESTIONS';
      } else if (line.startsWith('CORRECTIONS:')) {
        currentSection = 'CORRECTIONS';
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        const content = line.substring(2).trim();
        if (currentSection === 'SUGGESTIONS') {
          result.suggestions.push(content);
        } else if (currentSection === 'CORRECTIONS') {
          result.corrections.push({ text: content });
        }
      } else if (currentSection === 'FEEDBACK' && line && !line.includes(':')) {
        result.feedback = (result.feedback || '') + ' ' + line;
      }
    }
    
    // Validation
    if (typeof result.score !== 'number') {
      log('warn', 'response_parse', 'No valid overall score found, defaulting to 5');
      result.score = 5;
    }
    
    result.feedback = result.feedback || 'Review completed';
    
    log('info', 'response_parse', 'Successfully parsed review response', {
      score: result.score,
      suggestionsCount: result.suggestions.length
    });
    
    return { success: true, data: result };
  } catch (error) {
    const errorMsg = `Failed to parse review response: ${error}`;
    log('error', 'response_parse', errorMsg, { text: text.substring(0, 200) });
    return { success: false, error: errorMsg };
  }
}

/**
 * Call Gemini API with retry logic and fallbacks
 */
async function callGeminiWithRetry(client: any, prompt: string): Promise<{ success: boolean; text?: string; error?: string }> {
  // Use the Gemini 2.5 models
  const models = (config.generation.useFlashForReview
    ? ['gemini-2.5-flash', 'gemini-2.5-pro']
    : ['gemini-2.5-pro', 'gemini-2.5-flash']);
  const maxRetries = 2;
  
  for (const modelName of models) {
    log('info', 'api_call', `Attempting ${modelName}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log('info', 'api_call', `${modelName} attempt ${attempt}/${maxRetries}`);
        
        // Use the correct API structure: client.models.generateContent
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
          }
        });
        
        const text = response.text;
        
        if (text && text.length > 10) {
          log('info', 'api_call', `${modelName} success`, { textLength: text.length });
          return { success: true, text };
        } else {
          log('warn', 'api_call', `${modelName} returned empty response`);
        }
        
      } catch (error) {
        const errorMsg = `${modelName} attempt ${attempt} failed: ${error}`;
        log('error', 'api_call', errorMsg, error);
        
        if (attempt === maxRetries) {
          log('warn', 'api_call', `${modelName} failed after ${maxRetries} attempts, trying next model`);
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }
  
  const finalError = 'All models and retries exhausted';
  log('error', 'api_call', finalError);
  return { success: false, error: finalError };
}

/**
 * Main review function - clean and direct
 */
async function performReview(request: ReviewRequest): Promise<ReviewResponse> {
  const startTime = Date.now();
  log('info', 'review_start', 'Starting question review', { questionType: typeof request.question });
  
  try {
    // Step 1: Initialize client
    const clientResult = initializeGeminiClient();
    if (!clientResult.success) {
      return {
        success: false,
        error: clientResult.error,
        debugInfo: {
          stage: 'client_initialization',
          details: clientResult.error || 'Unknown client error',
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Step 2: Generate prompt
    const prompt = generateReviewPrompt(request.question);
    log('info', 'prompt_generated', 'Review prompt generated', { promptLength: prompt.length });
    
    // Step 3: Call API with retries
    const apiResult = await callGeminiWithRetry(clientResult.client, prompt);
    if (!apiResult.success) {
      return {
        success: false,
        error: `API call failed: ${apiResult.error}`,
        debugInfo: {
          stage: 'api_call',
          details: apiResult.error || 'Unknown API error',
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Step 4: Parse response
    const parseResult = parseReviewResponse(apiResult.text!);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Response parsing failed: ${parseResult.error}`,
        debugInfo: {
          stage: 'response_parsing',
          details: parseResult.error || 'Unknown parsing error',
          timestamp: new Date().toISOString()
        }
      };
    }
    
    const duration = Date.now() - startTime;
    log('info', 'review_complete', `Review completed successfully in ${duration}ms`, {
      score: parseResult.data.score,
      duration
    });
    
    return {
      success: true,
      data: parseResult.data
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = `Unexpected error in review process: ${error}`;
    log('error', 'review_error', errorMsg, { error, duration });
    
    return {
      success: false,
      error: errorMsg,
      debugInfo: {
        stage: 'unexpected_error',
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Internal function for use in orchestrator pipeline
 * Bypasses Firebase function wrapper for direct integration
 */
export async function performReviewInternal(mcq: any): Promise<ReviewResponse> {
  // Convert letter-based correctAnswer to index-based (A→0, B→1, C→2, D→3, E→4)
  let correctAnswerIndex = mcq.correctAnswer || mcq.correct_answer || 0;
  if (typeof correctAnswerIndex === 'string') {
    const letterToIndex: { [key: string]: number } = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 };
    correctAnswerIndex = letterToIndex[correctAnswerIndex.toUpperCase()] ?? 0;
  }

  // Convert MCQ format from orchestrator to Review Agent V2 format
  const reviewRequest: ReviewRequest = {
    question: {
      stem: mcq.stem || mcq.clinical_vignette || mcq.question || '',
      leadIn: mcq.leadIn || 'What is the most likely diagnosis?',
      options: mcq.options ? 
        (Array.isArray(mcq.options) ? 
          mcq.options.map((opt: any) => ({ text: opt.text || opt.toString() })) :
          Object.values(mcq.options).map((opt: any) => ({ text: opt.toString() }))
        ) : [],
      correctAnswer: correctAnswerIndex,
      explanation: mcq.explanation || mcq.correct_answer_rationale || '',
      taxonomy: mcq.taxonomy || mcq.tags || []
    }
  };

  log('info', 'internal_review_start', 'Internal review started for orchestrator', {
    hasQuestion: !!reviewRequest.question.stem,
    optionCount: reviewRequest.question.options.length,
    originalCorrectAnswer: mcq.correctAnswer,
    convertedCorrectAnswer: correctAnswerIndex,
    conversionApplied: typeof (mcq.correctAnswer || mcq.correct_answer) === 'string'
  });

  return await performReview(reviewRequest);
}

/**
 * Firebase Cloud Function export
 */
export const processReviewV2 = functions
  .runWith({
    timeoutSeconds: 120, // 2 minutes
    memory: '1GB',
    secrets: [GEMINI_API_KEY]
  })
  .https.onCall(async (data, context) => {
    // Basic auth check
    if (!context.auth) {
      log('warn', 'auth_check', 'Unauthenticated request');
      return {
        success: false,
        error: 'Authentication required'
      };
    }
    
    log('info', 'function_start', 'Review function called', { uid: context.auth.uid });
    
    try {
      const result = await performReview(data);
      log('info', 'function_complete', 'Function completed', { success: result.success });
      return result;
    } catch (error) {
      log('error', 'function_error', 'Function error', error);
      return {
        success: false,
        error: 'Internal function error',
        debugInfo: {
          stage: 'function_wrapper',
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      };
    }
  });
