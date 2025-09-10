# Release Notes — Consolidation to reviewQueue, Admin-Only Review, Filters & Indexes (2025-09-10)

## Executive Summary
We completed the big-bang consolidation of the question moderation workflow from `questionQueue` to a unified `reviewQueue`. All generation-to-review flows now write to `reviewQueue`. The admin review UI and callable endpoints are aligned to `review_*`, and review is now enforced as admin-only. We added filterability (source, sinceDays) with necessary composite indexes, ensured a11y enforcement (alt-text on approve), updated analytics for feedback-triggered entries, removed legacy aliases, added emulator-backed integration tests, and prepared migration and deployment documentation. No mocks were used; all tests run against Firebase emulators per policy.

## Principles & Guardrails Followed
- No mocks or dummy fallbacks in production logic; emulator-backed tests only. [[Policy: No mock functions]]
- Fix causes, not symptoms; comprehensive edits to eliminate deprecated `questionQueue` references.
- Role-based access: review is admin-only in both functions and UI; secure rules enforced.
- Systematically validated changes with integration tests and index updates.

## Architecture Context (High-Level)
- Frontend: React 19.x, Vite 6.x, Tailwind 3.x, MUI 7.x.
- Backend: Firebase Functions (Node 20, TypeScript), Firestore, Auth, Storage, Cloud Tasks.
- GenAI: `@google/genai@1.15.0` (Gemini 2.5 Pro/Flash) via robust client.
- Data model: `items`, `reviewQueue` (unified moderation), `evaluationJobs`, `liveLogs`, `testResults`, `evaluationSummaries`, `questionFeedback`, `questionFeedbackAgg`.
- Auth: custom claims `isAdmin`, `isReviewer` (review panel restricted to Admins).

## What Changed (Detailed)

### Backend (Functions)
- review endpoints
  - `functions/src/review/endpoints.ts`
    - `review_list_queue`: now supports `source?` (e.g., `user_feedback`) and `sinceDays?` filters, in addition to `status?`, `topicIds?`, `limit?`, `cursor?`.
    - `review_approve`: rejects approval when an image is present without adequate alt-text; writes `lastApprovalError: 'alt_text_missing'` and throws `failed-precondition`.
    - `review_enqueue_draft`, `review_save_draft`, `review_reject`: unchanged behavior; now all `review_*` endpoints require `requireAdmin` for callable security.
- orchestration write targets
  - `functions/src/ai/adaptedOrchestrator.ts`: saves generated drafts directly to `reviewQueue` instead of `questionQueue`.
- legacy admin alias removal
  - Removed deprecated `admin_reviewQuestion` callable from `functions/src/admin/questionQueue.ts`; admin review is via `review_*` endpoints.
- admin generation
  - `functions/src/admin/questionQueue.ts`: generation uses real taxonomy/entity selection and writes drafts to `reviewQueue` with preserved metadata (`topicHierarchy`, `kbSource`, `pipelineOutputs`, `priority`). Internal variable names no longer refer to “questionQueue”.

### Security & Rules
- Firestore rules (already aligned): `reviewQueue/*` read/write require admin.
- Callable functions: `requireAdmin` guards applied to all review endpoints.

### Firestore Indexes
- `reviewQueue` composites added/retained to support filters and sorting:
  - `(status ASC, createdAt DESC)`
  - `(source ASC, createdAt DESC)`
  - `(source ASC, status ASC, createdAt DESC)`
  - `(topicIds CONTAINS, status ASC, createdAt DESC)`
  - `(topicIds CONTAINS, source ASC, status ASC, createdAt DESC)`
- `items` retained indexes to support existing queries and avoid delete prompts during deploy until all call-sites migrate away from `topicIds` filtering:
  - `(status ASC, topicIds CONTAINS)`
  - `(topicIds CONTAINS, createdAt DESC)`
  - `(status ASC, topicIds CONTAINS, createdAt DESC)`

### Frontend
- API client
  - `web/src/lib/api.ts`: `api.admin.reviewListQueue` accepts `{ source?, sinceDays?, topicIds?, status?, limit?, cursor? }`; using `reviewApprove`, `reviewReject`, `reviewSaveDraft`, `reviewEnqueueDraft`.
- Admin review UI
  - `web/src/pages/AdminQuestionReviewPage.tsx`: reads `source`/`sinceDays` from URL query params; displays active filter chips; “Clear Filters” action; a11y hint if image alt text is missing; uses `review_*` endpoints.
- Routes and access guards
  - `web/src/app/routes.tsx`: Review tab visible only to Admins; `ReviewerRoute` does not grant access to admin review area.
- Analytics
  - `web/src/features/analytics/AdminEvalDashboard.tsx`: counts last-30d feedback-triggered entries via Firestore query and deep-links to `/admin/review?source=user_feedback&sinceDays=30`.

### Migration (Staging)
- Script: `functions/scripts/migrate-questionQueue-to-reviewQueue.ts`
  - Copies only `status == 'pending'` from `questionQueue` → `reviewQueue`.
  - Preserves `draftItem`, `topicHierarchy`, `kbSource`, `pipelineOutputs`, `priority`.
  - Adds `migratedFrom: 'questionQueue'` and `legacyQueueId`.
  - Supports `--dryRun`.
- Document: `docs/STAGING_MIGRATION_REVIEWQUEUE.md` with preconditions, commands, verification, rollback, and cleanup.

## Testing & Validation
- Emulator-backed integration tests (no mocks):
  - `functions/src/test/integration.review-a11y.test.ts`: a11y approval rejection for missing alt text; success with valid alt.
  - `functions/src/test/integration.review-list-filters.test.ts`: validates `source` and `sinceDays` filters and combination with `topicIds` and `createdAt`.
  - `functions/src/test/integration.admin-generation-to-reviewqueue.test.ts`: verifies admin generation populates `reviewQueue`.
- Updated legacy admin tests to use `review_*` endpoints (`admin-question-management.test.ts`).
- Web builds cleanly (Vite/TypeScript).

## Issues Addressed
- Inconsistent queue usage -> unified on `reviewQueue` across writers and UI.
- Access control gap -> admin-only review enforced in both backend and frontend.
- A11y gap -> enforced alt-text on approve with clear server-side error and audit trail.
- Analytics blind-spot -> surfaced feedback-triggered re-entries and deep-linked filters.
- Index prompts on deploy -> added/retained indexes for both `reviewQueue` and `items`.
- Legacy aliases lingering -> removed `admin_reviewQuestion`, test code updated, docs swept.

## Deployment Notes
- Deploy Firestore rules and indexes after pulling changes.
- Keep `items` indexes until all call-sites stop filtering by `topicIds` (prevents delete prompts and query failures).

## Backward Compatibility & Deprecations
- Frontend switched to `review_*`; deprecated `questionQueue` callables/aliases are removed.
- Migration script remains for staging prod parity.

## Next Steps (Detailed Plan)
1) E2E QA in staging
   - Run migration script (dry run, then execute) and verify counts.
   - Validate admin review filters (source/sinceDays) and pagination.
   - Approve/Reject flows with a mix of image/no-image drafts; confirm alt-text enforcement and audit fields.
2) Analytics enhancements
   - Add panels for filter breakdowns (source distribution, 7/30/90d windows) if needed.
3) De-index cleanup (post-migration)
   - After removing `topicIds` filtering from `items` call-sites, prune retained `items` indexes.
4) Documentation sweep
   - Ensure all public docs and guides reference `reviewQueue` only.
5) Performance checks
   - Confirm query latencies with new indexes; watch for index build completion.

## Risk & Rollback
- Missing composite indexes will cause Firestore errors; all required indexes are in `firestore.indexes.json`.
- If any regression is detected, rollback consists of reverting the release, restoring legacy endpoints temporarily (not recommended), or using the migration’s rollback plan (leave source docs intact; no destructive ops were added).

## References
- `product_architecture.md`
- `docs/STAGING_MIGRATION_REVIEWQUEUE.md`
- `DEPLOYMENT.md`
- `firestore.rules`, `firestore.indexes.json`
