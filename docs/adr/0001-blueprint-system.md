### ADR 0001: Question Blueprint System (ABD/NBME-aligned)

Status: Accepted
Date: 2025-09-09

Context
- We need consistent board-style MCQs that meet ABD/NBME standards: exactly five options, single best answer, cover-the-options lead-ins, homogeneous distractors, and strong a11y.
- Prior generation relied on prompts without a formal schema, causing variability and post-hoc rejections.

Decision
- Introduce a formal `QuestionBlueprint` schema and a curated dermatology-specific blueprint library.
- Insert a blueprint selection step into generation, driven by topic, difficulty, seed, and diversity flags.
- Enforce validators at generation time; log outcomes to `evaluationJobs/{jobId}/liveLogs` and attach per-item validation results.

Details
- Schema (implemented): `functions/src/types/questionBlueprint.ts` with fields:
  - id, leadIn, cognitiveTarget, requiredClues, optionalClues
  - constraints: optionsCount=5, singleBestAnswer=true, difficulty, bannedPhrases[]
  - optionStrategy: "homogeneous" | "mechanismDistractors" | ...
  - explanationOutline[], references[], a11y{ imageRequired, altTextRequired }
- Library (seeded): `functions/src/generation/blueprints/library.ts` (7+ dermatology blueprints).
- Selector: `functions/src/generation/blueprintSelector.ts` honors `leadInMix`, `topicSpread`, optional `seed`.
- Validators: `functions/src/generation/validators.ts` enforce ABD/NBME constraints (five options, single best, cover-the-options heuristic, homogeneity, duplicate detection, negative-lead-in guards).
- Batch orchestration: `functions/src/generation/generateQuestionsBatch.ts` integrates selector + validators with existing pipelines (`boardStyle`, `optimizedOrchestrator`, `hybridRouter`).

Mapping from UI request
- DTO: `EvaluationRequest` includes `pipelines[]`, `difficulty`, `count`, `topics[]`, `seed`, `diversity{ leadInMix, topicSpread, includeImages }`.
- Persisted under `evaluationJobs/{jobId}.request` for reproducibility.

Alternatives considered
- Keep pure prompt-based generation (rejected: quality variance, weak repeatability).
- Validators only post-hoc (rejected: wastes tokens, delays feedback loops).

Consequences
- More deterministic, higher-quality items; easier moderation.
- Slightly higher initial implementation complexity offset by fewer post-hoc edits.

Acceptance
- 100% items have five options and per-option explanations.
- ≥70% items pass validators on first attempt (tunable).
- Diversity flags influence blueprint/lead-in mix; outcomes observable in logs.

Operationalization
- Feature flags: `VITE_BLUEPRINTS_V1` for UI gating if needed.
- Telemetry: validator pass/fail, blueprint id, cognitiveTarget.

