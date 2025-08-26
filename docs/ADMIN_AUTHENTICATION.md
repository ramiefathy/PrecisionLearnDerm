# Admin Authentication Setup

## Overview

PrecisionLearnDerm uses Firebase Custom Claims for role-based access control (RBAC). This replaces the previous hardcoded email-based authentication for improved security and flexibility.

## How It Works

1. **Custom Claims**: Admin users have a custom claim `admin: true` set on their Firebase Auth token
2. **Security Rules**: Firestore and Storage rules check for `request.auth.token.admin == true`
3. **Cloud Functions**: Admin functions verify the admin claim before executing

## Initial Admin Setup

### Method 1: Using the Setup Script (Recommended for initial setup)

1. Ensure you have Firebase Admin SDK credentials:
   ```bash
   # Option A: Use service account key
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"
   
   # Option B: Use default credentials (if running on Google Cloud)
   gcloud auth application-default login
   ```

2. Run the admin setup script:
   ```bash
   # Grant admin role
   node scripts/set-admin-claim.js user@example.com
   
   # Revoke admin role
   node scripts/set-admin-claim.js user@example.com --remove
   ```

3. The user must sign out and sign back in for the new claims to take effect.

### Method 2: Using Cloud Functions (For existing admins)

Once at least one admin exists, they can manage other admins through Cloud Functions:

```javascript
// In your web app
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

// Grant admin role
const grantAdmin = httpsCallable(functions, 'admin_grant_role');
await grantAdmin({ email: 'newadmin@example.com' });

// Revoke admin role
const revokeAdmin = httpsCallable(functions, 'admin_revoke_role');
await revokeAdmin({ email: 'user@example.com' });

// List all admins
const listAdmins = httpsCallable(functions, 'admin_list_admins');
const result = await listAdmins();
console.log(result.data.admins);
```

## Security Considerations

1. **Never expose the setup script as a public endpoint**
2. **Store service account keys securely** and never commit them to version control
3. **Limit admin access** to only trusted personnel
4. **Audit admin actions** - all admin role changes are logged
5. **Users cannot revoke their own admin role** through Cloud Functions (prevents lockout)

## Verifying Admin Status

### In Cloud Functions
```javascript
import { requireAdmin, isAdmin } from './util/auth';

// Option 1: Throw error if not admin
export const myAdminFunction = functions.https.onCall((data, context) => {
  requireAdmin(context); // Throws if not admin
  // ... admin-only logic
});

// Option 2: Check boolean
export const myFunction = functions.https.onCall((data, context) => {
  if (isAdmin(context)) {
    // Admin-specific logic
  }
});
```

### In Security Rules
```javascript
// Firestore
function isAdmin() { 
  return request.auth != null && request.auth.token.admin == true; 
}

// Storage
allow write: if request.auth != null && request.auth.token.admin == true;
```

### In Web App
```javascript
// Get ID token result to check claims
const idTokenResult = await user.getIdTokenResult();
const isAdmin = idTokenResult.claims.admin === true;
```

## Migration from Email-based Auth

If migrating from the old email-based system:

1. Identify all users who should have admin access
2. Run the setup script for each admin user
3. Deploy the updated Cloud Functions and security rules
4. Update frontend code to check custom claims instead of email
5. Test thoroughly before removing old code

## Troubleshooting

### Admin claim not working
- Ensure the user has signed out and back in after claim was set
- Verify the claim was set: check `customClaims` in Firebase Console
- Check Cloud Functions logs for any errors

### Cannot set admin claim
- Verify Firebase Admin SDK is properly initialized
- Check service account has necessary permissions
- Ensure the email exists in Firebase Auth

### Security rules rejecting admin
- Verify the syntax: `request.auth.token.admin == true`
- Check the user's ID token includes the admin claim
- Test rules in Firebase Console Rules Playground
