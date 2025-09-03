#!/usr/bin/env bash
set -euxo pipefail

# 0) If your app lives in a subfolder, set it here
APP_DIR="."   # e.g., "web" or "app"
cd "$APP_DIR"

# 1) Make setup non-interactive and skip heavy postinstalls
export CI=1
export PUPPETEER_SKIP_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export npm_config_sharp_skip_download=true
export npm_config_audit=false
export npm_config_fund=false

# 2) Pin a modern Node with Corepack and use the right package manager
corepack enable

# If you need Node 22+, uncomment the next line to force it:
# corepack prepare node@22.11.0 --activate

# 3) Install deps respecting whichever lockfile you use
if [ -f pnpm-lock.yaml ]; then
  corepack prepare pnpm@9.12.0 --activate
  pnpm install --frozen-lockfile
elif [ -f package-lock.json ]; then
  npm ci
elif [ -f yarn.lock ]; then
  corepack prepare yarn@4.3.1 --activate
  yarn install --immutable
else
  echo "No lockfile found at $(pwd). Add one or adjust APP_DIR." >&2
  exit 1
fi

# 4) If you rely on LFS files during build, fetch them now
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git lfs env >/dev/null 2>&1; then
    git lfs install
    git lfs pull || true
  fi
fi

echo "Setup complete."
