#!/bin/bash
# AIコースのEdge Functionを本番へ出す。
#
# ⚠️ **必ずこのスクリプトを使うこと。`supabase functions deploy` を直接叩かない。**
#
# 【なぜ】2026-08-27、ai-course-checkout と ai-course-stripe-webhook を
# `--no-verify-jwt` なしでデプロイし、JWT検証がONになった。結果:
#   - LPの訪問者は未ログイン＝Authorizationヘッダを送らない
#     → ゲートウェイが401 → 決済ページが開かず、申込フォームへ落ちていた
#   - Stripeのwebhookは Stripe-Signature は送るが Supabase のJWTは送らない
#     → 401で弾かれる → 払っても受講権が発行されない
# 4時間13分ほど「誰も買えない」状態になっていた（実被害はゼロ。購入試行0件）。
#
# これらの関数は**未ログインの人から呼ばれるのが正常**で、
# 認証は関数の中で自前でやっている（checkout は商品検証、webhook は署名検証）。
set -e
cd "$(dirname "$0")/.."

PROJECT_REF="${PROJECT_REF:-jdkwijdphlkrcoiggfqw}"
export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(cat "$HOME/.supabase_backup_token")}"

# 未ログインから呼ばれる関数＝JWT検証をOFFにする（中で自前の検証をしている）
NO_JWT=(
  ai-course-checkout          # LPの訪問者は未ログイン。商品はサーバー側カタログで検証
  ai-course-stripe-webhook    # Stripeが呼ぶ。HMAC-SHA256の署名で検証
  ai-course-purchase-status   # 購入直後の確認。まだログインしていない
  ai-course-claim-session     # 購入直後の自動ログイン。ログイン前に呼ぶ
  ai-course-apply             # 申込フォーム。未ログイン
  ai-course-auth              # ログインそのもの
)

if [ $# -eq 0 ]; then
  echo "使い方: $0 <関数名> [関数名...]"
  echo ""
  echo "JWT検証をOFFで出す関数（未ログインから呼ばれる）:"
  printf '  %s\n' "${NO_JWT[@]}"
  exit 1
fi

for fn in "$@"; do
  flag=""
  for n in "${NO_JWT[@]}"; do
    if [ "$fn" = "$n" ]; then flag="--no-verify-jwt"; break; fi
  done
  echo "── $fn ${flag:-（JWT検証あり）} ──"
  supabase functions deploy "$fn" $flag --project-ref "$PROJECT_REF"
done

echo ""
echo "── 反映後の verify_jwt を確認 ──"
NO_JWT_LIST="${NO_JWT[*]}" node -e '
const { readFileSync } = require("fs");
const env = readFileSync(".env","utf8");
const url = (env.match(/^VITE_SUPABASE_URL=(.*)$/m)||[])[1] || "";
const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)||[])[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;
fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, { headers: { Authorization: `Bearer ${token}` } })
  .then((r) => r.json())
  .then((fns) => {
    // **NO_JWT に載っている関数だけ** verify_jwt=false を要求する。
    // かわバド側（notify-contact / rally-lottery / send-payment-email など）は
    // Supabase JS クライアント経由で呼ばれ、anonキーが Authorization に載るので
    // verify_jwt=true が正しい。実際それらは6〜7月から true のまま動いている。
    // 以前ここは「要求した関数すべてが false でなければ失敗」にしていたため、
    // かわバド側を出すたびに嘘の ❌ が出ていた（2026-08-28 に気づいて修正）。
    const want = process.argv.slice(1);
    const noJwt = (process.env.NO_JWT_LIST || "").split(/\s+/).filter(Boolean);
    let bad = 0;
    for (const f of fns.filter((f) => want.includes(f.slug))) {
      const mustBeOpen = noJwt.includes(f.slug);
      const ng = mustBeOpen && f.verify_jwt === true;
      if (ng) bad += 1;
      const note = ng ? "❌ 未ログインから呼べません"
        : mustBeOpen ? "OK（未ログイン可）"
        : "OK（要ログイン。anonキーで通る）";
      console.log(`  ${f.slug.padEnd(28)} verify_jwt=${String(f.verify_jwt).padEnd(6)} ${note}`);
    }
    if (bad > 0) { console.error("\n❌ 未ログインから呼ばれる関数のJWT検証がONです。--no-verify-jwt を付けて出し直してください。"); process.exit(1); }
    console.log("\n✅ すべて想定どおり");
  });
' "$@"
