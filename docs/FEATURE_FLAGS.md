# Feature Flags

Server-side toggles defined in `functions/src/util/config.ts` to control latency/quality trade-offs and optional features.

- `config.generation.useFlashForDraft` (boolean, default true)
  - Prefer `gemini-2.5-flash` for drafting to reduce latency. Fallback to Pro is still available internally.

- `config.generation.useFlashForReview` (boolean, default true)
  - Prefer `gemini-2.5-flash` for review passes for speed.

- `config.generation.disableKBContext` (boolean, default true)
  - Skip loading/using the Knowledge Base context while the KB pipeline is under development.

- `config.scoring.useProForFinal` (boolean, default true)
  - Keep final evaluation on `gemini-2.5-pro` to protect output quality. Flip off to use Flash end-to-end.

- `config.logs.enableStreaming` (boolean, default false)
  - Stream model output to Firestore `liveLogs`. Off by default. When enabled, logs include drafting snippets (stem/options/explanation excerpts) and orchestrator agent summaries. Entries are truncated (~800 chars) and emitted at key stages to avoid quota issues.
