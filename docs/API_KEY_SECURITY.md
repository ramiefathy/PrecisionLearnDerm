# API Key Security Configuration

## Overview

PrecisionLearnDerm uses Firebase Functions Secrets to securely manage the Gemini API key. This approach ensures the API key is never exposed in source code, CI/CD pipelines, or environment files.

## How It Works

1. **Secret Definition**: The API key is defined as a Firebase Functions secret using `defineSecret()`
2. **Secure Storage**: Firebase stores the secret encrypted and only makes it available to deployed functions
3. **Runtime Access**: Functions access the secret at runtime through the secure Firebase infrastructure

## Initial Setup

### 1. Set the Secret Locally

```bash
# Set the Gemini API key as a Firebase secret
firebase functions:secrets:set GEMINI_API_KEY

# You'll be prompted to enter the API key value
# The value is encrypted and stored securely by Firebase
```

### 2. Verify Secret is Set

```bash
# List all secrets
firebase functions:secrets:list

# Access secret details (without revealing the value)
firebase functions:secrets:access GEMINI_API_KEY
```

## Code Implementation

### Configuration Module (`functions/src/util/config.ts`)

```typescript
import { defineSecret } from 'firebase-functions/params';

// Define the secret - Firebase handles secure storage
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Helper to get the API key value
export function getGeminiApiKey(): string {
  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return apiKey;
}

// Check if API key is available
export function hasGeminiApiKey(): boolean {
  try {
    const apiKey = GEMINI_API_KEY.value();
    return !!apiKey;
  } catch {
    return false;
  }
}
```

### Using the API Key in Functions

```typescript
import { config } from '../util/config';

// In your function
async function callGeminiAPI(prompt: string): Promise<string> {
  const apiKey = config.gemini.getApiKey();
  // Use the API key securely
}

// Check if AI features are available
if (config.gemini.hasApiKey()) {
  // Use AI features
} else {
  // Use fallback logic
}
```

## CI/CD Configuration

The GitHub Actions workflow no longer needs to handle the API key:

```yaml
- name: Deploy to Firebase
  env:
    FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
  run: |
    # API key is already configured in Firebase
    firebase deploy --only functions --token "${FIREBASE_TOKEN}"
```

## Security Benefits

1. **No Source Code Exposure**: API key never appears in code
2. **No CI/CD Exposure**: Key isn't passed through GitHub Actions
3. **No Environment File**: No `.env` files with secrets
4. **Encrypted Storage**: Firebase encrypts secrets at rest
5. **Access Control**: Only deployed functions can access the secret
6. **Audit Trail**: Firebase logs secret access

## Rotating the API Key

To update or rotate the API key:

```bash
# Update the existing secret
firebase functions:secrets:set GEMINI_API_KEY

# Deploy functions to use the new key
firebase deploy --only functions
```

## Local Development

For local development with the Firebase emulator:

1. Create a `.env` file in the `functions` directory (never commit this):
   ```
   GEMINI_API_KEY=your-api-key-here
   ```

2. The config module will automatically use the local value when running emulators

3. Add `.env` to `.gitignore` to prevent accidental commits

## Troubleshooting

### Secret Not Found Error

If you see "GEMINI_API_KEY is not configured":

1. Ensure the secret is set: `firebase functions:secrets:list`
2. Redeploy functions after setting the secret
3. Check Firebase Console > Functions > Secrets tab

### Permission Errors

Ensure your Firebase project has the Secret Manager API enabled:

```bash
gcloud services enable secretmanager.googleapis.com
```

## Best Practices

1. **Never commit API keys** to version control
2. **Use different keys** for development and production
3. **Rotate keys regularly** (every 90 days recommended)
4. **Monitor usage** through Google Cloud Console
5. **Set up alerts** for unusual API usage patterns

## Migration from Environment Variables

If migrating from `process.env.GEMINI_API_KEY`:

1. Set the secret: `firebase functions:secrets:set GEMINI_API_KEY`
2. Update code to use `config.gemini.getApiKey()`
3. Remove any `.env` files from deployment
4. Update CI/CD to remove API key injection
5. Deploy and verify functionality
