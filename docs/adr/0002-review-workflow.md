### ADR 0002: Admin Review Queue Workflow

Status: Accepted
Date: 2025-09-09

Context
- Generated questions require structured moderation prior to publication.
- Existing admin endpoints are fragmented; drafts vs. active items are not standardized.

Decision
- Adopt a Firestore-backed review queue: `reviewQueue/{id}` as the single staging area.
- Callable endpoints (admin-only) manage lifecycle: enqueue, list, save draft, approve, reject.
- Approval writes to `items/{id}` with `status: "active"`, retaining draft provenance.

Details
- Data model: `reviewQueue/{id}` with fields: `draftItem`, `topicIds[]`, `difficulty`, `status` (pending|approved|rejected), `versions[]`, timestamps, reviewerId.
- Endpoints: implemented in `functions/src/review/endpoints.ts`.
- Security: Firestore rules allow admin-only read/write for `reviewQueue/*`.
- Audit trail: `versions[]` stores edit diffs with timestamp and user ID; approvals store `sourceDraftId` in `items/{id}`.

UI Plan (incremental)
- Queue list with filters (topic/difficulty/status), infinite scroll.
- Detail editor: side-by-side generated vs edited item; actions: Approve, Reject(with notes), Save Draft.

Alternatives considered
- Direct publish without queue (rejected: unsafe).
- Pure server-side moderation (rejected: lacks transparent audit trail and collaboration).

Consequences
- Traceable, auditable content workflow; simplified operations for admins.

Acceptance
- Emulator test shows enqueue → list → approve → items publish path works.

