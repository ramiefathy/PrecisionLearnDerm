### Runbook: Admin Evaluation Workflow

Scope
- Configure and launch evaluation jobs; monitor progress; view logs/results.

Prereqs
- Admin user with `admin` claim.
- Web env vars configured; Functions deployed.

Steps
1) Navigate to `/admin/evaluation-v2/run`.
2) Configure:
   - Pipelines (multi-select)
   - Difficulty (Basic | Intermediate | Advanced)
   - Number of questions (1–50)
   - Topics/Tags (comma-separated for now)
   - Optional: Seed; Diversity flags (leadInMix, topicSpread, includeImages)
3) Submit. The UI calls `startPipelineEvaluation` with DTO and redirects to `/admin/evaluation-v2?jobId=...`.
4) Monitor `LiveEvaluationLogs` and `EvaluationProgressMonitor`. Logs stream from `evaluationJobs/{jobId}/liveLogs`.
5) After completion, check `.../testResults` for summary and any validator failures.

Operational Notes
- Job metadata persisted under `evaluationJobs/{jobId}.request` for reproducibility.
- Long-polling is enabled for Firestore when necessary (network restricted contexts).
- If job stalls, see `functions/scripts/fixStuckEvaluations.js`.

