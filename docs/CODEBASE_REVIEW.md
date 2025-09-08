# PrecisionLearnDerm: Codebase Review Report

## Phase 1: Codebase Comprehension

Below is a high-level overview of the project structure, purpose, and key components.

### 1. Repository Structure
```
.
├── .github/                  # GitHub Actions workflows
├── cloudbuild.yaml           # GCP Cloud Build config
├── firebase.json             # Firebase hosting & emulator config
├── firestore.indexes.json
├── firestore.rules
├── storage.rules
├── docs/                     # Architecture & data-contract docs
├── example UI images/        # Screenshots & UI mock-ups
├── PLD_rules                 # Engineering rules & best practices
├── functions/                # Firebase Cloud Functions (TS)
├── scripts/                  # One-off and maintenance scripts
├── web/                      # Frontend (React + TS + Vite)
└── README.md                 # Project overview, quickstart, tech stack
```

### 2. Purpose & Overview
- **PrecisionLearnDerm** is an AI-powered dermatology board exam prep platform leveraging:
  - Multi-agent Gemini 2.5 Pro pipelines for question generation & scoring
  - Hierarchical taxonomy of dermatology entities
  - Personalized spaced-repetition learning (SRS)
  - Admin dashboard for educators, with live logs & real-time tracking

### 3. Tech Stack & Architecture
| Layer           | Technology                | Version   | Notes                              |
|-----------------|---------------------------|-----------|------------------------------------|
| Frontend        | React                     | 19.x      | SPA / Admin Dashboard              |
| Frontend        | TypeScript                | ~5.8      | Strict mode enforced               |
| UI Framework    | MUI                       | 7.x       | Theming & Grid                     |
| Build           | Vite                      | ^6        | Fast dev / optional SSR            |
| Backend (FaaS)  | Firebase Functions (Node) | 20        | AI pipeline & admin APIs           |
| Data            | Firestore                 | –         | NoSQL document store               |
| Auth            | Firebase Auth             | –         | Email/password + custom claims     |
| AI Provider     | Google Gemini 2.5 Pro     | API       | Multi-axis generation & scoring    |
| Package Manager | pnpm                      | 9.x       | Deterministic workspace support    |
| Linting         | ESLint                    | 9.x       | Custom rules for MUI Grid usage    |
| Formatting      | Prettier                  | 3.x       | Pre-commit enforced                |
| Testing         | Vitest (web) / Mocha (fn) | –         | Unit, integration, E2E via emulator |
| CI/CD           | GitHub Actions            | –         | Lint + Test + Deploy pipelines     |

Refer to the repository README.md for full details.

## Phase 2: CI Failure Analysis

This phase identified the following CI issues in GitHub Actions workflows:

| Issue                                  | File / Workflow                                  | Cause                                                    |
|----------------------------------------|----------------------------------------------------|----------------------------------------------------------|
| 1. Missing Codecov usage               | `.github/workflows/codecov.yml`                    | Unused; missing `CODECOV_TOKEN` secret → upload fails    |
| 2. Misconfigured preview deploy inputs | `.github/workflows/firebase-preview.yml`           | Invalid `entrypoint` input; action does not support it   |
| 3. Stray echo files in .github/        | `.github/echo 'google.com, pub-... > public`        | Noise; leftover files causing CI confusion               |

**Summary of Root Causes:**
- The Codecov workflow errors due to missing token but is no longer needed.
- The Firebase preview deploy step fails because `entrypoint` is not a recognized parameter.
- Two stray echo files under `.github/` should be removed.

## Phase 3: Master Issue List & Fixes

Below is a consolidated list of issues to address (with location, root cause, and proposed fixes), followed by patches implementing the changes so that CI passes end-to-end and deployment to Firebase succeeds.

### Issue 1: Remove unused Codecov workflow
- **Location:** `.github/workflows/codecov.yml`
- **Root cause:** Unused workflow causing CI failures and noise.
- **Fix:** Delete the file.

### Issue 2: Fix Firebase preview deploy workflow
- **Location:** `.github/workflows/firebase-preview.yml`
- **Root cause:** Invalid `entrypoint` input; missing expected `dir` or default behavior.
- **Fix:** Remove `entrypoint` option (let action pick up root `firebase.json`).

### Issue 3: Remove stray echo files in .github/
- **Location:** `.github/echo 'google.com,...'` and `.github/workflows/echo 'google.com,...'`
- **Root cause:** Accidental echo commands stored as files.
- **Fix:** Delete these files entirely.

*(Patches follow to apply each fix.)*