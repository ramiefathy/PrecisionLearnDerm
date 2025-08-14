# GitHub Actions Setup - Quick Guide 🚀

## ✅ Step-by-Step Setup (5 minutes)

### 1. Go to Your GitHub Repository
Open your browser and navigate to your PrecisionLearnDerm repository on GitHub.

### 2. Add Secrets (Copy & Paste These)
1. Go to: **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"** and add these TWO secrets:

#### Secret 1: FIREBASE_TOKEN
**Name:** `FIREBASE_TOKEN`
**Value:** 
```
1//05hYpgzDJ-PyDCgYIARAAGAUSNwF-L9Irl1-t8VfUV6e5I-vumbt2u8PfQ6GxO88V8y9X2SmMSPf862w6dFZQ_JAuALp1MZ9SNBw
```

#### Secret 2: GEMINI_API_KEY  
**Name:** `GEMINI_API_KEY`
**Value:**
```
AIzaSyDW4t1WsOg5TpdgPMp0Cs8iI5QsI-2OrZM
```

### 3. Push to GitHub
```bash
git add .github/workflows/deploy-firebase.yml
git commit -m "Add GitHub Actions deployment workflow"
git push origin main
```

### 4. Watch It Deploy! 
- Go to the **Actions** tab in your GitHub repository
- You'll see the workflow running automatically
- Click on it to see live logs

## 🎯 How to Use

### Automatic Deployment
Every time you push to `main` or `master` branch, it will automatically deploy!

### Manual Deployment
1. Go to **Actions** tab
2. Click **"Deploy to Firebase"** workflow
3. Click **"Run workflow"** button
4. Select branch and click **"Run workflow"**

## ✅ Benefits
- No more lockfile issues!
- Consistent Node 20 environment
- Automatic deployments on push
- Full deployment logs in GitHub

## 🔄 Rollback Plan
If you want to go back to manual deployment, simply:
1. Delete `.github/workflows/deploy-firebase.yml`
2. Continue using `firebase deploy` locally

---
**That's it! Your deployment is now automated with GitHub Actions!** 🎉
