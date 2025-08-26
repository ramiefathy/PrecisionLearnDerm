import { z } from 'zod';
import * as functions from 'firebase-functions';

// ============================================
// Common Schemas
// ============================================

export const UIDSchema = z.string().min(1).max(128);
export const EmailSchema = z.string().email();
export const DifficultySchema = z.number().min(0).max(1);
export const TopicIdSchema = z.string().min(1).max(100);
export const ItemIdSchema = z.string().min(1, 'Item ID is required');
export const TimestampSchema = z.union([
  z.object({
    _seconds: z.number(),
    _nanoseconds: z.number(),
  }),
  z.date(),
  z.string(),
  z.null(),
]);
export const ItemStatusSchema = z.enum(['draft', 'active', 'retired', 'archived']);
export const ComplexityLevelSchema = z.enum(['simple', 'moderate', 'complex']);
export const QuestionTypeSchema = z.enum(['A', 'K', 'V', 'R', 'mcq']);

// ============================================
// AI Function Schemas
// ============================================

export const GenerateMCQSchema = z.object({
  topicIds: z.array(TopicIdSchema).min(1).max(5).optional(),
  difficulty: DifficultySchema.optional(),
  entityName: z.string().min(1).max(200).optional(),
  useAI: z.boolean().optional(),
});

export const BoardStyleMCQSchema = z.object({
  topic: z.string().min(1).max(200),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  focusArea: z.string().min(1).max(200).optional()
});

export const ReviewMCQSchema = z.object({
  draftItem: z.object({
    stem: z.string().min(10),
    leadIn: z.string().min(5),
    options: z.array(z.object({
      text: z.string().min(1),
      isCorrect: z.boolean()
    })).length(5),
    explanation: z.string().min(10),
    topicIds: z.array(TopicIdSchema).optional()
  }),
  draftId: z.string().min(1)
});

export const ScoreMCQSchema = z.object({
  questionItem: z.object({
    stem: z.string().min(10),
    leadIn: z.string().min(5),
    options: z.array(z.object({
      text: z.string().min(1),
      isCorrect: z.boolean()
    })).min(2),
    explanation: z.string().min(10)
  }),
  reviewData: z.any().optional(),
  draftId: z.string().min(1)
});

export const TutorQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  context: z.object({
    questionId: z.string().optional(),
    topicId: TopicIdSchema.optional(),
    sessionHistory: z.array(z.any()).optional()
  }).optional()
});

// ============================================
// Personalization Engine Schemas
// ============================================

export const UpdateAbilitySchema = z.object({
  userId: UIDSchema,
  questionId: z.string().min(1),
  isCorrect: z.boolean(),
  difficulty: DifficultySchema,
  timeSpent: z.number().min(0).optional(),
  confidenceLevel: z.enum(['low', 'medium', 'high']).optional()
});

export const GetNextItemSchema = z.object({
  userId: UIDSchema,
  topicId: TopicIdSchema.optional(),
  targetDifficulty: DifficultySchema.optional(),
  excludeIds: z.array(z.string()).optional()
});

export const GetNextItemsSchema = z.object({
  count: z.number().int().positive().max(20).default(5),
  userId: UIDSchema.optional(),
  topicIds: z.array(TopicIdSchema).optional(),
  difficulty: DifficultySchema.optional(),
  excludeIds: z.array(ItemIdSchema).optional(),
  mixAdaptive: z.boolean().optional(),
});

export const RecordAnswerSchema = z.object({
  itemId: ItemIdSchema,
  answer: z.number().int().min(0),
  correct: z.boolean(),
  timeSpent: z.number().positive(),
  confidence: z.number().min(0).max(100).optional(),
  userId: UIDSchema.optional(),
});

export const RecordQuizSessionSchema = z.object({
  sessionId: z.string().min(1),
  answers: z.array(z.object({
    itemId: ItemIdSchema,
    answer: z.number().int().min(0),
    correct: z.boolean(),
    timeSpent: z.number().positive(),
    confidence: z.number().min(0).max(100).optional(),
  })),
  totalTime: z.number().positive(),
  completedAt: TimestampSchema.optional(),
  userId: UIDSchema.optional(),
});

export const SRSUpdateSchema = z.object({
  userId: UIDSchema,
  cardId: z.string().min(1),
  rating: z.number().min(1).max(5),
  timeSpent: z.number().min(0).optional()
});

export const AdaptiveGenerationSchema = z.object({
  userId: UIDSchema,
  recentMissed: z.array(z.object({
    questionId: z.string(),
    topicIds: z.array(TopicIdSchema),
    chosenIndex: z.number(),
    correctIndex: z.number()
  })).optional(),
  focusArea: z.string().optional(),
  count: z.number().min(1).max(10).optional()
});

// Quality & Feedback Schemas
export const SubmitFeedbackSchema = z.object({
  itemId: ItemIdSchema,
  userId: UIDSchema,
  feedbackType: z.enum(['incorrect', 'unclear', 'too_easy', 'too_hard', 'offensive', 'other']),
  description: z.string().max(500).optional(),
  suggestedCorrection: z.string().max(500).optional(),
});

export const QualityReviewQueueSchema = z.object({
  status: z.enum(['pending', 'in_review', 'resolved']).optional(),
  limit: z.number().int().positive().max(50).default(10),
  orderBy: z.enum(['created_at', 'feedback_count', 'priority']).optional(),
});

export const ResolveQualityReviewSchema = z.object({
  itemId: ItemIdSchema,
  reviewId: z.string().min(1),
  resolution: z.enum(['fixed', 'no_action', 'retired']),
  notes: z.string().max(500).optional(),
  updates: z.object({
    stem: z.string().optional(),
    leadIn: z.string().optional(),
    options: z.array(z.object({
      text: z.string().min(1),
      isCorrect: z.boolean()
    })).optional(),
    explanation: z.string().optional(),
    keyIndex: z.number().int().min(0).optional(),
  }).optional(),
});

// ============================================
// Admin Function Schemas
// ============================================

export const GenerateQuestionQueueSchema = z.object({
  count: z.number().min(1).max(100).optional(),
  topicWeighting: z.enum(['uniform', 'weighted', 'adaptive']).optional(),
  difficultyTarget: DifficultySchema.optional()
});

export const ReviewQuestionSchema = z.object({
  questionId: z.string().min(1),
  action: z.enum(['approve', 'reject', 'revise']),
  notes: z.string().max(1000).optional(),
  revisions: z.object({
    stem: z.string().optional(),
    leadIn: z.string().optional(),
    options: z.array(z.object({
      text: z.string(),
      isCorrect: z.boolean()
    })).optional(),
    explanation: z.string().optional()
  }).optional()
});

export const SetItemTaxonomySchema = z.object({
  itemId: z.string().min(1),
  categoryId: z.string().min(1),
  subCategoryId: z.string().optional(),
  topicIds: z.array(TopicIdSchema).min(1),
  difficulty: DifficultySchema.optional(),
  tags: z.array(z.string()).optional()
});

export const GrantAdminRoleSchema = z.object({
  email: EmailSchema,
  role: z.enum(['admin', 'reviewer', 'contributor']).optional(),
});
export const RevokeAdminRoleSchema = z.object({
  email: EmailSchema,
  role: z.enum(['admin', 'reviewer', 'contributor']).optional(),
});

// ============================================
// Item Management Schemas
// ============================================

export const ItemsGetSchema = z.object({
  status: z.enum(['active', 'draft', 'retired']).optional(),
  topicIds: z.array(TopicIdSchema).optional(),
  difficulty: z.object({
    min: DifficultySchema.optional(),
    max: DifficultySchema.optional()
  }).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional()
});

export const ItemsProposeSchema = z.object({
  stem: z.string().min(10),
  leadIn: z.string().min(5),
  options: z.array(z.object({
    text: z.string().min(1),
    isCorrect: z.boolean()
  })).length(5),
  explanation: z.string().min(10),
  topicIds: z.array(TopicIdSchema).min(1),
  difficulty: DifficultySchema.optional(),
  source: z.string().optional(),
  references: z.array(z.string()).optional()
});

export const ItemsPromoteSchema = z.object({
  draftId: z.string().min(1),
  notes: z.string().optional()
});

export const ItemsReviseSchema = z.object({
  itemId: z.string().min(1),
  revisions: z.object({
    stem: z.string().optional(),
    leadIn: z.string().optional(),
    options: z.array(z.object({
      text: z.string(),
      isCorrect: z.boolean()
    })).optional(),
    explanation: z.string().optional(),
    topicIds: z.array(TopicIdSchema).optional(),
    difficulty: DifficultySchema.optional()
  }),
  reason: z.string().min(1).max(500)
});

// ============================================
// Knowledge Base Schemas
// ============================================

export const KBSearchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().min(1).max(50).optional(),
  minQuality: z.number().min(0).max(100).optional(),
  categories: z.array(z.string()).optional()
});

// ============================================
// Activity & Monitoring Schemas
// ============================================

export const ActivityLogSchema = z.object({
  action: z.string().min(1),
  category: z.enum(['quiz', 'study', 'review', 'admin', 'system']),
  metadata: z.record(z.string(), z.any()).optional(),
  timestamp: TimestampSchema.optional(),
});

export const ActivityGetSchema = z.object({
  userId: UIDSchema.optional(),
  category: z.enum(['quiz', 'study', 'review', 'admin', 'system']).optional(),
  startDate: TimestampSchema.optional(),
  endDate: TimestampSchema.optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export const GetMetricsSchema = z.object({
  metricTypes: z.array(z.enum(['performance', 'errors', 'usage', 'costs'])).optional(),
  startTime: TimestampSchema.optional(),
  endTime: TimestampSchema.optional(),
  aggregation: z.enum(['sum', 'avg', 'max', 'min']).optional(),
});

export const GetLogsSchema = z.object({
  severity: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
  functionName: z.string().optional(),
  startTime: TimestampSchema.optional(),
  endTime: TimestampSchema.optional(),
  limit: z.number().int().positive().max(1000).default(100),
});

// ============================================
// Board-Style Question Schemas
// ============================================

export const BoardStyleGenerationSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  subtopic: z.string().optional(),
  complexity: ComplexityLevelSchema.default('moderate'),
  count: z.number().int().positive().max(5).default(1),
  includeImages: z.boolean().default(false),
  qualityThreshold: z.number().min(60).max(100).default(80),
  maxIterations: z.number().int().positive().max(5).default(3),
});

export const BoardStyleEvaluationSchema = z.object({
  question: z.object({
    stem: z.string().min(50, 'Clinical vignette must be detailed'),
    leadIn: z.string().min(1),
    options: z.array(z.object({
      text: z.string().min(1),
    })).length(5, 'Must have exactly 5 options'),
    explanation: z.string().min(50),
    keyIndex: z.number().int().min(0).max(4),
  }),
  evaluationCriteria: z.array(z.enum([
    'clinical_relevance',
    'vignette_completeness',
    'distractor_quality',
    'application_level',
    'clarity',
  ])).optional(),
});

// ============================================
// Validation Helper
// ============================================

/**
 * Validates input data against a schema
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated data
 * @throws HttpsError if validation fails
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid input: ${errors}`
      );
    }
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid input data'
    );
  }
}

/**
 * Creates a validated Cloud Function
 * @param schema - Zod schema for input validation
 * @param handler - Function handler
 * @returns Validated Cloud Function
 */
export function validatedFunction<T>(
  schema: z.ZodSchema<T>,
  handler: (data: T, context: functions.https.CallableContext) => Promise<any>
): functions.HttpsFunction {
  return functions.https.onCall(async (data, context) => {
    const validatedData = validateInput(schema, data);
    return handler(validatedData, context);
  });
}
