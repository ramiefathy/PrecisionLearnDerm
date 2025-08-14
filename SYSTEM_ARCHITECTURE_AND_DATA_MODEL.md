# PrecisionLearnDerm — System Architecture and Data Model

Last updated: 2025-08-12
Owner: Engineering (keep this file current after any structural change)

## Purpose
This document is the authoritative overview of the product’s architecture, code structure, and data model. It should be updated alongside any change to code organization, infrastructure, or schema. Link this doc in PR descriptions when relevant.

---

## High-level architecture

```mermaid
flowchart TB
  subgraph Client[Client]
    A[React 18 + TS + Tailwind (Vite)]
  end

  subgraph Firebase[Firebase]
    H[Hosting]
    F[Cloud Functions (Node 20, TS)]
    S[(Firestore)]
    ST[(Storage)]
  end

  subgraph AI[AI + Knowledge]
    G[Gemini 2.x (Draft/Review/Score/Tutor)]
    KB[knowledgeBase.json (functions/kb)]
  end

  subgraph OfflineStack[Offline Knowledge Stack]
    K[Neo4j KG (core/dermatology-kg-rag)]
    C[(ChromaDB vectors)]
    P[PDF/Hybrid Ingestion (LangExtract/MarkItDown/PyMuPDF)]
  end

  A -- hosted by --> H
  A -- RPC httpsCallable --> F
  F -- read/write --> S
  F -- uploads --> ST
  F -- prompts --> G
  F -- uses --> KB

  P -- builds --> K
  P -- builds --> C
  K -. optional sync/search .- F
  C -. optional semantic assist .- F
```

Key points:
- Web app is hosted on Firebase Hosting and interacts with Cloud Functions over HTTPS callable RPC.
- Cloud Functions perform AI operations (draft, review, score, tutor) and handle personalization, quality metrics, item lifecycle, and admin workflows. Primary data store is Firestore.
- knowledgeBase.json (packaged under functions) is used for tutor and agents; Neo4j/Chroma pipelines live under `core/dermatology-kg-rag/` for offline ingestion/enrichment.

---

## Repository map (selected)

- apps/PrecisionLearnDerm/
  - web/ (frontend)
    - src/
      - app/ — routing guards, Zustand store
      - components/ — QuizRunner, BatchQuizRunner, TutorDrawer, QuestionFeedback, etc.
      - pages/ — Landing, Auth, Dashboard, Quiz*, Admin*, etc.
      - lib/ — firebase init, api client, markdown, attempts, feedback
  - functions/ (backend)
    - src/
      - ai/ — drafting.ts, review.ts, scoring.ts, tutor.ts
      - pe/ — nextItem(s), ability (recordAnswer), srs, adaptiveGeneration, qualityRetirement
      - items/ — propose, revise, promote, get
      - admin/ — questionQueue, importQuestions
      - kb/ — knowledgeBase.json + helpers (search)
      - util/ — auth, logging, seed
      - test/ — simpleTest
      - index.ts — central export of callable functions
  - knowledge/ — (project KB assets)
  - docs/ — product and technical docs (keep in sync)
  - IMPLEMENTATION_SUMMARY.md, QUIZ_FUNCTIONALITY_STATUS.md, KNOWLEDGE_BASE_INTEGRATION.md, …

- core/dermatology-kg-rag/ (offline knowledge stack)
  - app/ — CLI (`app/cli.py`), KG drivers, ingestion pipelines, quality/evidence systems
  - data/ — processing outputs

- config/, data/, scripts/, tools/ — project-wide resources

---

## Frontend application structure

- Routing: `src/App.tsx` (lazy routes), `src/app/routes.tsx` (guards + Admin navigation)
- State: `src/app/store.ts` (Zustand). Auth/profile are NOT persisted; only `activeQuiz` is persisted to localStorage.
- API: `src/lib/api.ts` wraps callable functions under namespaces: `ai`, `pe`, `quality`, `items`, `admin`, `kb`, `test`, `util`.
- Quiz flow:
  - Config in `QuizConfigPage.tsx` → `useAppStore().activeQuiz.config`
  - `QuizInProgressPage.tsx` shows header, timer, and renders `QuizRunner` (one-by-one) or `BatchQuizRunner` (batch)
  - `QuizRunner.tsx` loads personalized questions first, else `pe_next_item` + `items_get`; records answers; triggers adaptive generation on incorrect
  - Batch runner aggregates answers and persists attempt on submit
- Accessibility/UX: consistent design language (white cards, slate/indigo palette), keyboard shortcuts, ARIA roles in QuizRunner, safe Markdown rendering for explanations.

---

## Cloud Functions — callable API surface (selected)

- ai/
  - `ai_generate_mcq`, `ai_review_mcq`, `ai_score_mcq`, `ai_chat_explain`
- pe/
  - `pe_next_item`, `pe_next_items`, `pe_record_answer`, `pe_trigger_adaptive_generation`, `pe_get_personalized_questions`
  - SRS: `pe_srs_update`, `pe_srs_due`
- items/ — `items_propose`, `items_revise`, `items_promote`, `items_get`
- quality/ — `quality_submit_feedback`, `quality_get_review_queue`, `quality_resolve_review`, `quality_get_analytics`
- admin/ — `admin_generateQueuedQuestions`, `admin_getQuestionQueue`, `admin_reviewQuestion`, `admin_initializeQueue`, `admin_import_legacy_questions`, `admin_get_question_bank_stats`
- test/ — `test_multi_agent_system`, `test_system_health`
- util/ — `util_seed_database`

Notes:
- All endpoints enforce auth (`requireAuth`) or admin (`requireAdmin`) as appropriate.

---

## Firestore data model (primary collections)

### users/{uid}
- displayName: string
- email: string
- preferences: { learningPace: slow|steady|medium|fast|accelerated, darkMode: boolean, emailSummary: boolean, quizConfidenceAssessment: boolean }
- stats: { quizzesTaken: number, averageScore: number, streak: number, lastStudiedAt: timestamp|null }
- ability: { theta: number, lastUpdate: timestamp }
- mastery: { [topicId]: { pMastery: number, lastUpdate: timestamp } }
- recentItems: { [itemId]: millis }
- adaptiveQueue: { pendingQuestions: string[], lastGenerated: timestamp }
- Subcollections:
  - personalQuestions/{personalQuestionId}
    - personalQuestionId: string
    - stem, leadIn, options[], keyIndex, explanation
    - topicIds[], gapTargeted: { topic, gapType, severity, evidence }, focusArea: string
    - difficulty: number, generatedAt: timestamp, triggeredBy: string (missedQuestionId)
  - flashcards/cards/{cardId}
    - front, back, topicIds[], ease, intervalDays, dueAt, reviewHistory[]

### items/{itemId}
- type: 'mcq'
- status: 'active' | 'draft' | 'retired'
- stem, leadIn, options[] (ordered), keyIndex, explanation
- topicIds[], category, subcategory, primaryTopic, domain
- difficulty: number (β), qualityScore: number, qualityIndicators: {}
- telemetry: { attempts: number, avgTimeSec: number, p2TimeSec: number, p98TimeSec: number, times: number[], avgRating?: number }
- source: 'legacy_question_bank' | 'ai_generated' | ...
- createdBy: string, createdAt/updatedAt: timestamp

### drafts/{draftId}
- draft: { stem, leadIn, options[], keyIndex?, explanation? }
- review: { correctedItem, changes[], qualityMetrics{}, recommendations[] }
- status: 'reviewed' | 'pending' | 'error'
- logs[]: { at, message, actor, operationId }

### questionFeedback (collection)
- Document per submission:
  - userId, itemId
  - questionQuality (1–5), explanationQuality (1–5)
  - difficultyRating, clarityRating, relevanceRating
  - reportedIssues: string[]
  - comment: string
  - createdAt: timestamp
- Functions aggregate to per-item quality metrics and flag/retire low-quality items.

### quizzes/{uid}/attempts/{attemptId}
- startedAt, finishedAt, durationSec, score
- items: [ { itemRef, topicIds[], chosenIndex, correctIndex, correct, confidence, timeToAnswerSec, ratings: { question, explanation, reasons[] }, note? } ]

### admin/questionBankMetadata (doc)
- lastImport: timestamp
- totalImportedQuestions: number
- categoryBreakdown: { [category]: count }
- averageQuality: number
- source: string
- importedBy: string

Indexes:
- Ensure compound indexes for common queries if added (e.g., items by status + topicIds array-contains-any). Current deploy uses Firebase index JSON; conflicts are handled at deploy time.

---

## Data flows

1) Quiz (one-by-one)
- Client configures quiz → store config → `pe_get_personalized_questions` (if present) else `pe_next_item` → `items_get`
- On submit → `pe_record_answer` updates `users/{uid}` ability/mastery and `items/{itemId}` telemetry; if incorrect → `pe_trigger_adaptive_generation` stores personalized items under user’s `personalQuestions` and updates `adaptiveQueue`

2) Quiz (batch)
- Client requests batch of previews → `pe_next_items` → `items_get` per item; on submit → client writes attempt to `quizzes/{uid}/attempts` (and may call `quality_submit_feedback`)

3) AI authoring
- Admin generates drafts via `ai_generate_mcq` → stored under `drafts/{draftId}`; `ai_review_mcq` improves content and logs changes; `ai_score_mcq` computes quality metrics; admins approve/promote to `items`

4) Quality monitoring
- Users submit quality feedback → `questionFeedback` documents → functions compute per-item metrics; if below threshold, item is flagged/retired and added to review queue

5) Tutor
- Client asks tutor with `itemId`/topics → `ai_chat_explain` uses KB first, optionally cites sources; guardrails limit to dermatology/STI content

---

## Environments and secrets

- Web `.env.local`: Firebase client config, Gemini model names
- Functions `.env` / functions.config(): `GEMINI_API_KEY`, any external API keys
- Neo4j/Chroma: configured within `core/dermatology-kg-rag/app/config.py`

---

## Maintenance guidance
- Update this doc when:
  - Adding/removing callable endpoints
  - Changing Firestore fields/collections or indexes
  - Restructuring directories or significant UI flows
  - Modifying AI agent prompt contracts or KB locations
- Include “Last updated” date and link the PR

## References
- `QUIZ_FUNCTIONALITY_STATUS.md` — live checklist for quiz readiness
- `KNOWLEDGE_BASE_INTEGRATION.md` — KB usage and priorities
- `ADMIN_QUESTION_QUEUE_IMPLEMENTATION.md` — admin flow for question queue 