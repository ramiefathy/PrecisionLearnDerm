# 🚀 PrecisionLearnDerm Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. Code Quality
- [x] All TypeScript compiles without errors
- [x] No hardcoded secrets or credentials
- [x] Input validation on all endpoints
- [x] Error handling implemented
- [x] Logging and monitoring in place

### 2. Security
- [x] Admin authentication via Firebase custom claims
- [x] API keys managed via Firebase Secrets
- [x] Firestore security rules updated
- [x] Storage rules properly restrictive
- [x] No exposed sensitive data

### 3. Testing
- [x] Unit tests for auth functions
- [x] Validation tests for schemas
- [ ] Integration tests with Firebase emulator
- [ ] End-to-end user flow tests

## 📋 Deployment Steps

### Step 1: Environment Setup
```bash
# Ensure you're logged into Firebase
firebase login

# Verify project
firebase use precisionlearnderm

# Ensure Node versions
# Functions build: Node 20 (engines enforced)
# Web build: Node 20 recommended with Vite 6 + esbuild 0.25.x
```

### Step 2: Set Secrets
```bash
# Set the Gemini API key (you'll be prompted to enter it)
firebase functions:secrets:set GEMINI_API_KEY

# Verify secret is set
firebase functions:secrets:list
```

### Step 3: Deploy Security Rules
```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules
firebase deploy --only storage:rules

# Deploy Firestore indexes
firebase deploy --only firestore:indexes
```

### Step 4: Deploy Cloud Functions
```bash
# Build functions first
cd functions
npm run build
cd ..

# Deploy all functions
firebase deploy --only functions

# Or deploy specific function groups
firebase deploy --only functions:ai_generate_mcq,functions:ai_review_mcq
firebase deploy --only functions:admin_grant_admin_role,functions:admin_revoke_admin_role
firebase deploy --only functions:healthCheck,functions:getMetrics,functions:getLogs

### Evaluation Functions (short-timeout safe)
To avoid deployment timeouts, deploy the evaluation functions individually after building:
```bash
npm --prefix functions run build
firebase deploy --only functions:cancelEvaluationJob
firebase deploy --only functions:processBatchTests
firebase deploy --only functions:startPipelineEvaluation
```
```

### Step 5: Deploy Web App
```bash
# Build the web app
cd web
npm run build
cd ..

# Deploy hosting
firebase deploy --only hosting
```

Notes
- Frontend uses MUI v7 Grid. Use `Grid` from `@mui/material` with `size={{ xs, md }}` props. Avoid `Grid2`/`Unstable_Grid2`.
- esbuild must be 0.25.x for Vite 6. Pin `esbuild@0.25.9` in devDependencies and avoid platform‑specific packages like `@esbuild/darwin-arm64` to keep CI and deploy environments cross‑platform.

### Step 6: Grant Initial Admin Access
```bash
# Run the admin setup script
node scripts/set-admin-claim.js ramiefathy@gmail.com

# Verify admin access
# The user should log out and log back in to refresh their token
```

## 🔍 Post-Deployment Verification

### 1. Health Checks
```bash
# Check functions health
curl https://us-central1-precisionlearnderm.cloudfunctions.net/healthCheck

# Expected response:
# {
#   "status": "healthy",
#   "checks": {
#     "firestore": true,
#     "geminiApi": true
#   },
#   "timestamp": "..."
# }
```

### 2. Admin Functions
- [ ] Admin can log in successfully
- [ ] Admin can access admin dashboard
- [ ] Admin can grant/revoke admin roles
- [ ] Admin can view logs and metrics

### 3. User Functions
- [ ] Users can register/login
- [ ] Users can generate questions
- [ ] Users can take quizzes
- [ ] Personalization engine works

### 4. Monitoring
- [ ] Logs are being written to Firestore
- [ ] Metrics are being collected
- [ ] Alerts are configured for critical errors
- [ ] Performance metrics are acceptable

## 🚨 Rollback Plan

If issues are encountered:

### Quick Rollback
```bash
# Rollback to previous function version
firebase functions:delete <function-name>
firebase deploy --only functions:<function-name>

# Rollback hosting
firebase hosting:rollback
```

### Full Rollback
```bash
# Restore from backup (ensure you have backups first!)
git checkout <previous-commit>
npm install
firebase deploy
```

## 📊 Success Criteria

- [ ] All health checks pass
- [ ] No errors in Cloud Functions logs
- [ ] Authentication works for both users and admins
- [ ] Core user flows work end-to-end
- [ ] Performance metrics within acceptable ranges:
  - Function cold start < 3s
  - API response time < 2s
  - Page load time < 3s

## 🔐 Security Checklist

- [ ] GEMINI_API_KEY is set as secret (not in code)
- [ ] Admin emails removed from source code
- [ ] Firebase App Check enabled (if applicable)
- [ ] CORS properly configured
- [ ] Rate limiting active
- [ ] Security rules tested with emulator

## 📝 Notes

- Always deploy to staging/dev environment first
- Monitor logs during and after deployment
- Have rollback plan ready
- Document any issues encountered
- Update this checklist based on lessons learned

## 🆘 Troubleshooting

### Common Issues

1. **Functions deployment fails**
   - Check Node version (should be 20)
   - Clear node_modules and reinstall
   - Check for TypeScript errors

2. **Secret not accessible**
   - Ensure secret is set: `firebase functions:secrets:list`
   - Redeploy functions after setting secret
   - Check function logs for access errors

3. **Admin access not working**
   - User must log out and back in after claims are set
   - Verify claims with Firebase Admin SDK
   - Check Firestore rules for admin checks

4. **Performance issues**
   - Check function memory allocation
   - Review Firestore query efficiency
   - Enable caching where appropriate

---

Last Updated: 2025-09-02
Status: Ready for deployment with security fixes
