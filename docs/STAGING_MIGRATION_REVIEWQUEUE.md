# Staging Migration Plan — questionQueue → reviewQueue

This outlines the exact steps to migrate drafts from `questionQueue` to `reviewQueue` in STAGING, verify success, and roll back if needed.

## Preconditions
- Confirm functions are deployed with the latest code (commit containing the reviewQueue consolidation).
- Firestore index present: `reviewQueue` composite index on `status ASC` + `createdAt DESC` (already added in `firestore.indexes.json`).
- Firestore rules updated: `reviewQueue` read/write restricted to admins; all client writes happen via callables.
- Admin UI updated to use `review_*` callables (already switched in code).

## Deploy latest
1) From repo root:
```bash
firebase deploy --only functions
```
2) Verify callable availability in Functions logs: `review_enqueue_draft`, `review_list_queue`, `review_approve`, `review_reject`, `review_save_draft`.

## Set secrets (for generation on staging)
If you want pipelines to generate real content:
```bash
# Do NOT paste secrets in code or VCS. Use Firebase secrets.
firebase functions:secrets:set GEMINI_API_KEY
# Follow the prompt to enter the key securely
firebase deploy --only functions
```

## Migration: copy pending docs
We will copy `status == 'pending'` documents from `questionQueue` into `reviewQueue`, preserving important metadata and tagging migrated docs.

Run locally with service account that has access to staging project:
```bash
cd functions
npm run build
node lib/scripts/migrate-questionQueue-to-reviewQueue.js --dryRun   # sanity check
node lib/scripts/migrate-questionQueue-to-reviewQueue.js            # execute
```
What the script does:
- Reads `questionQueue` where `status == 'pending'`
- Writes to `reviewQueue` with fields:
  - `draftItem`, `topicHierarchy`, `kbSource`, `pipelineOutputs`, `priority`
  - `status: 'pending'`, timestamps
  - `migratedFrom: 'questionQueue'`, `legacyQueueId`
- Does not delete source docs (read-only migration)

## Verification checklist
- Firestore data checks (use Console or queries):
  - `reviewQueue` has ≥ count of pending drafts formerly in `questionQueue`.
  - Sample a few migrated docs and confirm `draftItem`, `topicHierarchy`, `kbSource`, `priority` present.
  - New evaluation candidates and admin generation produce new docs in `reviewQueue`.
- Admin UI (`/admin/review`):
  - Loads pending queue items.
  - Approve rejects when image present and alt text missing; `lastApprovalError: 'alt_text_missing'` is recorded on failure.
  - Approve succeeds when alt text present and writes to `items/*`.
- Feedback loop:
  - Submit a few ratings for an item.
  - If average < 3.4, a new `reviewQueue` entry appears with `source: 'user_feedback'` and `sourceItemId` set.

## Rollback plan
- If the unified queue causes issues:
  - UI: Temporarily hide Review menu or gate access.
  - Data: Remove migrated documents only (filter by `migratedFrom == 'questionQueue'`). Example (script or manual):
    - Export IDs matching `migratedFrom` and batch delete in a controlled script.
  - Functionality: Revert to previous deployment tag (CI or `firebase deploy --only functions@<version>` if versioned) while investigating.

## Post-migration cleanup
- After verification period, consider deleting or archiving old `questionQueue` docs.
- Remove legacy aliases and any `questionQueue` references from code (if any remain).
- Update analytics to read from `reviewQueue`.

## Notes
- Generation during staging requires `GEMINI_API_KEY` via Secrets. Without it, pipelines won’t draft new questions, but admin functions and review flows remain testable.
- All writes to `reviewQueue` are via callables; Firestore rules are admin-only for defense in depth.
