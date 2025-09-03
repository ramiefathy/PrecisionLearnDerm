# Implementation Status

## Components

- Auth & Profile: Protected routes in `web/src/app/routes.tsx`. Profile page stub; user to wire storage.
- Dashboard: Greeting, Quick Stats, Suggestion preview via next-item.
- Topics/Config: Multi-select and default config; initializes `activeQuiz`.
- Quiz Runner (Immediate): Fetches preview + full item, renders options, sanitized explanation; telemetry via `pe_record_answer`.
- Quiz Runner (Batch): `BatchQuizRunner` collects answers, ratings/notes/flashcard toggle, persists attempt.
- Summary: Loads attempt from `quizzes/{uid}/attempts` and displays results.
- Tutor: Domain guard, per-user limit, crude global throttle, NCBI caching; labeled citations.
- PE: Elo/BKT math, time percentiles, exclude-recent; next-item scoring with mastery/quality and exploration.
- Flashcards: FSRS update; due queue with topic filters and hover hint.
- Admin: Guarded routes; propose/revise/promote implemented server-side (UI wiring next). Evaluation Admin Panel live with logs/dashboards; MUI Grid v7 standardized in UI.
- Logging: Structured logs to `ops/runLogs/entries`.

## Completed (highlights)
- Functions: ai.tutor, pe.{recordAnswer,nextItem,srsUpdate,srsDue}, items.{get,propose,revise,promote}, util.{rateLimit,cache,logging}.
- Web: Pages for Auth, Dashboard, Topics, Config, Quiz (immediate/batch), Summary, Flashcards, Admin, Mock, Patient Sim stubs.
- Build: Web and Functions builds are green. CI runs on Ubuntu/Node 20; web uses Vite 6 + esbuild 0.25.9 (no platform-specific deps).

## Remaining
- Ratings/notes/flashcard persistence to Firestore; flashcard content mapping.
- Admin items table with metrics and editor/diff; wire propose/revise/promote.
- Mock exam timer, pause/resume, blueprint coverage.
- Patient sim chat with logging and export to notes.
- Additional indexes for attempts/admin queries.
- Tests (unit/integration/E2E) and CI tests.
- Admin logs UI surfacing `ops/runLogs`.

## Plan (next)
- Persist ratings/notes and create flashcards on submit in batch runner.
- Build Admin Items table from `items` and `drafts`, with quick actions.
- Implement MockExamPage timer and blueprint selection with item sampling.
- Implement PatientSimulationPage chat log with export to notes.
- Add composite indexes and test harness in CI.
