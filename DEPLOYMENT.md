# PrecisionLearnDerm Deployment Documentation

## 🚀 Deployment Status

**Last Deployment:** August 17, 2025  
**Project ID:** dermassist-ai-1zyic  
**Status:** ✅ LIVE AND OPERATIONAL

## 📍 Production URLs

| Service | URL | Status |
|---------|-----|--------|
| **Main Application** | https://dermassist-ai-1zyic.web.app | ✅ Live |
| **Firebase Console** | https://console.firebase.google.com/project/dermassist-ai-1zyic | ✅ Active |
| **Health Check API** | https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/healthCheck | ✅ Healthy |

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React/Vite)                   │
│                   Hosted on Firebase Hosting                 │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Firebase Cloud Functions                     │
│                        66 Functions                          │
│                    (Node.js 20, 1st Gen)                    │
└─────────────────────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                      ▼
        ┌──────────────────┐    ┌──────────────────┐
        │  Firestore DB    │    │  Gemini AI API   │
        │   (NoSQL)        │    │  (Generation)    │
        └──────────────────┘    └──────────────────┘
```

## 📦 Deployed Components

### Cloud Functions (66 Total)
- **AI Generation:** 13 functions
- **Quiz/Learning:** 24 functions  
- **Admin Management:** 11 functions
- **Testing/Monitoring:** 18 functions

### Key Functions:
| Function Category | Count | Examples |
|------------------|-------|----------|
| AI Operations | 13 | `ai_generate_mcq`, `ai_review_mcq`, `ai_score_mcq` |
| User Learning | 24 | `pe_get_next_items`, `pe_record_answer`, `pe_srs_update` |
| Admin Tools | 11 | `admin_grant_role`, `admin_review_question` |
| Testing | 18 | `test_generate_question`, `healthCheck` |

## 🔧 Configuration

### Environment Variables
Location: `functions/.env`

```bash
GEMINI_API_KEY=<configured in Firebase Secrets>
NODE_ENV=production
```

### Firebase Services Status
| Service | Status | Configuration |
|---------|--------|---------------|
| **Authentication** | ✅ Enabled | Email/Password |
| **Firestore** | ✅ Active | Rules deployed |
| **Cloud Functions** | ✅ Running | 66 functions |
| **Hosting** | ✅ Live | 33 files deployed |
| **Cloud Storage** | ✅ Configured | Rules deployed |

## 🚀 Deployment Commands

### Full Deployment
```bash
# Deploy everything
firebase deploy

# Deploy specific services
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only storage
```

### Build Commands
```bash
# Build frontend
cd web && npm run build

# Build functions (excluding tests)
cd functions && npm run build
```

## 📋 Post-Deployment Setup

### 1. Enable Authentication
1. Go to [Firebase Console > Authentication](https://console.firebase.google.com/project/dermassist-ai-1zyic/authentication)
2. Enable Email/Password sign-in method
3. Add authorized domains if needed

### 2. Create Admin User
1. Register a user account on the app
2. Note the User UID from Firebase Console
3. Add to Firestore `admins` collection:
```javascript
{
  email: "admin@example.com",
  role: "super_admin",
  createdAt: serverTimestamp()
}
```

### 3. Seed Initial Data
Option A: Manual via Firebase Console
- Add documents to `items` collection
- Use the sample structure below

Option B: Use seed function (requires admin auth)
```bash
# After setting up admin user
# Call the util_seed_database function via authenticated request
```

### Sample Question Structure
```javascript
{
  type: "mcq",
  status: "active",
  topic: "Acne and Rosacea",
  subtopic: "Acne Vulgaris",
  difficulty: "medium",
  question: "Question text...",
  options: [
    { text: "Option A" },
    { text: "Option B" },
    { text: "Option C" },
    { text: "Option D" },
    { text: "Option E" }
  ],
  keyIndex: 1, // Correct answer index
  explanation: "Explanation text...",
  source: "manual",
  createdAt: serverTimestamp()
}
```

## 🔍 Monitoring & Debugging

### Health Checks
```bash
# Check application health
curl https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/healthCheck

# Expected response:
{
  "status": "healthy",
  "checks": {
    "firestore": true,
    "geminiApi": true
  }
}
```

### View Logs
```bash
# Functions logs
firebase functions:log

# Specific function logs
firebase functions:log --only ai_generate_mcq
```

### Firebase Console Monitoring
- [Functions Dashboard](https://console.firebase.google.com/project/dermassist-ai-1zyic/functions)
- [Firestore Data](https://console.firebase.google.com/project/dermassist-ai-1zyic/firestore)
- [Usage & Billing](https://console.firebase.google.com/project/dermassist-ai-1zyic/usage)

## 🛠️ Troubleshooting

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Functions timeout | Check Gemini API key configuration |
| Auth not working | Verify Email/Password is enabled in Firebase |
| No quiz questions | Seed database with sample data |
| CORS errors | Check function CORS middleware configuration |
| Build errors | Exclude test files from TypeScript compilation |

### Rollback Procedure
```bash
# List recent releases
firebase hosting:releases:list

# Rollback to previous version
firebase hosting:rollback

# For functions, redeploy previous code
git checkout <previous-commit>
firebase deploy --only functions
```

## 🔐 Security Considerations

### Firestore Rules
- Authentication required for user data
- Admin-only access for sensitive operations
- Rate limiting on public endpoints

### API Security
- All sensitive functions require authentication
- Admin functions check custom claims
- Input validation with Zod schemas

### Secrets Management
- Gemini API key stored in Firebase Secrets
- No secrets in code or environment files
- Rotate keys regularly

## 📈 Performance Optimization

### Current Optimizations
- Lazy loading for React components
- Firestore indexes for common queries
- Function cold start optimization
- CDN caching for static assets

### Recommended Improvements
1. Implement Redis caching for frequently accessed data
2. Add Cloud CDN for global distribution
3. Upgrade to 2nd gen Cloud Functions for better performance
4. Implement database sharding for scale

## 🔄 CI/CD Pipeline

### Current Setup
- Manual deployment via Firebase CLI
- TypeScript compilation checks
- ESLint code quality checks

### Future Improvements
1. GitHub Actions for automated deployment
2. Automated testing before deployment
3. Staging environment for testing
4. Blue-green deployment strategy

## 📞 Support & Maintenance

### Regular Maintenance Tasks
- [ ] Weekly: Check error logs and performance metrics
- [ ] Monthly: Review and rotate API keys
- [ ] Quarterly: Update dependencies and security patches
- [ ] Annually: Review and optimize database indexes

### Emergency Contacts
- Firebase Support: https://firebase.google.com/support
- Project Console: https://console.firebase.google.com/project/dermassist-ai-1zyic

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-08-17 | Initial deployment |
| - | - | 66 Cloud Functions deployed |
| - | - | Frontend application live |
| - | - | Firestore rules configured |

## ✅ Deployment Checklist

- [x] Build frontend application
- [x] Build functions (excluding tests)
- [x] Deploy Cloud Functions
- [x] Deploy hosting files
- [x] Deploy Firestore rules
- [x] Deploy Storage rules
- [x] Verify health check endpoint
- [x] Document deployment process
- [ ] Set up admin user
- [ ] Seed initial data
- [ ] Test core functionality
- [ ] Configure monitoring alerts

---

**Last Updated:** August 17, 2025  
**Maintained By:** PrecisionLearnDerm Team
