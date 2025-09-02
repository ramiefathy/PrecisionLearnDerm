/**
 * Enhanced Question Quality Scorer
 * Evaluates questions on multiple dimensions for board-style similarity
 */

import * as logger from 'firebase-functions/logger';

export interface DetailedQualityScore {
  overall: number; // 0-100 overall percentage score
  dimensions: {
    boardStyleSimilarity: number; // 0-100 How similar to actual board questions
    medicalAccuracy: number; // 0-100 Clinical accuracy and terminology
    clinicalDetail: number; // 0-100 Appropriate level of clinical detail
    distractorQuality: number; // 0-100 Quality of incorrect options
    explanationQuality: number; // 0-100 Educational value of explanation
    complexity: number; // 0-100 Appropriate difficulty level
  };
  feedback: {
    strengths: string[];
    weaknesses: string[];
    boardStyleNotes: string;
  };
  metadata: {
    stemWordCount: number;
    explanationWordCount: number;
    hasClinicalVignette: boolean;
    hasLabValues: boolean;
    hasImageDescription: boolean;
    questionType: 'recall' | 'application' | 'analysis';
  };
}

/**
 * Calculate detailed quality scores for a generated MCQ
 */
export function calculateDetailedQualityScore(mcq: any): DetailedQualityScore {
  const scores = {
    boardStyleSimilarity: 0,
    medicalAccuracy: 0,
    clinicalDetail: 0,
    distractorQuality: 0,
    explanationQuality: 0,
    complexity: 0
  };
  
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  
  // Extract text for analysis
  const stem = mcq.stem || '';
  const explanation = mcq.explanation || '';
  
  // Convert options to array format if needed
  let options: string[] = [];
  if (Array.isArray(mcq.options)) {
    options = mcq.options;
  } else if (mcq.options && typeof mcq.options === 'object') {
    // Convert {A: "...", B: "...", C: "...", D: "..."} to array
    options = Object.values(mcq.options).filter(opt => typeof opt === 'string');
  }
  
  // Calculate metadata
  const stemWordCount = stem.split(/\s+/).length;
  const explanationWordCount = explanation.split(/\s+/).length;
  
  // 1. Board-Style Similarity Score (0-10)
  scores.boardStyleSimilarity = evaluateBoardStyleSimilarity(mcq, stemWordCount);
  
  // 2. Medical Accuracy Score (0-10)
  scores.medicalAccuracy = evaluateMedicalAccuracy(mcq);
  
  // 3. Clinical Detail Score (0-10)
  scores.clinicalDetail = evaluateClinicalDetail(mcq, stemWordCount);
  
  // 4. Distractor Quality Score (0-10)
  scores.distractorQuality = evaluateDistractorQuality(options, mcq.correctAnswer);
  
  // 5. Explanation Quality Score (0-10)
  scores.explanationQuality = evaluateExplanationQuality(explanation, explanationWordCount, options);
  
  // 6. Complexity Score (0-10)
  scores.complexity = evaluateComplexity(mcq, stemWordCount);
  
  // Generate feedback (thresholds updated for 0-100 scale)
  if (scores.boardStyleSimilarity >= 80) {
    strengths.push('Excellent board-style format and presentation');
  } else if (scores.boardStyleSimilarity < 50) {
    weaknesses.push('Question format differs from typical board style');
  }
  
  if (scores.medicalAccuracy >= 80) {
    strengths.push('Strong medical terminology and accuracy');
  } else if (scores.medicalAccuracy < 50) {
    weaknesses.push('Medical terminology could be more precise');
  }
  
  if (scores.clinicalDetail >= 80) {
    strengths.push('Appropriate level of clinical detail');
  } else if (scores.clinicalDetail < 50) {
    weaknesses.push('Clinical detail insufficient for board-level assessment');
  }
  
  if (scores.distractorQuality >= 80) {
    strengths.push('High-quality distractors that test knowledge effectively');
  } else if (scores.distractorQuality < 50) {
    weaknesses.push('Distractors could be more plausible');
  }
  
  // Calculate overall score (weighted average) - already in 0-100 scale
  const overall = (
    scores.boardStyleSimilarity * 0.25 + // 25% weight
    scores.medicalAccuracy * 0.20 +      // 20% weight
    scores.clinicalDetail * 0.20 +       // 20% weight
    scores.distractorQuality * 0.15 +    // 15% weight
    scores.explanationQuality * 0.10 +   // 10% weight
    scores.complexity * 0.10             // 10% weight
  );
  
  // Determine question type
  const questionType = determineQuestionType(stem);
  
  // Check for special features
  const hasClinicalVignette = checkForClinicalVignette(stem);
  const hasLabValues = checkForLabValues(stem);
  const hasImageDescription = checkForImageDescription(stem);
  
  const boardStyleNotes = generateBoardStyleNotes(
    hasClinicalVignette,
    hasLabValues,
    stemWordCount,
    questionType
  );
  
  return {
    overall: Math.round(overall), // Round to nearest integer (0-100)
    dimensions: scores,
    feedback: {
      strengths,
      weaknesses,
      boardStyleNotes
    },
    metadata: {
      stemWordCount,
      explanationWordCount,
      hasClinicalVignette,
      hasLabValues,
      hasImageDescription,
      questionType
    }
  };
}

/**
 * Evaluate how similar the question is to actual board exam questions
 * Returns a percentage score (0-100)
 */
function evaluateBoardStyleSimilarity(mcq: any, stemWordCount: number): number {
  let score = 0;
  const stem = mcq.stem || '';
  
  // Ideal stem length for board questions (100-250 words)
  if (stemWordCount >= 100 && stemWordCount <= 250) {
    score += 2;
  } else if (stemWordCount >= 50 && stemWordCount < 100) {
    score += 1;
  } else if (stemWordCount > 250 && stemWordCount <= 350) {
    score += 1;
  }
  
  // Check for clinical vignette format
  const hasAge = /\d+[-\s]?(year|month|week|day)[-\s]?old/i.test(stem);
  const hasGender = /(male|female|man|woman|boy|girl)/i.test(stem);
  const hasPresentation = /(presents|complains?|reports?|develops?|notices?)/i.test(stem);
  
  if (hasAge) score += 1;
  if (hasGender) score += 1;
  if (hasPresentation) score += 2;
  
  // Check for temporal elements (important in board questions)
  const hasTimeline = /(\d+\s*(hours?|days?|weeks?|months?|years?)\s*(ago|prior|before|after|later))/i.test(stem);
  if (hasTimeline) score += 1;
  
  // Check for physical exam findings
  const hasPhysicalExam = /(examination|exam|reveals?|shows?|demonstrates?|noted)/i.test(stem);
  if (hasPhysicalExam) score += 1;
  
  // Check for proper question format
  const hasProperQuestion = stem.endsWith('?') || 
    /Which of the following|What is the (most likely|best|next|appropriate)/i.test(stem);
  if (hasProperQuestion) score += 1;
  
  // Convert to percentage (0-100)
  return Math.min(100, score * 10);
}

/**
 * Evaluate medical accuracy and terminology usage
 * Returns a percentage score (0-100)
 */
function evaluateMedicalAccuracy(mcq: any): number {
  let score = 5; // Start with baseline
  const text = `${mcq.stem} ${mcq.explanation}`.toLowerCase();
  
  // Check for proper medical terminology
  const medicalTerms = [
    'diagnosis', 'pathophysiology', 'etiology', 'prognosis',
    'differential', 'manifestation', 'syndrome', 'pathognomonic',
    'biopsy', 'histopathology', 'immunofluorescence', 'serology',
    'dermatoscopy', 'morphology', 'distribution', 'configuration'
  ];
  
  const termCount = medicalTerms.filter(term => text.includes(term)).length;
  score += Math.min(3, termCount * 0.5);
  
  // Check for specific dermatology terminology
  const dermTerms = [
    'papule', 'macule', 'vesicle', 'bulla', 'pustule', 'nodule',
    'plaque', 'erosion', 'ulcer', 'scale', 'crust', 'lichenification',
    'erythema', 'purpura', 'petechiae', 'telangiectasia'
  ];
  
  const dermTermCount = dermTerms.filter(term => text.includes(term)).length;
  score += Math.min(2, dermTermCount * 0.5);
  
  // Convert to percentage (0-100)
  return Math.min(100, score * 10);
}

/**
 * Evaluate the level of clinical detail
 * Returns a percentage score (0-100)
 */
function evaluateClinicalDetail(mcq: any, stemWordCount: number): number {
  let score = 0;
  const stem = mcq.stem || '';
  
  // Check for patient demographics
  if (/\d+[-\s]?(year|month)[-\s]?old/i.test(stem)) score += 1;
  if (/(male|female|man|woman)/i.test(stem)) score += 0.5;
  if (/(African American|Caucasian|Asian|Hispanic|ethnicity)/i.test(stem)) score += 0.5;
  
  // Check for history elements
  if (/(history of|past medical|PMH|previously diagnosed)/i.test(stem)) score += 1;
  if (/(medications?|drugs?|therapy|treatment)/i.test(stem)) score += 1;
  if (/(allergies|family history|social history|occupation)/i.test(stem)) score += 0.5;
  
  // Check for symptom description
  if (/(duration|onset|progressive|acute|chronic|intermittent)/i.test(stem)) score += 1;
  if (/(location|distribution|bilateral|unilateral|symmetric)/i.test(stem)) score += 1;
  if (/(quality|character|sharp|dull|burning|itching|painful)/i.test(stem)) score += 1;
  
  // Check for physical exam details
  if (/(size|diameter|cm|mm|measurement)/i.test(stem)) score += 1;
  if (/(color|erythematous|hyperpigmented|violaceous|pearly)/i.test(stem)) score += 1;
  if (/(texture|smooth|rough|scaly|indurated)/i.test(stem)) score += 0.5;
  
  // Convert to percentage (0-100)
  return Math.min(100, score * 10);
}

/**
 * Evaluate the quality of distractors (incorrect options)
 * Returns a percentage score (0-100)
 */
function evaluateDistractorQuality(options: string[], correctAnswer: string): number {
  if (!options || !Array.isArray(options) || options.length !== 5) return 0;
  
  let score = 2; // Base score for having exactly 5 options (ABD format)
  
  // Check length consistency
  const lengths = options.filter(opt => typeof opt === 'string').map(opt => opt.length);
  if (lengths.length > 0) {
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const lengthVariance = lengths.reduce((sum, len) => sum + Math.abs(len - avgLength), 0) / lengths.length;
    
    if (lengthVariance < avgLength * 0.5) score += 2; // Similar lengths
  }
  
  // Check for unique options
  const uniqueOptions = new Set(
    options.filter(opt => typeof opt === 'string').map(opt => opt.toLowerCase().trim())
  );
  if (uniqueOptions.size === options.length) score += 2; // All options are unique
  
  // Check for plausible distractors (not obviously wrong)
  const hasNoObviousWrong = !options.some(opt => 
    typeof opt === 'string' && 
    /^(none|all|both|neither)/i.test(opt) && 
    options.filter(o => 
      typeof o === 'string' && /^(none|all|both|neither)/i.test(o)
    ).length === 1
  );
  if (hasNoObviousWrong) score += 2;
  
  // Check for appropriate complexity
  const hasDetailedOptions = options.every(opt => typeof opt === 'string' && opt.length > 10);
  if (hasDetailedOptions) score += 2;
  
  // Convert to percentage (0-100)
  return Math.min(100, score * 10);
}

/**
 * Evaluate the quality of the explanation
 * Returns a percentage score (0-100)
 */
function evaluateExplanationQuality(
  explanation: string, 
  wordCount: number,
  options: string[]
): number {
  if (!explanation) return 0;
  
  let score = 2; // Base score for having an explanation
  
  // Check length (ideal: 150-400 words)
  if (wordCount >= 150 && wordCount <= 400) {
    score += 2;
  } else if (wordCount >= 100 && wordCount < 150) {
    score += 1;
  } else if (wordCount > 400 && wordCount <= 500) {
    score += 1;
  }
  
  // Check if explanation addresses why correct answer is right
  if (/correct|accurate|best|appropriate/i.test(explanation)) score += 1;
  
  // Check if explanation addresses why distractors are wrong
  const discussesOptions = Array.isArray(options) ? 
    options.filter(opt => 
      typeof opt === 'string' && (
        explanation.includes(opt.substring(0, Math.min(20, opt.length))) || 
        /incorrect|wrong|not|wouldn't/i.test(explanation)
      )
    ).length : 0;
  score += Math.min(2, discussesOptions * 0.5);
  
  // Check for educational content
  if (/pathophysiology|mechanism|etiology|epidemiology/i.test(explanation)) score += 1;
  if (/guidelines?|criteria|classification/i.test(explanation)) score += 1;
  if (/differential|distinguish|compared?/i.test(explanation)) score += 1;
  
  // Convert to percentage (0-100)
  return Math.min(100, score * 10);
}

/**
 * Evaluate question complexity and difficulty appropriateness
 * Returns a percentage score (0-100)
 */
function evaluateComplexity(mcq: any, stemWordCount: number): number {
  const stem = mcq.stem || '';
  let score = 5; // Start with medium complexity
  
  // Adjust based on cognitive level required
  if (/which.*most likely diagnosis/i.test(stem)) {
    score += 1; // Application level
  }
  if (/what is the (best|most appropriate) next step/i.test(stem)) {
    score += 2; // Analysis level
  }
  if (/which.*mechanism|pathophysiology/i.test(stem)) {
    score += 1; // Understanding level
  }
  
  // Check for multi-step reasoning
  if (stemWordCount > 150 && /however|but|despite|although/i.test(stem)) {
    score += 1;
  }
  
  // Penalize if too simple or too complex
  if (stemWordCount < 50) score -= 2; // Too simple
  if (stemWordCount > 400) score -= 1; // Too complex
  
  // Convert to percentage (0-100)
  return Math.min(100, Math.max(0, score * 10));
}

/**
 * Determine the cognitive level of the question
 */
function determineQuestionType(stem: string): 'recall' | 'application' | 'analysis' {
  if (/what is the (mechanism|definition|classification)/i.test(stem)) {
    return 'recall';
  }
  if (/next step|best treatment|most appropriate/i.test(stem)) {
    return 'analysis';
  }
  return 'application';
}

/**
 * Check if stem contains a clinical vignette
 */
function checkForClinicalVignette(stem: string): boolean {
  const hasPatient = /patient|man|woman|boy|girl|infant|child/i.test(stem);
  const hasPresentation = /presents?|comes?|brought|admitted/i.test(stem);
  const hasSymptoms = /complains?|reports?|symptoms?|signs?/i.test(stem);
  
  return hasPatient && hasPresentation && hasSymptoms;
}

/**
 * Check if stem contains lab values
 */
function checkForLabValues(stem: string): boolean {
  return /\d+\s*(mg|μg|ng|pg|mL|dL|L|IU|U|mmol|μmol|nmol|%)/i.test(stem);
}

/**
 * Check if stem describes an image
 */
function checkForImageDescription(stem: string): boolean {
  return /(photograph|image|figure|shown|depicted|microscopy|histopathology)/i.test(stem);
}

/**
 * Generate notes about board-style adherence
 */
function generateBoardStyleNotes(
  hasClinicalVignette: boolean,
  hasLabValues: boolean,
  stemWordCount: number,
  questionType: string
): string {
  const notes: string[] = [];
  
  if (hasClinicalVignette) {
    notes.push('✓ Contains clinical vignette');
  } else {
    notes.push('⚠ Missing clinical vignette format');
  }
  
  if (stemWordCount >= 100 && stemWordCount <= 250) {
    notes.push('✓ Ideal stem length for board exam');
  } else if (stemWordCount < 50) {
    notes.push('⚠ Stem too brief for board style');
  } else if (stemWordCount > 350) {
    notes.push('⚠ Stem longer than typical board question');
  }
  
  if (questionType === 'analysis') {
    notes.push('✓ Tests higher-order thinking');
  } else if (questionType === 'recall') {
    notes.push('⚠ Tests only factual recall');
  }
  
  if (hasLabValues) {
    notes.push('✓ Includes quantitative data');
  }
  
  return notes.join('; ');
}