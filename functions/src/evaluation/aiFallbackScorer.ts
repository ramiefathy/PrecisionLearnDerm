import * as logger from 'firebase-functions/logger';
import { evaluateQuestionWithAI, type BoardStyleQualityScore } from './aiQuestionScorer';
import { type DetailedQualityScore } from './questionScorer';

export async function scoreWithAIFallback(
  mcq: any,
  pipeline: string,
  topic: string,
  difficulty: string,
  quality: number,
  detailed: DetailedQualityScore
): Promise<BoardStyleQualityScore> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await evaluateQuestionWithAI(mcq, pipeline, topic, difficulty);
    } catch (error) {
      logger.warn('[AI_FALLBACK_SCORER] AI scoring attempt failed', { attempt, error });
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  logger.warn('[AI_FALLBACK_SCORER] Using rule-based fallback scores');
  return createFallbackScore(quality, detailed);
}

export function createFallbackScore(
  quality: number,
  detailed: DetailedQualityScore
): BoardStyleQualityScore {
  return {
    overall: Math.round(quality),
    clinicalRealism: detailed.dimensions.boardStyleSimilarity,
    medicalAccuracy: detailed.dimensions.medicalAccuracy,
    distractorQuality: detailed.dimensions.distractorQuality,
    cueingAbsence: detailed.dimensions.boardStyleSimilarity,
    coreQuality: {
      medicalAccuracy: detailed.dimensions.medicalAccuracy,
      clinicalRealism: detailed.dimensions.boardStyleSimilarity,
      stemCompleteness: detailed.dimensions.clinicalDetail,
      difficultyCalibration: detailed.dimensions.complexity
    },
    technicalQuality: {
      distractorQuality: detailed.dimensions.distractorQuality,
      cueingAbsence: detailed.dimensions.boardStyleSimilarity,
      clarity: detailed.dimensions.boardStyleSimilarity
    },
    educationalValue: {
      clinicalRelevance: detailed.dimensions.medicalAccuracy,
      educationalValue: detailed.dimensions.explanationQuality
    },
    detailedFeedback: {
      strengths: detailed.feedback.strengths,
      weaknesses: detailed.feedback.weaknesses,
      improvementSuggestions: []
    },
    metadata: {
      boardReadiness:
        quality >= 80
          ? 'ready'
          : quality >= 60
          ? 'minor_revision'
          : quality >= 40
          ? 'major_revision'
          : 'reject'
    }
  };
}
