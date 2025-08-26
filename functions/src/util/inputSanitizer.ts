/**
 * Input Sanitization Layer for AI Pipeline
 * 
 * Provides comprehensive input validation and sanitization to prevent:
 * - Prompt injection attacks
 * - Malformed input that could crash parsers
 * - Excessive resource consumption
 * - XSS and other security vulnerabilities
 */

import { logError, logInfo } from './logging';

// Maximum allowed lengths for various input types
const MAX_LENGTHS = {
  topic: 200,
  entityName: 100,
  description: 5000,
  stem: 2000,
  leadIn: 500,
  optionText: 500,
  explanation: 5000,
  prompt: 10000,
  difficulty: 50
};

// Dangerous patterns that could indicate prompt injection
const DANGEROUS_PATTERNS = [
  /\bignore\s+(all\s+)?previous\s+(instructions|prompts?)\b/gi,
  /\bsystem\s*:\s*/gi,
  /\b(forget|disregard)\s+everything\b/gi,
  /\bnew\s+instructions?\s*:/gi,
  /\boverride\s+(system\s+)?prompts?\b/gi,
  /\b(admin|root)\s+access\b/gi,
  /<script[\s>]/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // Event handlers like onclick=
  /<iframe/gi,
  /\beval\s*\(/gi,
  /\bexec\s*\(/gi
];

// Valid difficulty levels
const VALID_DIFFICULTIES = ['Basic', 'Advanced', 'Very Difficult'];

export interface SanitizationResult<T> {
  success: boolean;
  sanitized?: T;
  errors: string[];
  warnings: string[];
}

/**
 * Sanitize a string input by removing dangerous patterns and enforcing length limits
 */
export function sanitizeString(
  input: unknown,
  fieldName: string,
  maxLength?: number
): SanitizationResult<string> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Type validation
  if (typeof input !== 'string') {
    errors.push(`${fieldName} must be a string, got ${typeof input}`);
    return { success: false, errors, warnings };
  }
  
  let sanitized = input.trim();
  
  // Check for empty input
  if (!sanitized) {
    errors.push(`${fieldName} cannot be empty`);
    return { success: false, errors, warnings };
  }
  
  // Check length
  const limit = maxLength || MAX_LENGTHS[fieldName as keyof typeof MAX_LENGTHS] || 10000;
  if (sanitized.length > limit) {
    warnings.push(`${fieldName} truncated from ${sanitized.length} to ${limit} characters`);
    sanitized = sanitized.substring(0, limit);
  }
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sanitized)) {
      const match = sanitized.match(pattern);
      warnings.push(`Potentially dangerous pattern detected in ${fieldName}: "${match?.[0]}"`);
      // Remove the dangerous pattern
      sanitized = sanitized.replace(pattern, '');
    }
  }
  
  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return {
    success: true,
    sanitized,
    errors,
    warnings
  };
}

/**
 * Sanitize topic input for question generation
 */
export function sanitizeTopic(topic: unknown): SanitizationResult<string> {
  const result = sanitizeString(topic, 'topic', MAX_LENGTHS.topic);
  
  if (result.success && result.sanitized) {
    // Additional topic-specific validation
    // Topics should be medical/dermatological terms
    if (!/^[a-zA-Z0-9\s\-.,()]+$/.test(result.sanitized)) {
      result.warnings.push('Topic contains special characters that may affect search results');
    }
  }
  
  return result;
}

/**
 * Sanitize difficulty level input
 */
export function sanitizeDifficulty(difficulty: unknown): SanitizationResult<string> {
  const result = sanitizeString(difficulty, 'difficulty', MAX_LENGTHS.difficulty);
  
  if (result.success && result.sanitized) {
    // Normalize difficulty to valid values
    const normalized = result.sanitized
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    if (!VALID_DIFFICULTIES.includes(normalized)) {
      result.errors.push(`Invalid difficulty level: ${normalized}. Must be one of: ${VALID_DIFFICULTIES.join(', ')}`);
      result.success = false;
    } else {
      result.sanitized = normalized;
    }
  }
  
  return result;
}

/**
 * Sanitize an MCQ object
 */
export function sanitizeMCQ(mcq: any): SanitizationResult<any> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized: any = {};
  
  // Sanitize stem
  const stemResult = sanitizeString(mcq.stem, 'stem', MAX_LENGTHS.stem);
  if (!stemResult.success) {
    errors.push(...stemResult.errors);
  } else {
    sanitized.stem = stemResult.sanitized;
    warnings.push(...stemResult.warnings);
  }
  
  // Sanitize leadIn
  const leadInResult = sanitizeString(mcq.leadIn, 'leadIn', MAX_LENGTHS.leadIn);
  if (!leadInResult.success) {
    errors.push(...leadInResult.errors);
  } else {
    sanitized.leadIn = leadInResult.sanitized;
    warnings.push(...leadInResult.warnings);
  }
  
  // Sanitize options
  if (!Array.isArray(mcq.options)) {
    errors.push('Options must be an array');
  } else {
    sanitized.options = [];
    for (let i = 0; i < mcq.options.length; i++) {
      const option = mcq.options[i];
      const text = typeof option === 'string' ? option : option?.text;
      const optionResult = sanitizeString(text, `option[${i}]`, MAX_LENGTHS.optionText);
      
      if (!optionResult.success) {
        errors.push(...optionResult.errors);
      } else {
        sanitized.options.push({ text: optionResult.sanitized });
        warnings.push(...optionResult.warnings);
      }
    }
    
    // Validate option count (should be 4 or 5)
    if (sanitized.options.length < 4) {
      errors.push(`MCQ must have at least 4 options, got ${sanitized.options.length}`);
    } else if (sanitized.options.length > 5) {
      warnings.push(`MCQ has ${sanitized.options.length} options, truncating to 5`);
      sanitized.options = sanitized.options.slice(0, 5);
    }
  }
  
  // Sanitize explanation
  const explanationResult = sanitizeString(mcq.explanation, 'explanation', MAX_LENGTHS.explanation);
  if (!explanationResult.success) {
    errors.push(...explanationResult.errors);
  } else {
    sanitized.explanation = explanationResult.sanitized;
    warnings.push(...explanationResult.warnings);
  }
  
  // Validate keyIndex
  if (typeof mcq.keyIndex !== 'number') {
    errors.push('keyIndex must be a number');
  } else if (mcq.keyIndex < 0 || mcq.keyIndex >= (sanitized.options?.length || 0)) {
    errors.push(`keyIndex ${mcq.keyIndex} is out of range for ${sanitized.options?.length || 0} options`);
  } else {
    sanitized.keyIndex = mcq.keyIndex;
  }
  
  // Log any warnings
  if (warnings.length > 0) {
    logInfo('MCQ sanitization warnings', { warnings });
  }
  
  return {
    success: errors.length === 0,
    sanitized: errors.length === 0 ? sanitized : undefined,
    errors,
    warnings
  };
}

/**
 * Sanitize prompt input for AI generation
 */
export function sanitizePrompt(prompt: unknown): SanitizationResult<string> {
  const result = sanitizeString(prompt, 'prompt', MAX_LENGTHS.prompt);
  
  if (result.success && result.sanitized) {
    // Check for attempts to escape the prompt context
    const escapePatterns = [
      /\[\/INST\]/gi,
      /\[INST\]/gi,
      /<\|im_end\|>/gi,
      /<\|im_start\|>/gi,
      /###\s*Human:/gi,
      /###\s*Assistant:/gi
    ];
    
    for (const pattern of escapePatterns) {
      if (pattern.test(result.sanitized)) {
        result.warnings.push('Prompt escape attempt detected and neutralized');
        result.sanitized = result.sanitized.replace(pattern, '');
      }
    }
  }
  
  return result;
}

/**
 * Sanitize array of difficulties
 */
export function sanitizeDifficulties(difficulties: unknown): SanitizationResult<string[]> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized: string[] = [];
  
  if (!Array.isArray(difficulties)) {
    errors.push('Difficulties must be an array');
    return { success: false, errors, warnings };
  }
  
  for (const difficulty of difficulties) {
    const result = sanitizeDifficulty(difficulty);
    if (result.success && result.sanitized) {
      sanitized.push(result.sanitized);
      warnings.push(...result.warnings);
    } else {
      errors.push(...result.errors);
    }
  }
  
  if (sanitized.length === 0 && errors.length === 0) {
    errors.push('At least one valid difficulty must be provided');
  }
  
  return {
    success: errors.length === 0,
    sanitized: errors.length === 0 ? sanitized : undefined,
    errors,
    warnings
  };
}

/**
 * Main sanitization function for orchestrator input
 */
export function sanitizeOrchestratorInput(input: any): SanitizationResult<any> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sanitized: any = {};
  
  // Sanitize topic
  const topicResult = sanitizeTopic(input.topic);
  if (!topicResult.success) {
    errors.push(...topicResult.errors);
  } else {
    sanitized.topic = topicResult.sanitized;
    warnings.push(...topicResult.warnings);
  }
  
  // Sanitize difficulties
  if (input.difficulties) {
    const difficultiesResult = sanitizeDifficulties(input.difficulties);
    if (!difficultiesResult.success) {
      errors.push(...difficultiesResult.errors);
    } else {
      sanitized.difficulties = difficultiesResult.sanitized;
      warnings.push(...difficultiesResult.warnings);
    }
  }
  
  // Pass through other safe parameters
  const safeParams = ['enableCaching', 'useStreaming', 'userId', 'enableProgress'];
  for (const param of safeParams) {
    if (param in input) {
      sanitized[param] = input[param];
    }
  }
  
  // Log sanitization results
  if (errors.length > 0) {
    logError('Input sanitization failed', { errors, input });
  } else if (warnings.length > 0) {
    logInfo('Input sanitized with warnings', { warnings });
  }
  
  return {
    success: errors.length === 0,
    sanitized: errors.length === 0 ? sanitized : undefined,
    errors,
    warnings
  };
}