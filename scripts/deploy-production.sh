#!/bin/bash
# 本番（kawabado.com）へデプロイ
# ⚠️ 必ず先に scripts/deploy-staging.sh でステージング確認を済ませること
set -e
cd "$(dirname "$0")/.."
npm run build
./node_modules/.bin/wrangler pages deploy dist --project-name=badminton-platform --branch=main --commit-dirty=true
echo ""
echo "✅ 本番反映完了: https://kawabado.com"
