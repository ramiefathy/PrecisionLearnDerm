# TypeScript Interface Backward Compatibility Patterns

This document demonstrates the TypeScript patterns implemented to achieve backward compatibility while maintaining type safety.

## Problem Solved

The application had compilation errors due to:
1. Missing `explanationQuality` field in `QualityFeedbackRequest`
2. Missing `chosenIndex` field in `RecordAnswerRequest`
3. API calls expecting required fields that components weren't providing

## Solution Patterns

### 1. Index Signatures for Backward Compatibility

```typescript
export interface QualityFeedbackRequest {
  itemId: string;
  userId?: string; // Made optional for backward compatibility
  feedbackType?: 'quality' | 'difficulty' | 'content' | 'explanation';
  rating?: number;
  comment?: string;
  questionQuality?: number;
  explanationQuality?: number; // Added missing field
  // Additional fields from existing usage
  difficultyRating?: number;
  clarityRating?: number;
  relevanceRating?: number;
  reportedIssues?: string[];
  feedbackText?: string;
  // Index signature for backward compatibility with additional fields
  [key: string]: any;
}
```

### 2. FlexibleRequest Utility Type

```typescript
export type FlexibleRequest<T, OptionalKeys extends keyof T = never> = 
  Omit<T, OptionalKeys> & Partial<Pick<T, OptionalKeys>> & { [key: string]: any };

export type LegacyQualityFeedbackRequest = FlexibleRequest<
  QualityFeedbackRequest, 
  'userId' | 'feedbackType' | 'comment' | 'questionQuality' | 'explanationQuality'
>;
```

### 3. Dual Interface Pattern

For maximum flexibility, we provide both flexible and strict versions:

```typescript
// Flexible interface for backward compatibility
export interface RecordAnswerRequest {
  userId?: string;
  itemId: string;
  answer?: number;
  correctAnswer?: number;
  timeSpent?: number;
  correct?: boolean;
  chosenIndex?: number;
  timeToAnswer?: number;
  timeToAnswerSec?: number;
  correctIndex?: number;
  topicIds?: any;
  confidence?: 'Low' | 'Medium' | 'High';
  sessionType?: 'quiz' | 'flashcard' | 'mock_exam';
  sessionData?: {
    totalQuestions?: number;
    currentQuestionIndex?: number;
    topicIds?: string[];
    sessionId?: string;
    sessionTitle?: string;
  };
  [key: string]: any;
}

// Strict interface for new implementations
export interface StrictRecordAnswerRequest {
  userId: string;
  itemId: string;
  answer: number;
  correctAnswer: number;
  timeSpent: number;
  correct: boolean;
  chosenIndex: number;
  confidence?: 'Low' | 'Medium' | 'High';
  sessionType?: 'quiz' | 'flashcard' | 'mock_exam';
  sessionData?: {
    totalQuestions: number;
    currentQuestionIndex: number;
    topicIds: string[];
    sessionId: string;
    sessionTitle: string;
  };
}
```

### 4. Validation and Transformation Functions

```typescript
export function isValidRecordAnswerRequest(obj: any): obj is RecordAnswerRequest {
  return obj &&
    typeof obj.itemId === 'string' &&
    (typeof obj.answer === 'number' || typeof obj.chosenIndex === 'number' || obj.answer === undefined) &&
    (typeof obj.timeSpent === 'number' || typeof obj.timeToAnswer === 'number' || typeof obj.timeToAnswerSec === 'number' || obj.timeSpent === undefined);
}

export function normalizeRecordAnswerRequest(data: any): StrictRecordAnswerRequest {
  if (!isValidRecordAnswerRequest(data)) {
    throw new Error('Invalid record answer request data');
  }
  
  const chosenIndex = data.chosenIndex ?? data.answer ?? 0;
  const timeSpent = data.timeToAnswerSec ?? data.timeToAnswer ?? data.timeSpent ?? 0;
  const correctAnswer = data.correctAnswer ?? data.correctIndex ?? 0;
  
  return {
    userId: data.userId || 'anonymous',
    itemId: data.itemId,
    answer: data.answer ?? chosenIndex,
    correctAnswer,
    timeSpent,
    correct: data.correct ?? (chosenIndex === correctAnswer),
    chosenIndex,
    confidence: data.confidence as 'Low' | 'Medium' | 'High' | undefined,
    sessionType: data.sessionType,
    sessionData: data.sessionData ? {
      totalQuestions: data.sessionData.totalQuestions ?? 0,
      currentQuestionIndex: data.sessionData.currentQuestionIndex ?? 0,
      topicIds: data.sessionData.topicIds ?? [],
      sessionId: data.sessionData.sessionId ?? '',
      sessionTitle: data.sessionData.sessionTitle ?? ''
    } : undefined
  };
}
```

### 5. Union Types for API Flexibility

```typescript
export type QualityFeedbackInput = QualityFeedbackRequest | LegacyQualityFeedbackRequest | {
  itemId: string;
  rating: number;
  questionQuality?: number;
  explanationQuality?: number;
  [key: string]: any;
};

export type RecordAnswerInput = RecordAnswerRequest | LegacyRecordAnswerRequest | {
  itemId: string;
  answer?: number;
  chosenIndex?: number;
  timeSpent?: number;
  timeToAnswer?: number;
  correctAnswer?: number;
  [key: string]: any;
};
```

## Usage Examples

### For Existing Code (Backward Compatible)

```typescript
// This still works without changes
const feedback = {
  itemId: "123",
  questionQuality: 4,
  explanationQuality: 5,
  difficultyRating: 3,
  clarityRating: 4,
  relevanceRating: 5,
  reportedIssues: ["typo"],
  feedbackText: "Good question"
};

api.quality.submitFeedback(feedback); // ✅ Works!

// This also works
const answer = {
  itemId: "123",
  chosenIndex: 2,
  correct: true,
  timeToAnswerSec: 45,
  correctIndex: 2,
  topicIds: ["dermatology"],
  confidence: "High"
};

api.pe.recordAnswer(answer); // ✅ Works!
```

### For New Code (Type Safe)

```typescript
// Use transformation functions for type safety
const normalizedFeedback = normalizeQualityFeedbackRequest({
  itemId: "123",
  questionQuality: 4,
  explanationQuality: 5
});

const normalizedAnswer = normalizeRecordAnswerRequest({
  itemId: "123",
  chosenIndex: 2,
  timeToAnswerSec: 45,
  correctIndex: 2
});
```

## Key Benefits

1. **Backward Compatibility**: Existing code continues to work without changes
2. **Type Safety**: New code can use strict interfaces and validation
3. **Flexibility**: Index signatures allow additional fields
4. **Migration Path**: Gradual migration from flexible to strict interfaces
5. **Runtime Safety**: Validation functions prevent runtime errors

## Migration Strategy

1. **Phase 1**: Use flexible interfaces to resolve compilation errors
2. **Phase 2**: Add validation functions to critical paths
3. **Phase 3**: Gradually migrate to strict interfaces for new features
4. **Phase 4**: Apply transformation functions to ensure data consistency

This approach provides the best of both worlds: backward compatibility for existing code and type safety for new implementations.