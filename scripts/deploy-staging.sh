#!/bin/bash
# ステージング環境へデプロイ（CEO確認用。kawabado.com には影響しない）
# URL: https://staging.badminton-platform.pages.dev
set -e
cd "$(dirname "$0")/.."
npm run build
./node_modules/.bin/wrangler pages deploy dist --project-name=badminton-platform --branch=staging --commit-dirty=true
echo ""
echo "✅ ステージング反映完了: https://staging.badminton-platform.pages.dev"
echo "   確認OKになったら scripts/deploy-production.sh で本番反映"
