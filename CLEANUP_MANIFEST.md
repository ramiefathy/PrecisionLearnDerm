# Cleanup Manifest - Multi-Agent Pipeline Consolidation
**Date**: 2025-08-18
**Purpose**: Remove redundant files and consolidate multi-agent pipeline

## Files Marked for Deletion

### AI Pipeline - Redundant Implementations
These files represent parallel development efforts that were never consolidated:

#### Redundant Generators
- `functions/src/ai/abdCompliantGenerator.ts` - Obsolete ABD compliance generator
- `functions/src/ai/boardStyleGenerator.ts` - Duplicate of boardStyleGeneration.ts
- `functions/src/ai/boardStyleTemplates.ts` - Unused template system
- `functions/src/ai/enhancedQuestionGenerator.ts` - Duplicate question generation logic

#### Abandoned Pipeline Attempts
- `functions/src/ai/enhancedPipelineV2.ts` - Incomplete v2 pipeline
- `functions/src/ai/optimizedQuestionPipeline.ts` - Over-optimized parallel attempt
- `functions/src/ai/parallelPipeline.ts` - Incomplete parallel processing
- `functions/src/ai/quotaAwarePipeline.ts` - Over-engineered quota management

#### Redundant Orchestrators
- `functions/src/ai/orchestratorEnhanced.ts` - Competing orchestrator implementation
- `functions/src/ai/qualityOrchestrator.ts` - Partial duplicate of main orchestrator

#### Unused Utilities
- `functions/src/ai/semanticCache.ts` - Unused caching layer
- `functions/src/ai/smartPromptManager.ts` - Unnecessary abstraction layer

### Admin Panel - Redundant Pages
- `web/src/pages/AdminQuestionGenerationPage.tsx` - Duplicate of queue functionality
- `web/src/pages/AdminItemEditorPage.tsx` - Overlaps with review page
- `web/src/pages/AdminTestingPage.tsx` - Should be development only

## Files to Keep and Enhance

### Core Pipeline (To Be Refactored)
- `functions/src/ai/orchestratorAgent.ts` - Main orchestrator (to be enhanced)
- `functions/src/ai/boardStyleGeneration.ts` - Board-style generation (keep)
- `functions/src/ai/drafting.ts` - Core drafting agent
- `functions/src/ai/review.ts` - Review agent
- `functions/src/ai/scoring.ts` - Scoring agent

### Admin Panel - Core Pages
- `web/src/pages/AdminQuestionBankPage.tsx` - Main question management
- `web/src/pages/AdminQuestionReviewPage.tsx` - Review workflow
- `web/src/pages/AdminTaxonomyPage.tsx` - Taxonomy management

## Reason for Removal

These files were identified through analysis showing:
1. No imports in production code (index.ts)
2. Duplicate functionality with maintained files
3. Incomplete or abandoned implementations
4. Over-engineering without clear benefits

## Model Optimization Plan

### Current (Inefficient)
- All agents use `gemini-2.5-pro`

### New (Optimized)
- **Complex Tasks** (gemini-2.5-pro):
  - Drafting Agent
  - Summarization Agent
  
- **Simple Tasks** (gemini-2.5-flash):
  - Search Query Optimization
  - Review Agent
  - Scoring Agent
  - Validation Agent

Expected API cost reduction: ~60%
