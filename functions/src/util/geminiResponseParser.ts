/**
 * Centralized Gemini API Response Parser
 * Fixes systemic response parsing bugs that cause function timeouts
 * 
 * Root Cause: Multiple AI agents had incomplete validation for Gemini API responses,
 * causing "Cannot read properties of undefined (reading '0')" errors when
 * candidates[0].content.parts was undefined or empty.
 */

import { logError, logInfo } from './logging';

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  promptFeedback?: {
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
    blockReason?: string;
  };
}

export interface ParseResult {
  success: boolean;
  text?: string;
  error?: string;
  blockReason?: string;
}

/**
 * Safely parse Gemini API response with comprehensive validation
 * Prevents the "Cannot read properties of undefined (reading '0')" errors
 * that were causing function timeouts
 */
export function parseGeminiResponse(
  responseData: any,
  operationName: string = 'unknown'
): ParseResult {
  try {
    // Log the response structure for debugging (without exposing content)
    logInfo('gemini.response_received', {
      operation: operationName,
      hasCandidates: !!responseData?.candidates,
      candidateCount: responseData?.candidates?.length || 0,
      hasPromptFeedback: !!responseData?.promptFeedback,
      timestamp: new Date().toISOString()
    });

    // Check for prompt-level blocking first
    if (responseData?.promptFeedback?.blockReason) {
      const blockReason = responseData.promptFeedback.blockReason;
      logError('gemini.prompt_blocked', {
        operation: operationName,
        blockReason,
        safetyRatings: responseData.promptFeedback.safetyRatings || [],
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        error: `Content blocked at prompt level: ${blockReason}`,
        blockReason
      };
    }

    // Validate basic response structure
    if (!responseData) {
      return {
        success: false,
        error: 'No response data received from Gemini API'
      };
    }

    // PRIORITY 1: NEW @google/genai library format - GenerateContentResponse class with .text getter
    // This is the primary response format for the current library
    if (responseData && typeof responseData.text !== 'undefined') {
      try {
        const text = responseData.text; // Call the getter property
        if (text && typeof text === 'string' && text.length > 0) {
          logInfo('gemini.using_new_genai_library_format', {
            operation: operationName,
            textLength: text.length,
            responseType: 'GenerateContentResponse_class',
            timestamp: new Date().toISOString()
          });
          
          return {
            success: true,
            text
          };
        } else if (text === null || text === undefined) {
          // Text getter exists but returned empty - this indicates a real issue
          logError('gemini.new_format_empty_response', {
            operation: operationName,
            textValue: text,
            textType: typeof text,
            responseKeys: Object.keys(responseData),
            hasResponse: !!responseData,
            timestamp: new Date().toISOString()
          });
          
          return {
            success: false,
            error: 'Empty response from Gemini API - no generated content'
          };
        }
      } catch (error) {
        logError('gemini.new_format_text_access_error', {
          operation: operationName,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
        
        return {
          success: false,
          error: `Failed to access response text: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }

    // PRIORITY 2: LEGACY FORMATS - Ensure backwards compatibility
    // Handle both old @google/generative-ai and new @google/genai library response formats  
    // Old library: responseData has candidates directly
    // New library: responseData might have different structure
    let candidates = responseData.candidates;
    
    // Check if this is the new library format where response might be nested differently
    if (!candidates && responseData.response && responseData.response.candidates) {
      candidates = responseData.response.candidates;
      logInfo('gemini.using_legacy_response_format', {
        operation: operationName,
        timestamp: new Date().toISOString()
      });
    }

    // Alternative: new library might have content directly in response
    if (!candidates && responseData.content && typeof responseData.content === 'string') {
      logInfo('gemini.using_direct_content_format', {
        operation: operationName,
        contentLength: responseData.content.length,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        text: responseData.content
      };
    }

    if (!candidates) {
      // Enhanced debugging: Log the actual response structure when candidates is missing
      logError('gemini.missing_candidates_debug', {
        operation: operationName,
        responseStructure: JSON.stringify(responseData, null, 2),
        responseKeys: Object.keys(responseData),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        error: 'No candidates array in Gemini API response'
      };
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return {
        success: false,
        error: 'Candidates array is empty or invalid'
      };
    }

    const candidate = candidates[0];

    // Check for candidate-level blocking
    if (candidate.finishReason === 'SAFETY') {
      logError('gemini.content_blocked', {
        operation: operationName,
        finishReason: candidate.finishReason,
        safetyRatings: candidate.safetyRatings || [],
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        error: 'Content blocked by safety filters',
        blockReason: 'SAFETY'
      };
    }

    // Check for content truncation due to token limits
    if (candidate.finishReason === 'MAX_TOKENS' || candidate.finishReason === 'LENGTH') {
      logError('gemini.content_truncated', {
        operation: operationName,
        finishReason: candidate.finishReason,
        timestamp: new Date().toISOString()
      });
      return {
        success: false,
        error: `Content truncated due to ${candidate.finishReason} limit.`,
        blockReason: candidate.finishReason
      };
    }

    // Validate content structure (this is where the original bug was)
    if (!candidate.content) {
      // Enhanced debugging: Log the actual candidate structure when content is missing
      // CRITICAL: Log full raw responseData for Google support if issue persists
      logError('gemini.missing_content_debug', {
        operation: operationName,
        candidateStructure: JSON.stringify(candidate, null, 2),
        candidateKeys: Object.keys(candidate),
        finishReason: candidate.finishReason,
        fullResponseData: JSON.stringify(responseData, null, 2),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        error: 'No content object in candidate response'
      };
    }

    // CRITICAL FIX: Handle both old and new Gemini API response formats
    // New format may have text directly in content or in a different structure
    if (!candidate.content.parts) {
      // Check if content has text directly (new format)
      if (candidate.content.text && typeof candidate.content.text === 'string') {
        logInfo('gemini.using_direct_text_format', {
          operation: operationName,
          textLength: candidate.content.text.length,
          timestamp: new Date().toISOString()
        });
        
        return {
          success: true,
          text: candidate.content.text
        };
      }
      
      // If still no text, log the structure for debugging
      // CRITICAL: Log full raw responseData for Google support if issue persists
      logError('gemini.missing_parts_debug', {
        operation: operationName,
        candidateStructure: JSON.stringify(candidate, null, 2),
        contentKeys: candidate.content ? Object.keys(candidate.content) : 'no content',
        fullResponseData: JSON.stringify(responseData, null, 2),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        error: 'No parts array in candidate content and no direct text property'
      };
    }

    if (!Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
      return {
        success: false,
        error: 'Parts array is empty or invalid'
      };
    }

    const firstPart = candidate.content.parts[0];
    
    if (!firstPart) {
      return {
        success: false,
        error: 'First part in parts array is undefined'
      };
    }

    if (typeof firstPart.text !== 'string') {
      return {
        success: false,
        error: 'Text property is not a string or is undefined'
      };
    }

    // Success case
    const text = firstPart.text;
    
    logInfo('gemini.response_parsed_successfully', {
      operation: operationName,
      textLength: text.length,
      finishReason: candidate.finishReason || 'STOP',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      text
    };

  } catch (error: any) {
    // Catch any unexpected parsing errors
    logError('gemini.response_parse_error', {
      operation: operationName,
      error: {
        message: error.message || 'Unknown parsing error',
        stack: error.stack || 'No stack trace'
      },
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: `Failed to parse Gemini response: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Wrapper for Promise-based API calls with proper error handling
 * Returns a Promise that properly rejects with meaningful error messages
 */
export function createGeminiResponsePromise(
  responseData: any,
  operationName: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const result = parseGeminiResponse(responseData, operationName);
    
    if (result.success && result.text) {
      resolve(result.text);
    } else {
      // Create a proper Error object for rejection
      const error = new Error(result.error || 'Unknown Gemini parsing error');
      
      // Add additional context for debugging
      (error as any).operation = operationName;
      (error as any).blockReason = result.blockReason;
      (error as any).timestamp = new Date().toISOString();
      
      reject(error);
    }
  });
}

/**
 * Utility function to extract safety rating information for debugging
 */
export function extractSafetyInfo(responseData: any): {
  promptBlocked: boolean;
  contentBlocked: boolean;
  blockReasons: string[];
  safetyRatings: any[];
} {
  const result = {
    promptBlocked: false,
    contentBlocked: false,
    blockReasons: [] as string[],
    safetyRatings: [] as any[]
  };

  // Check prompt-level blocking
  if (responseData?.promptFeedback?.blockReason) {
    result.promptBlocked = true;
    result.blockReasons.push(responseData.promptFeedback.blockReason);
    if (responseData.promptFeedback.safetyRatings) {
      result.safetyRatings.push(...responseData.promptFeedback.safetyRatings);
    }
  }

  // Check candidate-level blocking - handle both response formats
  const candidates = responseData?.candidates || responseData?.response?.candidates;
  if (candidates?.[0]?.finishReason === 'SAFETY') {
    result.contentBlocked = true;
    result.blockReasons.push('SAFETY');
    if (candidates[0].safetyRatings) {
      result.safetyRatings.push(...candidates[0].safetyRatings);
    }
  }

  return result;
}