### Playbook: Psychometrics

Metrics
- Difficulty (P-value): target 0.30–0.70.
- Discrimination (point-biserial): ≥0.30 desirable.
- Distractor analysis: flag options selected <2–5% as non-functioning.

Data Sources
- Post-deployment response logs; per-item summary pipeline.

Policies (per user input)
- Auto-flag items with <80% AI score at generation and/or <75% user score after review exposure in prod.

Actions
- Low P-value (<0.30): check stem clarity, distractor plausibility.
- High P-value (>0.70): consider difficulty increase or blueprint adjustment.
- Low discrimination: revise distractors; ensure single-best separation.

Dashboards
- Approval rate, validator pass-rate, lead-in mix, item performance over time.

