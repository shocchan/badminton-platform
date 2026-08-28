#!/bin/bash
# 本番（kawabado.com）へデプロイ
# ⚠️ 必ず先に scripts/deploy-staging.sh でステージング確認を済ませること
#
# 実行後、本番が新ビルドを配信しているかまで自動検証し、
# 結果を画面表示＋Mac通知で知らせる（Claudeに確認を頼まなくても分かる）。
# ビルド/アップロードの詳細ログは $LOG に退避し、画面には要点だけを出す
# （Claude Code の Run パネルはスクロールできないため、結果が見える行数に収める）。
#
# 2026-08-20: security側ブランチにしか無かった自動検証をこのworktreeへ移植した
# （デプロイ元が ~/badminton-aicourse に切り替わった際の取り残し。
#  「✅が毎回出てこない」＝検証なしの旧版が動いていた）。
# あわせて AIコース固有の事前チェック（決済モードの明示）を追加。
#
# 2026-08-28 統合: security/rls-hardening-and-quality 側の版はこの版の部分集合だった
# （自動検証まで同じで、事前チェック・取り残し警告・PRODUCTION_STATE.txt・
#  キャッシュ無効化付きの配信確認が無い）。取りこぼしが無いことを確認のうえ、
# 情報量の多いこちらを採用した。security側にしか無かった行はゼロ。
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

# ── 事前チェック: 本番の環境変数（欠けたまま配信すると決済・計測が黙って死ぬ）──
if [ ! -f .env.production ]; then
  echo "❌ .env.production がありません（本番の環境変数が欠けたビルドになります）"
  exit 1
fi
CHECKOUT_MODE=$(grep -E '^VITE_AI_COURSE_CHECKOUT=' .env.production | cut -d= -f2 | tr -d '[:space:]' || true)

# ── 事前チェック: 「直したはずのものが本番に無い」を出す（2026-08-24）──
#
# このリポジトリは worktree が4つあり、それぞれ別ブランチを開いている。
# 本番は**このスクリプトを実行したワークツリーのブランチ**から作られるので、
# 別ブランチで直したものは、何も上書きされていなくても本番に出ない。
# 実際「大会カードの詳細を見る」「大会詳細のネイビー刷新」「特商法ページ」が
# この理由で本番に出ておらず、CEOからは「戻った」ように見えていた。
#
# ここでは止めない（実験ブランチも混ざるため）。**見落とせなくする**のが目的。
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "── 本番に出すブランチ ──"
echo "  ${CUR_BRANCH}"
UNSHIPPED=""
for b in $(git branch --format='%(refname:short)'); do
  [ "$b" = "$CUR_BRANCH" ] && continue
  n=$(git log --oneline "HEAD..$b" -- src/ 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" = "0" ] && continue
  UNSHIPPED="${UNSHIPPED}  ${b}: ${n}件\n"
done
if [ -n "$UNSHIPPED" ]; then
  echo ""
  echo "⚠️  このブランチに入っていない src/ の変更があります（＝本番に出ません）"
  printf "%b" "$UNSHIPPED"
  echo "   中身: git log --oneline HEAD..<ブランチ> -- src/"
  echo "   「前に直したのに戻っている」ときは、まずここを見ること"
fi
echo ""
echo "── 本番設定 ──"
echo "  AIコース決済: ${CHECKOUT_MODE:-off（購入ボタンは申込フォームへ倒れます）}"
grep -q '^VITE_GA4_ID=' .env.production && echo "  GA4計測: 有効" || echo "  GA4計測: 未設定"

echo "① ビルド中...（1〜2分かかります。詳細ログ: $LOG）"
npm run build >>"$LOG" 2>&1
echo "② 本番へアップロード中..."
./node_modules/.bin/wrangler pages deploy dist --project-name=badminton-platform --branch=main --commit-dirty=true >>"$LOG" 2>&1

# ── デプロイ後の自動検証: 本番が「今ビルドしたもの」を配信しているか ──
LOCAL_HASH=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)
echo "③ 検証中: 本番が新ビルド（${LOCAL_HASH}）を配信するか確認しています..."
for _ in 1 2 3 4 5 6; do
  # キャッシュ無効化（?cb=）で毎回オリジンの応答を見る
  LIVE_HASH=$(curl -s --max-time 10 -H 'Cache-Control: no-cache' "https://kawabado.com/?cb=$(date +%s)" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)
  if [ -n "$LIVE_HASH" ] && [ "$LIVE_HASH" = "$LOCAL_HASH" ]; then
    echo ""
    echo "✅✅✅ 本番反映 成功！ https://kawabado.com は新ビルドを配信中 ✅✅✅"
    # 「いま本番に何が入っているか」の唯一の記録。
    # これが無いと、本番との差分を調べる起点が無く、取り残しに気づけない
    {
      echo "deployed_at: $(date '+%Y-%m-%d %H:%M:%S %z')"
      echo "branch:      ${CUR_BRANCH}"
      echo "commit:      $(git rev-parse HEAD)"
      echo "asset:       ${LOCAL_HASH}"
    } > docs/PRODUCTION_STATE.txt
    echo "   （本番の内容を docs/PRODUCTION_STATE.txt に記録しました）"
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
