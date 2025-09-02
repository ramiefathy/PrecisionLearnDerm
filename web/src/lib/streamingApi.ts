/**
 * Streaming API Client
 * Handles long-running operations without Firebase SDK timeout limitations
 * Supports Server-Sent Events (SSE) and async job polling
 */

import { auth } from './firebase';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://us-central1-dermassist-ai-1zyic.cloudfunctions.net'
  : 'http://localhost:5001/dermassist-ai-1zyic/us-central1';

export interface StreamingOptions {
  onProgress?: (progress: any) => void;
  onChunk?: (chunk: any) => void;
  onComplete?: (result: any) => void;
  onError?: (error: any) => void;
}

export interface GenerationJobResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: any;
  completedAt?: any;
  duration?: number;
}

/**
 * Stream question generation using Server-Sent Events
 * Bypasses Firebase SDK's 70-second timeout limitation
 */
export async function streamQuestionGeneration(
  topic: string,
  difficulties: string[] = ['Basic', 'Advanced'],
  options: StreamingOptions = {}
): Promise<any> {
  const { onProgress, onChunk, onComplete, onError } = options;

  try {
    // Get auth token
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    // Create EventSource for SSE
    const response = await fetch(`${API_BASE_URL}/streamGenerateQuestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        topic,
        difficulties,
        useStreaming: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Check if response is SSE
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('text/event-stream')) {
      // Process SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = null;

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            // const event = line.substring(6).trim();
            continue;
          }

          if (line.startsWith('data:')) {
            const data = line.substring(5).trim();
            if (data) {
              try {
                const parsed = JSON.parse(data);
                
                // Handle different event types
                if (parsed.status === 'connected') {
                  console.log('Stream connected:', parsed.message);
                } else if (parsed.type === 'chunk') {
                  onChunk?.(parsed);
                } else if (parsed.status === 'progress') {
                  onProgress?.(parsed);
                } else if (parsed.status === 'complete') {
                  result = parsed.result;
                  onComplete?.(parsed);
                } else if (parsed.status === 'error') {
                  onError?.(parsed);
                  throw new Error(parsed.error);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }

      return result;

    } else {
      // Fallback to regular JSON response
      const data = await response.json();
      if (data.success) {
        onComplete?.(data);
        return data.result;
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    }

  } catch (error: any) {
    console.error('Streaming generation error:', error);
    onError?.(error);
    throw error;
  }
}

/**
 * Submit an async generation job
 * Returns immediately with a job ID for polling
 */
export async function submitGenerationJob(
  topic: string,
  difficulties: string[] = ['Basic', 'Advanced']
): Promise<string> {
  try {
    // Get auth token
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/submitGenerationJob`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        topic,
        difficulties
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      return data.jobId;
    } else {
      throw new Error(data.error || 'Job submission failed');
    }

  } catch (error: any) {
    console.error('Job submission error:', error);
    throw error;
  }
}

/**
 * Check the status of an async generation job
 */
export async function checkGenerationJob(jobId: string): Promise<GenerationJobResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/checkGenerationJob?jobId=${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      return data.job;
    } else {
      throw new Error(data.error || 'Failed to check job');
    }

  } catch (error: any) {
    console.error('Job check error:', error);
    throw error;
  }
}

/**
 * Poll for job completion with exponential backoff
 */
export async function pollGenerationJob(
  jobId: string,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    onProgress?: (job: GenerationJobResult) => void;
  } = {}
): Promise<any> {
  const {
    maxAttempts = 60,
    initialDelay = 2000,
    maxDelay = 10000,
    onProgress
  } = options;

  let attempts = 0;
  let delay = initialDelay;

  while (attempts < maxAttempts) {
    try {
      const job = await checkGenerationJob(jobId);
      onProgress?.(job);

      if (job.status === 'completed') {
        return job.result;
      } else if (job.status === 'failed') {
        throw new Error(job.error || 'Job failed');
      }

      // Wait before next poll with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, maxDelay);
      attempts++;

    } catch (error: any) {
      console.error('Polling error:', error);
      
      // If it's a network error, retry
      if (attempts < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, maxDelay);
        attempts++;
      } else {
        throw error;
      }
    }
  }

  throw new Error('Job polling timeout - max attempts reached');
}

/**
 * High-level function to generate questions with automatic fallback
 * Tries streaming first, falls back to async job if needed
 */
export async function generateQuestionsRobust(
  topic: string,
  difficulties: string[] = ['Basic', 'Advanced'],
  options: StreamingOptions & {
    preferStreaming?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<any> {
  const {
    preferStreaming = true,
    timeoutMs = 300000, // 5 minutes default
    ...streamingOptions
  } = options;

  // Try streaming first if preferred
  if (preferStreaming) {
    try {
      console.log('Attempting streaming generation...');
      
      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Streaming timeout')), timeoutMs);
      });

      const streamPromise = streamQuestionGeneration(
        topic,
        difficulties,
        streamingOptions
      );

      const result = await Promise.race([streamPromise, timeoutPromise]);
      return result;

    } catch (error: any) {
      console.warn('Streaming failed, falling back to async job:', error.message);
    }
  }

  // Fallback to async job
  console.log('Using async job generation...');
  const jobId = await submitGenerationJob(topic, difficulties);
  
  // Poll for completion
  return pollGenerationJob(jobId, {
    onProgress: (job) => {
      streamingOptions.onProgress?.({
        status: job.status,
        jobId: job.jobId,
        duration: job.duration
      });
    }
  });
}

/**
 * WebSocket-based real-time generation (alternative approach)
 * Requires WebSocket server implementation
 */
export class WebSocketGenerationClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private wsUrl: string = 'wss://us-central1-dermassist-ai-1zyic.cloudfunctions.net/wsGeneration') {}

  async connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.wsUrl}?token=${token}`);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.handleReconnect(token);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleReconnect(token: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.connect(token).catch(console.error);
      }, delay);
    }
  }

  async generateQuestions(
    topic: string,
    difficulties: string[],
    onMessage: (data: any) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      // Set up message handler
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);

          if (data.type === 'complete') {
            resolve(data.result);
          } else if (data.type === 'error') {
            reject(new Error(data.error));
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      // Send generation request
      this.ws.send(JSON.stringify({
        type: 'generate',
        topic,
        difficulties
      }));
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}