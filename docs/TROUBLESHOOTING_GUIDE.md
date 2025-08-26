# Troubleshooting Guide

**Version**: 2.0  
**Last Updated**: 2025-08-15  
**Status**: Production Support Guide

## Overview

This guide provides comprehensive troubleshooting steps for common issues encountered with the PrecisionLearnDerm AI pipeline. Each issue includes symptoms, root causes, and step-by-step resolution procedures.

## Quick Diagnostic Checklist

### System Health Check
```bash
# 1. Verify Firebase Functions deployment
firebase functions:list

# 2. Check API key configuration
firebase functions:secrets:access GEMINI_API_KEY

# 3. Test basic connectivity
curl -X GET "https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/systemHealth"

# 4. Validate local environment
npm run test:health
```

### Common Issues Summary

| Issue Category | Frequency | Avg Resolution Time | Critical |
|----------------|-----------|-------------------|----------|
| API Key Issues | High | 5 minutes | Yes |
| CORS Errors | Medium | 2 minutes | No |
| Generation Failures | Low | 10 minutes | Yes |
| Quality Issues | Low | 15 minutes | No |
| Authentication | Medium | 5 minutes | Yes |

## API Configuration Issues

### Issue: GEMINI_API_KEY Not Configured

#### Symptoms
```
Error: GEMINI_API_KEY is not configured. 
Run: firebase functions:secrets:set GEMINI_API_KEY
```

#### Root Cause
- Firebase Functions Secret not set
- API key not accessible to deployed functions
- Insufficient permissions

#### Resolution Steps
```bash
# 1. Set the API key secret
firebase functions:secrets:set GEMINI_API_KEY

# 2. Enter your Gemini API key when prompted
# Get your key from: https://makersuite.google.com/app/apikey

# 3. Deploy functions to use the new secret
firebase deploy --only functions

# 4. Verify the secret is accessible
firebase functions:secrets:access GEMINI_API_KEY

# 5. Test the configuration
curl -X POST "https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/test_enhanced_pipeline" \
  -H "Content-Type: application/json" \
  -d '{"topicIds": ["psoriasis"], "difficulty": 0.5}'
```

#### Prevention
- Set up monitoring for API key expiration
- Document key rotation procedures
- Use environment-specific secrets

### Issue: API Key Permissions Insufficient

#### Symptoms
```
Error: HTTP 403: API key not valid. Please pass a valid API key.
```

#### Root Cause
- API key lacks necessary permissions
- Key may be restricted to specific IPs
- Key may have usage quotas exceeded

#### Resolution Steps
1. **Verify API Key Permissions**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to APIs & Services → Credentials
   - Check API key restrictions and quotas

2. **Update API Key Restrictions**
   ```bash
   # Remove IP restrictions if testing locally
   # Or add Cloud Functions IPs to allowed list
   ```

3. **Check Usage Quotas**
   - Monitor API usage in Google Cloud Console
   - Increase quotas if necessary
   - Implement rate limiting if needed

## CORS and Network Issues

### Issue: CORS Policy Blocking Browser Requests

#### Symptoms
```
Access to fetch at 'https://...' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present
```

#### Root Cause
- Using `onCall` functions directly from browser
- Missing CORS headers in `onRequest` functions
- Incorrect request method (missing OPTIONS preflight)

#### Resolution Steps
1. **For Testing - Use Test Endpoints**
   ```javascript
   // Use CORS-enabled test endpoints
   const response = await fetch(
     'https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/test_enhanced_pipeline',
     {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ topicIds: ['psoriasis'], difficulty: 0.5 })
     }
   );
   ```

2. **For Production - Use Firebase SDK**
   ```javascript
   // Use Firebase callable functions
   const generateQuestion = firebase.functions().httpsCallable('ai_generate_enhanced_mcq');
   const result = await generateQuestion({ topicIds: ['psoriasis'] });
   ```

3. **Fix Custom Functions**
   ```typescript
   // Add CORS headers to custom functions
   export const customFunction = functions.https.onRequest((req, res) => {
     res.set('Access-Control-Allow-Origin', '*');
     res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
     res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
     
     if (req.method === 'OPTIONS') {
       res.status(204).send('');
       return;
     }
     
     // Your function logic here
   });
   ```

### Issue: Network Timeout Errors

#### Symptoms
```
Error: Function execution exceeded timeout
Request timed out after 60 seconds
```

#### Root Cause
- Complex generation taking too long
- Network connectivity issues
- Gemini API response delays

#### Resolution Steps
1. **Increase Function Timeout**
   ```typescript
   export const longRunningFunction = functions
     .runWith({ timeoutSeconds: 300 })
     .https.onCall(async (data, context) => {
       // Function logic
     });
   ```

2. **Implement Retry Logic**
   ```typescript
   async function callWithRetry(apiCall: () => Promise<any>, maxRetries = 3): Promise<any> {
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         return await apiCall();
       } catch (error) {
         if (attempt === maxRetries) throw error;
         await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
       }
     }
   }
   ```

3. **Monitor and Alert**
   ```typescript
   // Add performance monitoring
   const startTime = Date.now();
   const result = await generateQuestion();
   const duration = Date.now() - startTime;
   
   if (duration > 10000) {
     console.warn('Slow generation detected:', { duration, topic });
   }
   ```

## Authentication and Authorization Issues

### Issue: Firebase Authentication Required

#### Symptoms
```
Error: Unauthenticated. Authentication required.
```

#### Root Cause
- Calling authenticated functions without valid token
- Token expired or invalid
- User not logged in

#### Resolution Steps
1. **For Testing - Use Test Endpoints**
   ```bash
   # Use non-authenticated test endpoints
   curl -X POST "https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/test_enhanced_pipeline" \
     -H "Content-Type: application/json" \
     -d '{"topicIds": ["psoriasis"]}'
   ```

2. **For Production - Ensure Authentication**
   ```javascript
   // Ensure user is authenticated
   const user = firebase.auth().currentUser;
   if (!user) {
     await firebase.auth().signInAnonymously();
   }
   
   // Get ID token
   const idToken = await user.getIdToken();
   
   // Call function with authentication
   const generateQuestion = firebase.functions().httpsCallable('ai_generate_enhanced_mcq');
   const result = await generateQuestion({ topicIds: ['psoriasis'] });
   ```

3. **Check Authentication Rules**
   ```typescript
   // Verify function authentication requirements
   export const optionalAuthFunction = functions.https.onCall((data, context) => {
     // Check if authentication is required for this endpoint
     if (requiresAuth && !context.auth) {
       throw new functions.https.HttpsError(
         'unauthenticated',
         'Authentication required'
       );
     }
   });
   ```

### Issue: Admin Role Required

#### Symptoms
```
Error: Insufficient permissions. Admin role required.
```

#### Root Cause
- User doesn't have admin custom claims
- Custom claims not properly set
- Role-based access control misconfiguration

#### Resolution Steps
1. **Set Admin Claims**
   ```bash
   # Use the admin claim script
   node scripts/set-admin-claim.js user@example.com
   ```

2. **Verify Claims**
   ```javascript
   // Check user's custom claims
   firebase.auth().currentUser.getIdTokenResult()
     .then(idTokenResult => {
       console.log('Admin claim:', idTokenResult.claims.admin);
     });
   ```

3. **Force Token Refresh**
   ```javascript
   // Force refresh to get new claims
   await firebase.auth().currentUser.getIdToken(true);
   ```

## Generation Quality Issues

### Issue: Low Quality Scores

#### Symptoms
- Generated questions scoring below 15/25
- Medical accuracy below 85%
- Structural validation failures

#### Root Cause
- Insufficient knowledge base context
- Topic not well-represented in KB
- Generation parameters suboptimal

#### Resolution Steps
1. **Check Knowledge Base Coverage**
   ```typescript
   // Verify topic has adequate KB coverage
   const kbCoverage = await checkTopicCoverage(topicId);
   if (kbCoverage.completeness_score < 65) {
     console.warn('Low KB coverage for topic:', topicId);
   }
   ```

2. **Adjust Generation Parameters**
   ```javascript
   // Use strict mode for higher quality
   const result = await generateQuestion({
     topicIds: ['specific_topic'],
     difficulty: 0.5,
     strictMode: true,  // Enable strict validation
     useAI: true
   });
   ```

3. **Review Generated Content**
   ```javascript
   // Check quality metrics
   if (result.quality.score < 18) {
     console.log('Quality issues:', result.quality.validationResult.warnings);
     console.log('Improvements made:', result.metadata.improvements);
   }
   ```

### Issue: Medical Accuracy Failures

#### Symptoms
- Questions contain medical errors
- Treatment recommendations incorrect
- Clinical scenarios unrealistic

#### Root Cause
- Knowledge base information outdated
- Gemini API generating incorrect content
- Validation rules insufficient

#### Resolution Steps
1. **Enable Enhanced Medical Validation**
   ```typescript
   // Use the enhanced pipeline with medical checks
   const result = await runEnhancedPipeline(topicIds, difficulty, {
     strictValidation: true,
     targetQuality: 20  // Higher quality target
   });
   ```

2. **Review Medical Accuracy Report**
   ```javascript
   if (!result.quality.accuracyCheck.isAccurate) {
     console.log('Medical issues found:', result.quality.accuracyCheck.issues);
     console.log('Suggestions:', result.quality.accuracyCheck.suggestions);
   }
   ```

3. **Update Validation Rules**
   ```typescript
   // Add condition-specific validation rules
   const customMedicalChecks = [
     {
       condition: 'psoriasis',
       validTreatments: ['topical corticosteroids', 'biologics', 'methotrexate'],
       invalidTreatments: ['antibiotics', 'antivirals']
     }
   ];
   ```

## Performance Issues

### Issue: Slow Response Times

#### Symptoms
- Generation taking >5 seconds
- Timeout errors occurring
- Poor user experience

#### Root Cause
- Complex iterative improvement cycles
- Gemini API latency
- Multiple validation passes

#### Resolution Steps
1. **Monitor Performance**
   ```typescript
   // Add performance monitoring
   const performanceMetrics = {
     generationTime: Date.now(),
     validationTime: 0,
     improvementTime: 0,
     totalTime: 0
   };
   
   // Track each stage
   const startValidation = Date.now();
   const validationResult = await validateQuestion(question);
   performanceMetrics.validationTime = Date.now() - startValidation;
   ```

2. **Optimize for Speed**
   ```javascript
   // Use faster generation mode
   const result = await generateQuestion({
     topicIds: ['psoriasis'],
     strictMode: false,      // Disable for speed
     maxIterations: 2        // Limit improvement cycles
   });
   ```

3. **Implement Caching**
   ```typescript
   // Cache high-quality questions
   const cacheKey = `question_${topic}_${difficulty}`;
   let question = await cache.get(cacheKey);
   
   if (!question) {
     question = await generateQuestion(params);
     if (question.quality.score >= 20) {
       await cache.set(cacheKey, question, 3600); // Cache for 1 hour
     }
   }
   ```

### Issue: High Memory Usage

#### Symptoms
- Functions running out of memory
- Inconsistent performance
- Error logs showing memory issues

#### Root Cause
- Large knowledge base loaded in memory
- Memory leaks in generation process
- Insufficient function memory allocation

#### Resolution Steps
1. **Increase Memory Allocation**
   ```typescript
   export const memoryIntensiveFunction = functions
     .runWith({ memory: '2GB' })
     .https.onCall(async (data, context) => {
       // Function logic
     });
   ```

2. **Optimize Memory Usage**
   ```typescript
   // Load KB on-demand instead of globally
   async function getKnowledgeContext(topic: string) {
     const kbEntry = await loadTopicSpecificKB(topic);
     return kbEntry;
   }
   ```

3. **Clean Up Resources**
   ```typescript
   // Explicit cleanup after generation
   async function generateWithCleanup(params: any) {
     try {
       const result = await generate(params);
       return result;
     } finally {
       // Clean up temporary resources
       await cleanup();
     }
   }
   ```

## Data and Storage Issues

### Issue: Knowledge Base Access Errors

#### Symptoms
```
Error: Failed to load KB: ENOENT: no such file or directory
```

#### Root Cause
- Knowledge base file missing
- Incorrect file path in deployed functions
- Build process not including KB files

#### Resolution Steps
1. **Verify File Exists**
   ```bash
   # Check if KB file exists in functions directory
   ls -la functions/src/kb/knowledgeBase.json
   ```

2. **Fix Build Configuration**
   ```json
   // Ensure KB files are included in deployment
   // functions/package.json
   {
     "files": [
       "lib/**/*",
       "src/kb/**/*"
     ]
   }
   ```

3. **Alternative Loading Method**
   ```typescript
   // Load from Firestore if file system fails
   async function loadKnowledgeBase(): Promise<any> {
     try {
       // Try file system first
       const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
       return JSON.parse(fs.readFileSync(kbPath, 'utf8'));
     } catch (error) {
       // Fallback to Firestore
       const doc = await db.collection('system').doc('knowledgeBase').get();
       return doc.data() || {};
     }
   }
   ```

### Issue: Firestore Permission Denied

#### Symptoms
```
Error: Permission denied. Missing or insufficient permissions.
```

#### Root Cause
- Firestore security rules too restrictive
- Authentication token missing or invalid
- Service account permissions insufficient

#### Resolution Steps
1. **Check Firestore Rules**
   ```javascript
   // firestore.rules
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Allow authenticated reads
       match /items/{document} {
         allow read: if request.auth != null;
       }
       
       // Allow admin writes
       match /admin/{document} {
         allow read, write: if request.auth.token.admin == true;
       }
     }
   }
   ```

2. **Verify Authentication**
   ```typescript
   // Ensure proper authentication in functions
   const uid = context.auth?.uid;
   if (!uid) {
     throw new functions.https.HttpsError(
       'unauthenticated',
       'Authentication required'
     );
   }
   ```

3. **Update Service Account Permissions**
   ```bash
   # Grant necessary IAM roles
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:YOUR_SERVICE_ACCOUNT" \
     --role="roles/datastore.user"
   ```

## Monitoring and Logging

### Enable Debug Logging
```typescript
// Set environment variable for detailed logs
process.env.DEBUG = 'true';

// Enhanced logging in functions
import { logInfo, logError, logDebug } from '../util/logging';

export const debuggableFunction = functions.https.onCall(async (data, context) => {
  logDebug('Function called with data:', data);
  
  try {
    const result = await processRequest(data);
    logInfo('Function completed successfully', { result });
    return result;
  } catch (error) {
    logError('Function failed', { error, data });
    throw error;
  }
});
```

### Performance Monitoring
```typescript
// Add performance tracking
const performanceMonitor = {
  start: Date.now(),
  checkpoints: {} as Record<string, number>,
  
  checkpoint(name: string) {
    this.checkpoints[name] = Date.now() - this.start;
  },
  
  summary() {
    return {
      totalTime: Date.now() - this.start,
      checkpoints: this.checkpoints
    };
  }
};

// Use in functions
performanceMonitor.checkpoint('generation_complete');
performanceMonitor.checkpoint('validation_complete');
console.log('Performance:', performanceMonitor.summary());
```

## Emergency Procedures

### System Degradation Response
1. **Switch to Fallback Mode**
   ```typescript
   // Disable AI generation temporarily
   const emergencyConfig = {
     useAI: false,
     strictMode: false,
     maxIterations: 1
   };
   ```

2. **Route to Backup Endpoints**
   ```javascript
   // Use simplified generation
   const result = await generateFallbackMCQ(entity, topic, difficulty);
   ```

3. **Monitor Recovery**
   ```bash
   # Check system health
   curl "https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/systemHealth"
   ```

### Critical Issue Escalation
1. **Immediate Response**
   - Document the issue with timestamps
   - Capture error messages and stack traces
   - Note affected users/sessions

2. **Temporary Mitigation**
   - Switch to backup generation methods
   - Reduce quality thresholds temporarily
   - Enable manual question review

3. **Resolution Tracking**
   - Monitor fix deployment
   - Validate resolution with test cases
   - Update documentation with lessons learned

## Support Resources

### Internal Documentation
- **API Reference**: `/docs/AI_PIPELINE_API.md`
- **Architecture Guide**: `/docs/ENHANCED_ARCHITECTURE.md`
- **Quality Standards**: `/docs/QUALITY_STANDARDS.md`

### External Resources
- **Firebase Documentation**: https://firebase.google.com/docs
- **Gemini API Documentation**: https://ai.google.dev/docs
- **Medical Education Standards**: ABD Guidelines

### Contact Information
- **Technical Lead**: Available via internal channels
- **System Administrator**: On-call rotation
- **Medical Education Expert**: Available for content validation issues