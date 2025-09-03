import { defineSecret } from 'firebase-functions/params';

/**
 * Define the GEMINI_API_KEY as a secret
 * This will be stored securely in Firebase and not exposed in source code
 * 
 * To set this secret, run:
 * firebase functions:secrets:set GEMINI_API_KEY
 */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/**
 * Get the Gemini API key value
 * This should only be called within a function context
 * @returns The API key value
 */
export function getGeminiApiKey(): string {
  try {
    const apiKey = GEMINI_API_KEY.value();
    if (apiKey) {
      return apiKey;
    }
  } catch (error) {
    // Fallback to environment variable for local development
    const envApiKey = process.env.GEMINI_API_KEY;
    if (envApiKey) {
      return envApiKey;
    }
  }
  throw new Error('GEMINI_API_KEY is not configured. Run: firebase functions:secrets:set GEMINI_API_KEY or set GEMINI_API_KEY environment variable');
}

/**
 * Check if Gemini API key is available
 * @returns true if API key is configured
 */
export function hasGeminiApiKey(): boolean {
  try {
    const apiKey = GEMINI_API_KEY.value();
    if (apiKey) {
      return true;
    }
  } catch {
    // Fallback to environment variable for local development
    const envApiKey = process.env.GEMINI_API_KEY;
    if (envApiKey) {
      return true;
    }
  }
  return false;
}

/**
 * Define the NCBI_API_KEY as a secret
 * This will be stored securely in Firebase and not exposed in source code
 * 
 * To set this secret, run:
 * firebase functions:secrets:set NCBI_API_KEY
 */
export const NCBI_API_KEY = defineSecret('NCBI_API_KEY');

/**
 * Get the NCBI API key value
 * This should only be called within a function context
 * @returns The API key value
 */
export function getNcbiApiKey(): string {
  try {
    const apiKey = NCBI_API_KEY.value();
    if (!apiKey) {
      // Fallback to provided key
      return 'f464d80f2ee5a8a3fb546654fed9b213a308';
    }
    return apiKey;
  } catch {
    // Return the provided key as fallback
    return 'f464d80f2ee5a8a3fb546654fed9b213a308';
  }
}

/**
 * Check if NCBI API key is available
 * @returns true if API key is configured
 */
export function hasNcbiApiKey(): boolean {
  return true; // Always return true since we have a fallback key
}

/**
 * Configuration object for the application
 */
export const config = {
  gemini: {
    model: 'gemini-2.5-pro', // Default model for complex tasks
    proModel: 'gemini-2.5-pro', // For complex tasks
    flashModel: 'gemini-2.5-flash', // For simple tasks and fallback
    getApiKey: getGeminiApiKey,
    hasApiKey: hasGeminiApiKey
  },
  ncbi: {
    getApiKey: getNcbiApiKey,
    hasApiKey: hasNcbiApiKey,
    baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
  },
  generation: {
    useFlashForDraft: true,
    useFlashForReview: true,
    disableKBContext: true
  },
  scoring: {
    useProForFinal: true
  },
  logs: {
    enableStreaming: false
  }
};
