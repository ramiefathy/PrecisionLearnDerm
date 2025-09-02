/**
 * Structured Text Parser Utility
 * Handles parsing of structured text responses from Gemini API
 * Replaces JSON mode to avoid truncation issues at 4086 characters
 */

import * as logger from 'firebase-functions/logger';

/**
 * MCQ structure for parsed questions
 */
export interface ParsedMCQ {
  stem: string;
  leadIn?: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string; // E is required for ABD format
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation: string;
  keyConcept?: string;
  clinicalPearls?: string[];
  difficulty?: string;
  topic?: string;
}

/**
 * Parse structured text response into MCQ object
 * Handles various formatting variations and edge cases
 */
export function parseStructuredMCQResponse(text: string): ParsedMCQ | null {
  try {
    // Normalize line endings and trim
    const normalizedText = text.replace(/\r\n/g, '\n').trim();
    
    // Initialize result object
    const result: Partial<ParsedMCQ> = {
      options: {} as any
    };
    
    // Extract STEM section - supports both old format and new === format
    const stemMatch = normalizedText.match(/(?:===\s*STEM\s*===|STEM:)\s*\n([\s\S]*?)(?=\n===\s*(?:LEAD[_-]?IN|OPTIONS|QUESTION)\s*===|\n(?:LEAD[_-]?IN|OPTIONS|QUESTION):|$)/i);
    if (stemMatch) {
      result.stem = stemMatch[1].trim();
    }
    
    // Extract LEAD-IN or QUESTION section separately - supports both formats
    const leadInMatch = normalizedText.match(/(?:===\s*LEAD[_-]?IN\s*===|LEAD[_-]?IN:|QUESTION:)\s*\n([\s\S]*?)(?=\n===\s*OPTIONS\s*===|\nOPTIONS:|\nCHOICES:|$)/i);
    if (leadInMatch) {
      result.leadIn = leadInMatch[1].trim();
    }
    
    // Extract OPTIONS section with multiple format support
    const optionsMatch = normalizedText.match(/(?:===\s*OPTIONS\s*===|OPTIONS:|CHOICES:)\s*\n([\s\S]*?)(?=\n===\s*CORRECT[_ ]?ANSWER\s*===|\nCORRECT[_ ]?ANSWER:|\nANSWER:|$)/i);
    if (optionsMatch) {
      const optionsText = optionsMatch[1];
      
      // Parse individual options (supports A), A., or A:)
      const optionPatterns = [
        /^([A-E])[).:]\s*(.+)$/gm,  // Matches A) text, A. text, A: text
        /^([A-E])\s+(.+)$/gm         // Matches A text (space separator)
      ];
      
      for (const pattern of optionPatterns) {
        let match;
        const tempOptions: any = {};
        let matchCount = 0;
        
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(optionsText)) !== null) {
          const letter = match[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
          const optionText = match[2].trim();
          tempOptions[letter] = optionText;
          matchCount++;
        }
        
        // Accept if we found at least 4 options
        if (matchCount >= 4) {
          result.options = tempOptions;
          break;
        }
      }
    }
    
    // Extract CORRECT_ANSWER section - supports both formats
    const answerMatch = normalizedText.match(/(?:===\s*CORRECT[_ ]?ANSWER\s*===|CORRECT[_ ]?ANSWER:|ANSWER:|KEY:)\s*\n?([A-E])/i);
    if (answerMatch) {
      result.correctAnswer = answerMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
    }
    
    // Extract EXPLANATION section
    const explanationMatch = normalizedText.match(/(?:===\s*EXPLANATION\s*===|EXPLANATION:)\s*\n([\s\S]*?)(?=\n(?:===|KEY[_ ]?CONCEPT|CLINICAL[_ ]?PEARLS|DIFFICULTY|TOPIC):|$)/i);
    if (explanationMatch) {
      result.explanation = explanationMatch[1].trim();
    }
    
    // Extract optional KEY_CONCEPT
    const keyConceptMatch = normalizedText.match(/(?:===\s*KEY[_ ]?CONCEPT\s*===|KEY[_ ]?CONCEPT:)\s*\n?(.*?)(?=\n(?:===|CLINICAL[_ ]?PEARLS|DIFFICULTY|TOPIC):|$)/i);
    if (keyConceptMatch) {
      result.keyConcept = keyConceptMatch[1].trim();
    }
    
    // Extract optional CLINICAL_PEARLS
    const pearlsMatch = normalizedText.match(/(?:===\s*CLINICAL[_ ]?PEARLS\s*===|CLINICAL[_ ]?PEARLS:)\s*\n([\s\S]*?)(?=\n(?:===|DIFFICULTY|TOPIC):|$)/i);
    if (pearlsMatch) {
      const pearlsText = pearlsMatch[1].trim();
      // Split by bullet points, numbers, or new lines
      result.clinicalPearls = pearlsText
        .split(/[\n•\-*]/)
        .map(pearl => pearl.replace(/^\d+[.)]\s*/, '').trim())
        .filter(pearl => pearl.length > 0);
    }
    
    // Extract optional DIFFICULTY
    const difficultyMatch = normalizedText.match(/(?:===\s*DIFFICULTY\s*===|DIFFICULTY:)\s*\n?(.*?)(?=\n(?:===|TOPIC):|$)/i);
    if (difficultyMatch) {
      result.difficulty = difficultyMatch[1].trim();
    }
    
    // Extract optional TOPIC
    const topicMatch = normalizedText.match(/(?:===\s*TOPIC\s*===|TOPIC:)\s*\n?(.*?)$/i);
    if (topicMatch) {
      result.topic = topicMatch[1].trim();
    }
    
    // Validate required fields
    if (!result.stem || !result.correctAnswer || !result.explanation) {
      logger.warn('[PARSER] Missing required fields', {
        hasStem: !!result.stem,
        hasAnswer: !!result.correctAnswer,
        hasExplanation: !!result.explanation,
        hasOptions: Object.keys(result.options || {}).length
      });
      return null;
    }
    
    // Validate options (exactly 5 required for ABD format)
    const optionKeys = Object.keys(result.options || {});
    if (optionKeys.length !== 5 || !['A', 'B', 'C', 'D', 'E'].every(key => key in result.options!)) {
      logger.warn('[PARSER] Invalid options - ABD format requires exactly 5 options (A-E)', {
        foundOptions: optionKeys,
        count: optionKeys.length,
        missingOptions: ['A', 'B', 'C', 'D', 'E'].filter(key => !(key in (result.options || {})))
      });
      return null;
    }
    
    // Validate correct answer is in options
    if (!result.options || !result.options[result.correctAnswer]) {
      logger.warn('[PARSER] Correct answer not in options', {
        correctAnswer: result.correctAnswer,
        availableOptions: optionKeys
      });
      return null;
    }
    
    return result as ParsedMCQ;
    
  } catch (error) {
    logger.error('[PARSER] Failed to parse structured text', {
      error: error instanceof Error ? error.message : String(error),
      textLength: text?.length || 0,
      textPreview: text?.substring(0, 200)
    });
    return null;
  }
}

/**
 * Parse batch response containing multiple MCQs
 * Handles difficulty-separated sections
 */
export function parseBatchStructuredResponse(text: string): {
  Basic?: ParsedMCQ;
  Advanced?: ParsedMCQ;
  'Very Difficult'?: ParsedMCQ;
} {
  const result: any = {};
  
  // Split by difficulty markers
  const difficulties = ['Basic', 'Advanced', 'Very Difficult'];
  
  for (const difficulty of difficulties) {
    // Look for section markers like "=== Basic ===" or "### Basic ###"
    const sectionPattern = new RegExp(
      `(?:={3,}|#{3,}|\\*{3,})?\\s*${difficulty}\\s*(?:={3,}|#{3,}|\\*{3,})?\\s*\\n([\\s\\S]*?)(?=(?:={3,}|#{3,}|\\*{3,})?\\s*(?:${difficulties.join('|')})\\s*(?:={3,}|#{3,}|\\*{3,})?|$)`,
      'i'
    );
    
    const match = text.match(sectionPattern);
    if (match) {
      const sectionText = match[1];
      const parsed = parseStructuredMCQResponse(sectionText);
      if (parsed) {
        result[difficulty] = parsed;
        logger.info(`[PARSER] Successfully parsed ${difficulty} question`);
      } else {
        logger.warn(`[PARSER] Failed to parse ${difficulty} section`);
      }
    }
  }
  
  // If no difficulty sections found, try to parse as single MCQ
  if (Object.keys(result).length === 0) {
    const singleMCQ = parseStructuredMCQResponse(text);
    if (singleMCQ) {
      // Infer difficulty from content or default to Basic
      const inferredDifficulty = singleMCQ.difficulty || 'Basic';
      result[inferredDifficulty] = singleMCQ;
    }
  }
  
  return result;
}

/**
 * Convert structured text MCQ to legacy format for backward compatibility
 * Handles both object-based and array-based option formats
 */
export function convertToLegacyFormat(parsed: ParsedMCQ, useArrayFormat: boolean = false): any {
  // Convert letter-based correct answer to index (A=0, B=1, etc.)
  const answerIndex = parsed.correctAnswer.charCodeAt(0) - 65;
  
  if (useArrayFormat) {
    // Convert to array-based format (used by some components)
    const optionsArray = [
      parsed.options.A,
      parsed.options.B,
      parsed.options.C,
      parsed.options.D,
      parsed.options.E
    ].filter(opt => opt !== undefined && opt !== '');
    
    return {
      stem: parsed.stem,
      leadIn: parsed.leadIn || '', // Use parsed lead-in if available
      options: optionsArray,
      correctAnswer: answerIndex,
      explanation: parsed.explanation,
      keyConcept: parsed.keyConcept || '',
      clinicalPearls: parsed.clinicalPearls || [],
      difficulty: parsed.difficulty || 'medium',
      topic: parsed.topic || ''
    };
  } else {
    // Keep object-based format (used by other components)
    return {
      stem: parsed.stem,
      leadIn: parsed.leadIn || '', // Use parsed lead-in if available
      options: parsed.options,
      correctAnswer: parsed.correctAnswer, // Keep as letter
      explanation: parsed.explanation,
      keyConcept: parsed.keyConcept || '',
      clinicalPearls: parsed.clinicalPearls || [],
      difficulty: parsed.difficulty || 'medium',
      topic: parsed.topic || ''
    };
  }
}

/**
 * Validate MCQ content for quality standards
 */
export function validateMCQContent(mcq: ParsedMCQ): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check stem length (should be substantial for clinical vignette)
  if (mcq.stem.length < 100) {
    issues.push('Stem too short for clinical vignette (< 100 chars)');
  }
  
  // Check option quality
  const optionValues = Object.values(mcq.options);
  const minOptionLength = Math.min(...optionValues.map(opt => opt.length));
  if (minOptionLength < 3) {
    issues.push('Options too brief (< 3 chars)');
  }
  
  // Check for duplicate options
  const uniqueOptions = new Set(optionValues);
  if (uniqueOptions.size < optionValues.length) {
    issues.push('Duplicate options detected');
  }
  
  // Check explanation quality
  if (mcq.explanation.length < 50) {
    issues.push('Explanation too brief (< 50 chars)');
  }
  
  // Check for absolute terms (common MCQ writing error)
  const absoluteTerms = ['always', 'never', 'all', 'none', 'only'];
  const optionText = optionValues.join(' ').toLowerCase();
  for (const term of absoluteTerms) {
    if (optionText.includes(term)) {
      issues.push(`Absolute term "${term}" found in options`);
      break;
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Generate structured text prompt template
 * Provides clear format instructions for Gemini
 */
export function generateStructuredPromptTemplate(): string {
  return `
MANDATORY OUTPUT FORMAT - YOU MUST FOLLOW THIS EXACTLY:

=== STEM ===
[Complete clinical vignette with patient demographics, chief complaint, history, physical exam findings, and relevant test results. DO NOT include any question here - end with clinical findings only]

=== LEAD_IN ===
[The actual question being asked. This section is ABSOLUTELY REQUIRED and MUST contain the question. Examples: "What is the most likely diagnosis?" or "Which of the following is the best next step in management?" or "Which of the following tests would be most appropriate?"]

=== OPTIONS ===
A) [First option]
B) [Second option]
C) [Third option]
D) [Fourth option]
E) [Fifth option]

=== CORRECT_ANSWER ===
[Single letter A, B, C, D, or E]

=== EXPLANATION ===
[Comprehensive explanation including why the correct answer is right and why each distractor is wrong]

=== KEY_CONCEPT ===
[Main learning point from this question]

=== CLINICAL_PEARLS ===
- [Important clinical pearl 1]
- [Important clinical pearl 2]

=== DIFFICULTY ===
[Easy, Medium, or Hard]

=== TOPIC ===
[Medical topic or condition]

CRITICAL VALIDATION CHECKLIST:
✓ STEM section contains ONLY the clinical vignette (no question)
✓ LEAD_IN section contains the actual question (NEVER skip this!)
✓ All sections use the === SECTION_NAME === format
✓ Each section appears exactly once in the order shown
✓ STEM is at least 100 characters
✓ Exactly 5 options labeled A through E

FAILURE TO INCLUDE THE LEAD_IN SECTION WILL RESULT IN REJECTION.
The LEAD_IN is where you MUST place the question like "What is the most likely diagnosis?"
`;
}