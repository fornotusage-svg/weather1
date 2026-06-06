#!/usr/bin/env bash
# Build the frontend pointing at an external API base, then publish to Surge.
# Usage:
#   SURGE_DOMAIN=weather-locator.surge.sh \
#   VITE_API_BASE=https://weather-locator-api.onrender.com \
#   ./surge.sh
set -euo pipefail

SURGE_DOMAIN="${SURGE_DOMAIN:-weather-locator-$(date +%s).surge.sh}"
VITE_API_BASE="${VITE_API_BASE:-}"

cd "$(dirname "$0")"

echo "→ Installing frontend deps"
npm install

echo "→ Building with VITE_API_BASE=${VITE_API_BASE}"
VITE_API_BASE="$VITE_API_BASE" npm run build

echo "→ Publishing ${SURGE_DOMAIN} to surge.sh"
# Surge needs a CNAME file in the project for the domain to be remembered
echo "${SURGE_DOMAIN}" > dist/CNAME

# Surge's CLI uses ~/.netrc for auth; if you don't have it, you'll be
# prompted for email + password on first run.
npx --yes surge ./dist "${SURGE_DOMAIN}"

echo
echo "✓ Deployed to https://${SURGE_DOMAIN}"
echo "  (set SURGE_DOMAIN and VITE_API_BASE env vars to use a stable domain)"
