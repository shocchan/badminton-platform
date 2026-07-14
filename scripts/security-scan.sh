#!/bin/bash
# 定期脆弱性診断スクリプト（クレジット取引セキュリティ・チェックリスト対応）
# 実行頻度: 四半期に1回以上（結果は docs/security-scans/ に保存）
# 使い方: ./scripts/security-scan.sh
set -uo pipefail
cd "$(dirname "$0")/.."

STAMP=$(date +%Y-%m-%d)
OUTDIR="docs/security-scans"
OUT="$OUTDIR/scan-$STAMP.md"
mkdir -p "$OUTDIR"

{
  echo "# セキュリティスキャン結果 $STAMP"
  echo ""
  echo "## 1. 依存パッケージの既知脆弱性 (npm audit)"
  echo '```'
  npm audit --omit=dev 2>&1 | tail -20
  echo '```'
  echo ""
  echo "## 2. 依存パッケージの既知脆弱性 (devDependencies含む)"
  echo '```'
  npm audit 2>&1 | tail -8
  echo '```'
  echo ""
  echo "## 3. 秘密情報のコミット混入チェック"
  echo '```'
  # sk_live/sk_test/service_role キー等がソースに直書きされていないか（このスクリプト自身は除外）
  grep -rEn "sk_(live|test)_[A-Za-z0-9]{20,}|service_role.{0,20}eyJ|SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ" \
    src/ supabase/functions/ scripts/ --exclude=security-scan.sh 2>/dev/null && echo "⚠️ 直書きの疑いあり（上記を確認）" || echo "OK: ソース内に秘密鍵の直書きなし"
  echo '```'
  echo ""
  echo "## 4. 本番HTTPセキュリティヘッダー"
  echo '```'
  curl -sI https://kawabado.com/ | grep -iE "strict-transport|x-content-type|x-frame|content-security" || echo "（検出ヘッダーなし）"
  echo '```'
  echo ""
  echo "## 5. 管理画面Basic認証ゲートの死活確認"
  echo '```'
  CODE=$(curl -s -o /dev/null -w "%{http_code}" https://kawabado.com/ja/admin)
  echo "GET /ja/admin (認証なし) => HTTP $CODE $([ "$CODE" = "401" ] && echo 'OK: ゲート有効' || echo '⚠️ 401以外。ゲート設定を確認')"
  echo '```'
} > "$OUT"

echo "✅ 診断完了: $OUT"
grep -E "vulnerabilities|⚠️|OK:" "$OUT" | head -10
