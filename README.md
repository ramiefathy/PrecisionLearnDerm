# PrecisionLearnDerm 🧠🩺

> AI-powered dermatology board exam preparation platform with advanced taxonomy-based question generation

[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Gemini](https://img.shields.io/badge/Gemini-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)

## 🌟 Overview

PrecisionLearnDerm is a sophisticated AI-powered platform designed to help medical professionals prepare for dermatology board examinations. The platform leverages multi-agent AI systems, advanced taxonomy organization, and personalized learning algorithms to deliver high-quality, contextually relevant practice questions.

### ✨ Key Features

- **🤖 Multi-Agent AI Pipeline**: Powered by Gemini 2.5 Pro with specialized agents for drafting, review, and scoring
- **📚 Taxonomy-Based Organization**: Hierarchical categorization of 4,299+ dermatology entities
- **⚡ Personalized Learning**: Adaptive question selection based on user performance and preferences  
- **🏥 Board-Style Questions**: Clinically accurate questions following ABD guidelines
- **🎯 Real-time Performance Tracking**: SRS-based spaced repetition system
- **👨‍⚕️ Admin Dashboard**: Comprehensive management tools for educators and administrators

### 📊 Admin Pipeline Evaluation (New)

Test and compare AI pipelines with live dashboards, logs, and canonicalized results.

- Routes:
  - `/admin/evaluation` (legacy)
  - `/admin/evaluation-v2` (beta)
- UI Components:
  - `web/src/components/evaluation/EvaluationDashboard.tsx` — live charts, table, question dialog
  - `web/src/components/evaluation/EvaluationProgressMonitor.tsx` — progress + cancel
  - `web/src/components/evaluation/LiveEvaluationLogs.tsx` — streaming logs
  - `web/src/components/evaluation/EvaluationResultsDisplay.tsx` — final results view
- Functions:
  - `functions/src/evaluation/startPipelineEvaluation.ts` — create job and trigger processing
  - `functions/src/evaluation/evaluationProcessor.ts` — batched processing, logs, results (with cancel checks)
  - `functions/src/evaluation/evaluationJobManager.ts` — job lifecycle utils
  - `functions/src/evaluation/aiQuestionScorer.ts` — Gemini-based evaluation

Canonical fields saved per test for robust UI/analytics:
- `normalized.optionsArray`, `normalized.correctAnswerIndex`, `normalized.correctAnswerLetter`
- `aiScoresFlat.overall`, `.boardReadiness`, `.clinicalRealism`, `.medicalAccuracy`, `.distractorQuality`, `.cueingAbsence`

Cancel support: callable `cancelEvaluationJob` sets `cancelRequested` and the processor stops at batch boundaries.

### ⚠️ Frontend UI Note: MUI Grid usage
- Import with `import { Grid } from '@mui/material'`.
- Use the container/item API for compatibility with our CI/tooling:
  - Parent: `<Grid container spacing={...}>`
  - Children: `<Grid item xs={12} md={6}> ... </Grid>`
- Do not use `@mui/material/Grid2` or `@mui/material/Unstable_Grid2` in this repo.

### 🔧 Build Tooling Note: Vite 6 + esbuild
- Pin `esbuild@0.25.9` in `devDependencies` for compatibility with Vite 6.
- Do not add platform‑specific esbuild packages (e.g., `@esbuild/darwin-arm64`) to `package.json` — they fail on Linux CI.
- If you hit a host/binary mismatch, clear stale binaries in `web/node_modules` and reinstall.

## 🏗️ Architecture

### Frontend
- **React 19** with TypeScript for modern, type-safe development
- **Firebase Hosting** for reliable, global content delivery
- **Responsive Design** optimized for desktop and mobile learning

### Backend  
- **52+ Firebase Cloud Functions** providing scalable, serverless API endpoints
- **Cloud Firestore** for real-time data synchronization
- **Multi-tier caching** (L1: Memory, L2: Firestore) for optimal performance

### AI System
- **Gemini 2.5 Pro** as the primary language model
- **Structured text parsing** to eliminate JSON truncation issues
- **Robust client** with retry logic and fallback to Gemini 2.5 Flash
- **Parallel processing** for research and question generation

### 🔌 File Interconnections (Key Paths)

- Entry: `functions/src/index.ts` (exports) and `web/src/App.tsx` (routes)
- Pipelines: `functions/src/ai/boardStyleGeneration.ts`, `functions/src/ai/optimizedOrchestrator.ts`, `functions/src/ai/hybridPipelineRouter.ts`
- Evaluation (backend): `functions/src/evaluation/startPipelineEvaluation.ts`, `functions/src/evaluation/evaluationProcessor.ts`, `functions/src/evaluation/evaluationJobManager.ts`, `functions/src/evaluation/aiQuestionScorer.ts`
- Evaluation (frontend): `web/src/pages/AdminEvaluationV2Page.tsx` + components under `web/src/components/evaluation/`
- Approved question dataset: `functions/src/data/approved_dermatology_questions.json`

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Firebase CLI
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/PrecisionLearnDerm.git
cd PrecisionLearnDerm

# Install dependencies
cd functions && npm install
cd ../web && npm install

# Set up environment variables
cp web/.env.sample web/.env.local
# Add your Firebase config and API keys

# Start local development
cd web && npm run dev
```

### Firebase Setup

```bash
# Install Firebase CLI if needed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase project
firebase use YOUR_PROJECT_ID

# Deploy functions
cd functions && npm run build && firebase deploy --only functions

# Deploy frontend
cd ../web && npm run build && firebase deploy --only hosting

### 🧭 Minimal, Safe Deploy of Evaluation Functions

To avoid deployment timeouts, deploy these functions individually after building once:

```bash
npm --prefix functions run build
firebase deploy --only functions:cancelEvaluationJob
firebase deploy --only functions:processBatchTests
firebase deploy --only functions:startPipelineEvaluation
```

Then deploy the web app as needed:

```bash
npm --prefix web run build
firebase deploy --only hosting
```
```

## 🎮 Usage

### For Students
1. **Sign Up**: Create an account and complete the onboarding process
2. **Configure Quiz**: Choose topics via traditional selection or advanced taxonomy browsing
3. **Take Practice Exams**: Answer board-style questions with detailed explanations
4. **Track Progress**: Monitor performance with analytics and spaced repetition scheduling

### For Administrators  
1. **Access Admin Panel**: Navigate to `/admin` with administrative privileges
2. **Generate Questions**: Use AI pipeline to create new questions with taxonomy targeting
3. **Review Quality**: Manage question queue and approve generated content
4. **Monitor System**: View performance metrics and system health

## 🔧 Development

### Project Structure

```
PrecisionLearnDerm/
├── functions/                 # Firebase Cloud Functions
│   ├── src/
│   │   ├── ai/               # AI pipeline and orchestration
│   │   ├── admin/            # Administrative functions
│   │   ├── pe/               # Personalization engine
│   │   ├── services/         # Core services (taxonomy, etc.)
│   │   └── util/             # Utilities and helpers
│   └── package.json
├── web/                      # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/           # Application pages
│   │   ├── contexts/        # React contexts
│   │   └── hooks/           # Custom React hooks
│   └── package.json
├── docs/                     # Documentation
├── CLAUDE.md                 # Development guide
└── README.md
```

### Key Commands

```bash
# Backend development
cd functions
npm run build         # Compile TypeScript
npm run test:unit     # Run unit tests
firebase emulators:start  # Start local emulators

# Frontend development  
cd web
npm run dev          # Start development server
npm run build        # Production build
npm run test         # Run tests

# Deployment
firebase deploy --only functions    # Deploy backend
firebase deploy --only hosting      # Deploy frontend

# Evaluation functions (one-by-one)
npm --prefix functions run build
firebase deploy --only functions:cancelEvaluationJob
firebase deploy --only functions:processBatchTests
firebase deploy --only functions:startPipelineEvaluation
```

## 🧪 Testing

The platform includes comprehensive testing infrastructure:

- **Unit Tests**: Individual component and function testing
- **Integration Tests**: Cross-service interaction testing
- **End-to-End Tests**: Complete user journey validation
- **Performance Tests**: Load and stress testing
- **Admin Interface**: Manual testing tools at `/admin/testing`

```bash
# Run all tests
npm run test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 🔐 Security

- **Firebase Authentication** with role-based access control
- **Input sanitization** and validation on all endpoints
- **Rate limiting** to prevent abuse
- **Secure API key management** with environment variables
- **Private repository** for sensitive medical content
  - Store LLM keys in Firebase Secrets (e.g., `GEMINI_API_KEY`)
  - Always enforce `requireAuth`/`requireAdmin` in callables

## 📈 Performance

Current performance metrics:
- **Question Generation**: 24.15s average (87% improvement from baseline)
- **Multi-Agent Pipeline**: 60-70s typical response time
- **Cache Hit Rate**: Two-tier caching with L1/L2 optimization
- **Success Rate**: 66% in production (continuously improving)

## 🤝 Contributing

This is a private repository for medical education purposes. If you have access and would like to contribute:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

## 📋 Roadmap

### Phase 1: Core Platform ✅
- [x] Multi-agent question generation
- [x] Taxonomy-based organization  
- [x] User authentication and roles
- [x] Basic quiz functionality

### Phase 2: Advanced Features ✅
- [x] Performance optimization
- [x] Enhanced caching system
- [x] Admin dashboard
- [x] Deployment automation

### Phase 3: Intelligence & Analytics 🚧
- [ ] Advanced personalization algorithms
- [ ] Predictive performance modeling
- [ ] Enhanced question analytics
- [ ] Mobile application

## 🆘 Support

For technical issues or questions:

1. **Check** the [CLAUDE.md](./CLAUDE.md) development guide
2. **Review** existing GitHub issues
3. **Contact** the development team for private repository access

## 📄 License

This project is proprietary software for medical education. All rights reserved.

## 🙏 Acknowledgments

- **Medical Experts** who provided domain knowledge and validation
- **Firebase Team** for the robust infrastructure platform
- **Google AI** for the Gemini language models
- **Open Source Community** for the foundational tools and libraries

---

**Built with ❤️ for medical education**

*Last updated: September 2025*

---

## ✅ Best Practices (Cheat Sheet)

- Firebase Functions
  - Prefer `https.onCall` with `requireAuth`/`requireAdmin`
  - Keep module scope light; lazy-load KB/Taxonomy
  - Use `getRobustGeminiClient` with timeouts/retries/Flash fallback
  - Write canonical fields for UI (`normalized.*`, `aiScoresFlat.*`)
  - Avoid deep function-to-function chains (timeout cascades)

- Firestore
  - Store compact per-test results; avoid full raw LLM dumps
  - Use atomic increments (e.g., `completedTests`) where possible
  - Add indexes for admin listing/filters

- Frontend
  - Prefer canonical fields; keep fallbacks for legacy data
  - Treat quality as percentage (0–100%) consistently
  - Sanitize any rich text before rendering

- Secrets & Config
  - Keep keys in Firebase Secrets
  - Verify Node.js 20 in `functions/package.json` engines
  - Set required secrets before deploys (e.g., `GEMINI_API_KEY`)

## 🧭 Overall Product Architecture

SPA (React) on Firebase Hosting → Firebase Functions (callables) → Firestore (data) → Gemini (AI). Pipelines orchestrate drafting/review/scoring with robust caching, structured text, and live progress logs. Admin evaluation writes canonical result shapes for resilient dashboards.
