#!/bin/bash
# 本番（kawabado.com）へデプロイ
# ⚠️ 必ず先に scripts/deploy-staging.sh でステージング確認を済ませること
#
# ────────────────────────────────────────────────────────────────
# 2026-08-28: 「本番のビルド元を1つに固定する」門を入れた
# ────────────────────────────────────────────────────────────────
# Cloudflare Pages の配信は**差分ではなく全置換**である。
# つまり本番サイトは、このスクリプトを実行したワークツリーの姿へ丸ごと入れ替わる。
# ワークツリーが4つ（sales / aicourse / platform / secure-runtime）あり、
# それぞれ別ブランチを開いていたため、実行するフォルダが違うだけで
# 本番がそのフォルダの姿になっていた。2026-08-28 だけで3回起き、
# AIコースのログインが消えて**実在の生徒3人がログインできなくなった**。
#
# 以前の版は「他ブランチに未取込があります」と**警告するだけ**だった。
# 警告は読み飛ばされる。だからすべて**中断**に変えた。
# `--force` のような抜け道は用意しない（抜け道は必ず使われる）。
#
# 検証用に DRY_RUN=1 を用意しているが、これは②アップロードを飛ばすだけで、
# ①ビルドまでは本番と同じ手順を通る。**門はDRY_RUNでも必ず全部通る。**
set -e
cd "$(dirname "$0")/.."

REPO_ROOT="$(pwd)"
LOG="/tmp/kawabado-deploy-production.log"

notify() {
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

gate_stop() {
  echo ""
  echo "🛑 本番デプロイを中断しました（本番サイトには一切触れていません）"
  notify "本番デプロイ 中断" "$1"
  exit 1
}

echo "══════════════════════════════════════════"
echo " 本番デプロイ前チェック（1つでも×なら中断）"
echo "══════════════════════════════════════════"

# ── 門(a): 本番へ出してよいブランチか ───────────────────────────
# ブランチ名は scripts/DEPLOY_BRANCH に1行で書く。
# 名前を変えるときはそのファイル1か所だけ直せばよい。
if [ ! -f scripts/DEPLOY_BRANCH ]; then
  echo "❌ (a) scripts/DEPLOY_BRANCH がありません"
  echo ""
  echo "   このファイルが「本番へ出してよい唯一のブランチ名」の正本です。"
  echo "   進めるには: ブランチ名を1行だけ書いて作ってください"
  echo "     echo 'integration/unify-2026-08-28' > ${REPO_ROOT}/scripts/DEPLOY_BRANCH"
  gate_stop "scripts/DEPLOY_BRANCH が無い"
fi
DEPLOY_BRANCH=$(head -1 scripts/DEPLOY_BRANCH | tr -d '[:space:]')
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ -z "$DEPLOY_BRANCH" ]; then
  echo "❌ (a) scripts/DEPLOY_BRANCH が空です"
  echo "   進めるには: 1行目にデプロイ用ブランチ名を書いてください"
  gate_stop "DEPLOY_BRANCH が空"
fi

if [ "$CUR_BRANCH" != "$DEPLOY_BRANCH" ]; then
  echo "❌ (a) 本番へ出せないブランチです"
  echo ""
  echo "   いまのフォルダ  : ${REPO_ROOT}"
  echo "   いまのブランチ  : ${CUR_BRANCH}"
  echo "   出してよいブランチ: ${DEPLOY_BRANCH}"
  echo ""
  echo "   本番は「実行したフォルダの姿」へ丸ごと入れ替わります。"
  echo "   別ブランチから出すと、そのブランチに無いものが本番から消えます。"
  echo ""
  echo "   進めるには:"
  echo "     1) この作業をコミットする"
  echo "     2) ${DEPLOY_BRANCH} を開いているフォルダへ移動する"
  echo "     3) そこで取り込む:  git merge ${CUR_BRANCH}"
  echo "     4) そこで実行する:  ./scripts/deploy-production.sh"
  gate_stop "ブランチが ${DEPLOY_BRANCH} ではない"
fi
echo "✅ (a) ブランチ: ${CUR_BRANCH}"

# ── 門(b): このワークツリーに未コミットが無いか ─────────────────
# 「本番が未コミットの作業ツリーから作られていた」が実際に起きた。
# 未コミットのまま出すと、本番の中身がどのコミットなのか誰にも分からなくなる。
# **配信物に入るものは全部見る。** index.html は Worker が丸ごと埋め込む本体で、
# vite.config.ts / package.json / .env.production はビルド結果を変える。
# 2026-08-28 の検証で「index.html を未コミットで書き換えても素通りする」ことが実測された。
DIRTY=$(git status --porcelain -- src supabase scripts public \
  index.html vite.config.ts package.json package-lock.json tsconfig*.json .env.production)
if [ -n "$DIRTY" ]; then
  DIRTY_N=$(printf '%s\n' "$DIRTY" | wc -l | tr -d ' ')
  echo "❌ (b) 未コミットの変更があります（${DIRTY_N}件 / src supabase scripts public）"
  echo ""
  printf '%s\n' "$DIRTY" | head -20 | sed 's/^/     /'
  [ "$DIRTY_N" -gt 20 ] && echo "     …ほか $((DIRTY_N - 20))件"
  echo ""
  echo "   進めるには（どちらか）:"
  echo "     ・出したい変更なら → git add -A && git commit -m '...'"
  echo "     ・出したくない変更なら → git stash（あとで git stash pop で戻せます）"
  gate_stop "未コミットの変更がある"
fi
echo "✅ (b) 未コミットなし"

# ── 門(c): 他ブランチに取り込み忘れが無いか ──────────────────────
# 本番はこのブランチの姿になる。他ブランチにしかない src/ の変更は、
# 何も壊していなくても本番から**消える**。CEOには「戻った」ように見える。
# ただし最終コミットが90日以上前のブランチは、放棄されたものとみなして除外する
# （永久に止まり続けて、結局この門ごと無効化されるのを避けるため）。
STALE_DAYS=90
CUTOFF=$(( $(date +%s) - STALE_DAYS * 24 * 60 * 60 ))
UNSHIPPED=""
SKIPPED=""
# **ローカルブランチだけを見ている。** push された作業は見えない。
# いまは push 禁止の運用なので成り立つが、他マシンから push するようになったら
# `git branch -a` に広げること（この前提が崩れたら門(c)は嘘になる）
for b in $(git branch --format='%(refname:short)'); do
  [ "$b" = "$CUR_BRANCH" ] && continue
  LAST_TS=$(git log -1 --format=%ct "$b" 2>/dev/null || echo 0)
  LAST_DAY=$(git log -1 --format=%cd --date=short "$b" 2>/dev/null || echo '?')
  if [ "$LAST_TS" -lt "$CUTOFF" ]; then
    SKIPPED="${SKIPPED}     ${b}（最終コミット ${LAST_DAY}）\n"
    continue
  fi
  # 門(b)(d) と同じ範囲を見る。public/ には _headers・_redirects・hero-*.webp など
  # 30項目が入っており、全置換で本番から消える。src/ だけ見ていると素通りする
  # （2026-08-28 の検証で実測）
  n=$(git log --oneline "HEAD..$b" -- src supabase public index.html vite.config.ts 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" = "0" ] && continue
  UNSHIPPED="${UNSHIPPED}     ${b}: ${n}件（最終コミット ${LAST_DAY}）\n"
done

if [ -n "$SKIPPED" ]; then
  echo "ℹ️  (c) ${STALE_DAYS}日以上動いていないブランチは除外しました:"
  printf "%b" "$SKIPPED"
fi

if [ -n "$UNSHIPPED" ]; then
  echo "❌ (c) このブランチに取り込まれていない src/ の変更があります"
  echo "       （このまま出すと、これらは本番から消えます）"
  echo "       ※ 見ている範囲: src/ supabase/ public/ index.html vite.config.ts"
  echo ""
  printf "%b" "$UNSHIPPED"
  echo "   中身の確認: git log --oneline HEAD..<ブランチ> -- src supabase public index.html"
  echo ""
  echo "   進めるには（各ブランチについて）:"
  echo "     ・必要な変更 → git merge <ブランチ>  ここで取り込んでからデプロイ"
  echo "     ・不要な変更 → そのブランチを削除する（git branch -D <ブランチ>）"
  echo "       ※ 判断がつかないものを消さないこと。消すと本番から消えます"
  gate_stop "他ブランチに未取込の変更がある"
fi
echo "✅ (c) 他ブランチに未取込の src/ 変更なし"

# ── 門(d): 他ワークツリーに未コミットが無いか ────────────────────
# 別フォルダで作業中の src/ の変更は、コミットされるまでこのブランチに来ない。
# 「直したのに本番に出ない」の典型。
WT_DIRTY=""
WT_GONE=""
while read -r key val; do
  [ "$key" = "worktree" ] || continue
  wt="$val"
  [ "$wt" = "$REPO_ROOT" ] && continue
  if [ ! -d "$wt" ]; then
    WT_GONE="${WT_GONE}     ${wt}\n"
    continue
  fi
  wb=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
  wd=$(git -C "$wt" status --porcelain -- src supabase scripts public \
      index.html vite.config.ts package.json 2>/dev/null || true)
  if [ -n "$wd" ]; then
    wn=$(printf '%s\n' "$wd" | wc -l | tr -d ' ')
    WT_DIRTY="${WT_DIRTY}     ${wt}\n       ブランチ ${wb} / src/ に未コミット ${wn}件\n"
    WT_DIRTY="${WT_DIRTY}$(printf '%s\n' "$wd" | head -5 | sed 's/^/         /')\n"
  fi
done < <(git worktree list --porcelain)

if [ -n "$WT_GONE" ]; then
  echo "ℹ️  (d) 消えたワークツリーは無視しました（git worktree prune で掃除できます）:"
  printf "%b" "$WT_GONE"
fi

if [ -n "$WT_DIRTY" ]; then
  echo "❌ (d) 他のフォルダに未コミットの src/ 変更があります"
  echo ""
  printf "%b" "$WT_DIRTY"
  echo "   進めるには:"
  echo "     1) そのフォルダで内容を確認し、コミットする"
  echo "        （例: cd <上のフォルダ> && git add -A && git commit -m '...'）"
  echo "     2) このフォルダへ戻り、取り込む:  git merge <そのブランチ>"
  echo "     3) もう一度 ./scripts/deploy-production.sh"
  gate_stop "他ワークツリーに未コミットがある"
fi
echo "✅ (d) 他ワークツリーに未コミットの src/ 変更なし"

# ── 事前チェック: 本番の環境変数（欠けたまま配信すると決済・計測が黙って死ぬ）──
if [ ! -f .env.production ]; then
  echo "❌ .env.production がありません（本番の環境変数が欠けたビルドになります）"
  gate_stop ".env.production が無い"
fi
CHECKOUT_MODE=$(grep -E '^VITE_AI_COURSE_CHECKOUT=' .env.production | cut -d= -f2 | tr -d '[:space:]' || true)

echo ""
echo "── 本番設定 ──"
echo "  出すブランチ: ${CUR_BRANCH} ($(git rev-parse --short HEAD))"
echo "  AIコース決済: ${CHECKOUT_MODE:-off（購入ボタンは申込フォームへ倒れます）}"
grep -q '^VITE_GA4_ID=' .env.production && echo "  GA4計測: 有効" || echo "  GA4計測: 未設定"
echo ""

# ここから先は実際にビルド/配信する。失敗時はログ末尾を出す。
: > "$LOG"
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
LOCAL_HASH=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)
echo "   ビルド完了: ${LOCAL_HASH}"

if [ "${DRY_RUN:-}" = "1" ]; then
  echo ""
  echo "🧪 DRY_RUN=1 のため、②アップロードは行いません（本番は無変更）"
  echo "   本番へ出すときは DRY_RUN を付けずに実行してください"
  exit 0
fi

echo "② 本番へアップロード中..."
./node_modules/.bin/wrangler pages deploy dist --project-name=badminton-platform --branch=main --commit-dirty=true >>"$LOG" 2>&1

# ── デプロイ後の自動検証: 本番が「今ビルドしたもの」を配信しているか ──
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
