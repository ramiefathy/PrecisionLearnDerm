import 'dotenv/config';
import * as admin from 'firebase-admin';

admin.initializeApp();

// AI functions
export { generateMcq as ai_generate_mcq } from './ai/drafting';
export { processReview as ai_review_mcq } from './ai/review';
export { processScoring as ai_score_mcq } from './ai/scoring';
export { tutorQuery as ai_tutor_query } from './ai/tutor';

// Knowledge base functions
export { kbSearch as kb_search } from './kb/search';

// Personalization Engine functions
export { updateAbility as pe_update_ability } from './pe/ability';
export { triggerAdaptiveGeneration as pe_trigger_adaptive_generation } from './pe/adaptiveGeneration';
export { getPersonalizedQuestions as pe_get_personal_questions } from './pe/adaptiveGeneration';
export { submitQuestionFeedback as pe_submit_question_feedback } from './pe/qualityRetirement';
export { getQualityReviewQueue as pe_get_quality_review_queue } from './pe/qualityRetirement';
export { resolveQualityReview as pe_resolve_quality_review } from './pe/qualityRetirement';
export { getQualityAnalytics as pe_get_quality_analytics } from './pe/qualityRetirement';
export { srsUpdate as pe_srs_update } from './pe/srs';
export { srsDue as pe_srs_due } from './pe/srs';
export { getNextItem as pe_get_next_item } from './pe/nextItem';
export { getNextItems as pe_get_next_items } from './pe/nextItems';

// Item management functions
export { itemsGet as items_get } from './items/get';
export { itemsPropose as items_propose } from './items/propose';
export { itemsPromote as items_promote } from './items/promote';
export { itemsRevise as items_revise } from './items/revise';

// Admin functions
export { admin_generateQuestionQueue as admin_generate_question_queue } from './admin/questionQueue';
export { admin_generate_per_topic as admin_generate_per_topic } from './admin/questionQueue';
export { admin_getQuestionQueue as admin_get_question_queue } from './admin/questionQueue';
export { admin_reviewQuestion as admin_review_question } from './admin/questionQueue';
export { admin_listUncategorized as admin_list_uncategorized } from './admin/taxonomy';
export { admin_setItemTaxonomy as admin_set_item_taxonomy } from './admin/taxonomy';
export { importLegacyQuestions as admin_import_legacy_questions } from './admin/importQuestions';
export { getQuestionBankStats as admin_get_question_bank_stats } from './admin/importQuestions';

// Test functions
export { testSimple, testIterativeScoringPipeline } from './test/simpleTest';

// Testing endpoints (no auth required)
export { test_generate_question, test_review_question, test_score_question } from './test/aiTestingEndpoints';
