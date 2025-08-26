#!/usr/bin/env node

/**
 * Script to grant initial admin role to a user
 * This bypasses authentication checks and should only be used for initial setup
 * 
 * Usage: node grant-initial-admin.js <email>
 */

const admin = require('firebase-admin');
const path = require('path');

// Check for email argument
const email = process.argv[2];
if (!email) {
  console.error('❌ Usage: node grant-initial-admin.js <email>');
  process.exit(1);
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('❌ Invalid email format');
  process.exit(1);
}

// Initialize Firebase Admin with service account
const serviceAccountPath = path.join(__dirname, '../service-account.json');

try {
  // Check if service account file exists
  require(serviceAccountPath);
} catch (error) {
  console.error('❌ Service account file not found at:', serviceAccountPath);
  console.error('Please ensure service-account.json exists in the project root');
  console.error('You can download it from Firebase Console > Project Settings > Service Accounts');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath)
});

async function grantAdminRole() {
  try {
    console.log(`🔍 Looking up user with email: ${email}...`);
    
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    console.log(`✅ Found user: ${user.uid}`);
    
    // Check if already admin
    if (user.customClaims?.admin === true) {
      console.log('ℹ️  User already has admin role');
      process.exit(0);
    }
    
    console.log('🔐 Granting admin role...');
    
    // Set admin custom claim
    await admin.auth().setCustomUserClaims(user.uid, {
      ...user.customClaims,
      admin: true
    });
    
    console.log(`✅ Successfully granted admin role to ${email}`);
    console.log('');
    console.log('⚠️  IMPORTANT: The user must log out and log back in for the changes to take effect!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Log out from the application');
    console.log('2. Log back in');
    console.log('3. Access the admin panel');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.error('User not found. Please ensure the user has signed up first.');
    }
    
    process.exit(1);
  }
}

// Run the script
grantAdminRole();
