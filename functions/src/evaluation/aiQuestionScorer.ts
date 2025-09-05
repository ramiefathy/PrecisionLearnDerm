/**
 * AI-Powered Question Quality Scorer using Gemini 2.5 Pro
 * Evaluates questions against ABD board examination standards
 */

import * as logger from 'firebase-functions/logger';
import { getRobustGeminiClient } from '../util/robustGeminiClient';
import { config } from '../util/config';
// parseStructuredTextResponse not needed - we'll parse directly

export interface BoardStyleQualityScore {
  overall: number; // 0-100 percentage score
  clinicalRealism: number; // Flattened convenience fields
  medicalAccuracy: number;
  distractorQuality: number;
  cueingAbsence: number;
  coreQuality: {
    medicalAccuracy: number; // 0-100 Medical correctness and current guidelines
    clinicalRealism: number; // 0-100 Realistic board-style scenario with proper ABD format
    stemCompleteness: number; // 0-100 Answerable without seeing options
    difficultyCalibration: number; // 0-100 Appropriate for intended level
  };
  technicalQuality: {
    distractorQuality: number; // 0-100 Plausible, homogeneous incorrect options
    cueingAbsence: number; // 0-100 No overly revealing details or unintended hints
    clarity: number; // 0-100 Grammar, language clarity, technical writing quality
  };
  educationalValue: {
    clinicalRelevance: number; // 0-100 Relevant to dermatology practice
    educationalValue: number; // 0-100 Teaches important concepts, quality explanation
  };
  detailedFeedback: {
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
  };
  metadata: {
    boardReadiness: 'ready' | 'minor_revision' | 'major_revision' | 'reject';
    failureReason?: string;
  };
}

/**
 * Use Gemini 2.5 Pro to evaluate question quality against ABD standards
 */
export async function evaluateQuestionWithAI(
  mcq: any,
  pipeline: string,
  topic: string,
  difficulty: string
): Promise<BoardStyleQualityScore> {
  try {
    const client = getRobustGeminiClient({
      maxRetries: 3,
      fallbackToFlash: true, // Enable flash fallback for speed
      timeout: 120000 // Match generation timeout
    });

    const prompt = generateEvaluationPrompt(mcq, pipeline, topic, difficulty);
    
    const result = await client.generateText({
      prompt,
      operation: 'board_style_evaluation',
      preferredModel: (config.scoring.useProForFinal ? config.gemini.proModel : config.gemini.flashModel) as 'gemini-2.5-pro' | 'gemini-2.5-flash'
    });

    if (!result.text) {
      throw new Error('No evaluation response from Gemini');
    }

    // Parse the structured response
    const scores = parseEvaluationResponse(result.text);
    
    logger.info('[AI_SCORER] Question evaluated', {
      pipeline,
      topic,
      overall: scores.overall,
      boardReadiness: scores.metadata.boardReadiness
    });

    return scores;
  } catch (error) {
    logger.error('[AI_SCORER] Evaluation failed', { error });
    throw error;
  }
}

/**
 * Generate comprehensive evaluation prompt based on ABD guidelines
 */
function generateEvaluationPrompt(
  mcq: any,
  pipeline: string,
  topic: string,
  difficulty: string
): string {
  // Format the question for evaluation
  const formattedOptions = mcq.options?.map((opt: string, idx: number) => 
    `${String.fromCharCode(65 + idx)}) ${opt}`
  ).join('\n') || 'No options provided';

  // Normalize correct answer to letter form for clarity in the prompt
  const correctAnswerText = typeof mcq.correctAnswer === 'number'
    ? String.fromCharCode(65 + mcq.correctAnswer)
    : (mcq.correctAnswer || 'Not specified');

  return `You are an expert American Board of Dermatology (ABD) examination committee member with 20+ years of experience evaluating board questions. You must evaluate this dermatology MCQ against strict ABD standards using a streamlined assessment.

QUESTION METADATA:
- Pipeline: ${pipeline}
- Topic: ${topic}
- Intended Difficulty: ${difficulty}

QUESTION TO EVALUATE:
================
STEM:
${mcq.stem || 'Missing stem'}

OPTIONS:
${formattedOptions}

CORRECT ANSWER: ${correctAnswerText}

EXPLANATION:
${mcq.explanation || 'Missing explanation'}
================

STREAMLINED EVALUATION CRITERIA:

Score each dimension from 0-100 where:
- 90-100: Exceeds board standards
- 70-89: Meets board standards  
- 50-69: Approaching board standards
- 30-49: Below board standards
- 0-29: Far below board standards

CORE QUALITY (4 criteria):
1. MEDICAL_ACCURACY (0-100): Medical correctness and adherence to current guidelines/evidence
2. CLINICAL_REALISM (0-100): Realistic board-style scenario with proper ABD format (demographics, chief complaint, history, physical exam, lead-in)
3. STEM_COMPLETENESS (0-100): Can a qualified dermatologist answer correctly using ONLY the stem without seeing options?
4. DIFFICULTY_CALIBRATION (0-100): Is the difficulty appropriate for the intended level (${difficulty})?

TECHNICAL QUALITY (3 criteria):
5. DISTRACTOR_QUALITY (0-100): Are incorrect options plausible to someone with incomplete knowledge AND similar in structure, length, and detail?
6. CUEING_ABSENCE (0-100): Is the question free from overly revealing details or unintended hints that make it too easy?
7. CLARITY (0-100): Is the language clear, grammatically correct, unambiguous, and technically well-written?

EDUCATIONAL VALUE (2 criteria):
8. CLINICAL_RELEVANCE (0-100): Is this relevant to dermatology practice and scenarios dermatologists encounter?
9. EDUCATIONAL_VALUE (0-100): Does this question teach important concepts with a quality explanation?

OVERALL ASSESSMENT (1 criterion):
10. BOARD_READINESS: Overall assessment - 'ready', 'minor_revision', 'major_revision', or 'reject'

Provide specific feedback including:
- STRENGTHS: List 2-3 specific strengths
- WEAKNESSES: List 2-3 specific weaknesses with WHY they are problems
- IMPROVEMENTS: List 2-3 specific improvements needed and HOW to fix them

FORMAT YOUR RESPONSE EXACTLY AS:
===SCORES===
MEDICAL_ACCURACY: [0-100]
CLINICAL_REALISM: [0-100]
STEM_COMPLETENESS: [0-100]
DIFFICULTY_CALIBRATION: [0-100]
DISTRACTOR_QUALITY: [0-100]
CUEING_ABSENCE: [0-100]
CLARITY: [0-100]
CLINICAL_RELEVANCE: [0-100]
EDUCATIONAL_VALUE: [0-100]
BOARD_READINESS: [ready|minor_revision|major_revision|reject]

===FEEDBACK===
STRENGTHS:
- [Strength 1]
- [Strength 2]
- [Strength 3]

WEAKNESSES:
- [Weakness 1 and why it's a problem]
- [Weakness 2 and why it's a problem]
- [Weakness 3 and why it's a problem]

IMPROVEMENTS:
- [Improvement 1 and how to fix it]
- [Improvement 2 and how to fix it]
- [Improvement 3 and how to fix it]`;
}

/**
 * Parse the AI evaluation response into structured scores
 */
function parseEvaluationResponse(text: string): BoardStyleQualityScore {
  const strict = tryParseStrict(text);
  if (strict) return strict;
  const loose = tryParseLoose(text);
  if (loose) return loose;
  throw new Error('Invalid response format');
}

function tryParseStrict(text: string): BoardStyleQualityScore | null {
  const scoresMatch = text.match(/===SCORES===([\s\S]*?)===FEEDBACK===/);
  const feedbackMatch = text.match(/===FEEDBACK===([\s\S]*?)$/);
  if (!scoresMatch || !feedbackMatch) {
    return null;
  }
  const scoresText = scoresMatch[1];
  const feedbackText = feedbackMatch[1];

  const parseScore = (pattern: string): number => {
    const match = scoresText.match(new RegExp(`${pattern}:\\s*(\\d+(?:\\.\\d+)?)`));
    return match ? parseFloat(match[1]) : NaN;
  };
  const parseString = (pattern: string, textSection: string): string => {
    const match = textSection.match(new RegExp(`${pattern}:\\s*(.+)`));
    return match ? match[1].trim() : '';
  };
  const parseList = (pattern: string, textSection: string): string[] => {
    const match = textSection.match(new RegExp(`${pattern}:[\\s\\S]*?(?=\\n[A-Z]|$)`));
    if (!match) return [];
    return match[0]
      .split('\n')
      .slice(1)
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());
  };

  const coreQuality = {
    medicalAccuracy: parseScore('MEDICAL_ACCURACY'),
    clinicalRealism: parseScore('CLINICAL_REALISM'),
    stemCompleteness: parseScore('STEM_COMPLETENESS'),
    difficultyCalibration: parseScore('DIFFICULTY_CALIBRATION')
  };
  if (Object.values(coreQuality).some(isNaN)) return null;

  const technicalQuality = {
    distractorQuality: parseScore('DISTRACTOR_QUALITY'),
    cueingAbsence: parseScore('CUEING_ABSENCE'),
    clarity: parseScore('CLARITY')
  };
  if (Object.values(technicalQuality).some(isNaN)) return null;

  const educationalValue = {
    clinicalRelevance: parseScore('CLINICAL_RELEVANCE'),
    educationalValue: parseScore('EDUCATIONAL_VALUE')
  };
  if (Object.values(educationalValue).some(isNaN)) return null;

  const feedback = {
    strengths: parseList('STRENGTHS', feedbackText),
    weaknesses: parseList('WEAKNESSES', feedbackText),
    improvementSuggestions: parseList('IMPROVEMENTS', feedbackText)
  };
  const boardReadiness = parseString('BOARD_READINESS', scoresText) as any || 'minor_revision';

  return constructScore(coreQuality, technicalQuality, educationalValue, feedback, boardReadiness);
}

function tryParseLoose(text: string): BoardStyleQualityScore | null {
  const parseScore = (pattern: string): number => {
    const match = text.match(new RegExp(`${pattern}\\s*[:|-]\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
    return match ? parseFloat(match[1]) : NaN;
  };
  const parseString = (pattern: string): string => {
    const match = text.match(new RegExp(`${pattern}\\s*[:|-]\\s*(.+)`, 'i'));
    return match ? match[1].trim() : '';
  };
  const parseList = (pattern: string): string[] => {
    const match = text.match(new RegExp(`${pattern}:[\\s\\S]*?(?=\n[A-Z]|$)`, 'i'));
    if (!match) return [];
    return match[0]
      .split('\n')
      .slice(1)
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim());
  };

  const coreQuality = {
    medicalAccuracy: parseScore('MEDICAL_ACCURACY'),
    clinicalRealism: parseScore('CLINICAL_REALISM'),
    stemCompleteness: parseScore('STEM_COMPLETENESS'),
    difficultyCalibration: parseScore('DIFFICULTY_CALIBRATION')
  };
  if (Object.values(coreQuality).some(isNaN)) return null;

  const technicalQuality = {
    distractorQuality: parseScore('DISTRACTOR_QUALITY'),
    cueingAbsence: parseScore('CUEING_ABSENCE'),
    clarity: parseScore('CLARITY')
  };
  if (Object.values(technicalQuality).some(isNaN)) return null;

  const educationalValue = {
    clinicalRelevance: parseScore('CLINICAL_RELEVANCE'),
    educationalValue: parseScore('EDUCATIONAL_VALUE')
  };
  if (Object.values(educationalValue).some(isNaN)) return null;

  const feedback = {
    strengths: parseList('STRENGTHS'),
    weaknesses: parseList('WEAKNESSES'),
    improvementSuggestions: parseList('IMPROVEMENTS')
  };
  const boardReadiness = parseString('BOARD_READINESS') as any || 'minor_revision';

  return constructScore(coreQuality, technicalQuality, educationalValue, feedback, boardReadiness);
}

function constructScore(
  coreQuality: { medicalAccuracy: number; clinicalRealism: number; stemCompleteness: number; difficultyCalibration: number },
  technicalQuality: { distractorQuality: number; cueingAbsence: number; clarity: number },
  educationalValue: { clinicalRelevance: number; educationalValue: number },
  feedback: { strengths: string[]; weaknesses: string[]; improvementSuggestions: string[] },
  boardReadiness: 'ready' | 'minor_revision' | 'major_revision' | 'reject'
): BoardStyleQualityScore {
  const coreAvg = Object.values(coreQuality).reduce((a, b) => a + b, 0) / 4;
  const technicalAvg = Object.values(technicalQuality).reduce((a, b) => a + b, 0) / 3;
  const educationalAvg = Object.values(educationalValue).reduce((a, b) => a + b, 0) / 2;
  const overall = coreAvg * 0.5 + technicalAvg * 0.3 + educationalAvg * 0.2;

  return {
    overall: Math.round(overall),
    clinicalRealism: coreQuality.clinicalRealism,
    medicalAccuracy: coreQuality.medicalAccuracy,
    distractorQuality: technicalQuality.distractorQuality,
    cueingAbsence: technicalQuality.cueingAbsence,
    coreQuality,
    technicalQuality,
    educationalValue,
    detailedFeedback: feedback,
    metadata: { boardReadiness }
  };
}
