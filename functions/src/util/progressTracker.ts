import * as admin from 'firebase-admin';

const db = admin.firestore();

export interface GenerationProgress {
  sessionId: string;
  userId: string;
  topic: string;
  pipeline: 'orchestrated' | 'simplified';
  startTime: string;
  currentStage: string;
  stages: {
    [key: string]: {
      status: 'pending' | 'running' | 'complete' | 'error' | 'skipped';
      startTime?: string;
      endTime?: string;
      duration?: number;
      message?: string;
      details?: any;
      progress?: number; // 0-100
    };
  };
  estimatedTimeRemaining?: number;
  percentComplete: number;
  lastUpdate: string;
  chunks?: Array<{
    timestamp: string;
    content: string;
    length: number;
  }>;
  error?: string;
  result?: any;
}

export class ProgressTracker {
  private sessionId: string;
  private progressRef: FirebaseFirestore.DocumentReference;
  
  constructor(sessionId?: string) {
    this.sessionId = sessionId || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.progressRef = db.collection('generationProgress').doc(this.sessionId);
  }
  
  async initialize(userId: string, topic: string, pipeline: 'orchestrated' | 'simplified') {
    const progress: GenerationProgress = {
      sessionId: this.sessionId,
      userId,
      topic,
      pipeline,
      startTime: new Date().toISOString(),
      currentStage: 'initializing',
      stages: this.getInitialStages(pipeline),
      percentComplete: 0,
      lastUpdate: new Date().toISOString()
    };
    
    await this.progressRef.set(progress);
    return this.sessionId;
  }
  
  private getInitialStages(pipeline: string): GenerationProgress['stages'] {
    const baseStages: GenerationProgress['stages'] = {
      initialization: { status: 'running' },
      drafting: { status: 'pending' },
      saving: { status: 'pending' }
    };

    if (pipeline === 'orchestrated') {
      return {
        ...baseStages,
        context: { status: 'pending' },
        search: { status: 'pending' },
        review: { status: 'pending' },
        scoring: { status: 'pending' },
        refinement: { status: 'pending' }
      };
    }
    
    return baseStages;
  }
  
  async updateStage(
    stage: string, 
    status: 'running' | 'complete' | 'error' | 'skipped',
    details?: any,
    progress?: number
  ) {
    const now = new Date().toISOString();
    const update: any = {
      [`stages.${stage}.status`]: status,
      [`stages.${stage}.lastUpdate`]: now,
      lastUpdate: now
    };
    
    if (status === 'running') {
      update[`stages.${stage}.startTime`] = now;
      update.currentStage = stage;
    } else if (status === 'complete' || status === 'error' || status === 'skipped') {
      update[`stages.${stage}.endTime`] = now;
      
      // Calculate duration if startTime exists
      const doc = await this.progressRef.get();
      const data = doc.data() as GenerationProgress;
      if (data?.stages[stage]?.startTime) {
        const startTime = new Date(data.stages[stage].startTime!).getTime();
        const endTime = new Date(now).getTime();
        update[`stages.${stage}.duration`] = endTime - startTime;
      }
    }
    
    if (details) {
      update[`stages.${stage}.details`] = details;
    }
    
    if (progress !== undefined) {
      update[`stages.${stage}.progress`] = progress;
    }
    
    // Calculate overall progress
    const doc = await this.progressRef.get();
    const data = doc.data() as GenerationProgress;
    if (data) {
      const stages = Object.values(data.stages);
      const completed = stages.filter(s => 
        s.status === 'complete' || s.status === 'skipped'
      ).length;
      const total = stages.length;
      update.percentComplete = Math.round((completed / total) * 100);
      
      // Estimate time remaining
      if (completed > 0) {
        const completedStages = stages.filter(s => s.duration);
        if (completedStages.length > 0) {
          const avgDuration = completedStages.reduce((sum, s) => sum + s.duration!, 0) / completedStages.length;
          const remaining = total - completed;
          update.estimatedTimeRemaining = Math.round(avgDuration * remaining);
        }
      }
    }
    
    await this.progressRef.update(update);
  }
  
  async addMessage(stage: string, message: string) {
    await this.progressRef.update({
      [`stages.${stage}.message`]: message,
      [`stages.${stage}.messageTime`]: new Date().toISOString()
    });
  }
  
  async complete(result?: any) {
    const now = new Date().toISOString();
    const doc = await this.progressRef.get();
    const data = doc.data() as GenerationProgress;
    
    let totalDuration = 0;
    if (data?.startTime) {
      totalDuration = new Date(now).getTime() - new Date(data.startTime).getTime();
    }
    
    await this.progressRef.update({
      currentStage: 'complete',
      percentComplete: 100,
      endTime: now,
      totalDuration,
      result: result || null
    });
  }
  
  async error(error: string) {
    await this.progressRef.update({
      currentStage: 'error',
      error,
      endTime: new Date().toISOString()
    });
  }
  
  getSessionId() {
    return this.sessionId;
  }
}