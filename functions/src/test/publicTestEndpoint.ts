/**
 * Public test endpoint for testing question generation without authentication
 * WARNING: This should only be used for testing and should be removed in production
 */

import * as functions from 'firebase-functions';
import cors from 'cors';
import { generateQuestionsOptimized } from '../ai/optimizedOrchestrator';
import { logInfo, logError } from '../util/logging';
const corsHandler = cors({ origin: true });

export const testGenerateQuestions = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '1GB'
  })
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      try {
        // Log the request
        logInfo('test_generate_questions_called', {
          method: req.method,
          body: req.body,
          origin: req.headers.origin
        });

        if (req.method !== 'POST') {
          res.status(405).json({ error: 'Method not allowed' });
          return;
        }

        const { topic, difficulties, enableProgress, useStreaming } = req.body;

        if (!topic) {
          res.status(400).json({ error: 'Topic is required' });
          return;
        }

        // Call the optimized orchestrator directly
        const result = await generateQuestionsOptimized(
          topic,
          difficulties || ['Basic', 'Advanced', 'Very Difficult'],
          true, // useCache
          useStreaming || false,
          'test-user',
          enableProgress
        );

        // Extract questions and agent outputs
        const response: any = {
          success: true,
          questions: {} as any,
          agentOutputs: result.agentOutputs || [],
          sessionId: result.sessionId,
          stats: {
            generated: 0,
            saved: 0
          },
          difficulties: [] as string[]
        };

        // Extract actual questions from result
        const validDifficulties = ['Basic', 'Advanced', 'Very Difficult'];
        for (const [key, value] of Object.entries(result)) {
          if (validDifficulties.includes(key) && value) {
            response.questions[key] = value;
            response.difficulties.push(key);
            response.stats.generated++;
          }
        }

        logInfo('test_generate_questions_success', {
          topic,
          generated: response.stats.generated,
          difficulties: response.difficulties
        });

        res.status(200).json(response);
      } catch (error: any) {
        logError('test_generate_questions_failed', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Unknown error',
          message: 'Test generation failed'
        });
      }
    });
  });