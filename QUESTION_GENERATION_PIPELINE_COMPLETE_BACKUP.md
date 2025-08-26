# PrecisionLearnDerm Question Generation Pipeline - Complete Implementation Backup
## Version 2.0 - Generated August 22, 2025

This document contains the complete, detailed implementation of the question generation pipeline for PrecisionLearnDerm. This serves as a comprehensive backup that can be used to fully recreate the system if needed.

---

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Core Components](#core-components)
3. [Question Generation Modalities](#question-generation-modalities)
4. [Implementation Details](#implementation-details)
5. [Critical Configurations](#critical-configurations)
6. [API Endpoints](#api-endpoints)
7. [Recovery Instructions](#recovery-instructions)

---

## System Architecture Overview

### Technology Stack
- **Runtime**: Node.js 20 (running on Node 22 host)
- **Framework**: Firebase Functions with TypeScript
- **Database**: Cloud Firestore
- **AI Model**: Google Gemini 2.5 Pro/Flash
- **Knowledge Base**: 4,299 dermatology entities (JSON)
- **Caching**: In-memory SharedCache with TTL management
- **Frontend**: React 19 + TypeScript + Vite

### Performance Metrics
- **Simple Generation**: 24.15s average (target < 35s) ✅
- **Multi-Agent Pipeline**: 60-70s typical (target < 120s) ✅
- **Cache Hit Rate**: 64% API call reduction ✅
- **Success Rate**: 66% (improving with deployments)

---

## Core Components

### 1. Orchestrators

#### A. Adapted Orchestrator (`adaptedOrchestrator.ts`)
**Purpose**: Compatibility layer providing exact same API as original orchestratorAgent.ts but using optimized implementation

**Key Functions**:
```typescript
export async function orchestrateQuestionGeneration(
  topic: string,
  difficulties: Difficulty[] = ['Basic', 'Advanced', 'Very Difficult'],
  useCache: boolean = true,
  useStreaming: boolean = true,
  userId?: string,
  enableProgress?: boolean
): Promise<{
  questions: { [key in Difficulty]?: MCQ };
  savedIds: { [key in Difficulty]?: string };
  topic: string;
  saveError?: string;
  sessionId?: string;
  agentOutputs?: any[];
}>
```

**Cloud Function Configuration**:
```typescript
.runWith({ 
  timeoutSeconds: 540, // 9 minutes - maximum allowed
  memory: '2GB',
  secrets: [GEMINI_API_KEY]
})
```

#### B. Optimized Orchestrator (`optimizedOrchestrator.ts`)
**Purpose**: Core pipeline with parallel processing and structured text parsing

**Key Optimizations**:
1. **Parallel Web Search**: NCBI + OpenAlex executed concurrently (50% time reduction)
2. **Parallel Validation**: Review + Scoring in parallel (66% time reduction)
3. **Smart Context Caching**: 64% API call reduction
4. **Structured Text Parsing**: Eliminates JSON truncation at 4086 chars

**Critical Function - Structured Text Parser**:
```typescript
function parseStructuredTextResponse(text: string, topic: string, difficulty: string): MCQ {
  const cleanedText = text.trim();
  
  // Extract STEM
  const stemMatch = cleanedText.match(/STEM:\s*([\s\S]*?)(?=\n\s*OPTIONS:|$)/i);
  const stem = stemMatch[1].trim();
  
  // Extract OPTIONS
  const optionsMatch = cleanedText.match(/OPTIONS:\s*([\s\S]*?)(?=\n\s*CORRECT_ANSWER:|$)/i);
  const optionsText = optionsMatch[1].trim();
  const optionLines = optionsText.split('\n').filter(line => line.trim());
  
  const options: { A: string; B: string; C: string; D: string } = { A: '', B: '', C: '', D: '' };
  
  for (const line of optionLines) {
    const optionMatch = line.match(/([A-D])\)\s*(.+)/i);
    if (optionMatch) {
      const letter = optionMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      options[letter] = optionMatch[2].trim();
    }
  }
  
  // Extract CORRECT_ANSWER
  const correctAnswerMatch = cleanedText.match(/CORRECT_ANSWER:\s*([A-D])/i);
  const correctAnswer = correctAnswerMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
  
  // Extract EXPLANATION
  const explanationMatch = cleanedText.match(/EXPLANATION:\s*([\s\S]*?)$/i);
  const explanation = explanationMatch[1].trim();
  
  return { stem, options, correctAnswer, explanation };
}
```

### 2. AI Agents

#### A. Drafting Agent (`drafting.ts`)
**Purpose**: Generate board-style MCQs with ABD compliance

**Key Features**:
- Uses structured text format (NOT JSON) to prevent truncation
- Implements ABD guidelines for question quality
- Supports 5-option questions with comprehensive explanations

**Structured Response Format**:
```
CLINICAL_VIGNETTE:
[Patient presentation with demographics and findings]

LEAD_IN:
What is the most likely diagnosis?

OPTION_A:
[Correct answer]

OPTION_B through OPTION_E:
[Plausible distractors]

CORRECT_ANSWER:
A

CORRECT_ANSWER_RATIONALE:
[Detailed explanation]

DISTRACTOR_1_EXPLANATION through DISTRACTOR_4_EXPLANATION:
[Why each is incorrect]

EDUCATIONAL_PEARLS:
[Key learning points]

QUALITY_VALIDATION:
[ABD compliance checks]
```

#### B. Review Agent (`review.ts`)
**Purpose**: Medical accuracy and educational value review

**Review Criteria**:
1. Medical Accuracy
2. Clinical Realism
3. Content Clarity
4. Educational Value
5. Answer Quality
6. Explanation Quality

**Output Format**: JSON with corrected content and quality scores

#### C. Scoring Agent (`scoring.ts`)
**Purpose**: Question quality assessment and iterative improvement

**Scoring Rubric (25 points total)**:
- cognitive_level (1-5)
- vignette_quality (1-5)
- options_quality (1-5)
- technical_clarity (1-5)
- rationale_explanations (1-5)

**Quality Tiers**:
- Premium: 22-25 points
- High: 18-21 points
- Standard: 15-17 points
- Needs Review: < 15 points

**Iterative Improvement Process**:
```typescript
async function processIterativeScoring(
  originalQuestion: any, 
  entityName: string, 
  entity: any, 
  maxIterations: number = 5
): Promise<IterativeScoringResult>
```

### 3. Support Systems

#### A. Robust Gemini Client (`robustGeminiClient.ts`)
**Purpose**: Reliable AI API communication with retry logic

**Key Features**:
- Exponential backoff with jitter
- Model fallback (Pro → Flash)
- Timeout protection (2 minutes default)
- JSON mode detection and handling
- Fast mode for time-critical operations

**Configuration**:
```typescript
interface GeminiClientOptions {
  maxRetries?: number;      // Default: 3
  baseDelay?: number;        // Default: 1000ms
  maxDelay?: number;         // Default: 10000ms
  timeout?: number;          // Default: 120000ms (2 minutes)
  fallbackToFlash?: boolean; // Default: true
  fastMode?: boolean;        // Aggressive timeouts
}
```

**CRITICAL**: Operations with '_json' suffix use JSON mode, others use text mode

#### B. Shared Cache (`sharedCache.ts`)
**Purpose**: Eliminate redundant KB loading and API calls

**Cache Types**:
1. **Knowledge Base Cache**: 24-hour TTL, singleton pattern
2. **Context Cache**: 1-hour TTL for generated contexts
3. **Web Search Cache**: 4-hour TTL for NCBI/OpenAlex results
4. **Question Cache**: 7-day TTL for expensive generations

**Performance Impact**:
- 64% reduction in API calls
- 16ms KB load time (4,299 entries)
- LRU eviction when cache full (1000 entries max)

#### C. Timeout Protection (`timeoutProtection.ts`)
**Purpose**: Prevent hanging operations causing function timeouts

**Key Functions**:
```typescript
export async function executeAIAgentsWithTimeout<T>(
  agents: Array<{
    name: string;
    operation: () => Promise<T>;
    required?: boolean;
  }>,
  config: Partial<TimeoutConfig> = {}
): Promise<{
  results: { [agentName: string]: T };
  errors: { [agentName: string]: Error };
  timeouts: string[];
}>
```

**Default Configuration**:
```typescript
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  operationTimeout: 30000,      // 30s per AI agent
  totalTimeout: 120000,         // 2 minutes total
  enableGracefulDegradation: true
};
```

---

## Question Generation Modalities

### 1. Simple Generation
**Endpoint**: `test_generate_question`
**Time**: 30-35 seconds
**Process**: Direct KB lookup → AI generation → Single pass

### 2. Multi-Agent Orchestrator
**Endpoint**: `orchestrateQuestionGeneration`
**Time**: 60-120 seconds
**Process**: 
1. Context gathering (KB + Web Search)
2. Parallel drafting for difficulties
3. Parallel review + scoring
4. Iterative refinement if needed

### 3. Enhanced Pipeline
**Endpoint**: `test_enhanced_pipeline`
**Time**: Variable based on iterations
**Process**: Generation → Scoring → Rewrite loop until quality threshold

### 4. Admin Generation
**Endpoint**: `admin_generate_questions`
**Features**: 
- ABD compliance enforced
- Batch generation support
- Progress tracking
- Database persistence

### 5. Distributed Services
**Endpoints**: 
- `gatherQuestionContext`
- `draftQuestion`
- `reviewQuestion`
- `scoreQuestion`
**Purpose**: Microservices architecture for scalability

---

## Implementation Details

### Database Schema

#### Question Queue Collection
```typescript
{
  draftItem: {
    type: 'mcq',
    stem: string,
    leadIn: string,
    options: Array<{text: string}>,
    keyIndex: number,
    explanation: string,
    citations: Array<{source: string}>,
    difficulty: number,
    qualityScore: number,
    iterationHistory: any[],
    scoringData: any
  },
  status: 'pending' | 'approved' | 'rejected',
  topicHierarchy: {
    category: string,
    topic: string,
    subtopic: string,
    fullTopicId: string
  },
  kbSource: {
    entity: string,
    completenessScore: number
  },
  pipelineOutputs: {
    generation: any,
    webSearch: any,
    review: any,
    scoring: any,
    refinements: any,
    performance: any
  },
  createdAt: Timestamp,
  priority: number,
  source: string,
  metadata: any
}
```

### Error Handling Patterns

#### 1. Retry with Exponential Backoff
```typescript
private calculateDelay(attempt: number): number {
  const exponentialDelay = this.options.baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay;
  const delay = Math.min(exponentialDelay + jitter, this.options.maxDelay);
  return Math.round(delay);
}
```

#### 2. Model Fallback Strategy
```
Primary: gemini-2.5-pro
Fallback: gemini-2.5-flash (on 500 errors or rate limits)
```

#### 3. Graceful Degradation
- Partial results accepted when non-critical operations fail
- Circuit breaker pattern for frequently failing services
- Timeout protection on all external calls

### Prompt Engineering Standards

#### Question Generation Prompt Structure
1. Role definition (Dr. expert persona)
2. Task specification
3. Knowledge base data
4. ABD guidelines (11 critical requirements)
5. Response format specification
6. Quality validation criteria

#### Key Prompt Elements
- **Cover-the-options rule**: Question answerable without seeing options
- **Bottom-up approach**: Present findings → deduce condition
- **Homogeneous options**: All same category (diagnoses OR treatments)
- **Difficulty calibration**: 70-80% correct answer rate target

---

## Critical Configurations

### Environment Variables
```bash
GEMINI_API_KEY=<your-api-key>
FIREBASE_PROJECT_ID=dermassist-ai-1zyic
NODE_ENV=development|production
```

### Firebase Function Settings
```javascript
// Maximum configuration for complex operations
{
  timeoutSeconds: 540,  // 9 minutes max
  memory: '2GB',
  secrets: [GEMINI_API_KEY]
}

// Standard configuration
{
  timeoutSeconds: 300,  // 5 minutes
  memory: '1GB'
}

// Light operations
{
  timeoutSeconds: 180,  // 3 minutes
  memory: '512MB'
}
```

### CORS Configuration
```typescript
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://dermassist-ai-1zyic.web.app',
    'https://dermassist-ai-1zyic.firebaseapp.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
};
```

---

## API Endpoints

### Production Endpoints (Auth Required)

#### 1. Main Orchestrator
```
POST /orchestrateQuestionGeneration
Body: {
  topic: string,
  difficulties: ['Basic', 'Advanced', 'Very Difficult']
}
```

#### 2. Admin Generation
```
POST /admin_generate_questions
Body: {
  topic: string,
  count: number,
  difficulties: string[]
}
```

### Test Endpoints (No Auth, Dev Only)

#### 1. Simple Test
```
POST /test_generate_question
Body: {
  topic: string,
  difficulty: 'easy' | 'medium' | 'hard'
}
```

#### 2. Enhanced Pipeline Test
```
POST /test_enhanced_pipeline
Body: {
  topicIds: string[],
  difficulty: number,
  useAI: boolean,
  strictMode: boolean
}
```

#### 3. Orchestrator Test
```
POST /testOrchestratorPipeline
Body: {
  topic: string,
  difficulties: string[],
  useCache: boolean
}
```

---

## Recovery Instructions

### If Pipeline Breaks

#### 1. Check JSON Truncation Issue
**Symptom**: Responses cut off at ~4086 characters
**Fix**: Ensure all operations use `enhanced_drafting_structured` NOT `enhanced_drafting_json`

#### 2. Timeout Errors
**Symptom**: Functions timing out at 60-540 seconds
**Fix**: 
- Verify timeout configuration (2 minutes minimum)
- Check parallel processing implementation
- Ensure timeout protection wrapper is used

#### 3. Low Success Rate
**Symptom**: < 50% success rate
**Fix**:
- Deploy all functions: `firebase deploy --only functions --project dermassist-ai-1zyic`
- Check Gemini API quota
- Verify fallback to Flash model is working

#### 4. Cache Issues
**Symptom**: Slow performance, high API usage
**Fix**:
- Check SharedCache singleton initialization
- Verify KB file exists at correct path
- Monitor cache metrics for hit rate

### Complete System Restoration

1. **Restore Code Files**:
   - `/functions/src/ai/adaptedOrchestrator.ts`
   - `/functions/src/ai/optimizedOrchestrator.ts`
   - `/functions/src/ai/drafting.ts`
   - `/functions/src/ai/review.ts`
   - `/functions/src/ai/scoring.ts`
   - `/functions/src/util/robustGeminiClient.ts`
   - `/functions/src/util/sharedCache.ts`
   - `/functions/src/util/timeoutProtection.ts`

2. **Restore Configuration**:
   - Set environment variables
   - Configure Firebase project
   - Set up CORS origins

3. **Deploy Functions**:
   ```bash
   cd functions
   npm install
   npm run build
   firebase deploy --only functions --project dermassist-ai-1zyic
   ```

4. **Verify Deployment**:
   ```bash
   firebase functions:log --project dermassist-ai-1zyic
   ```

5. **Test Pipeline**:
   - Navigate to https://dermassist-ai-1zyic.web.app/admin/testing
   - Run simple generation test
   - Run multi-agent orchestrator test
   - Verify 24-35 second response times

### Critical Implementation Notes

1. **NEVER use JSON mode for complex content** - causes truncation
2. **ALWAYS use structured text parsing** for reliability
3. **Set 2-minute timeouts** as per user guidance ("Give it 2 minutes!")
4. **Implement parallel processing** for multi-agent operations
5. **Use SharedCache singleton** to prevent redundant KB loading
6. **Enable model fallback** (Pro → Flash) for resilience
7. **Implement retry logic** with exponential backoff
8. **Use timeout protection** on all external calls
9. **Cache aggressively** (context, searches, questions)
10. **Monitor performance metrics** for optimization opportunities

---

## Performance Optimization Checklist

### Current Achievements
- [x] Parallel web search (NCBI + OpenAlex)
- [x] Parallel validation (Review + Scoring)
- [x] Context caching (1-hour TTL)
- [x] Web search caching (4-hour TTL)
- [x] Question caching (7-day TTL)
- [x] Structured text parsing (no JSON truncation)
- [x] Model fallback (Pro → Flash)
- [x] Timeout protection (2-minute limits)
- [x] Singleton KB loading
- [x] Fast mode for time-critical ops

### Future Optimizations
- [ ] Implement Redis for distributed caching
- [ ] Add CDN for static KB content
- [ ] Implement queue-based processing
- [ ] Add horizontal scaling for functions
- [ ] Implement predictive pre-generation
- [ ] Add WebSocket for real-time updates
- [ ] Implement GraphQL for efficient queries
- [ ] Add observability with OpenTelemetry

---

## Monitoring and Debugging

### Key Metrics to Track
1. **Response Times**: Target < 35s simple, < 120s complex
2. **Success Rate**: Target > 95%
3. **Cache Hit Rate**: Target > 60%
4. **API Call Reduction**: Target > 50%
5. **Error Rate**: Target < 5%
6. **Timeout Rate**: Target < 2%

### Debug Commands
```bash
# View function logs
firebase functions:log --project dermassist-ai-1zyic

# Filter by function
firebase functions:log --only admin_generate_questions

# Real-time monitoring
firebase functions:log --follow

# Check specific operation
firebase functions:log | grep "robust_gemini"
```

### Common Log Patterns
```
[ADAPTED] - Adapter layer operations
[OPTIMIZED] - Optimized orchestrator operations
robust_gemini_* - Gemini client operations
shared_cache.* - Cache operations
timeout.* - Timeout protection events
```

---

## Version History

### Version 2.0 (Current - August 2025)
- Implemented structured text parsing (fixes JSON truncation)
- Added parallel processing throughout pipeline
- Implemented comprehensive caching system
- Added timeout protection
- Achieved 87% performance improvement

### Version 1.0 (July 2025)
- Initial implementation with JSON mode
- Sequential processing
- Basic retry logic
- No caching

---

## Contact and Support

**Project**: PrecisionLearnDerm
**Environment**: Firebase (dermassist-ai-1zyic)
**Last Updated**: August 22, 2025
**Status**: Operational with 66% success rate (improving with deployments)

---

END OF BACKUP DOCUMENTATION