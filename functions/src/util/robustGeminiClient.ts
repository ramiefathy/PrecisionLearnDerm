/**
 * Robust Gemini API Client
 * Implements retry logic, model fallback, and enhanced error handling
 * to fix malformed JSON responses and 500 errors
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { getGeminiApiKey } from './config';
import { logInfo, logError } from './logging';
import { parseGeminiResponse } from './geminiResponseParser';

export interface GeminiClientOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeout?: number;
  fallbackToFlash?: boolean;
  fastMode?: boolean; // New: Use aggressive timeouts and immediate Flash fallback
}

export interface GeminiRequest {
  prompt: string;
  operation: string;
  preferredModel?: 'gemini-2.5-pro' | 'gemini-2.5-flash';
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResult {
  success: boolean;
  text?: string;
  error?: string;
  model?: string;
  attempts?: number;
  duration?: number;
}

/**
 * Robust Gemini API client with retry logic and fallback mechanisms
 */
export class RobustGeminiClient {
  private genAI: GoogleGenAI;
  private options: Required<GeminiClientOptions>;

  constructor(options: GeminiClientOptions = {}) {
    const apiKey = getGeminiApiKey();
    this.genAI = new GoogleGenAI({ apiKey });
    
    // Fast mode: Aggressive settings for speed
    if (options.fastMode) {
      this.options = {
        maxRetries: options.maxRetries || 2, // Fewer retries
        baseDelay: options.baseDelay || 500, // Faster retries
        maxDelay: options.maxDelay || 3000, // Lower max delay
        timeout: options.timeout || 120000, // Use 2 minutes even in fast mode per user guidance "Give it 2 minutes!"
        fallbackToFlash: true, // Always fallback to Flash
        fastMode: true
      };
    } else {
      this.options = {
        maxRetries: options.maxRetries || 3,
        baseDelay: options.baseDelay || 1000,
        maxDelay: options.maxDelay || 10000,
        timeout: options.timeout || 120000, // 2 minutes default
        fallbackToFlash: options.fallbackToFlash !== false,
        fastMode: false
      };
    }
  }

  /**
   * Generate text with robust error handling and retry logic
   */
  async generateText(request: GeminiRequest): Promise<GeminiResult> {
    const startTime = Date.now();
    const { prompt, operation, preferredModel = 'gemini-2.5-pro' } = request;
    
    logInfo('robust_gemini_request_started', {
      operation,
      operationLength: operation.length,
      operationOriginal: request.operation, // Track original operation name
      preferredModel,
      promptLength: prompt.length,
      maxRetries: this.options.maxRetries,
      timestamp: new Date().toISOString()
    });

    // Fast mode: Start with Flash model for speed
    let result: GeminiResult;
    if (this.options.fastMode) {
      logInfo('robust_gemini_fast_mode_enabled', {
        operation,
        timeout: this.options.timeout,
        maxRetries: this.options.maxRetries
      });
      
      // Try Flash model first for speed
      result = await this.tryModelWithRetry(prompt, 'gemini-2.5-flash', operation);
      
      // Only try Pro model if Flash fails AND we have time
      if (!result.success && preferredModel === 'gemini-2.5-pro') {
        logInfo('robust_gemini_fast_mode_pro_fallback', {
          operation,
          flashError: result.error
        });
        result = await this.tryModelWithRetry(prompt, 'gemini-2.5-pro', operation);
      }
    } else {
      // Normal mode: Try preferred model first
      result = await this.tryModelWithRetry(prompt, preferredModel, operation);
      
      // Fallback to flash model if pro fails and fallback is enabled
      if (!result.success && this.options.fallbackToFlash && preferredModel === 'gemini-2.5-pro') {
        logInfo('robust_gemini_fallback_to_flash', {
          operation,
          originalError: result.error,
          attempts: result.attempts
        });
        
        result = await this.tryModelWithRetry(prompt, 'gemini-2.5-flash', operation);
        if (result.success) {
          logInfo('robust_gemini_fallback_success', {
            operation,
            fallbackModel: 'gemini-2.5-flash'
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    result.duration = duration;

    if (result.success) {
      logInfo('robust_gemini_success', {
        operation,
        model: result.model,
        attempts: result.attempts,
        duration,
        textLength: result.text?.length || 0
      });
    } else {
      logError('robust_gemini_final_failure', {
        operation,
        error: result.error,
        attempts: result.attempts,
        duration,
        fallbackUsed: preferredModel === 'gemini-2.5-pro' && this.options.fallbackToFlash
      });
    }

    return result;
  }

  /**
   * Try a specific model with retry logic
   */
  private async tryModelWithRetry(
    prompt: string,
    modelName: 'gemini-2.5-pro' | 'gemini-2.5-flash',
    operation: string
  ): Promise<GeminiResult> {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        logInfo('robust_gemini_attempt', {
          operation,
          operationFull: operation, // Full operation name for comparison
          operationTruncated: operation.substring(0, 10), // First 10 chars for comparison
          model: modelName,
          attempt,
          maxRetries: this.options.maxRetries,
          timestamp: new Date().toISOString()
        });

        const result = await this.makeSingleRequest(prompt, modelName, operation);
        
        if (result.success) {
          return {
            ...result,
            model: modelName,
            attempts: attempt
          };
        }
        
        lastError = result.error || 'Unknown error';
        
        // Don't retry on certain errors
        if (this.shouldNotRetry(result.error)) {
          logInfo('robust_gemini_no_retry', {
            operation,
            model: modelName,
            attempt,
            error: result.error
          });
          break;
        }
        
        // Wait before retrying (exponential backoff with jitter)
        if (attempt < this.options.maxRetries) {
          const delay = this.calculateDelay(attempt);
          logInfo('robust_gemini_retry_delay', {
            operation,
            model: modelName,
            attempt,
            delay
          });
          await this.delay(delay);
        }

      } catch (error: any) {
        lastError = error.message || String(error);
        logError('robust_gemini_attempt_error', {
          operation,
          model: modelName,
          attempt,
          error: lastError
        });
        
        // Wait before retrying on exceptions too
        if (attempt < this.options.maxRetries) {
          const delay = this.calculateDelay(attempt);
          await this.delay(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      model: modelName,
      attempts: this.options.maxRetries
    };
  }

  /**
   * Make a single request to the Gemini API
   */
  private async makeSingleRequest(
    prompt: string,
    modelName: string,
    operation: string
  ): Promise<GeminiResult> {
    return new Promise(async (resolve, reject) => {
      // DEBUG: Log the actual timeout value being used
      logInfo('robust_gemini_timeout_value', {
        operation,
        model: modelName,
        timeoutValue: this.options.timeout,
        fastMode: this.options.fastMode,
        allOptions: JSON.stringify(this.options)
      });
      
      const timeoutId = setTimeout(() => {
        logError('robust_gemini_timeout', {
          operation,
          operationName: operation, // Explicit operation name tracking
          operationLength: operation.length,
          model: modelName,
          timeout: this.options.timeout,
          timeoutSource: 'robustGeminiClient',
          timestamp: new Date().toISOString()
        });
        resolve({
          success: false,
          error: `Request timed out after ${this.options.timeout}ms for operation: ${operation}`
        });
      }, this.options.timeout);

      try {
        // Configure model with optimal parameters for medical content generation
        const isJsonOperation = operation.includes('json') || operation.includes('structured');
        
        // Optimal parameters for different operations
        const getOptimalConfig = (operation: string) => {
          // Review operations need high consistency 
          if (operation.includes('review')) {
            return {
              temperature: 0.3,  // Low for consistent medical accuracy
              topK: 20,         // Focused responses
              topP: 0.85,       // Balanced diversity
              maxOutputTokens: 8192
            };
          }
          
          // Scoring operations need very high consistency
          if (operation.includes('scoring') || operation.includes('score')) {
            return {
              temperature: 0.2,  // Very low for consistent scoring
              topK: 15,         // Highly focused
              topP: 0.8,        // Conservative diversity
              maxOutputTokens: 4096
            };
          }
          
          // Drafting operations need moderate creativity
          if (operation.includes('drafting') || operation.includes('generate')) {
            return {
              temperature: 0.7,  // Moderate creativity for diverse questions
              topK: 40,         // Good variety
              topP: 0.9,        // Higher diversity for creative content
              maxOutputTokens: 8192
            };
          }
          
          // Default balanced configuration
          return {
            temperature: 0.5,   // Balanced
            topK: 30,          // Moderate focus
            topP: 0.9,         // Good diversity
            maxOutputTokens: 8192
          };
        };
        
        const generationConfig = getOptimalConfig(operation);
        
        // Configure safety settings separately (critical for medical content)  
        // Using OFF rather than BLOCK_NONE for complete safety filter disabling per official docs
        const safetySettings = [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.OFF // Completely turn off safety filter for medical content
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, 
            threshold: HarmBlockThreshold.OFF // Medical discussions require unfiltered content
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.OFF // Medical content may include anatomical references
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.OFF // Medical procedures may be flagged as dangerous
          }
        ];
        
        // Enable JSON mode for operations that explicitly request it
        // Operations with '_json' in the name expect JSON responses
        const useJsonMode = operation.includes('_json');

        // Log request details for debugging
        logInfo('gemini_request_details', {
          operation,
          model: modelName,
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 500) + (prompt.length > 500 ? '...' : ''),
          jsonModeEnabled: useJsonMode,
          responseFormat: useJsonMode ? 'JSON' : 'text',
          attempt: 1
        });

        const requestStartTime = Date.now();
        
        // Log that we're starting the generation (NOT streaming)
        logInfo('robust_gemini_generation_starting', {
          operation,
          model: modelName,
          isStreaming: false,
          timeoutMs: this.options.timeout
        });

        // Use new @google/genai library format - configuration directly in config
        const config: any = {
          temperature: generationConfig.temperature,
          topK: generationConfig.topK,
          topP: generationConfig.topP,
          maxOutputTokens: generationConfig.maxOutputTokens,
          safetySettings
        };
        
        // Add JSON mode if needed
        if (useJsonMode) {
          config.responseMimeType = 'application/json';
          logInfo('json_mode_enabled', {
            operation,
            model: modelName,
            reason: 'Operation name contains _json suffix'
          });
        }
        
        const response = await this.genAI.models.generateContent({
          model: modelName,
          contents: prompt,
          config
        });
        const requestDuration = Date.now() - requestStartTime;
        
        clearTimeout(timeoutId);
        
        // DEBUG: Log the actual response structure from new library
        logInfo('robust_gemini_api_response', {
          operation,
          model: modelName,
          requestDuration,
          hasResponse: !!response,
          completedWithinTimeout: requestDuration < this.options.timeout
        });

        logInfo('robust_gemini_response_structure_debug', {
          operation,
          model: modelName,
          responseKeys: response ? Object.keys(response) : [],
          responseType: typeof response,
          fullResponseStructure: JSON.stringify(response, null, 2)
        });

        // Use centralized response parser - new library returns response directly
        const parseResult = parseGeminiResponse(response, operation);
        
        if (parseResult.success && parseResult.text) {
          // Additional JSON validation for operations expecting JSON
          // Note: 'structured' operations return structured text, not JSON
          if (operation.includes('json') && !operation.includes('structured')) {
            const jsonValidation = this.validateJsonResponse(parseResult.text);
            if (!jsonValidation.isValid) {
              resolve({
                success: false,
                error: `Invalid JSON response: ${jsonValidation.error}`
              });
              return;
            }
          }
          
          resolve({
            success: true,
            text: parseResult.text
          });
        } else {
          resolve({
            success: false,
            error: parseResult.error || 'Failed to parse response'
          });
        }

      } catch (error: any) {
        clearTimeout(timeoutId);
        
        const errorMessage = this.extractErrorMessage(error);
        logError('robust_gemini_api_error', {
          operation,
          model: modelName,
          error: errorMessage,
          errorType: error.constructor?.name || 'Unknown',
          errorDetails: error.toString(),
          prompt,
        });
        
        resolve({
          success: false,
          error: errorMessage
        });
      }
    });
  }

  /**
   * Extract meaningful error message from various error types
   * Compatible with both old and new @google/genai library error formats
   */
  private extractErrorMessage(error: any): string {
    // Handle new @google/genai library ApiError class
    if (error.status && error.message) {
      // ApiError from @google/genai has status property
      switch (error.status) {
        case 500:
          return 'Gemini API server error (500) - service temporarily unavailable';
        case 503:
          return 'Gemini API service unavailable (503) - temporary overload';
        case 429:
          return 'Gemini API rate limit exceeded - too many requests';
        case 400:
          return 'Invalid request format or content policy violation';
        case 404:
          return 'Gemini API endpoint not found - check model name';
        default:
          return `Gemini API error (${error.status}): ${error.message}`;
      }
    }
    
    // Handle HTTP status codes directly (new library format)
    if (typeof error.status === 'number' && !error.message) {
      switch (error.status) {
        case 500:
          return 'Gemini API server error (500) - service temporarily unavailable';
        case 503:
          return 'Gemini API service unavailable (503) - temporary overload'; 
        case 429:
          return 'Gemini API rate limit exceeded - too many requests';
        case 400:
          return 'Invalid request format or content policy violation';
        case 404:
          return 'Gemini API endpoint not found - check model name';
        default:
          return `Gemini API error (${error.status})`;
      }
    }
    
    // Fallback for legacy error formats
    if (error.message) {
      // Handle legacy GoogleGenerativeAIFetchError
      if (error.message.includes('[500 Internal Server Error]')) {
        return 'Gemini API server error (500) - service temporarily unavailable';
      }
      if (error.message.includes('[503 Service Unavailable]')) {
        return 'Gemini API service unavailable (503) - temporary overload';
      }
      if (error.message.includes('[429 Too Many Requests]')) {
        return 'Gemini API rate limit exceeded - too many requests';
      }
      if (error.message.includes('[400 Bad Request]')) {
        return 'Invalid request format or content policy violation';
      }
      if (error.message.includes('fetch')) {
        return 'Network error connecting to Gemini API';
      }
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    return 'Unknown Gemini API error';
  }

  /**
   * Check if an error should not be retried
   */
  private shouldNotRetry(error?: string): boolean {
    if (!error) return false;
    
    const noRetryPatterns = [
      'Invalid request format',
      'content policy violation',
      'API key',
      'authentication',
      'authorization',
      'quota exceeded',
      'Content blocked by safety filters'
    ];
    
    return noRetryPatterns.some(pattern => 
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.options.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    const delay = Math.min(exponentialDelay + jitter, this.options.maxDelay);
    return Math.round(delay);
  }

  /**
   * Validate JSON response
   */
  private validateJsonResponse(text: string): { isValid: boolean; error?: string } {
    try {
      // Try to parse the JSON
      JSON.parse(text);
      return { isValid: true };
    } catch (error: any) {
      // Check for common JSON issues and try to fix them
      const trimmed = text.trim();
      
      // Remove markdown code block markers if present
      let cleaned = trimmed;
      if (cleaned.startsWith('```json') && cleaned.endsWith('```')) {
        cleaned = cleaned.slice(7, -3).trim();
      } else if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
        cleaned = cleaned.slice(3, -3).trim();
      }
      
      // Try parsing cleaned version
      try {
        JSON.parse(cleaned);
        return { isValid: true };
      } catch (secondError) {
        return {
          isValid: false,
          error: `JSON parsing failed: ${error.message}`
        };
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a new robust Gemini client instance
 * 
 * IMPORTANT: Creates a new instance for each request to avoid state leakage
 * in serverless environment. Each Firebase Function invocation should
 * get its own isolated client instance.
 */
export function getRobustGeminiClient(options?: GeminiClientOptions): RobustGeminiClient {
  // Always create a new instance to ensure request isolation
  // This prevents state leakage between concurrent function invocations
  return new RobustGeminiClient(options);
}

/**
 * Convenience function for simple text generation with robust handling
 * Maintains backwards compatibility with all existing agents
 */
export async function generateTextRobustly(
  prompt: string,
  operation: string,
  preferredModel: 'gemini-2.5-pro' | 'gemini-2.5-flash' = 'gemini-2.5-pro'
): Promise<string> {
  const client = getRobustGeminiClient({
    // Use default settings optimized for reliability
    maxRetries: 3,
    fallbackToFlash: true,
    timeout: 120000 // 2 minutes
  });
  
  const result = await client.generateText({
    prompt,
    operation,
    preferredModel
  });
  
  if (result.success && result.text) {
    return result.text;
  }
  
  throw new Error(result.error || 'Failed to generate text');
}