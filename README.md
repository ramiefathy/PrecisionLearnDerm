# PrecisionLearnDerm 🧠🩺

> AI-powered dermatology board exam preparation platform with advanced taxonomy-based question generation

[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Gemini](https://img.shields.io/badge/Gemini-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)

## 🌟 Overview

PrecisionLearnDerm is a sophisticated AI-powered platform designed to help medical professionals prepare for dermatology board examinations. The platform leverages multi-agent AI systems, advanced taxonomy organization, and personalized learning algorithms to deliver high-quality, contextually relevant practice questions.

### ✨ Key Features

- **🤖 Multi-Agent AI Pipeline**: Powered by Gemini 2.5 Pro with specialized agents for drafting, review, and scoring
- **📚 Taxonomy-Based Organization**: Hierarchical categorization of 4,299+ dermatology entities
- **⚡ Personalized Learning**: Adaptive question selection based on user performance and preferences
- **🏥 Board-Style Questions**: Clinically accurate questions following ABD guidelines
- **🎯 Real-time Performance Tracking**: SRS-based spaced repetition system
- **👨‍⚕️ Admin Dashboard**: Comprehensive management tools for educators and administrators

### 📊 Admin Pipeline Evaluation (New)

Test and compare AI pipelines with live dashboards, logs, and canonicalized results.

- Routes:
  - `/admin/evaluation` (legacy)
  - `/admin/evaluation-v2` (beta)
- UI Components:
  - `web/src/components/evaluation/EvaluationDashboard.tsx` — live charts, table, question dialog
  - `web/src/components/evaluation/EvaluationProgressMonitor.tsx` — progress + cancel
  - `web/src/components/evaluation/LiveEvaluationLogs.tsx` — streaming logs
  - `web/src/components/evaluation/EvaluationResultsDisplay.tsx` — final results view
- Functions:
  - `functions/src/evaluation/startPipelineEvaluation.ts` — create job and trigger processing
  - `functions/src/evaluation/evaluationProcessor.ts` — batched processing, logs, results (with cancel checks)
  - `functions/src/evaluation/evaluationJobManager.ts` — job lifecycle utils
  - `functions/src/evaluation/aiQuestionScorer.ts` — Gemini-based evaluation

Canonical fields saved per test for robust UI/analytics:
- `normalized.optionsArray`, `normalized.correctAnswerIndex`, `normalized.correctAnswerLetter`
- `aiScoresFlat.overall`, `.boardReadiness`, `.clinicalRealism`, `.medicalAccuracy`, `.distractorQuality`, `.cueingAbsence`

Cancel support: callable `cancelEvaluationJob` sets `cancelRequested` and the processor stops at batch boundaries.

### ⚠️ Frontend UI Note: MUI Grid usage
- Import with `import { Grid } from '@mui/material'`.
- Use the container/item API for compatibility with our CI/tooling:
  - Parent: `<Grid container spacing={...}>`

---

## 🛡 Medical / Ethical Disclaimer

PrecisionLearnDerm is an **educational tool only**. It:
- Does **not** provide medical advice, diagnosis, or treatment recommendations.
- Should **not** be used for patient care decisions.
- Includes AI-generated content that undergoes internal validation but may still contain inaccuracies.

Always defer to authoritative clinical sources and board guidelines. Report questionable items via the issue tracker or in-app feedback.

---

## ✅ Quick Start (TL;DR)

```bash
# 1. Clone
git clone git@github.com:ramiefathy/PrecisionLearnDerm.git
cd PrecisionLearnDerm

# 2. Install global tooling (optional but recommended)
npm i -g firebase-tools

# 3. Install workspace dependencies (choose one)
pnpm install   # preferred
# or
npm install

# 4. Bootstrap environment variables
cp .env.example .env
cp web/.env.example web/.env.local
cp functions/.env.example functions/.env

# 5. Auth with Firebase
firebase login

# 6. Emulators (local full-stack dev)
pnpm dev:emulators   # or: firebase emulators:start --import=./.cache/emulators

# 7. Web app
pnpm dev:web         # e.g. Vite/Next dev server

# 8. Run unit tests
pnpm test

# 9. Trigger sample evaluation job (script)
pnpm cli:evaluate --questionSet=sample --model=gemini-2.5-pro
```

---

## 🧩 Tech Stack (Pin & Verify)

| Layer | Technology | Target Version (example) | Notes |
|-------|------------|--------------------------|-------|
| Frontend | React | 18.x | SPA / admin dashboard |
| Frontend | TypeScript | 5.4.x | Strict mode enforced |
| Frontend UI | MUI (Material UI) | 5.x | Theming & Grid layout |
| Build | Vite or Next.js | (confirm) | Fast dev / SSR optional |
| Backend (FaaS) | Firebase Functions | Node 20 runtime | AI pipeline + admin APIs |
| Data | Firestore | N/A | Strong consistency for document reads |
| Auth | Firebase Auth | N/A | Email/password + (future) SSO |
| AI Provider | Google Gemini 2.5 Pro | API | Multi-axis scoring & generation |
| Package Manager | pnpm | 9.x | Deterministic, workspace support |
| Linting | ESLint | 9.x | Custom rules for MUI Grid usage |
| Formatting | Prettier | 3.x | Enforced in pre-commit |
| Testing | Vitest / Jest | (confirm) | Snapshot + domain tests |
| Type Checking | tsc | 5.4.x | CI gate |
| Observability | Structured Logs (JSON) | Internal | Firestore + Cloud Logging hybrid |
| Metrics | OpenTelemetry / Custom counters | Phase 1 | Export to GCP Metrics |
| CI/CD | GitHub Actions | Latest | Lint + test + deploy gates |
| Secrets | Firebase / GCP Secret Manager | N/A | Runtime injection |

(If an item differs in the actual codebase, update this table—this document is source-of-truth once aligned.)

---

## 🗂 Repository Layout (Illustrative)

```
/web                       Frontend application
  src/
    components/
    pages/
    lib/
    hooks/
  public/
  (tests)
/functions                 Firebase Cloud Functions source
  src/
    evaluation/
      startPipelineEvaluation.ts
      evaluationProcessor.ts
      evaluationJobManager.ts
      aiQuestionScorer.ts
      logSchema.ts
    domain/
    services/
    adapters/
  (tests)
/scripts                   One-off and maintenance scripts
/docs                      Architecture & data contracts (expand)
/infra                     Deployment configs (workflows, firestore rules)
```

---

## 🔐 Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| FIREBASE_PROJECT_ID | root /.env | Firebase project selection |
| FIREBASE_EMULATORS | root /.env | Toggle emulator usage |
| GEMINI_API_KEY | functions/.env | AI model access |
| EVAL_MAX_CONCURRENCY | functions/.env | Throttle processing |
| LOG_SINK | functions/.env | firestore|cloud|both |
| WEB_FIREBASE_API_KEY | web/.env.local | Browser config (non-secret) |
| WEB_FEATURE_FLAGS | web/.env.local | Comma-separated features |
| SENTRY_DSN / OTEL_EXPORTER_OTLP_ENDPOINT | (optional) | Tracing/Errors |

Never commit real secrets—`.env*` files should be gitignored (verify `.gitignore`).

---

## 🚀 Deployment Workflow

### Branching Strategy
- `main`: Always deployable (protected).
- `feature/*`: Incremental work.
- `release/*`: (Optional) staging hardening.

### GitHub Actions (Suggested Jobs)
| Job | Trigger | Gates |
|-----|---------|-------|
| lint-typecheck | PR | ESLint + tsc |
| test | PR | Unit / domain tests |
| preview-hosting | PR label: `preview` | Deploy to temporary Firebase channel |
| deploy-functions | merge to main | Functions + rules |
| deploy-hosting | merge to main | Web app hosting |
| scan-deps | daily schedule | Audit & license check |

### Manual Commands

```bash
# Deploy functions only
firebase deploy --only functions

# Deploy hosting (production)
firebase deploy --only hosting

# Staged preview
firebase hosting:channel:deploy feature-123

# Firestore rules & indexes
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Promotion Policy
1. PR passes CI.
2. (Optional) Preview environment functional check.
3. Merge → automatic production deployment.
4. Post-deploy smoke: health pings + sample evaluation job.

Rollback: redeploy previous functions version or hosting release (retain last N artifacts).

---

## 🧪 Testing Strategy

| Layer | Kind | Examples |
|-------|------|----------|
| Pure logic | Unit | Normalization, scoring rubric mapping |
| Pipeline orchestration | Integration (emulator) | Cancel mid-batch, resume, error propagation |
| Data schema | Contract tests | Stored documents match TS interfaces |
| Frontend | Component + snapshot | Evaluation dashboard states |
| AI Regression | Golden-set tests | Stability of scoring across model updates |
| Load (Phase 2) | Synthetic | Batch latency under concurrency |

Run locally:
```bash
pnpm test
pnpm test:watch
pnpm test:functions   # emulator-backed
```

---

## 🧭 Observability & Monitoring

### Structured Log Format (JSON)

Every log line emitted by backend functions SHOULD conform:

```json
{
  "ts": "2025-01-01T12:00:00.123Z",
  "level": "info",
  "component": "evaluationProcessor",
  "jobId": "eval_abc123",
  "phase": "batch",
  "batchIndex": 2,
  "totalBatches": 10,
  "processedCount": 50,
  "successCount": 48,
  "failureCount": 2,
  "event": "batch.complete",
  "durationMs": 8421,
  "model": "gemini-2.5-pro",
  "schemaVersion": 1,
  "message": "Batch processed",
  "context": {
    "rubricVersion": "v3",
    "retryCount": 0
  }
}
```

Required keys: `ts`, `level`, `component`, `event`, `message`  
Conditional keys: `jobId`, `batchIndex`, `errorCode`, `durationMs`

### Log Levels
- `debug`: Fine-grained (suppressed in production)
- `info`: Lifecycle milestones (job start, batch complete)
- `warn`: Recoverable anomaly (retry, partial failure)
- `error`: Failed operation requiring attention
- `fatal` (rare): Systemic failure → triggers alert

### Error Taxonomy (Code → Meaning)
| Code | Description | Typical Cause | Action |
|------|-------------|---------------|--------|
| E_MODEL_TIMEOUT | AI call timeout | Provider latency | Retry with backoff |
| E_MODEL_CONTENT | Safety/content block | Model filter | Mark item skipped |
| E_NORMALIZE | Normalization failure | Schema drift | Investigate schemaVersion |
| E_SCORE_PARSE | Unexpected scoring format | Provider change | Add parser fallback |
| E_CANCELED | User canceled job | Expected | Graceful halt |
| E_BATCH_WRITE | Firestore batch commit failed | Quota / transient | Retry (exponential) |
| E_CONFIG | Invalid runtime config | Mis-set env var | Fail fast + alert |
| E_INTERNAL | Uncaught error | Bug | Create issue |

### Metrics (Initial Set)

| Metric | Type | Dimensions | Description |
|--------|------|------------|-------------|
| evaluation_jobs_started_total | Counter | model, rubricVersion | Jobs initiated |
| evaluation_jobs_completed_total | Counter | model | Successful jobs |
| evaluation_jobs_failed_total | Counter | errorCode | Failed jobs |
| evaluation_jobs_canceled_total | Counter | - | User cancellations |
| evaluation_active_jobs | Gauge | - | In-progress jobs |
| evaluation_batch_latency_ms | Histogram | model | Per-batch wall time |
| evaluation_end_to_end_latency_ms | Histogram | model | Job total duration |
| evaluation_ai_call_latency_ms | Histogram | model, operation | AI API latency |
| evaluation_ai_tokens_total | Counter | model, direction=in|out | Token volume |
| evaluation_normalization_failures_total | Counter | errorCode | Normalization errors |
| evaluation_scoring_failures_total | Counter | errorCode | Scorer errors |
| evaluation_cancel_latency_ms | Histogram | - | Cancel → stop duration |
| evaluation_question_quality_score | Histogram | dimension (overall) | Distribution for monitoring drift |

Export path (Phase 1): aggregated into Firestore aggregates for UI + Cloud Logging → Metrics (Phase 2: OpenTelemetry exporter).

### Dashboards (Proposed Panels)
1. Active vs Completed Jobs (stacked area)
2. Batch Latency p50/p90
3. Failure Rate by errorCode
4. Token Usage over Time
5. Quality Score Drift (box plot per day)
6. Cancel Responsiveness

### Alerting Threshold Examples
- Failure rate > 5% over 15 min → warn
- Median batch latency > 2× 7-day rolling baseline → investigate
- No jobs completed in 60 min while started > 0 → stall alert
- Drift in `qualityScore.overall` > 10% vs baseline → review scoring rubric

---

## 🗄 Data Model Summary

### Versioning
All persisted domain documents include:
- `schemaVersion: number`
- `updatedAt: Timestamp`
- Migration policy documented in `/docs/DATA_CONTRACTS.md` (to be added).

### Question (Canonical)

```ts
export interface Question {
  id: string;
  stem: string;
  options: string[];              // Raw options (original order)
  correctAnswerIndex: number;     // 0-based
  taxonomyPath: string[];         // e.g. ["Inflammatory", "Acneiform", "Acne Vulgaris"]
  difficulty?: number;            // 1–5 calibrated scale
  source: 'ai' | 'manual' | 'hybrid';
  status: 'draft' | 'review' | 'active' | 'retired';
  version: number;
  boardStyleFlags?: {
    singleBest?: boolean;
    imageBased?: boolean;
    pediatric?: boolean;
  };
  assets?: {
    imageRefs?: string[];         // Cloud Storage paths
  };
  tags?: string[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  // Normalized / Derived
  normalized: {
    optionsArray: string[];       // Post-normalization (trimmed, deduped)
    correctAnswerIndex: number;
    correctAnswerLetter: string;  // A/B/C/D...
  };
  aiScoresFlat?: {
    overall?: number;
    boardReadiness?: number;
    clinicalRealism?: number;
    medicalAccuracy?: number;
    distractorQuality?: number;
    cueingAbsence?: number;
  };
  rubricVersion?: string;
  schemaVersion: number;
}
```

### EvaluationJob

```ts
export interface EvaluationJob {
  id: string;
  createdBy: {
    uid: string;
    role?: 'admin' | 'faculty' | 'system';
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  cancelRequested?: boolean;
  startedAt?: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  schemaVersion: number;
  config: {
    model: string;               // "gemini-2.5-pro"
    batchSize: number;
    scoringRubricVersion: string;
    maxQuestions?: number;
    selectionQuery?: {
      taxonomyFilters?: string[];
      difficultyRange?: [number, number];
      source?: ('ai' | 'manual' | 'hybrid')[];
    };
  };
  progress: {
    currentBatch: number;
    totalBatches: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
  aggregates?: {
    avgOverallScore?: number;
    avgDifficulty?: number;
    scoreDistribution?: Record<string, number>;
  };
  metrics?: {
    totalTokensIn?: number;
    totalTokensOut?: number;
    aiLatencyMsSum?: number;
    endToEndMs?: number;
  };
  error?: {
    code: string;
    message: string;
    firstSeenAt: FirebaseFirestore.Timestamp;
  };
  logPointers?: {
    firstLogId?: string;
    lastLogId?: string;
  };
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
```

### Log Entry (Structured)

```ts
export interface EvaluationLog {
  id: string;
  ts: FirebaseFirestore.Timestamp;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  jobId?: string;
  component: string;
  event: string;                 // e.g. "job.start", "batch.complete", "ai.call"
  phase?: 'init' | 'batch' | 'finalize' | 'cancel';
  message: string;
  batchIndex?: number;
  totalBatches?: number;
  processedCount?: number;
  successCount?: number;
  failureCount?: number;
  durationMs?: number;
  errorCode?: string;
  model?: string;
  schemaVersion: number;
  context?: Record<string, any>;
}
```

---

## 🔁 Cancellation Semantics

- `cancelEvaluationJob` sets `cancelRequested = true`.
- Processor checks flag at:
  - Start of each batch
  - Before model invocation group
  - Before final aggregation
- Guarantee: cancellation latency < max(batch duration).
- Future (Phase 2): mid-batch cooperative cancellation tokens for long AI calls.

---

## 🧱 Architectural Principles

| Principle | Application |
|-----------|-------------|
| Pure Core | Normalization & scoring are pure functions (no IO) → unit testable |
| Adapter Isolation | AI provider wrapper implements a stable interface |
| Idempotency | Re-processing a batch does not duplicate writes (idempotent keys) |
| Schema Evolution | Every write includes `schemaVersion`; migrations executed via scripts |
| Observability-First | All lifecycle phases produce structured logs & metrics |
| Fail Fast | Configuration validation at cold start (missing env → hard error) |

---

## 🤝 Contribution Guidelines

### 1. Ground Rules
- Follow the medical disclaimer mindset: content = educational only.
- Keep PRs small and focused (< 500 LOC preferred).
- New domain logic requires corresponding tests.

### 2. Branch Naming
`feature/<short-desc>`  
`fix/<issue-number>-<short-desc>`  
`chore/<task>`  
`experiment/<idea>`

### 3. Commit Messages (Conventional Commits)
```
feat(evaluation): add batch latency histogram
fix(question-normalizer): handle duplicate trailing punctuation
chore: bump firebase-tools
test(scoring): add regression golden set
```

### 4. PR Checklist
- [ ] Linked issue (if applicable)
- [ ] Added / updated tests
- [ ] Updated README / docs if schema or flow changed
- [ ] No secret material in diff
- [ ] Lint + typecheck pass locally (`pnpm lint && pnpm typecheck`)

### 5. Code Style
- ESLint + Prettier enforced (run `pnpm format`).
- Avoid dynamic `any`; prefer explicit domain types.
- Keep functions ≤ ~50 lines unless justified.

### 6. Testing
- Mandatory for: normalization, scoring, evaluation orchestration edge cases.
- Provide at least one failure-path test for new error codes.

### 7. Opening Issues
Use labels:
- `type:bug`
- `type:feat`
- `type:techdebt`
- `type:data-migration`
- `priority:high|normal|low`

### 8. Security
If a potential vulnerability: DO NOT open a public issue; email or use private channel (placeholder: security@domain.tld).

---

## 🗃 Data Migration Workflow

1. Introduce new `schemaVersion` constant.
2. Write forward-compatible reader (handle old + new).
3. Add migration script: `/scripts/migrations/migrate_v<N>.ts`.
4. Run dry-run in emulator with snapshot export.
5. Execute in production during low-traffic window.
6. Lock writes if necessary (set a feature flag `WRITE_LOCK=true`).

---

## 🧪 AI Evaluation Quality Assurance

| Safeguard | Description |
|-----------|-------------|
| Golden Set | Curated ~50 questions scored each release to detect drift |
| Stability Threshold | Reject deployment if variance > configured threshold |
| Rubric Versioning | `scoringRubricVersion` pinned per job |
| Deterministic Parameters | Temperature fixed for evaluation scoring tasks |
| Logging of Raw Responses | (Optional) Redacted stored excerpt for audit |
| Bias Review (Planned) | Periodic sampling to ensure dermatologic diversity representation |

---

## 🧰 Scripts (Planned / Existing Examples)

| Script | Purpose |
|--------|---------|
| `pnpm cli:new-question` | Generate & store a question using current model |
| `pnpm cli:evaluate --questionSet=sample` | Kick off evaluation job |
| `pnpm cli:migrate --to=5` | Run schema migration |
| `pnpm cli:recalc-scores` | Recompute derived aggregates |

---

## 🛡 Security & Privacy (Snapshot)

| Aspect | Approach |
|--------|---------|
| Authentication | Firebase Auth; admin roles gated by custom claims |
| Authorization | Firestore rules + server validation |
| Secrets | Never in source; environment / Secret Manager |
| PII | No direct patient identifiers stored; performance data abstracted |
| Logging Hygiene | No raw user-auth tokens; redact sensitive AI responses if needed |
| Rate Limiting (Planned) | Per-user evaluation concurrency cap |

---

## 🧭 Roadmap (Excerpt)

| Phase | Focus |
|-------|-------|
| 1 | Stabilize evaluation pipeline observability |
| 2 | Add OpenTelemetry tracing export |
| 3 | Introduce adaptive difficulty engine |
| 4 | Golden-set benchmarking dashboard |
| 5 | Multi-model comparison (Gemini vs fallback provider) |

---

## 📄 License

(Select and add a license file—e.g., Apache-2.0 or proprietary. Until then, all rights reserved.)

---

## ❓ FAQ (Seed)

| Question | Answer |
|----------|--------|
| Can I use this for clinical decisions? | No—educational only. |
| Can I add another AI model? | Yes—implement `IAiScoringAdapter`. |
| How do I cancel a long evaluation? | Use admin UI or call `cancelEvaluationJob`. |
| How are scores calculated? | Multi-axis rubric (clinical realism, accuracy, distractor quality, etc.), aggregated into `overall`. |

---

## 🛠 Maintenance Checklist

| Frequency | Task |
|-----------|------|
| Weekly | Dependency audit + vulnerability scan |
| Weekly | Review failure logs for new error codes |
| Bi-weekly | Golden-set regression run |
| Monthly | Token usage cost optimization review |
| Quarterly | Schema version & migration debt audit |

---

## 🔄 Updating This Document

If you change:
- Data shape → update Data Model section + increment `schemaVersion`.
- Scoring approach → update AI Evaluation QA + rubric references.
- Observability fields → update Log Format + metrics tables.

PRs modifying platform contracts MUST tag `@maintainers`.

---

## 📬 Contact / Support

Create an issue with appropriate labels or reach out via internal channel (placeholder). Security concerns: see Security section.

---

Happy contributing! ✨  
Let’s build a trustworthy, observable, and resilient educational AI platform.
