/**
 * Unified Types for Multi-Agent Pipeline
 * Based on clean reference implementation
 */

export interface MCQ {
  stem: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface QuestionSuite {
  basic: MCQ;
  advanced: MCQ;
  difficult: MCQ;
}

export enum Agent {
  ORCHESTRATOR = 'Orchestrator',
  SEARCH_QUERY_OPTIMIZATION = 'Search Query Optimization Agent',
  NCBI_SEARCH = 'NCBI Search Agent',
  OPENALEX_SEARCH = 'OpenAlex Search Agent',
  SUMMARIZATION = 'Summarization Agent',
  ENHANCED_DRAFTING = 'Enhanced Drafting Agent',
  REVIEW = 'Review Agent',
  SCORING = 'Scoring Agent',
  REFINEMENT = 'Refinement Agent',
  FINAL_VALIDATION = 'Final Validation Agent',
}

export interface ProcessLog {
  agent: Agent;
  message: string;
  status: 'running' | 'completed' | 'error';
  details?: string;
  timestamp: number;
}

export interface Score {
  scores: {
    clinicalRelevance: number;
    clarity: number;
    singleBestAnswer: number;
    difficulty: number;
    educationalValue: number;
  };
  totalScore: number;
  feedback: string;
}

export type Difficulty = 'Basic' | 'Advanced' | 'Very Difficult';

export interface AgentConfig {
  model: 'gemini-2.5-pro' | 'gemini-2.5-flash';
  temperature: number;
  maxOutputTokens: number;
  responseMimeType?: 'application/json' | 'text/plain';
}

export interface PipelineResult {
  success: boolean;
  questions?: QuestionSuite;
  logs: ProcessLog[];
  totalExecutionTime: number;
  error?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'NCBI' | 'OpenAlex';
  relevanceScore: number;
  publishedDate?: string;
  academicSource: boolean;
}

export interface ResearchContext {
  topic: string;
  ncbiData: string;
  openAlexData: string;
  synthesizedSummary: string;
  searchQueries: string[];
}

// Configuration for each agent based on task complexity
export const AGENT_CONFIGS: Record<Agent, AgentConfig> = {
  [Agent.ORCHESTRATOR]: {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    maxOutputTokens: 1024
  },
  [Agent.SEARCH_QUERY_OPTIMIZATION]: {
    model: 'gemini-2.5-flash',
    temperature: 0.3,
    maxOutputTokens: 512
  },
  [Agent.NCBI_SEARCH]: {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    maxOutputTokens: 2048
  },
  [Agent.OPENALEX_SEARCH]: {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    maxOutputTokens: 2048
  },
  [Agent.SUMMARIZATION]: {
    model: 'gemini-2.5-pro', // Complex synthesis task
    temperature: 0.3,
    maxOutputTokens: 2048
  },
  [Agent.ENHANCED_DRAFTING]: {
    model: 'gemini-2.5-pro', // Complex creative task
    temperature: 0.7,
    maxOutputTokens: 3072,
    responseMimeType: 'application/json'
  },
  [Agent.REVIEW]: {
    model: 'gemini-2.5-flash',
    temperature: 0.2,
    maxOutputTokens: 1024
  },
  [Agent.SCORING]: {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json'
  },
  [Agent.REFINEMENT]: {
    model: 'gemini-2.5-flash',
    temperature: 0.5,
    maxOutputTokens: 2048
  },
  [Agent.FINAL_VALIDATION]: {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    maxOutputTokens: 512
  }
};

// Scoring thresholds
export const MINIMUM_SCORE_THRESHOLD = 20;
export const MAX_REFINEMENT_ATTEMPTS = 5;

// Difficulty configuration
export const DIFFICULTY_LEVELS: Record<Difficulty, number> = {
  'Basic': 0.3,
  'Advanced': 0.6,
  'Very Difficult': 0.9
};
