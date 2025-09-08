# Firebase API Key Error Fix

## Issue Summary

**Error**: `Firebase: Error (auth/invalid-api-key)` when accessing the deployed web application

**Root Cause**: The deployed application was missing the required `.env` file in the `web/` directory, causing all Firebase environment variables to be undefined.

## Solution

### 1. Create the Environment File

Create a `.env` file in the `web/` directory with the following content:

```env
VITE_FIREBASE_API_KEY=AIzaSyB0Jh0q16acdPWXwy1dc0H4eggqAVew4xA
VITE_FIREBASE_AUTH_DOMAIN=dermassist-ai-1zyic.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dermassist-ai-1zyic
VITE_FIREBASE_STORAGE_BUCKET=dermassist-ai-1zyic.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=141408860984
VITE_FIREBASE_APP_ID=1:141408860984:web:7507332d26b8453b045fc
VITE_GEMINI_MODEL_PRO=gemini-2.5-pro
VITE_GEMINI_MODEL_FLASH=gemini-2.5-flash

# Firebase Development Configuration
# Set to true to force production Firebase usage even in development
VITE_USE_FIREBASE_PROD=false
```

### 2. Rebuild and Redeploy

After creating the `.env` file:

```bash
# Rebuild the web application
cd web
npm run build

# Deploy to Firebase hosting
cd ..
firebase deploy --only hosting
```

## How Environment Variables Work

The Firebase configuration in `web/src/lib/firebase.ts` relies on Vite environment variables:

```typescript
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
```

When the `.env` file is missing, these variables become `undefined`, causing Firebase to throw an `invalid-api-key` error.

## Security Note

The `.env` file is gitignored for security reasons. You need to create it locally before each deployment. The values provided are for the `dermassist-ai-1zyic` Firebase project.

## Verification

After redeployment, the application should:
1. Load without Firebase authentication errors
2. Successfully connect to the Firebase project
3. Allow user registration and login

## Prevention

To prevent this issue in the future:
1. Always ensure the `.env` file exists before building
2. Add a pre-build check script that verifies environment variables
3. Consider using Firebase project configuration commands to generate the config automatically

Created: $(date)
Status: **RESOLVED**