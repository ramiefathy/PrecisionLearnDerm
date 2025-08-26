# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Essential Commands

### Quick Start
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

# Lint and format
cd web && npm run lint
cd functions && npm run lint
```

### Testing AI Pipeline
```bash
# Local testing interfaces (must have emulators running)
open http://localhost:5000/ai-pipeline-tester-local.html
open http://localhost:5000/simple-ai-tester.html
open http://localhost:5000/cloud-function-seeder.html

# Test specific AI agents
curl -X POST http://localhost:5001/dermassist-ai-1zyic/us-central1/testBoardStyleGeneration \
  -H "Content-Type: application/json" \
  -d '{"topic": "melanoma"}'
```

### Deployment
```bash
# Deploy everything
firebase deploy

# Deploy incrementally (recommended order)
firebase deploy --only firestore:rules,storage:rules,firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting

# Post-deployment setup
node scripts/set-admin-claim.js <email>
node scripts/post-deploy-setup.js  # Seeds initial data
```

### Troubleshooting
```bash
# Fix NPM package issues
bash scripts/fix-npm-packages.sh

# Check function logs
firebase functions:log --only <functionName>

# Verify deployment
bash verify-deployment.sh

# Reset local emulator data
rm -rf .firebase/
firebase emulators:start --clear
```

## Architecture Overview

### Multi-Agent AI Pipeline
The system uses **Gemini 2.5 Pro** exclusively across five specialized agents that work in sequence:

1. **Board-Style Generator** (`functions/src/ai/boardStyleGeneration.ts`)
   - Creates ABD-compliant questions using knowledge base as context
   - Uses few-shot learning with professional examples
   - Validates against medical standards

2. **Structure Validator** (`functions/src/ai/pipelineEnhanced.ts`)
   - Ensures questions meet formatting requirements
   - Validates stem, options, and explanation structure
   - Enforces ABD guidelines

3. **Medical Accuracy Checker** (`functions/src/ai/review.ts`)
   - Validates clinical correctness
   - Cross-references with knowledge base
   - Ensures evidence-based content

4. **Quality Improver** (`functions/src/ai/qualityOrchestrator.ts`)
   - Iteratively enhances questions below threshold
   - Maximum 3 improvement iterations
   - Targets score ≥20/25

5. **Final Scorer** (`functions/src/ai/scoring.ts`)
   - 25-point comprehensive evaluation
   - Requires 18+ to pass
   - Provides detailed feedback

### Personalization Engine Architecture
```
User Performance → Ability Tracking (Elo) → Topic Mastery (BKT)
                         ↓
              Spaced Repetition (FSRS)
                         ↓
              Adaptive Question Generation
```

Key components:
- **Elo Rating**: `functions/src/pe/abilityTracking.ts` - Tracks overall ability
- **BKT**: `functions/src/pe/performanceTracking.ts` - Models topic mastery  
- **FSRS**: `functions/src/pe/srs.ts` - Optimizes review scheduling
- **Adaptive Gen**: `functions/src/pe/adaptiveGeneration.ts` - Creates targeted questions

### Database Schema

#### Core Collections
```typescript
// User profile with performance metrics
users/{uid}: {
  profile: UserProfile,
  preferences: UserPreferences,
  performanceMetrics: PerformanceMetrics,
  topicMastery: { [topic: string]: MasteryData }
}

// Question with psychometrics
items/{itemId}: {
  content: QuestionContent,
  metadata: QuestionMetadata,
  psychometrics: ItemPsychometrics,
  qualityScores: QualityScores,
  telemetry: UsageTelemetry
}

// Quiz attempts with detailed analytics
quizzes/{uid}/attempts/{attemptId}: {
  config: QuizConfig,
  responses: QuestionResponse[],
  analytics: QuizAnalytics,
  abilityChanges: AbilityUpdate[]
}
```

### Security Architecture
- **Authentication**: Firebase Auth with email/password and Google SSO
- **Authorization**: Custom Claims RBAC (`admin: true` for admin users)
- **Validation**: Zod schemas on all 52 Cloud Functions
- **Secrets**: Firebase Functions Secrets for API keys
- **Rules**: Strict Firestore security rules per collection

## Critical Configuration

### Environment Variables
```bash
# web/.env (from Firebase Console)
VITE_FIREBASE_API_KEY=<your-api-key>
VITE_FIREBASE_AUTH_DOMAIN=dermassist-ai-1zyic.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dermassist-ai-1zyic
VITE_FIREBASE_STORAGE_BUCKET=dermassist-ai-1zyic.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<your-sender-id>
VITE_FIREBASE_APP_ID=<your-app-id>

# Firebase Secrets (set via CLI)
firebase functions:secrets:set GEMINI_API_KEY
```

### Quality Gates & Thresholds
- **Medical Accuracy**: ≥90% required
- **Structure Score**: ≥85 required  
- **ABD Compliance**: ≥80 required
- **Overall Quality**: ≥18/25 required
- **Generation Timeout**: 30 seconds per question
- **Max Iterations**: 3 improvement attempts

## Development Patterns

### Working with AI Agents
```typescript
// Standard pattern for agent calls
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

### Error Handling Pattern
```typescript
// All functions follow this pattern
export const functionName = functions.https.onCall(async (data, context) => {
  try {
    // Input validation with Zod
    const validated = schema.parse(data);
    
    // Check authentication
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '...');
    
    // Business logic
    const result = await processRequest(validated);
    
    // Return success
    return { success: true, data: result };
  } catch (error) {
    // Structured error response
    logger.error('Function failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
```

### Frontend API Pattern
```typescript
// Standard API call pattern in web/src/lib/api.ts
export async function apiCall(endpoint: string, data: any) {
  const functions = getFunctions();
  const callable = httpsCallable(functions, endpoint);
  const result = await callable(data);
  return result.data;
}
```

## Testing Strategy

### Unit Tests
```bash
# Frontend (Vitest)
cd web && npx vitest run src/tests/smoke.test.ts

# Backend (Mocha)  
cd functions && npm run test:unit
```

### Integration Tests
```bash
# Run with emulators
cd functions && npm run test:integration
```

### AI Pipeline Tests
```bash
# Use HTML testers for manual testing
open http://localhost:5000/ai-pipeline-tester-local.html

# Or use test endpoints
curl http://localhost:5001/.../testBoardStyleGeneration
curl http://localhost:5001/.../testEnhancedPipeline
```

## Known Issues & Workarounds

1. **NPM Package Conflicts**
   ```bash
   # Use the fix script
   bash scripts/fix-npm-packages.sh
   ```

2. **Empty Database After Deploy**
   ```bash
   # Seed with initial questions
   node scripts/post-deploy-setup.js
   ```

3. **API Endpoint Mismatches**
   - Check `web/src/lib/api.ts` matches `functions/src/index.ts` exports
   - Function names must match exactly

4. **Emulator Data Persistence**
   ```bash
   # Clear and restart if corrupted
   rm -rf .firebase/
   firebase emulators:start --clear
   ```

5. **TypeScript Build Errors**
   ```bash
   # Rebuild TypeScript declarations
   cd functions && rm -rf lib && npm run build
   ```

## Performance Optimization

### AI Pipeline
- Use caching for knowledge base lookups
- Batch question generation when possible
- Monitor Gemini API quotas (2 RPM limit)

### Frontend
- Lazy load admin components
- Use React.memo for expensive renders
- Implement virtual scrolling for large lists

### Backend
- Use Firestore compound indexes
- Implement collection group queries carefully
- Cache user performance metrics

## Monitoring & Debugging

### Check Function Logs
```bash
# View all function logs
firebase functions:log

# Filter by function
firebase functions:log --only generateQuestion

# Stream logs
firebase functions:log --follow
```

### Performance Monitoring
- Check Firebase Console → Functions → Metrics
- Monitor Gemini API usage in Google Cloud Console
- Use Chrome DevTools Performance tab for frontend

### Debug AI Pipeline
1. Use test endpoints with detailed output
2. Check intermediate agent results in logs
3. Verify knowledge base is loaded correctly
4. Monitor quality scores and failure reasons

## Deployment Checklist

1. **Pre-deployment**
   - [ ] Run all tests: `npm test` in both directories
   - [ ] Build projects: `npm run build` in both directories
   - [ ] Update environment variables if needed
   - [ ] Check Gemini API key is set

2. **Deployment**
   - [ ] Deploy rules first: `firebase deploy --only firestore:rules,storage:rules`
   - [ ] Deploy functions: `firebase deploy --only functions`
   - [ ] Deploy hosting: `firebase deploy --only hosting`

3. **Post-deployment**
   - [ ] Grant admin access: `node scripts/set-admin-claim.js <email>`
   - [ ] Seed initial data if needed
   - [ ] Test core features in production
   - [ ] Monitor error logs for first hour

## Important Project Rules

From the engineering standards documents:

- **Never assume code correctness** - Always verify against official documentation
- **Firebase SDK v9+ only** - No compat imports allowed
- **Least-privilege security** - All Firestore rules must be restrictive
- **App Check required** - Must be enabled for production
- **Emulator testing mandatory** - Test all changes locally first
- **CI/CD deployment only** - Never deploy from developer machines
- **Medical accuracy critical** - 90%+ accuracy requirement is non-negotiable
- **ABD compliance required** - All questions must follow board guidelines
