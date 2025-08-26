/**
 * Orchestrated Agent Communication Interfaces
 * Defines the contract for communication between agents in the MCQ generation pipeline
 */

// Base interface for all agent communications
export interface AgentRequest {
  requestId: string;
  timestamp: number;
  requestingAgent: string;
  targetAgent: string;
  iteration: number;
  context?: any;
}

export interface AgentResponse {
  requestId: string;
  timestamp: number;
  respondingAgent: string;
  success: boolean;
  confidence: number;
  processingTime: number;
  metadata?: any;
  error?: string;
}

// Knowledge Assessment Types
export interface KnowledgeEntity {
  id: string;
  name: string;
  description: string;
  symptoms?: string;
  treatment?: string;
  diagnosis?: string;
  completeness_score: number;
  topic?: string;
  sources?: string[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  relevanceScore: number;
  publishedDate?: string;
  academicSource: boolean;
}

export interface EnhancedKnowledgeEntity extends KnowledgeEntity {
  webSearchSupplementation?: {
    results: WebSearchResult[];
    searchQueries: string[];
    confidenceBoost: number;
    lastSearched: number;
  };
  assessmentResult: {
    sufficientForDrafting: boolean;
    confidenceLevel: number;
    gapsIdentified: string[];
    recommendedSearch: string[];
  };
}

// Orchestrator Request/Response Types
export interface OrchestratorDraftingRequest extends AgentRequest {
  enhancedEntity: EnhancedKnowledgeEntity;
  generationParams: {
    topicIds: string[];
    difficulty: number;
    boardStyle: boolean;
    constraints?: any;
  };
  iterationContext?: {
    previousAttempts: number;
    previousFeedback: string[];
    targetImprovements: string[];
  };
}

export interface DraftingAgentResponse extends AgentResponse {
  draftQuestion: {
    type: 'A';
    topicIds: string[];
    stem: string;
    leadIn: string;
    options: Array<{ text: string }>;
    keyIndex: number;
    explanation: string;
    citations: Array<{ source: string }>;
    difficulty: number;
    qualityScore: number;
    status: 'draft';
    aiGenerated: boolean;
    sourceEntity: string;
  };
  sourceAttribution: {
    primaryEntity: string;
    webSearchContribution: number;
    knowledgeBaseContribution: number;
    supplementaryResources: string[];
  };
}

export interface OrchestratorReviewRequest extends AgentRequest {
  draftQuestion: any;
  generationContext: {
    sourceEntity: EnhancedKnowledgeEntity;
    iterationNumber: number;
    previousReviews?: any[];
  };
  reviewCriteria: {
    medicalAccuracy: boolean;
    clinicalRealism: boolean;
    educationalValue: boolean;
    technicalQuality: boolean;
    abdCompliance: boolean;
  };
}

export interface ReviewAgentResponse extends AgentResponse {
  reviewResult: {
    correctedQuestion: any;
    qualityMetrics: {
      medical_accuracy: number;
      clarity: number;
      realism: number;
      educational_value: number;
      overall_score: number;
    };
    changes: Array<{
      field: string;
      original: string;
      corrected: string;
      reason: string;
    }>;
    recommendations: string[];
    confidence: number;
  };
  passingCriteria: {
    meetsMinimumStandards: boolean;
    readyForScoring: boolean;
    requiresRegeneration: boolean;
  };
}

export interface OrchestratorScoringRequest extends AgentRequest {
  reviewedQuestion: any;
  reviewResult: any;
  scoringContext: {
    iterationNumber: number;
    targetScore: number;
    previousScores?: number[];
  };
}

export interface ScoringAgentResponse extends AgentResponse {
  scoringResult: {
    totalScore: number;
    rubricScores: {
      cognitive_level: number;
      vignette_quality: number;
      options_quality: number;
      technical_clarity: number;
      rationale_explanations: number;
    };
    qualityTier: 'Premium' | 'High' | 'Standard' | 'Needs Review';
    difficultyCalibration: {
      predicted_difficulty: number;
      confidence_interval: [number, number];
    };
    feedback: {
      strengths: string[];
      weaknesses: string[];
      specificImprovements: string[];
    };
  };
  iterationDecision: {
    shouldContinue: boolean;
    recommendsRegeneration: boolean;
    recommendsReview: boolean;
    targetScore: number;
    maxIterationsReached: boolean;
  };
}

export interface OrchestratorQARequest extends AgentRequest {
  finalQuestion: any;
  scoringHistory: any[];
  reviewHistory: any[];
  qualificationContext: {
    targetScore: number;
    achievedScore: number;
    iterationCount: number;
  };
}

export interface QualityAssuranceResponse extends AgentResponse {
  qaResult: {
    finalValidation: {
      boardCompliance: {
        score: number;
        clinicalVignettePresent: boolean;
        boardStyleFormat: boolean;
        appropriateDifficulty: boolean;
      };
      educationalValue: {
        score: number;
        learningObjectivesClear: boolean;
        clinicalRelevance: boolean;
        knowledgeApplication: boolean;
      };
      medicalAccuracy: {
        score: number;
        evidenceBased: boolean;
        currentPractice: boolean;
        terminologyCorrect: boolean;
      };
    };
    certification: {
      approved: boolean;
      qualityTier: 'Premium' | 'High' | 'Standard' | 'Rejected';
      reasonsForApproval: string[];
      reasonsForRejection: string[];
      finalScore: number;
    };
    recommendations: {
      forFutureQuestions: string[];
      forSystemImprovement: string[];
    };
  };
}

// Orchestrator Pipeline State
export interface PipelineState {
  requestId: string;
  currentStage: 'knowledge_assessment' | 'web_search' | 'drafting' | 'review' | 'scoring' | 'qa' | 'completed' | 'failed';
  iteration: number;
  maxIterations: number;
  startTime: number;
  stageHistory: Array<{
    stage: string;
    startTime: number;
    endTime?: number;
    success: boolean;
    data?: any;
  }>;
  currentEntity?: EnhancedKnowledgeEntity;
  currentQuestion?: any;
  qualityGates: {
    minReviewScore: number;
    minScoringScore: number;
    requiresQA: boolean;
  };
}

// Agent Health Check Interface
export interface AgentHealthCheck {
  agentName: string;
  healthy: boolean;
  lastChecked: number;
  responseTime: number;
  capabilities: string[];
  errorRate: number;
  version: string;
}

// Orchestrator Configuration
export interface OrchestrationConfig {
  maxIterations: number;
  qualityThresholds: {
    reviewScore: number;
    scoringScore: number;
    qaScore: number;
  };
  enableWebSearch: boolean;
  webSearchQuota: number;
  timeouts: {
    drafting: number;
    review: number;
    scoring: number;
    qa: number;
    webSearch: number;
  };
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
}