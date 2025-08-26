#!/usr/bin/env node

/**
 * Script to set admin custom claims for a user
 * 
 * This script should only be run locally by authorized personnel with proper
 * Firebase Admin SDK credentials. Never expose this as a public endpoint.
 * 
 * Usage: node set-admin-claim.js <email> [--remove]
 * 
 * Example:
 *   node set-admin-claim.js user@example.com
 *   node set-admin-claim.js user@example.com --remove
 */

const admin = require('firebase-admin');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node set-admin-claim.js <email> [--remove]');
  process.exit(1);
}

const email = args[0];
const shouldRemove = args.includes('--remove');

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('Invalid email format');
  process.exit(1);
}

// Initialize Firebase Admin SDK
try {
  // Try to use service account if available
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    path.join(__dirname, '../service-account-key.json');
  
  if (require('fs').existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'dermassist-ai-1zyic'
    });
    console.log('Initialized with service account');
  } else {
    // Fall back to default credentials with project ID
    admin.initializeApp({
      projectId: 'dermassist-ai-1zyic'
    });
    console.log('Initialized with default credentials');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
  process.exit(1);
}

async function setAdminClaim() {
  try {
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    console.log(`Found user: ${user.uid} (${user.email})`);

    if (shouldRemove) {
      // Remove admin claim
      const customClaims = user.customClaims || {};
      delete customClaims.admin;
      await admin.auth().setCustomUserClaims(user.uid, customClaims);
      console.log(`✅ Admin claim removed for user ${email}`);
    } else {
      // Set admin claim
      await admin.auth().setCustomUserClaims(user.uid, { 
        ...user.customClaims,
        admin: true 
      });
      console.log(`✅ Admin claim set for user ${email}`);
      
      // Verify the claim was set
      const updatedUser = await admin.auth().getUser(user.uid);
      if (updatedUser.customClaims?.admin === true) {
        console.log('✅ Admin claim verified successfully');
      } else {
        console.error('❌ Failed to verify admin claim');
      }
    }

    console.log('\n⚠️  Important: The user must sign out and sign back in for the new claims to take effect.');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Execute
setAdminClaim().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
