// Shared types for PrecisionLearnDerm project

export interface User {
  uid: string;
  email: string;
  isAdmin?: boolean;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  difficulty?: number;
  topics?: string[];
}

export interface KnowledgeBaseEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: number;
  completeness: number;
}

// Add more shared types as needed
