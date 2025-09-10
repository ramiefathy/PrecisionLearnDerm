# Release Notes — reviewQueue Consolidation (2025-09-10)

## Highlights
- Unified question moderation under `reviewQueue`; deprecated `questionQueue` endpoints removed.
- Admin-only review: callable endpoints gated by `requireAdmin` and UI restricted to admins.
- New filters for review listing: `source` and `sinceDays` with supporting composite indexes.
- Analytics: dashboard shows last-30d feedback-triggered entries and links to filtered review list.

## Backend
- `functions/src/review/endpoints.ts`
  - `review_list_queue` now accepts `source?` and `sinceDays?` (with `topicIds?`, `status?`, `cursor?`, `limit?`).
  - Approval rejects missing image alt text; logs `lastApprovalError`.
  - All `review_*` endpoints require admin.
- `functions/src/ai/adaptedOrchestrator.ts`
  - Writes generated drafts to `reviewQueue`.
- Removed deprecated `admin_reviewQuestion` callable from `functions/src/admin/questionQueue.ts`.

## Firestore Indexes
- Added reviewQueue composites:
  - `(status ASC, createdAt DESC)`
  - `(source ASC, createdAt DESC)`
  - `(source ASC, status ASC, createdAt DESC)`
  - `(topicIds CONTAINS, status ASC, createdAt DESC)`
  - `(topicIds CONTAINS, source ASC, status ASC, createdAt DESC)`
- Retained items indexes to support legacy `topicIds` queries and avoid delete prompts:
  - `(status ASC, topicIds CONTAINS)`
  - `(topicIds CONTAINS, createdAt DESC)`
  - `(status ASC, topicIds CONTAINS, createdAt DESC)`

## Frontend
- `web/src/lib/api.ts`: `api.admin.reviewListQueue` accepts `{ source?, sinceDays? }`; `reviewApprove`, `reviewReject`, `reviewSaveDraft`, `reviewEnqueueDraft` in use.
- `web/src/pages/AdminQuestionReviewPage.tsx`: reads query params `source`/`sinceDays`, shows chips, clear action.
- `web/src/app/routes.tsx`: Review tab visible only to admins.
- `web/src/features/analytics/AdminEvalDashboard.tsx`: counts 30d feedback entries; deep links to filtered list.

## Tests
- New emulator tests: `functions/src/test/integration.review-list-filters.test.ts` (filters & combined conditions).
- Updated admin tests to use `review_*` endpoints; removed legacy aliases.

## Migration
- Staging migration script remains: `functions/scripts/migrate-questionQueue-to-reviewQueue.ts` (read-only copy with tags).

## Deployment Notes
- Deploy Firestore rules and indexes after pulling changes.
- Keep retained `items` indexes to avoid delete prompts until all `topicIds` filters are removed.

## Backward Compatibility
- Web updated to new endpoints; no consumer of `questionQueue` remains.

## Known Risks
- Combining filters requires deployed composite indexes; missing index will prompt during emulator runs or production queries.
- If any legacy UI/tests still reference `getQuestionQueue`/`reviewQuestion`, they must be updated.
