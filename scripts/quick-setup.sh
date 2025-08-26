#!/bin/bash

# Quick setup script for PrecisionLearnDerm post-deployment

echo "🚀 PrecisionLearnDerm Post-Deployment Setup"
echo "==========================================="
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first."
    exit 1
fi

# Set project
firebase use dermassist-ai-1zyic

echo "📋 Application URLs:"
echo "-------------------"
echo "🌐 Main App: https://dermassist-ai-1zyic.web.app"
echo "🔧 Firebase Console: https://console.firebase.google.com/project/dermassist-ai-1zyic"
echo ""

echo "📋 Available Test Endpoints:"
echo "---------------------------"
echo "Health Check: https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/healthCheck"
echo ""

echo "📋 Manual Setup Steps:"
echo "---------------------"
echo "1. Go to Firebase Console: https://console.firebase.google.com/project/dermassist-ai-1zyic"
echo ""
echo "2. Set up Authentication:"
echo "   - Go to Authentication > Sign-in method"
echo "   - Enable Email/Password authentication if not already enabled"
echo ""
echo "3. Create Admin User:"
echo "   - Go to Authentication > Users"
echo "   - Click 'Add user'"
echo "   - Enter your email and a secure password"
echo "   - Note the User UID after creation"
echo ""
echo "4. Grant Admin Privileges:"
echo "   - Go to Firestore Database"
echo "   - Create collection 'admins' if it doesn't exist"
echo "   - Add document with ID = User UID from step 3"
echo "   - Set fields:"
echo "     * email: your-email"
echo "     * role: 'super_admin'"
echo "     * createdAt: (server timestamp)"
echo ""
echo "5. Add Sample Questions (Optional):"
echo "   - Go to Firestore Database"
echo "   - Collection: 'items'"
echo "   - Add sample quiz questions manually or import from backup"
echo ""
echo "6. Verify Gemini API Key:"
echo "   - Go to Cloud Functions > Configuration"
echo "   - Ensure GEMINI_API_KEY secret is set"
echo ""

echo "📋 Testing the Application:"
echo "--------------------------"
echo "1. Visit: https://dermassist-ai-1zyic.web.app"
echo "2. Sign in with the admin account you created"
echo "3. Test quiz functionality"
echo "4. Test AI question generation (requires admin access)"
echo ""

echo "📋 Quick Health Check:"
curl -s https://us-central1-dermassist-ai-1zyic.cloudfunctions.net/healthCheck | python3 -m json.tool 2>/dev/null || echo "Health check endpoint requires authentication or has CORS restrictions"
echo ""

echo "✅ Setup guide complete! Follow the manual steps above to complete configuration."
