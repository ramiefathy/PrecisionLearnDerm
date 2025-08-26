#!/bin/bash

# Script to set Firebase Functions secrets for PrecisionLearnDerm
# Run this script from the functions directory

echo "🔐 Setting up Firebase Functions Secrets for PrecisionLearnDerm"
echo "================================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if we're in the functions directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "❌ Please run this script from the functions directory"
    exit 1
fi

echo ""
echo "📋 This script will help you set the following secrets:"
echo "   1. GEMINI_API_KEY - Required for AI functionality"
echo ""

# Function to set a secret
set_secret() {
    local secret_name=$1
    local secret_description=$2
    
    echo ""
    echo "Setting ${secret_name}..."
    echo "Description: ${secret_description}"
    echo ""
    
    # Check if secret already exists
    if firebase functions:secrets:access ${secret_name} &> /dev/null; then
        echo "⚠️  Secret ${secret_name} already exists."
        read -p "Do you want to update it? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Skipping ${secret_name}..."
            return
        fi
    fi
    
    # Set the secret
    firebase functions:secrets:set ${secret_name}
    
    if [ $? -eq 0 ]; then
        echo "✅ ${secret_name} set successfully!"
    else
        echo "❌ Failed to set ${secret_name}"
        return 1
    fi
}

# Set GEMINI_API_KEY
echo "=========================================="
echo "1. Setting Gemini API Key"
echo "=========================================="
echo ""
echo "To get your Gemini API key:"
echo "1. Go to https://aistudio.google.com/apikey"
echo "2. Click 'Get API Key' or 'Create API Key'"
echo "3. Copy the API key"
echo ""
read -p "Press Enter when ready to input your Gemini API key..."

set_secret "GEMINI_API_KEY" "Google Gemini API key for AI-powered question generation"

# Grant access to functions
echo ""
echo "🔧 Granting secret access to Cloud Functions..."
firebase functions:secrets:grant GEMINI_API_KEY

echo ""
echo "=========================================="
echo "✅ Secret Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Deploy your functions: npm run deploy"
echo "2. The secrets will be available in production"
echo ""
echo "To verify secrets are set:"
echo "  firebase functions:secrets:access GEMINI_API_KEY"
echo ""
echo "To list all secrets:"
echo "  firebase functions:secrets:list"
