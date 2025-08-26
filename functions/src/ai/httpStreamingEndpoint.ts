/**
 * HTTP Streaming Endpoint for Long-Running AI Operations
 * Bypasses Firebase SDK's 70-second timeout limitation by using direct HTTP streaming
 */

import * as functions from 'firebase-functions';
import cors from 'cors';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { getStreamingGeminiClient } from '../util/streamingGeminiClient';
import { generateQuestionsOptimized } from './optimizedOrchestrator';
import { logInfo, logError } from '../util/logging';
import { ProgressTracker } from '../util/progressTracker';

// Initialize CORS with appropriate settings
const corsHandler = cors({ 
  origin: true,
  credentials: true 
});

/**
 * HTTP endpoint for streaming question generation
 * Supports Server-Sent Events (SSE) for real-time progress updates
 */
export const streamGenerateQuestions = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes server-side
    memory: '2GB'
  })
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // Handle OPTIONS request for CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      try {
        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).send('Unauthorized');
          return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // TEMPORARILY DISABLED: Admin role check for testing
        // TODO: Re-enable admin check after testing
        /*
        const userDoc = await admin.firestore()
          .collection('users')
          .doc(userId)
          .get();
        
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
          res.status(403).send('Forbidden: Admin access required');
          return;
        }
        */

        // Parse request body
        const { topic, difficulties = ['Basic', 'Advanced'], useStreaming = true } = req.body;

        if (!topic) {
          res.status(400).send('Topic is required');
          return;
        }

        // Set up SSE headers for streaming
        if (useStreaming) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Disable nginx buffering
          });

          // Send initial connection message
          res.write('event: connected\n');
          res.write(`data: ${JSON.stringify({ status: 'connected', message: 'Stream initialized' })}\n\n`);

          // Create progress tracker with SSE updates
          const sessionId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const progressTracker = new ProgressTracker(sessionId);

          // Set up progress listener
          const progressListener = (progress: any) => {
            res.write('event: progress\n');
            res.write(`data: ${JSON.stringify(progress)}\n\n`);
          };

          // Start generation with streaming updates
          try {
            logInfo('streaming_generation_started', {
              topic,
              difficulties,
              userId,
              sessionId
            });

            // Create streaming client with chunk callback
            const streamingClient = getStreamingGeminiClient({
              onChunk: (chunk: string) => {
                // Send chunk updates via SSE
                res.write('event: chunk\n');
                res.write(`data: ${JSON.stringify({ 
                  type: 'chunk',
                  content: chunk.substring(0, 100), // Send preview only
                  length: chunk.length,
                  timestamp: new Date().toISOString()
                })}\n\n`);
              }
            });

            // Set session ID for progress tracking
            streamingClient.setSessionId(sessionId);

            // Run the optimized orchestrator pipeline
            const result = await generateQuestionsOptimized(
              topic,
              difficulties
            );

            // Send final result
            res.write('event: complete\n');
            res.write(`data: ${JSON.stringify({
              status: 'complete',
              result,
              sessionId,
              duration: Date.now()
            })}\n\n`);

            logInfo('streaming_generation_complete', {
              topic,
              sessionId,
              duration: Date.now(),
              questionCount: Object.keys(result).filter(k => ['Basic', 'Advanced', 'Very Difficult'].includes(k)).length
            });

          } catch (error: any) {
            logError('streaming_generation_error', {
              error: error.message,
              topic,
              sessionId
            });

            // Send error via SSE
            res.write('event: error\n');
            res.write(`data: ${JSON.stringify({
              status: 'error',
              error: error.message || 'Generation failed',
              sessionId
            })}\n\n`);
          }

          // Close the stream
          res.end();

        } else {
          // Non-streaming fallback (standard HTTP response)
          const sessionId = `http_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const progressTracker = new ProgressTracker(sessionId);

          const result = await generateQuestionsOptimized(
            topic,
            difficulties
          );

          res.status(200).json({
            success: true,
            result,
            sessionId,
            duration: Date.now()
          });
        }

      } catch (error: any) {
        logError('http_endpoint_error', {
          error: error.message,
          method: req.method,
          path: req.path
        });

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
          });
        }
      }
    });
  });

/**
 * HTTP endpoint for checking generation progress (polling fallback)
 */
export const checkGenerationProgress = functions
  .runWith({
    timeoutSeconds: 60
  })
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // Handle OPTIONS request for CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      try {
        const { sessionId } = req.query;

        if (!sessionId || typeof sessionId !== 'string') {
          res.status(400).send('Session ID is required');
          return;
        }

        // Fetch progress from Firestore
        const progressDoc = await admin.firestore()
          .collection('generationProgress')
          .doc(sessionId)
          .get();

        if (!progressDoc.exists) {
          res.status(404).json({
            success: false,
            error: 'Session not found'
          });
          return;
        }

        const progress = progressDoc.data();
        res.status(200).json({
          success: true,
          progress,
          sessionId
        });

      } catch (error: any) {
        logError('progress_check_error', {
          error: error.message
        });

        res.status(500).json({
          success: false,
          error: error.message || 'Failed to check progress'
        });
      }
    });
  });

/**
 * HTTP endpoint for async job submission
 * Returns immediately with a job ID, results can be polled or retrieved later
 */
export const submitGenerationJob = functions
  .runWith({
    timeoutSeconds: 60
  })
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // Handle OPTIONS request for CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      try {
        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).send('Unauthorized');
          return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // TEMPORARILY DISABLED: Admin role check for testing
        // TODO: Re-enable admin check after testing

        // Parse request body
        const { topic, difficulties = ['Basic', 'Advanced'] } = req.body;

        if (!topic) {
          res.status(400).send('Topic is required');
          return;
        }

        // Create job record
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const jobRef = admin.firestore().collection('generationJobs').doc(jobId);

        await jobRef.set({
          jobId,
          userId,
          topic,
          difficulties,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Trigger async processing (using Pub/Sub or Cloud Tasks)
        // For now, we'll process inline but return immediately
        processGenerationJobAsync(jobId, topic, difficulties, userId);

        // Return job ID immediately
        res.status(202).json({
          success: true,
          jobId,
          message: 'Job submitted successfully',
          checkProgressUrl: `/checkGenerationJob?jobId=${jobId}`
        });

      } catch (error: any) {
        logError('job_submission_error', {
          error: error.message
        });

        res.status(500).json({
          success: false,
          error: error.message || 'Failed to submit job'
        });
      }
    });
  });

/**
 * Async job processor (runs in background)
 */
async function processGenerationJobAsync(
  jobId: string,
  topic: string,
  difficulties: string[],
  userId: string
): Promise<void> {
  const jobRef = admin.firestore().collection('generationJobs').doc(jobId);

  try {
    // Update job status to processing
    await jobRef.update({
      status: 'processing',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create progress tracker
    const progressTracker = new ProgressTracker(jobId);

    // Run the optimized orchestrator pipeline
    const result = await generateQuestionsOptimized(
      topic,
      difficulties as any
    );

    // Update job with results
    await jobRef.update({
      status: 'completed',
      result,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      duration: Date.now()
    });

    logInfo('async_job_completed', {
      jobId,
      topic,
      duration: Date.now()
    });

  } catch (error: any) {
    logError('async_job_failed', {
      jobId,
      error: error.message
    });

    // Update job with error
    await jobRef.update({
      status: 'failed',
      error: error.message || 'Job processing failed',
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

/**
 * HTTP endpoint to check async job status
 */
export const checkGenerationJob = functions
  .runWith({
    timeoutSeconds: 60
  })
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      // Handle OPTIONS request for CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      try {
        const { jobId } = req.query;

        if (!jobId || typeof jobId !== 'string') {
          res.status(400).send('Job ID is required');
          return;
        }

        // Fetch job from Firestore
        const jobDoc = await admin.firestore()
          .collection('generationJobs')
          .doc(jobId)
          .get();

        if (!jobDoc.exists) {
          res.status(404).json({
            success: false,
            error: 'Job not found'
          });
          return;
        }

        const job = jobDoc.data();
        res.status(200).json({
          success: true,
          job
        });

      } catch (error: any) {
        logError('job_check_error', {
          error: error.message
        });

        res.status(500).json({
          success: false,
          error: error.message || 'Failed to check job'
        });
      }
    });
  });