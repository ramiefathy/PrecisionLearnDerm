import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface GenerationProgress {
  sessionId: string;
  currentStage: string;
  stages: Record<string, {
    status: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    message?: string;
    details?: any;
    progress?: number;
  }>;
  percentComplete: number;
  estimatedTimeRemaining?: number;
  pipeline?: 'orchestrated' | 'simplified';
  chunks?: Array<{
    timestamp: string;
    content: string;
    length: number;
  }>;
  error?: string;
}

export function useGenerationProgress(sessionId: string | null) {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestChunk, setLatestChunk] = useState<string>('');
  
  useEffect(() => {
    if (!sessionId) return;
    
    const unsubscribe = onSnapshot(
      doc(db, 'generationProgress', sessionId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as GenerationProgress;
          setProgress(data);
          
          // Check if complete
          if (data.currentStage === 'complete') {
            setIsComplete(true);
          }
          
          // Check for errors
          if (data.error) {
            setError(data.error);
          }
          
          // Get latest chunk if streaming
          if (data.chunks && data.chunks.length > 0) {
            const latest = data.chunks[data.chunks.length - 1];
            setLatestChunk(latest.content);
          }
        }
      },
      (error) => {
        console.error('Error monitoring progress:', error);
        setError('Failed to monitor generation progress');
      }
    );
    
    return () => unsubscribe();
  }, [sessionId]);
  
  return { 
    progress, 
    isComplete, 
    error,
    latestChunk,
    isStreaming: !!(progress?.chunks && progress.chunks.length > 0)
  };
}