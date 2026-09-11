#!/bin/bash
# ステージング環境へデプロイ（CEO確認用。kawabado.com には影響しない）
# URL: https://staging.badminton-platform.pages.dev
set -e
cd "$(dirname "$0")/.."
# .env.staging（VITE_STRIPE_PUBLISHABLE_KEY 等の上書き）を読む staging モードでビルド。
# 本番ビルド（deploy-production.sh → npm run build）には .env.staging の内容は入らない。
npm run build:staging
./node_modules/.bin/wrangler pages deploy dist --project-name=badminton-platform --branch=staging --commit-dirty=true

# DBの関数・テーブルの有無（2026-09-10）。ステージングは本番とDBを共有しているので、
# 本番DBに無いものを呼ぶ画面は、ステージングでも404で壊れて見える。
# ここでは止めずに知らせる（本番へ出すときは deploy-production.sh の門(e)が止める）。
echo ""
echo "── DBの関数・テーブルの確認（ステージングでは止めません）──"
node scripts/check-db-objects.mjs --warn src || true
echo ""
echo "✅ ステージング反映完了: https://staging.badminton-platform.pages.dev"
echo "   確認OKになったら scripts/deploy-production.sh で本番反映"
