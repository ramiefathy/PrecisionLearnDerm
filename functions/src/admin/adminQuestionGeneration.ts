/**
 * Admin Question Generation Module
 * Dedicated pipeline for admin-driven question generation with ABD guidelines
 * Separate from personalized question generation to maintain clean separation
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAdmin } from '../util/auth';
import { logInfo, logError } from '../util/logging';
import { orchestrateQuestionGeneration } from '../ai/adaptedOrchestrator';
import { generateBoardStyleMCQ } from '../ai/boardStyleGeneration';
import { config } from '../util/config';

const db = admin.firestore();

// ABD Guidelines integration for admin generation
const ABD_ENHANCED_PROMPT = `
You are generating questions following American Board of Dermatology (ABD) standards:

1. CLINICAL VIGNETTE STRUCTURE:
   - Patient demographics (age, gender, race when relevant)
   - Chief complaint with duration
   - Relevant history (medical, family, social, medications)
   - Complete physical examination findings
   - Laboratory/diagnostic results when appropriate
   - Pertinent negatives to rule out differentials

2. QUESTION REQUIREMENTS:
   - Test clinical reasoning, NOT simple recall
   - Require synthesis of information and clinical decision-making
   - Focus on common conditions and important clinical scenarios
   - Bottom-up approach: present findings first, require deduction

3. OPTION QUALITY:
   - All options from same category (all diagnoses or all treatments)
   - Similar length and grammatical structure
   - Plausible distractors that could be considered
   - No absolute terms (always, never, all, none)

4. TARGET DIFFICULTY:
   - Aim for 70-80% correct response rate
   - Evidence-based, current medical knowledge
   - Clinically relevant and important
`;

interface AdminGenerationRequest {
  topic: string;
  difficulties?: ('Basic' | 'Advanced' | 'Very Difficult')[];
  questionCount?: number;
  useABDGuidelines?: boolean;
  focusArea?: string; // e.g., 'diagnosis', 'treatment', 'pathophysiology'
  enableProgress?: boolean;
  enableStreaming?: boolean;
}

interface AdminGenerationResponse {
  success: boolean;
  questions?: any;
  generated?: number;
  topic?: string;
  difficulties?: string[];
  message?: string;
  method: 'orchestrated' | 'board-style' | 'hybrid' | 'failed';
  sessionId?: string;
}

/**
 * Admin question generation with ABD guidelines integration
 */
export async function generateAdminQuestions(
  request: AdminGenerationRequest,
  userId?: string
): Promise<AdminGenerationResponse> {
  try {
    const {
      topic,
      difficulties = ['Basic', 'Advanced', 'Very Difficult'],
      questionCount = difficulties.length,
      useABDGuidelines = true,
      focusArea,
      enableProgress = true,
      enableStreaming = true
    } = request;

    logInfo('admin_generation_started', {
      topic,
      difficulties,
      questionCount,
      useABDGuidelines,
      focusArea
    });

    const generatedQuestions: any = {};
    let totalGenerated = 0;

    // Use board-style generation when ABD guidelines are requested (fast, reliable)
    // Otherwise use orchestrated generation for research-backed questions
    if (useABDGuidelines) {
      try {
        logInfo('admin_board_style_generation_start', { 
          topic, 
          difficulties,
          questionCount,
          useABDGuidelines: true,
          method: 'board-style'
        });

        // Import board-style generation function
        const { generateBoardStyleMCQ } = await import('../ai/boardStyleGeneration');
        
        // Map difficulty levels for board-style generation
        const difficultyMap: Record<string, 'easy' | 'medium' | 'hard'> = {
          'Basic': 'easy',
          'Advanced': 'medium',
          'Very Difficult': 'hard'
        };
        
        // Generate for each difficulty level
        for (const difficulty of difficulties) {
          try {
            const mappedDifficulty = difficultyMap[difficulty] || 'medium';
            const question = await generateBoardStyleMCQ(topic, mappedDifficulty, focusArea);
            if (question) {
              generatedQuestions[difficulty] = question;
              totalGenerated++;
              logInfo('board_style_question_generated', { topic, difficulty });
            }
          } catch (difficultyError: any) {
            logError('board_style_difficulty_failed', { 
              topic, 
              difficulty, 
              error: difficultyError.message 
            });
          }
        }

        if (totalGenerated > 0) {
          // Save generated questions to review queue
          const savedIds: Record<string, string> = {};
          for (const [difficulty, question] of Object.entries(generatedQuestions)) {
            try {
              const docRef = await db.collection('questionQueue').add({
                draftItem: question,
                status: 'pending',
                topicHierarchy: {
                  category: 'Dermatology',
                  topic: topic,
                  subtopic: difficulty,
                  fullTopicId: `dermatology/${topic.toLowerCase().replace(/\s+/g, '_')}/${difficulty.toLowerCase()}`
                },
                kbSource: {
                  entity: topic,
                  completenessScore: 100 // Board-style doesn't use KB scoring
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                priority: difficulty === 'Basic' ? 1 : difficulty === 'Advanced' ? 2 : 3,
                source: 'board-style-generation',
                metadata: {
                  author: 'admin-board-style',
                  version: 1,
                  useABDGuidelines: true
                }
              });
              savedIds[difficulty] = docRef.id;
              logInfo('board_style_question_saved', { 
                topic, 
                difficulty, 
                questionId: docRef.id 
              });
            } catch (saveError: any) {
              logError('board_style_save_failed', { 
                topic, 
                difficulty, 
                error: saveError.message 
              });
            }
          }
          
          return {
            success: true,
            questions: generatedQuestions,
            generated: totalGenerated,
            topic,
            difficulties,
            method: 'board-style',
            message: `Successfully generated ${totalGenerated} board-style questions and saved ${Object.keys(savedIds).length} to review queue`
          };
        } else {
          throw new Error('Board-style generation produced no questions');
        }
      } catch (boardStyleError: any) {
        logError('board_style_generation_failed', { 
          topic, 
          error: boardStyleError.message 
        });
        // Fall through to orchestrated generation as fallback
      }
    }

    // Use orchestrated generation for non-ABD or as fallback
    try {
      logInfo('admin_optimized_generation_start', { 
        topic, 
        difficulties,
        questionCount,
        useABDGuidelines: !!useABDGuidelines,
        method: 'optimized-orchestrated'
      });

      // Enable streaming for better visibility and potentially better handling of long operations
      const orchestratedResult = await orchestrateQuestionGeneration(
        topic, 
        difficulties, 
        true, 
        enableStreaming,
        userId,
        enableProgress
      );
      const generatedCount = Object.keys(orchestratedResult.questions || {}).length;
      
      logInfo('admin_optimized_generation_success', {
        topic,
        difficulties,
        generated: generatedCount,
        method: 'optimized-orchestrated'
      });
      
      // Check if we actually generated questions
      if (generatedCount === 0) {
        logError('admin_generation_zero_questions', {
          topic,
          difficulties,
          error: 'No questions were generated - API timeout or content policy block'
        });
        
        return {
          success: false,  // Changed from true - 0 questions is a failure
          questions: {},
          generated: 0,
          topic,
          difficulties,
          method: 'failed',  // Changed from 'orchestrated' to indicate failure
          message: 'Generation failed: All AI agents timed out or were blocked. This typically indicates the topic is too complex or contains restricted content.'
        };
      }
      
      // We have questions - this is success
      return {
        success: true,
        questions: orchestratedResult.questions || {},
        generated: generatedCount,
        topic,
        difficulties,
        method: 'orchestrated',
        message: `Successfully generated ${generatedCount} questions using optimized pipeline`,
        sessionId: orchestratedResult.sessionId
      };
      
    } catch (orchestratedError: any) {
      logError('admin_optimized_generation_failed', { 
        topic, 
        difficulties,
        error: orchestratedError.message || String(orchestratedError) 
      });
      
      return {
        success: false,
        questions: {},
        generated: 0,
        topic,
        difficulties,
        method: 'failed',
        message: `Optimized generation failed: ${orchestratedError.message || 'Unknown error'}`
      };
    }

  } catch (error: any) {
    logError('admin_generation_failed', { 
      request, 
      error: error.message || String(error) 
    });
    
    return {
      success: false,
      message: `Generation failed: ${error.message || 'Unknown error'}`,
      method: 'failed'
    };
  }
}

/**
 * Firebase Cloud Function for admin question generation
 */
export const adminGenerateQuestions = functions
  .runWith({
    timeoutSeconds: 300, // 5 minutes for admin generation
    memory: '1GB'
  })
  .https.onCall(async (data, context) => {
    try {
      // Require admin authentication
      requireAdmin(context);
      
      // Validate input
      const { topic, difficulties, questionCount, useABDGuidelines, focusArea } = data;
      
      if (!topic || typeof topic !== 'string') {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Topic is required and must be a string'
        );
      }
      
      if (difficulties && !Array.isArray(difficulties)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Difficulties must be an array'
        );
      }
      
      if (questionCount && (typeof questionCount !== 'number' || questionCount < 1 || questionCount > 50)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Question count must be a number between 1 and 50'
        );
      }
      
      // Check API key
      if (!config.gemini.hasApiKey()) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Gemini API key not configured'
        );
      }
      
      // Generate questions
      const result = await generateAdminQuestions({
        topic: topic.trim(),
        difficulties,
        questionCount,
        useABDGuidelines,
        focusArea,
        enableProgress: data.enableProgress,
        enableStreaming: data.enableStreaming
      }, context.auth?.uid);
      
      // Log success
      if (result.success) {
        await logInfo('admin_generation_completed', {
          topic,
          generated: result.generated,
          method: result.method,
          userId: context.auth?.uid
        });
      }
      
      return result;
      
    } catch (error: any) {
      await logError('admin_generation_endpoint_failed', { error, data });
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate admin questions',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

/**
 * Batch admin question generation for multiple topics
 */
export const adminBatchGenerateQuestions = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes for batch generation
    memory: '1GB'
  })
  .https.onCall(async (data, context) => {
    try {
      // Require admin authentication
      requireAdmin(context);
      
      const { topics = [], difficulties = ['Basic', 'Advanced', 'Very Difficult'] } = data;
      
      if (!Array.isArray(topics) || topics.length === 0) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Topics array is required and cannot be empty'
        );
      }
      
      if (topics.length > 20) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Cannot generate for more than 20 topics at once'
        );
      }
      
      const results: any = {};
      let totalGenerated = 0;
      
      // Process topics in parallel with concurrency limit
      const concurrencyLimit = 3;
      for (let i = 0; i < topics.length; i += concurrencyLimit) {
        const batch = topics.slice(i, i + concurrencyLimit);
        
        const batchPromises = batch.map(async (topic: string) => {
          try {
            const result = await generateAdminQuestions({
              topic,
              difficulties,
              useABDGuidelines: true
            });
            
            results[topic] = result;
            if (result.success) {
              totalGenerated += result.generated || 0;
            }
            
            return result;
          } catch (error) {
            results[topic] = {
              success: false,
              message: `Failed to generate for ${topic}: ${error}`,
              method: 'failed'
            };
            return null;
          }
        });
        
        await Promise.all(batchPromises);
      }
      
      await logInfo('admin_batch_generation_completed', {
        topics,
        totalGenerated,
        successfulTopics: Object.values(results).filter((r: any) => r.success).length,
        userId: context.auth?.uid
      });
      
      return {
        success: totalGenerated > 0,
        results,
        totalGenerated,
        processedTopics: topics.length,
        successfulTopics: Object.values(results).filter((r: any) => r.success).length
      };
      
    } catch (error: any) {
      await logError('admin_batch_generation_failed', { error, data });
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError(
        'internal',
        'Failed to batch generate admin questions',
        error instanceof Error ? error.message : String(error)
      );
    }
  });