// Edge Function 側の約束（2026-08-26 Phase S1/S2）。
//
// checkout と webhook は Deno で動くので、ここからは実行できない。
// しかも**本番と共有**なので、確認のためだけにデプロイもできない。
// そこで「デプロイしたときに何が起きるか」をソースの形で固定しておく。
//
// ここが落ちるときは、デプロイ後に本番で起きることが変わっている。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planById } from './planCatalog';

const CHECKOUT = readFileSync('supabase/functions/ai-course-checkout/index.ts', 'utf8');
const WEBHOOK = readFileSync('supabase/functions/ai-course-stripe-webhook/index.ts', 'utf8');
const CATALOG = readFileSync('supabase/functions/_shared/aiCoursePlans.ts', 'utf8');

describe('関数側カタログが src と一致している', () => {
  it('trialDays を持っている（無いと webhook が 7日を書けない）', () => {
    expect(CATALOG).toContain('trialDays: number | null;');
  });

  it('体験パスの日数が src のカタログと同じ', () => {
    const m = /"id": "ai-trial-pass"[\s\S]*?"trialDays": (\d+|null)/.exec(CATALOG);
    expect(m, '関数側カタログに体験パスの trialDays が無い').toBeTruthy();
    expect(m![1]).toBe(String(planById('ai-trial-pass')!.trialDays));
  });

  it('自動生成であることが書いてある（手で直させない）', () => {
    expect(CATALOG).toContain('AUTO-GENERATED');
  });
});

describe('checkout: 流入元を購入行へ焼き付ける', () => {
  it('anon_id は UUID 形式だけ受ける', () => {
    expect(CHECKOUT).toMatch(/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/);
  });

  it('形が違えば捨てるだけで、決済は止めない', () => {
    // 計測のために購入を失敗させてはいけない
    expect(CHECKOUT).toMatch(/\? body\.anonId : null/);
  });

  it('購入行に流入元を書く（あとで台帳が変わっても売上の出どころは動かない）', () => {
    expect(CHECKOUT).toContain('attribution_source: utm.utm_source ?? null');
    expect(CHECKOUT).toContain('attribution_campaign: utm.utm_campaign ?? null');
  });

  it('受け取るUTMのキーは固定のまま（知らないキーを保存しない）', () => {
    const m = /for \(const k of \[([^\]]+)\]\)/.exec(CHECKOUT);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('"utm_source"');
    expect(m![1]).toContain('"ref"');
  });

  it('金額はサーバー側カタログから取る（クライアントの値を信じない）', () => {
    expect(CHECKOUT).toContain('FUNCTION_PLAN_CATALOG.find');
  });
});

describe('webhook: 体験の長さを受講権に書く', () => {
  it('trial_days をカタログから書く', () => {
    expect(WEBHOOK).toContain('trial_days: plan.trialDays');
  });

  it('旧仕様の trial_window_minutes も書いたまま（既存の行と混ぜない）', () => {
    expect(WEBHOOK).toContain('trial_window_minutes: plan.realtimeWindowMinutes');
  });

  it('開始前は未開始のまま（購入した瞬間に時計を回さない）', () => {
    // 受講権の発行そのものは RPC ai_grant_purchase_access へ移した（migration 20260824140000）。
    // 再送で二重に延長しないため・上位プランを格下げしないための直列化点で、
    // trial_started_at を null に戻すのも**いまはこのRPCの中**。
    // だから webhook のソースではなく、RPCを呼んでいることと、RPC側の中身を見る。
    expect(WEBHOOK).toContain('rpc/ai_grant_purchase_access');
    const grantSql = readFileSync(
      'supabase/migrations/20260824140000_ai_course_access_extend.sql', 'utf8');
    expect(grantSql, '新規発行で体験の時計が回ってしまう')
      .toMatch(/trial_window_minutes, trial_started_at, purchase_id/);
    expect(grantSql, '買い直しても「開始前」に戻らない')
      .toMatch(/trial_started_at\s*=\s*case when v_apply then null/);
    // trial_days の後追い書き込みも、開始済みの行には触らない
    expect(WEBHOOK).toContain('trial_started_at=is.null');
  });

  it('購入メールが日数で案内する', () => {
    expect(WEBHOOK).toMatch(/plan\.trialDays !== null/);
    expect(WEBHOOK).toContain('日間ご利用いただけます');
    expect(WEBHOOK).toContain('天（请在购买后30天内开始）');
  });

  it('メールにAI音声会話の回数も書く（日数制では回数が上限）', () => {
    expect(WEBHOOK).toContain('音声会話は合計3回');
    expect(WEBHOOK).toContain('语音会话共3次');
  });
});

describe('本番へ出す手順が記録に残っている', () => {
  it('どの関数をどう出すかが書いてある', () => {
    // 2026-08-27 に本番へ反映済み。手順と、そのとき踏んだ失敗を記録に残す
    const doc = readFileSync('docs/ai-course/decisions/2026-08-26-sales-foundation.md', 'utf8');
    expect(doc).toContain('ai-course-stripe-webhook');
    expect(doc).toContain('ai-course-checkout');
    expect(doc).toContain('--no-verify-jwt');
  });
});

/* ── デプロイの仕方（2026-08-27・実際に本番を壊した） ────────────────
   ai-course-checkout と ai-course-stripe-webhook を `--no-verify-jwt` なしで
   デプロイし、JWT検証がONになった。結果:
     - LPの訪問者は未ログイン＝Authorizationヘッダを送らない → 401 → 決済ページが開かない
     - Stripeのwebhookも Supabase のJWTは送らない → 401 → 払っても受講権が出ない
   4時間13分「誰も買えない」状態だった（購入試行0件で実被害はゼロ）。

   これらの関数は**未ログインから呼ばれるのが正常**で、認証は関数の中で
   自前でやっている（checkout は商品検証、webhook は署名検証）。
   同じ間違いを繰り返さないよう、手順をスクリプトに固定した。 */
describe('Edge Functionのデプロイ手順', () => {
  const SCRIPT_PATH = 'scripts/deploy-edge-functions.sh';
  const SCRIPT = readFileSync(SCRIPT_PATH, 'utf8');

  it('専用スクリプトがある（deploy を直接叩かせない）', () => {
    expect(SCRIPT).toContain('--no-verify-jwt');
  });

  it('未ログインから呼ばれる関数がすべて一覧に入っている', () => {
    const list = /NO_JWT=\(([\s\S]*?)\n\)/.exec(SCRIPT);
    expect(list, 'NO_JWT の一覧が見つからない').toBeTruthy();
    for (const fn of [
      'ai-course-checkout',        // LPの訪問者
      'ai-course-stripe-webhook',  // Stripe
      'ai-course-purchase-status', // 購入直後（ログイン前）
      'ai-course-claim-session',   // 自動ログイン（ログイン前）
      'ai-course-apply',           // 申込フォーム
      'ai-course-auth',            // ログインそのもの
    ]) {
      expect(list![1], `${fn} が一覧に無い＝JWT検証ONで出てしまう`).toContain(fn);
    }
  });

  it('出したあとに verify_jwt を確認して、ONなら失敗で止まる', () => {
    expect(SCRIPT).toContain('verify_jwt');
    expect(SCRIPT).toMatch(/process\.exit\(1\)/);
  });

  it('なぜそうするのかが手順に書いてある（次に読む人が外さないように）', () => {
    expect(SCRIPT).toContain('未ログイン');
    expect(SCRIPT).toContain('署名');
  });
});
