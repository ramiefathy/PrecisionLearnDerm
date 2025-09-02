CLAUDE.md — Agent Development Playbook (PrecisionLearnDerm)
Last updated: 2025‑09‑02 (Rev 2)

System Snapshot

Frontend: React 19, Vite 6, TypeScript, Firebase Hosting
Backend: Firebase Cloud Functions (Node 20 + TypeScript), callable functions preferred
Data: Firestore (rules + indexes), Firebase Storage (rules)
AI: Gemini 2.5 Pro (primary), Gemini 2.5 Flash (fallback), structured text protocols
Knowledge: Lazy, in‑memory KB + taxonomy singleton
Knowledge Base: GraphRAG population pipeline, PDF extraction, multi-source augmentation
Observability: Structured logs/metrics in Firestore, health check endpoints
Build/Test: Functions via mocha + emulators; Web via Vitest/RTL
CI/CD: GitHub Actions with connection check, build validation, and Firebase deployment
Repository: Clean state with tracked lockfiles and web/src/lib source files
Context Ingestion Checklist (Read Before Coding)
Backend entrypoint: functions/src/index.ts (exports cancelEvaluationJob)
Orchestrator: functions/src/ai/adaptedOrchestrator.ts → functions/src/ai/optimizedOrchestrator.ts
Drafting: functions/src/ai/drafting.ts (structured text, not JSON)
Review: functions/src/ai/reviewAgentV2.ts (Gemini client v2, retry-aware)
Scoring: functions/src/ai/scoring.ts (structured rubric parsing)
Evaluation: functions/src/evaluation/evaluationProcessor.ts (canonicalization + cancel support)
Timeouts/Concurrency: functions/src/util/timeoutProtection.ts, functions/src/util/robustGeminiClient.ts, functions/src/util/concurrentExecutor.ts
Caching: functions/src/util/enhancedCache.ts (L1 memory + L2 Firestore), functions/src/util/sharedCache.ts (topic/context helpers)
Knowledge/Taxonomy: functions/src/services/knowledgeBaseSingleton.ts, functions/src/services/taxonomyService.ts
Auth/Guardrails: functions/src/util/auth.ts, functions/src/util/corsConfig.ts, functions/src/util/middleware.ts
Monitoring/Logging: functions/src/util/monitoring.ts, functions/src/util/logging.ts
Firestore security: firestore.rules, storage.rules
Frontend Firebase integration: web/src/lib/firebase.ts
Frontend route guards: web/src/app/routes.tsx, web/src/contexts/AuthContext.tsx
Explanation rendering (sanitized): web/src/lib/markdown.ts, web/src/components/QuizRunner.tsx
GraphRAG KB Population:
Pipeline entry: GraphRAG/integrated_pipeline.py
PDF processing: GraphRAG/pdf_indexer.py (critical load() fix applied)
Augmentation: GraphRAG/augmented_field_extractor.py
Batch processing: GraphRAG/batch_processor.py
Infrastructure: GraphRAG/singleton_base.py, GraphRAG/memory_manager.py
Configuration: GraphRAG/secure_config.py (env vars only)
Golden Rules (Do/Don't)
Do use https.onCall + requireAuth/requireAdmin for callable functions; prefer verifyAdmin(req) for onRequest.
Don't trust frontend profile fields for admin; rely on ID token customClaims.admin.
Do use robustGeminiClient with structured text; don't use JSON responses for long content.
Do lazy‑load heavy data (KB/Taxonomy); never load megabyte files at module scope.
Don't create circular dependencies (util modules must not import each other in loops).
Do use L1 (memory) + L2 (Firestore) caching; don't re-run web searches or LLM calls unnecessarily.
Do sanitize any HTML on the client; only use renderSafeMarkdown.
Don't expose test endpoints in production; guard on env and require admin.
Do set timeouts (120s) and limit retries; don't block event loop with long sync work.
Do use ThreadSafeSingleton base class for all manager components (GraphRAG).
Don't use pickle serialization; use JSON for security.
Do implement proper PDF loading before indexing (load() call required).
Don't process entities sequentially; use semaphore-based parallelization.
Do cache augmentation results to avoid repeated API calls.
Never use mock implementations - all components must be real/functional.
Do write canonical fields (normalized.*, aiScoresFlat.*) for UI resilience.
Do handle correctAnswer === 0 as valid in quality scoring.
Don't delete lockfiles in CI; preserve for reproducible builds.

Pipeline Evaluation System (Admin)

Entry points
- Web page: `web/src/pages/AdminEvaluationPage.tsx` → renders config form, live dashboard, logs
- Components: `EvaluationDashboard`, `EvaluationProgressMonitor`, `LiveEvaluationLogs`, `EvaluationResultsDisplay`
- Cloud Functions: 
  - `startPipelineEvaluation` (callable): creates job + triggers processing
  - `processBatchTests` (callable): processes tests in intelligent batches, now with cancel checks
  - `cancelEvaluationJob` (callable): sets `cancelRequested` on the job and logs request

Data model
- Job doc: `evaluationJobs/{jobId}` with `status`, `config`, `progress`, timestamps, and (new) `cancelRequested`, `cancellationReason`
- Subcollections:
  - `testResults/test_{index}`: now includes canonicalized fields
    - `normalized.optionsArray`: always [A..E]
    - `normalized.correctAnswerIndex`: 0–4
    - `normalized.correctAnswerLetter`: 'A'–'E'
    - `aiScoresFlat.*`: overall, boardReadiness, clinicalRealism, medicalAccuracy, distractorQuality, cueingAbsence
  - `liveLogs/*`: structured progress and result logs

UI normalization (implemented)
- Options rendering handles both array and object sources; prefers `normalized.optionsArray`
- Correct answer supports both numeric index and letter; prefers `normalized.correctAnswerLetter`
- AI score charts/table chips read `aiScoresFlat.*` with fallback to nested `aiScores`
- Quality units standardized to 0–100% across dashboards/results

Backend robustness (implemented)
- `evaluateQuestionWithAI` normalizes numeric correctAnswer to letter in prompts (improves scoring clarity)
- Rule-based `calculateQualityScore` now counts correctAnswer when it is 0 (board-style index)
- `processBatchTestsLogic` checks `cancelRequested` before starting and after each batch; logs `evaluation_cancelled` and fails job with "Cancelled by user"
- `storeTestResult` writes canonical fields for consistent UI consumption across pipeline variations

Deployment guidance (short-timeout safe)
- Prerequisites:
  - Ensure `GEMINI_API_KEY` is set: `firebase functions:secrets:set GEMINI_API_KEY`
  - Verify lockfiles exist: `functions/package-lock.json` and `web/package-lock.json`
  - Check project: `firebase use dermassist-ai-1zyic`
- Build functions: `cd functions && npm ci && npm run build && cd ..`
- Deploy functions individually (avoids 540s timeout):
  - `firebase deploy --only functions:cancelEvaluationJob --project dermassist-ai-1zyic`
  - `firebase deploy --only functions:processBatchTests --project dermassist-ai-1zyic`
  - `firebase deploy --only functions:startPipelineEvaluation --project dermassist-ai-1zyic`
- Build web: `cd web && npm install && npm run build && cd ..`
- Deploy hosting: `firebase deploy --only hosting --project dermassist-ai-1zyic`

Operational checks
- Start an evaluation: live progress fills, charts show AI metrics from `aiScoresFlat`
- Cancel during run: cancel button calls `cancelEvaluationJob`; job flips to failed with cancellation logs
- Firestore: verify `normalized.*` and `aiScoresFlat.*` present in `testResults`
AI Usage — Structured Text Protocols (Required)
Drafting (functions/src/ai/drafting.ts)
Operation: draft_mcq_structured
Preferred Model: gemini-2.5-pro; fallback: gemini-2.5-flash
Timeout: 120000 ms
Prompt produces sections:
CLINICAL_VIGNETTE:
LEAD_IN:
OPTION_A:
OPTION_B:
OPTION_C:
OPTION_D:
OPTION_E:
CORRECT_ANSWER: [A–E]
CORRECT_ANSWER_RATIONALE:
DISTRACTOR_1_EXPLANATION:
DISTRACTOR_2_EXPLANATION:
DISTRACTOR_3_EXPLANATION:
DISTRACTOR_4_EXPLANATION:
EDUCATIONAL_PEARLS:
QUALITY_VALIDATION:
Parse via parseStructuredMCQResponse in drafting.ts. Never switch to JSON; it truncates.
Scoring (functions/src/ai/scoring.ts)

Operation: enhanced_scoring_structured (through robust client)
The model returns rubric lines:
=== SCORING RUBRIC ===
COGNITIVE_LEVEL: 1–5
VIGNETTE_QUALITY: 1–5
OPTIONS_QUALITY: 1–5
TECHNICAL_CLARITY: 1–5
RATIONALE_EXPLANATIONS: 1–5
… plus feedback sections and difficulty prediction fields.
Parse via parseStructuredScoringResponse.
Review (functions/src/ai/reviewAgentV2.ts)

Default path uses Review Agent V2 with client.models.generateContent
Retries and fallback included; keep prompt concise and structured for stable parsing.
Robust Client Usage (functions/src/util/robustGeminiClient.ts)

Always use:
const client = getRobustGeminiClient({ maxRetries: 3, fallbackToFlash: true, timeout: 120000 });
await client.generateText({ prompt, operation: '...', preferredModel: 'gemini-2.5-pro' });
Avoid direct SDK calls in new code unless mirroring reviewAgentV2's pattern.
GraphRAG Knowledge Base Population

Architecture
Pipeline: Phase 1 (PDF caching) + Phase 2 (parallel processing) + Phase 3 (execution)
Data Sources: Bolognia PDF (3,205 pages) + NCBI PubMed + OpenAlex + Web search
Entity Types: 20 types including diagnosis (831), dermpath_neoplasm (121), drug (120)
Performance Target: <3 seconds per entity (from 40-60 seconds baseline)

Key Components
PDF Indexer (GraphRAG/pdf_indexer.py):
Page-by-page extraction with entity name matching
CRITICAL: Must call self.load() before indexing
Context window: ±2 pages around entity mentions
Cache complete index to eliminate 20x redundancy

Augmentation Pipeline (GraphRAG/augmented_field_extractor.py):
Primary extraction via Gemini API
Parallel augmentation for missing fields
Multi-source: NCBI (10 req/s limit), OpenAlex, web search
AMA citation formatting for all sources

Resource Management:
Memory thresholds for M2 Max (32GB): 75% safe, 85% warning, 90% critical
Token bucket rate limiting for API calls
Adaptive batch sizing based on memory usage
Thread-safe singleton pattern for all managers

Performance Optimizations (Required)
Caching Layer:
class AugmentationCache:
    def __init__(self, ttl_hours=24):
        self.cache = {}
        self.ttl = ttl_hours * 3600
        
    async def get_or_fetch(self, key, fetch_func):
        if key in self.cache:
            entry, timestamp = self.cache[key]
            if time.time() - timestamp < self.ttl:
                return entry
        result = await fetch_func()
        self.cache[key] = (result, time.time())
        return result

Entity Parallelization:
Use asyncio.Semaphore(10) for controlled concurrency
Process entities in batches of 50-100
Maintain proper error handling with gather(return_exceptions=True)

Field Prioritization:
Reduce augmentation from 20 to 5 high-priority fields
Skip augmentation if entity >80% complete
Focus on: recent_advances, genetic_factors, treatment, diagnosis, prognosis

Expected Performance Gains:
Caching: 40-60% fewer API calls
Parallel entities: 10x throughput increase
Reduced fields: 70% fewer augmentations
Combined: ~2-3 seconds per entity (20x improvement)

Performance Playbook
Parallelization: Use executeConcurrently for NCBI/OpenAlex searches (10s default per op, 2 retries). See performParallelWebSearch in optimizedOrchestrator.ts.
Caching:
enhancedCache.ts: getMCQCache(), getContextCache(), getTemplateCache() → L1 memory + L2 Firestore, TTL by type.
sharedCache.ts: supplemental topic/context caching.
Cache keys must be stable hashes of prompts/queries; don’t include volatile timestamps.
Lazy Loading:
Taxonomy: taxonomyService.initialize() pulls from knowledgeBaseSingleton.getTaxonomyOnly(); never import heavy data at module scope.
KB: knowledgeBaseSingleton caches and reuses instances per function container.
Time budgets:
Draft/Review/Score each within ~120s total; aim to keep sub-steps <30s.
Web search parallelization target: ~3–5s combined (cache if repeated).
Logging overhead:
monitoring.ts writes logs to Firestore; keep payloads small; avoid logging entire LLM outputs.
For hot paths, consider sampling.
GraphRAG Performance:
API Call Reduction: Cache augmentation results with AugmentationCache (40-60% reduction)
Concurrent Processing: 10 entities parallel with asyncio.Semaphore for rate limit safety
Memory Management: Monitor with MemoryManager thresholds (75/85/90/95%)
PDF Caching: Complete index caching eliminates 20x redundancy in 240MB file
Batch Strategies: 75 entities sequential, 40 entities parallel (M2 Max optimized)
Security & Compliance Essentials
Secrets:
Use defineSecret in util/config.ts (GEMINI_API_KEY, NCBI_API_KEY). Never hardcode secrets.
Don’t commit service accounts; use default credentials in Functions and CI secrets.
Functions:
Prefer https.onCall; always call requireAuth or requireAdmin (util/auth.ts).
For onRequest, require verifyAuth/verifyAdmin (util/middleware.ts) and strict CORS with createCORSMiddleware/withCORS.
Firestore rules:
Users can only access their own docs; items write requires admin claim.
On create validations must use request.resource.data (not resource.data).
Frontend admin gating:
Don’t read admin from profile; gate critical UI on customClaims.admin and/or backend decisions.
Common Tasks (Recipes)
Add a callable admin function
Validate input with zod (functions/src/util/validation.ts).
Enforce: requireAdmin(context).
Wrap heavy work with timeouts; use robust cache if repeating.
Log with monitoring.log/logError; keep details small.
Example:
export const admin_doSomething = functions
.runWith({ timeoutSeconds: 120, memory: '1GB', secrets: ['GEMINI_API_KEY'] })
.https.onCall(async (data, context) => {
requireAdmin(context);
const input = validateInput(MyZodSchema, data);
const timer = new PerformanceTimer('admin_doSomething', { uid: context.auth!.uid });
try {
// lazy init if needed
await initializeTaxonomyService();
// do work with caching + robust client
await timer.end(true);
return { success: true, result: ... };
} catch (e: any) {
await logError('admin_doSomething.error', e, { uid: context.auth?.uid });
throw new functions.https.HttpsError('internal', e.message || 'Failed');
}
});

Use the orchestrator in new flows

Call orchestrateQuestionGeneration (callable wrapper) or generateQuestionsOptimized internally.
Feed sanitized input via sanitizeOrchestratorInput; set useStreaming only if endpoints are enabled.
Store results with minimal payloads; large agent outputs are optional and should be pruned.
Add LLM step safely

Reuse robustGeminiClient; define clear operation name; choose structured text schema.
Keep prompts short; include only necessary context; no raw logs of full prompt/response to Firestore.
Cache upstream context (web search results) and downstream final artifacts (MCQs) with TTL.
Run KB Population Pipeline

Environment Setup:
export GOOGLE_API_KEY="your-api-key"
export NCBI_API_KEY="your-ncbi-key"

Verify paths:
KB: /Users/ramiefathy/Downloads/dermatology_kb_v5.json
PDF: /Users/ramiefathy/Downloads/Dermatology/General Dermatology Textbooks/*Bolognia-New.pdf

Run with optimizations:
cd GraphRAG
python run_phase3_kb_population.py
# Select option 1-4 based on batch size

Monitor progress:
tail -f pipeline_monitoring.log

Analyze results:
python analyze_kb_completeness.py knowledgeBaseUpdating/output/final_augmented/final_augmented_kb.json

Debug PDF Indexer

Test PDF loading:
python test_pdf_indexer.py

Check entity extraction:
from pdf_indexer import PDFIndexer
indexer = PDFIndexer(pdf_path)
indexer.load()  # CRITICAL - must call before indexing
success = indexer.build_complete_index(entity_names)
context = indexer.get_entity_context("Psoriasis Vulgaris")

Frontend Integration Notes
Firebase App: web/src/lib/firebase.ts initializes app/auth/firestore/functions (region us-central1).
Explanation rendering: renderSafeMarkdown ensures DOMPurify; any new rich content must pass through sanitization.
Route guards:
ProtectedRoute relies on Firebase auth state.
AdminRoute should not trust profile.role/isAdmin; prefer ID token claims (customClaims.admin). If you need admin in UI, fetch via a secure callable that checks admin on server.
Deployment & Environments
Emulators:
Functions tests use firebase emulators with mocha; prefer emulator-driven tests for data ops.
CI/CD:
GitHub Actions workflows:
- `.github/workflows/connection-check.yml`: Validates Firebase auth, lists functions/secrets, tests health endpoint
- `.github/workflows/ci.yml`: Builds and tests on PR/push; uses `npm install` for web, `npm ci` for functions
- `.github/workflows/deploy-firebase.yml`: Auto-deploys functions on main push; requires `FIREBASE_TOKEN` secret
Deploy functions individually to avoid timeouts (see Deployment guidance above)
Envs:
NODE_ENV governs dev/prod behaviors in CORS and test endpoints; ensure production disables any public test function exports.
Web requires Vite env vars: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, etc.
Monitoring:
Health: functions/src/util/monitoring.ts (healthCheck onRequest)
Logs/Metrics: getLogs/getMetrics callable (admin‑guarded)
File/Module Patterns to Preserve
No heavyweight work at module load time (avoid taxonomy/KB loads outside functions).
Avoid circular deps:
enhancedCache uses console logging (not monitoring/logging) to break cycles.
monitoring imports health; health may import enhancedCache lazily.
Keep util modules side‑effect free; expose factories/getters (e.g., getTaxonomyService()).
Structured Specs (Quick Copy)
Drafting (A‑type MCQ: 5 options)
Required sections: CLINICAL_VIGNETTE, LEAD_IN, OPTION_A .. OPTION_E, CORRECT_ANSWER, CORRECT_ANSWER_RATIONALE, DISTRACTOR_1_EXPLANATION .. DISTRACTOR_4_EXPLANATION, EDUCATIONAL_PEARLS, QUALITY_VALIDATION
Lead‑in example: “What is the most likely diagnosis?”
Scoring (Rubric + Difficulty)

Keys: COGNITIVE_LEVEL, VIGNETTE_QUALITY, OPTIONS_QUALITY, TECHNICAL_CLARITY, RATIONALE_EXPLANATIONS
Feedback sections: <CRITERION>_FEEDBACK (bulleted)
Difficulty: PREDICTED_DIFFICULTY, CONFIDENCE_INTERVAL_MIN/MAX, DIFFICULTY_JUSTIFICATION
Pitfalls & Troubleshooting
"No parts array…" or empty response:
Ensure Review Agent V2 is used; retry via robust client; keep prompt size small.
Firebase deployment timeouts:
Check for circular imports; verify no heavy file IO at module scope; run madge if needed locally.
Deploy functions individually with --project flag to avoid 540s timeout.
Slow endpoints:
Add caching; parallelize independent calls; lower retries; verify external API timeouts (10s typical).
Production safety:
Ensure test/public onRequest endpoints are disabled or admin‑guarded; remove from index.ts exports in prod.
CI/CD Issues:
"Dependencies lock file not found": Ensure package-lock.json files are committed
EBADPLATFORM errors: Remove platform-specific devDependencies (darwin-arm64)
"Cannot find module ../lib/firebase": Ensure web/src/lib is tracked in git
GraphRAG Issues:
"0 pages loaded": Ensure pdf_indexer.load() is called before build_complete_index
Entity timeout (40-60s): Implement caching + parallelization (see Performance Optimizations)
Memory errors: Check MemoryManager thresholds, reduce batch size
API rate limits: Adjust semaphore values, implement exponential backoff
"Entity not found": Check entity name format matches PDF content exactly
Pickle errors: Replace with JSON serialization for security
Security Hardening (Actionable)
Always use defineSecret for GEMINI_API_KEY/NCBI_API_KEY; never fallback to literals.
Require admin for logs/metrics/introspection APIs (already implemented).
For any new HTTP endpoint, enforce:
withCORS('STRICT') + verifyAdmin(req) if sensitive
or convert to https.onCall with requireAdmin
Appendix A — High‑Value Entry Points

functions/src/index.ts: authoritative exports list (includes cancelEvaluationJob)
functions/src/ai/adaptedOrchestrator.ts: callable wrapper
functions/src/ai/optimizedOrchestrator.ts: parallel search + validation + agents
functions/src/ai/drafting.ts: structured drafting
functions/src/ai/reviewAgentV2.ts: robust review with GoogleGenAI
functions/src/ai/scoring.ts: rubric scoring + rewrite (optional)
functions/src/evaluation/evaluationProcessor.ts: batch processing + canonicalization
functions/src/evaluation/evaluationJobManager.ts: job lifecycle + quality scoring
functions/src/evaluation/aiQuestionScorer.ts: AI-powered board-style scoring
functions/src/services/taxonomyService.ts: lazy taxonomy API
functions/src/services/knowledgeBaseSingleton.ts: KB/taxonomy cache
functions/src/util/enhancedCache.ts: two-tier cache
functions/src/util/monitoring.ts: logs/metrics/health
firestore.rules, storage.rules: access control
web/src/components/evaluation/*: evaluation UI components
web/src/pages/AdminEvaluationPage.tsx: evaluation admin page
Appendix B — Example Robust Gemini Call
const client = getRobustGeminiClient({
maxRetries: 3,
fallbackToFlash: true,
timeout: 120000
});

const res = await client.generateText({
prompt: myPrompt,
operation: 'draft_mcq_structured',
preferredModel: 'gemini-2.5-pro',
temperature: 0.7
});

if (!res.success || !res.text) throw new Error(res.error || 'No text');
const mcq = parseStructuredMCQResponse(res.text);

Appendix C — Testing Guidance

Functions:
npm run build; run mocha in emulator context (see functions/package.json scripts)
Target small unit tests for new parsers/utilities; avoid external network
Frontend:
Expand Vitest coverage for critical routes and components with Firebase mocks (see web/src/tests/firebase-mocks.ts)
Appendix D — GraphRAG Entry Points

GraphRAG/integrated_pipeline.py: Main pipeline orchestrator combining Phase 1 & 2
GraphRAG/pdf_indexer.py: PDF processing with entity extraction (check load() fix)
GraphRAG/augmented_field_extractor.py: Multi-source augmentation (NCBI, OpenAlex, web)
GraphRAG/singleton_base.py: Thread-safe singleton pattern for managers
GraphRAG/memory_manager.py: M2 Max memory management with thresholds
GraphRAG/secure_config.py: Environment-based configuration (no hardcoded keys)
GraphRAG/batch_processor.py: Memory-efficient batch processing
GraphRAG/parallel_batch_coordinator.py: Parallel execution coordinator
GraphRAG/analyze_kb_completeness.py: KB quality and completeness analysis
GraphRAG/run_phase3_kb_population.py: Main execution script
GraphRAG/test_phase1_phase2_integration.py: Comprehensive component testing
GraphRAG/test_pdf_indexer.py: PDF indexer debugging and testing
