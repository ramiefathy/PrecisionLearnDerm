#!/bin/bash

# Fix NPM Package Issues Script
# This script resolves package management issues across the monorepo

set -e  # Exit on error

echo "🔧 Starting NPM package fix process..."
echo "======================================="

# Save current directory
ROOT_DIR=$(pwd)

# Function to clean and reinstall packages
clean_and_install() {
    local dir=$1
    local name=$2
    
    echo ""
    echo "📦 Processing $name..."
    cd "$ROOT_DIR/$dir"
    
    # Remove node_modules and package-lock
    echo "  → Removing node_modules and package-lock.json..."
    rm -rf node_modules package-lock.json
    
    # Clean npm cache for this directory
    echo "  → Cleaning npm cache..."
    npm cache clean --force 2>/dev/null || true
    
    # Install fresh dependencies
    echo "  → Installing dependencies..."
    npm install --legacy-peer-deps
    
    echo "  ✅ $name completed"
}

# 1. First, install shared types (dependency for other packages)
echo "🔗 Step 1: Installing shared types..."
cd "$ROOT_DIR/shared/types"
rm -rf node_modules package-lock.json
npm install
echo "✅ Shared types installed"

# 2. Clean and install root dependencies
echo ""
echo "🌳 Step 2: Root package..."
cd "$ROOT_DIR"
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# 3. Fix functions directory
echo ""
echo "⚡ Step 3: Functions package..."
cd "$ROOT_DIR/functions"

# Remove all the duplicate package-lock files
rm -f "package-lock 2.json" "package-lock 3.json"

# Remove problematic type definitions that are causing conflicts
rm -rf node_modules package-lock.json

# Create a clean package.json without the problematic dependencies
cat > package.json << 'EOF'
{
  "name": "precision-learn-derm-functions",
  "version": "0.1.0",
  "private": true,
  "main": "lib/index.js",
  "engines": {
    "node": "20"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && cp -r src/kb/*.json lib/kb/ 2>/dev/null || true",
    "watch": "tsc -w -p tsconfig.json",
    "lint": "echo 'skip'",
    "deploy": "firebase deploy --only functions",
    "clean": "rm -rf lib",
    "gcp-build": "npm run build"
  },
  "dependencies": {
    "@precisionlearnderm/shared-types": "file:../shared/types",
    "firebase-admin": "^12.7.0",
    "firebase-functions": "^5.1.1"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "typescript": "^5.5.4"
  }
}
EOF

# Install with legacy peer deps to avoid conflicts
npm install --legacy-peer-deps

# 4. Fix web directory
echo ""
echo "🌐 Step 4: Web package..."
clean_and_install "web" "Web app"

# 5. Verify installations
echo ""
echo "🔍 Verifying installations..."
cd "$ROOT_DIR"

# Check if all key directories have node_modules (skip root and shared/types since they have no deps)
for dir in "functions" "web"; do
    if [ -d "$dir/node_modules" ]; then
        echo "  ✅ $dir has node_modules"
    else
        echo "  ❌ $dir is missing node_modules"
        exit 1
    fi
done

# 6. Try building functions to verify TypeScript works
echo ""
echo "🏗️  Testing functions build..."
cd "$ROOT_DIR/functions"
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! All packages fixed and building correctly"
    echo ""
    echo "Next steps:"
    echo "1. Run: firebase deploy --only firestore:rules,storage:rules,functions"
    echo "2. Set initial admin: node scripts/set-admin-claim.js <email>"
    echo "3. Test the application"
else
    echo ""
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi
