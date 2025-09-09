import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { selectBlueprint } from './blueprintSelector';
import { ensureFiveOptions, hasSingleBestAnswer, checkHomogeneous, checkCoverTheOptions, guardNegativeLeadIn, detectDuplicateOptions } from './validators';
import { generateBoardStyleMCQ } from '../ai/boardStyleGeneration';
import { routeHybridGeneration } from '../ai/hybridPipelineRouter';
import { generateQuestionsOptimized } from '../ai/optimizedOrchestrator';

const db = admin.firestore();

export interface BatchRequest {
  jobId: string;
  topic: string;
  difficulty: 'Basic'|'Intermediate'|'Advanced';
  pipeline: 'boardStyle'|'optimizedOrchestrator'|'hybridRouter';
  seed?: number;
  diversity?: { leadInMix?: boolean; topicSpread?: boolean; includeImages?: boolean };
}

export async function generateQuestionsBatch(req: BatchRequest): Promise<any> {
  const { jobId, topic, difficulty, pipeline, seed, diversity } = req;

  // Select a blueprint for this topic/difficulty
  const blueprint = selectBlueprint({ topic, difficulty, seed, diversity });
  logger.info('[GEN_BATCH] Selected blueprint', { jobId, topic, difficulty, blueprintId: blueprint.id });

  // Execute underlying generation based on pipeline
  let result: any;
  if (pipeline === 'boardStyle') {
    const mapped = difficulty === 'Basic' ? 'easy' : difficulty === 'Intermediate' ? 'medium' : 'hard';
    result = await generateBoardStyleMCQ(topic, mapped as any, undefined);
  } else if (pipeline === 'optimizedOrchestrator') {
    const diffMap: Record<'Basic'|'Intermediate'|'Advanced','Basic'|'Advanced'|'Very Difficult'> = {
      Basic: 'Basic',
      Intermediate: 'Advanced',
      Advanced: 'Very Difficult'
    };
    const out = await generateQuestionsOptimized(topic, [diffMap[difficulty]] as any, true, false, 'eval-batch');
    result = out && out[diffMap[difficulty]];
  } else {
    const diffMap: Record<'Basic'|'Intermediate'|'Advanced','Basic'|'Advanced'|'Very Difficult'> = {
      Basic: 'Basic',
      Intermediate: 'Advanced',
      Advanced: 'Very Difficult'
    };
    const out = await routeHybridGeneration({ topic, difficulties: [diffMap[difficulty]], urgency: 'normal', quality: 'standard', features: {}, userId: 'eval-batch' });
    result = out?.questions?.[diffMap[difficulty]];
  }

  // Normalize options (enforce 5, single best, homogeneity, cover-the-options)
  const stem: string = result?.stem || result?.question || '';
  const leadIn: string = result?.leadIn || result?.lead_in || 'Which of the following is the most likely diagnosis?';
  let optionsArr = ensureFiveOptions(result?.options);

  // Guards and repairs (non-destructive logging only; do not fabricate content)
  const negCheck = guardNegativeLeadIn(leadIn);
  const coverOk = checkCoverTheOptions(leadIn, stem);
  const homogeneous = optionsArr.length === 5 ? checkHomogeneous(optionsArr) : false;
  const duplicates = detectDuplicateOptions(optionsArr);
  const singleBest = hasSingleBestAnswer(result?.correctAnswer ?? result?.keyIndex);

  await db.collection('evaluationJobs').doc(jobId).collection('liveLogs').add({
    type: 'generation_progress',
    timestamp: new Date().toISOString(),
    pipeline,
    stage: 'blueprint_validation',
    details: { blueprintId: blueprint.id, negLeadIn: !negCheck.ok ? negCheck.reason : 'ok', coverOk, homogeneous, duplicates, singleBest },
    message: `[${pipeline}] blueprint ${blueprint.id} | cover:${coverOk} homo:${homogeneous} dups:${duplicates.join(',') || 'none'}`
  });

  return {
    blueprintId: blueprint.id,
    result,
    normalized: {
      options: optionsArr
    },
    validation: {
      coverOk,
      homogeneous,
      duplicates,
      singleBest,
      negativeLeadIn: !negCheck.ok
    }
  };
}
