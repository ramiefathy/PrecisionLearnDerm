### Runbook: Generation → Review → Approval

Scope
- Move generated drafts through review to publication in `items/*`.

Flow
1) Generation writes drafts via `review_enqueue_draft` (or manual enqueue) with payload: stem, options A–E, correctIndex, explanations, metadata.
2) Review queue UI lists pending drafts; use filters as needed.
3) Open a draft → edit stem/options/explanations; Save Draft to persist versions.
4) Approve to publish to `items/{id}` (`status: active`, `sourceDraftId`).
5) Reject with notes for future revision.

Validation
- Validators run at generation time; review UI should highlight any failures.
- Ensure five options, single-best, cover-the-options lead-in, distractor homogeneity.

Audit
- All edits appended to `versions[]` with timestamp and reviewer uid.
- Approved item stores provenance fields for rollback and analysis.

