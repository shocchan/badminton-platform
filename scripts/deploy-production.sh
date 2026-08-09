#!/bin/bash
# 本番（kawabado.com）へデプロイ
# ⚠️ 必ず先に scripts/deploy-staging.sh でステージング確認を済ませること
#
# 実行後、本番が新ビルドを配信しているかまで自動検証し、
# 結果を画面表示＋Mac通知で知らせる（Claudeに確認を頼まなくても分かる）。
# ビルド/アップロードの詳細ログは $LOG に退避し、画面には要点だけを出す
# （Claude Code の Run パネルはスクロールできないため、結果が見える行数に収める）。
set -e
cd "$(dirname "$0")/.."

LOG="/tmp/kawabado-deploy-production.log"
: > "$LOG"

notify() {
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}
on_error() {
  echo ""
  echo "❌❌❌ 本番デプロイ 失敗 ❌❌❌"
  echo "── エラー箇所の抜粋（全文: $LOG）──"
  tail -25 "$LOG"
  notify "kawabado.com デプロイ失敗" "エラーで中断しました。Claudeに「デプロイ失敗した」と伝えてください"
}
trap on_error ERR

echo "① ビルド中...（1〜2分かかります。詳細ログ: $LOG）"
npm run build >>"$LOG" 2>&1
echo "② 本番へアップロード中..."
./node_modules/.bin/wrangler pages deploy dist --project-name=badminton-platform --branch=main --commit-dirty=true >>"$LOG" 2>&1

# ── デプロイ後の自動検証: 本番が「今ビルドしたもの」を配信しているか ──
LOCAL_HASH=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)
echo "③ 検証中: 本番が新ビルド（${LOCAL_HASH}）を配信するか確認しています..."
for _ in 1 2 3 4 5 6; do
  LIVE_HASH=$(curl -s --max-time 10 https://kawabado.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)
  if [ -n "$LIVE_HASH" ] && [ "$LIVE_HASH" = "$LOCAL_HASH" ]; then
    echo ""
    echo "✅✅✅ 本番反映 成功！ https://kawabado.com は新ビルドを配信中 ✅✅✅"
    notify "kawabado.com 本番反映 成功" "新しいビルドが配信されています"
    exit 0
  fi
  sleep 5
done

echo ""
echo "⚠️ アップロードは完了しましたが、30秒待っても本番での配信確認が取れませんでした"
echo "   （数分遅れて反映されることもあります。Claudeに「デプロイ確認して」と伝えてください）"
notify "kawabado.com 要確認" "アップロード完了・配信確認が未達。Claudeに確認を頼んでください"
exit 1
