# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Essential Commands

### Quick Setup (First Time)
```bash
# Complete setup from scratch
cd web && npm install && cd .. && \
cd functions && npm install && cd .. && \
cp web/.env.sample web/.env && \
echo "Edit web/.env with Firebase config, then run: firebase functions:secrets:set GEMINI_API_KEY"
```

### Development Workflow
```bash
# Start everything for local development (run in separate terminals)
firebase emulators:start
cd web && npm run dev

# Build entire project
cd web && npm run build && cd ../functions && npm run build && cd ..

# Run all tests
cd web && npm test && cd ../functions && npm test && cd ..

# Run specific test files
cd web && npx vitest run src/tests/admin.spec.tsx
cd functions && npx mocha lib/test/auth.test.js

# Run integration tests only
cd functions && npm run test:integration

# Lint and format
cd web && npm run lint
cd functions && npm run lint  # Note: Currently skips (returns 'skip')
```

### Deployment
```bash
# Deploy everything to Firebase
firebase deploy

# Deploy specific services
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only firestore:rules,storage:rules,firestore:indexes

# Grant admin access to a user (after deployment)
node scripts/set-admin-claim.js <email>
```

### Testing AI Pipeline
```bash
# Local testing interfaces (must have emulators running)
open http://localhost:5000/ai-pipeline-tester-local.html
open http://localhost:5000/simple-ai-tester.html
open http://localhost:5000/cloud-function-seeder.html

# Test specific AI agents via HTTP
curl -X POST http://localhost:5001/dermassist-ai-1zyic/us-central1/testBoardStyleGeneration \
  -H "Content-Type: application/json" \
  -d '{"topic": "melanoma"}'

# Test enhanced pipeline
curl -X POST http://localhost:5001/dermassist-ai-1zyic/us-central1/testEnhancedPipeline \
  -H "Content-Type: application/json" \
  -d '{"topic": "psoriasis", "difficulty": "intermediate"}'
```

## Working with AI Agents

### Standard Pattern for Agent Calls
```typescript
// All agents use Gemini 2.5 Pro exclusively
const result = await callAgent({
  model: 'gemini-2.5-pro',  // Always use this model
  temperature: 0.7,          // Standard for creative tasks
  maxTokens: 2000,          // Typical limit
  systemPrompt: AGENT_PROMPTS.boardStyle,
  userPrompt: buildPrompt(context),
  retries: 3,               // Built-in retry logic
  timeout: 30000            // 30 second timeout
});
```

### Quality Gates & Thresholds
- **Medical Accuracy**: ≥90% required
- **Structure Score**: ≥85 required  
- **ABD Compliance**: ≥80 required
- **Overall Quality**: ≥18/25 required
- **Generation Timeout**: 30 seconds per question
- **Max Iterations**: 3 improvement attempts

## Architecture Overview

### Technology Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Zustand, Vite
- **Backend**: Firebase Cloud Functions (Node.js 20), Firestore
- **AI**: Google Gemini 2.5 Pro for all AI agents
- **Auth**: Firebase Authentication with Custom Claims RBAC

### Project Structure
```
PrecisionLearnDerm/
├── web/                    # React frontend application
│   ├── src/
│   │   ├── pages/         # Page components (Dashboard, Quiz, Admin, etc.)
│   │   ├── components/    # Reusable UI components
│   │   ├── lib/           # Core utilities, API client, Firebase config
│   │   └── tests/         # Frontend tests
│   └── dist/              # Build output (deployed to Firebase Hosting)
│
├── functions/             # Firebase Cloud Functions backend
│   ├── src/
│   │   ├── ai/           # AI agents (drafting, review, scoring, tutor)
│   │   ├── pe/           # Personalization engine (ability, SRS, adaptive)
│   │   ├── admin/        # Admin functions (queue, taxonomy, analytics)
│   │   ├── items/        # Question management (CRUD operations)
│   │   ├── kb/           # Knowledge base (4,299 dermatology entities)
│   │   └── index.ts      # Function exports and initialization
│   └── lib/              # Compiled JavaScript output
│
├── shared/                # Shared TypeScript types
├── knowledge/             # Medical knowledge data files
└── scripts/              # Utility scripts (admin setup, fixes)
```

### Key Architectural Patterns

#### AI Pipeline Architecture
The system uses a multi-agent pipeline powered by Gemini 2.5 Pro:
1. **Board-Style Generator**: Creates ABD-compliant questions using knowledge base as context
2. **Structure Validator**: Ensures questions meet formatting requirements
3. **Medical Accuracy Checker**: Validates clinical correctness
4. **Quality Improver**: Iteratively enhances questions until they meet quality thresholds
5. **Final Scorer**: Evaluates on 25-point scale (requires 18+ to pass)

#### Personalization Engine
- **Elo Rating System**: Tracks user ability (theta parameter)
- **Bayesian Knowledge Tracing**: Models topic mastery probabilities
- **FSRS Algorithm**: Optimizes spaced repetition scheduling
- **Adaptive Generation**: Creates personalized questions based on performance gaps

#### Security Model
- **Firebase Custom Claims**: Admin users have `admin: true` in auth token
- **Zod Validation**: Type-safe input validation on all 40+ endpoints
- **Secret Management**: API keys stored in Firebase Functions Secrets
- **Firestore Rules**: Strict data access controls based on user roles

### Critical Configuration

#### Environment Variables
The web app requires Firebase configuration in `web/.env`:
```
VITE_FIREBASE_API_KEY=<from-firebase-console>
VITE_FIREBASE_AUTH_DOMAIN=dermassist-ai-1zyic.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dermassist-ai-1zyic
VITE_FIREBASE_STORAGE_BUCKET=dermassist-ai-1zyic.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<from-firebase-console>
VITE_FIREBASE_APP_ID=<from-firebase-console>
```

#### Firebase Secrets
Functions require the Gemini API key to be set as a secret:
```bash
firebase functions:secrets:set GEMINI_API_KEY
```

#### Firebase Emulator Ports
- **Functions**: http://localhost:5001
- **Firestore**: http://localhost:8081 (Note: configured as 8081, not default 8080)
- **Hosting**: http://localhost:5000
- **Emulator UI**: http://localhost:4000

### Database Schema

#### Core Collections
- **users/{uid}**: User profiles, preferences, performance metrics, mastery tracking
- **items/{itemId}**: Questions with psychometrics, quality scores, telemetry
- **quizzes/{uid}/attempts/{attemptId}**: Quiz attempt records with detailed analytics
- **users/{uid}/personalQuestions/{pqId}**: Adaptive questions targeting knowledge gaps

### API Endpoints

The system exposes 52 Cloud Functions organized by category:
- **AI Functions**: Question generation, review, scoring, tutoring
- **Admin Functions**: Queue management, taxonomy, user administration
- **Personalization**: Ability tracking, item selection, SRS scheduling
- **Item Management**: CRUD operations for questions
- **Utility Functions**: Health checks, testing endpoints

### Quality Standards

All code must adhere to:
- **Medical Accuracy**: 90%+ accuracy requirement for AI-generated content
- **ABD Compliance**: Questions must follow American Board of Dermatology guidelines
- **TypeScript Strict Mode**: No `any` types, full type safety
- **Test Coverage**: Unit and integration tests required for critical paths
- **Performance Targets**: API responses <2s, page loads <3s

### Troubleshooting Common Issues

1. **NPM Package Issues**: If encountering dependency conflicts:
   ```bash
   bash scripts/fix-npm-packages.sh
   ```

2. **Empty Database**: After deployment, seed initial questions:
   ```bash
   node scripts/post-deploy-setup.js  # Seeds initial data and configures defaults
   ```

3. **API Endpoint Mismatches**: Check `web/src/lib/api.ts` against `functions/src/index.ts` exports

4. **Emulator Issues**: Reset local emulator data:
   ```bash
   rm -rf .firebase/
   firebase emulators:start --clear
   ```

5. **Function Logs**: Check specific function execution:
   ```bash
   firebase functions:log --only <functionName>
   ```

6. **Deployment Verification**:
   ```bash
   bash verify-deployment.sh
   ```

### Development Tips

1. **Local Testing**: Always use Firebase emulators for development to avoid production API costs
2. **AI Pipeline Testing**: Use the HTML test interfaces for rapid iteration on question generation
3. **Performance Monitoring**: Check `functions/logs` for execution times and errors
4. **Security Testing**: Verify admin-only functions are properly protected before deployment

### Deployment Checklist

1. Ensure all environment variables are configured
2. Run tests: `npm test` in both web and functions directories
3. Build projects: `npm run build` in both directories
4. Deploy backend first: `firebase deploy --only functions`
5. Deploy frontend: `firebase deploy --only hosting`
6. Grant admin access: `node scripts/set-admin-claim.js <email>`
7. Seed initial data if needed
8. Verify all core features work in production

## Important Project Rules

From the project's engineering standards:
- Never assume any code is correct - always cross-check against official documentation
- Every change must be verified against current Firebase and upstream best practices
- Use only Firebase JS SDK v9+ modular API (no compat imports)
- All Firestore/Storage rules must be least-privilege and reviewed
- Enable and enforce App Check for all production endpoints
- Use emulator testing for all rule and feature changes before merging
- Never deploy from developer laptops - use CI/CD pipeline only
