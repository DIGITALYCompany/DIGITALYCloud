#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SITE_URL=https://digitalycloud.com
export NEXT_PUBLIC_API_URL=https://digitalycloud.com/v1
export API_INTERNAL_URL=http://127.0.0.1:4000/v1
export API_PROXY_TARGET=http://127.0.0.1:4000

npm run build

mkdir -p release-artifacts

tar \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.next/cache' \
  --exclude='*/.next/cache' \
  --exclude='*.bak' \
  --exclude='.data' \
  --exclude='*.log' \
  -czf release-artifacts/release.tar.gz \
  package.json package-lock.json \
  node_modules apps packages

echo "Release archive ready"
