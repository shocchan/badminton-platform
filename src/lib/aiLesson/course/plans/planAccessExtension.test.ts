// 再購入で受講権がどうなるかの受入テスト（2026-08-24）。
//
// ここで固定したいのは2つだけ:
//   1. **期間は減らない。** 残り20日ある人が1か月プランを買い足したら50日になる
//      （旧実装は now+30日 の上書きで30日に縮んでいた）
//   2. **高い権利は安い購入で消えない。** 6か月伴走コース受講中の人が
//      体験パスを買っても、プラン内容が体験パスに化けない ← release gate
//      （金額は planCatalog.ts が正準なので、ここには書かない）
//
// 実体はDBの ai_grant_purchase_access（migration 20260824140000）。
// TS側の nextAccessOnPurchase はその写しで、SQLとのずれもここで検出する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  nextAccessOnPurchase, planStrengthRank, PLAN_STRENGTH_RANK, MANUAL_STRENGTH_RANK,
  type ExistingAccess,
} from './planEntitlements';
import { planById } from './planCatalog';

const repoFile = (rel: string) => readFileSync(join(__dirname, '../../../../../', rel), 'utf8');
const MIGRATION = repoFile('supabase/migrations/20260824140000_ai_course_access_extend.sql');
const WEBHOOK = repoFile('supabase/functions/ai-course-stripe-webhook/index.ts');
const CHECKOUT = repoFile('supabase/functions/ai-course-checkout/index.ts');

const NOW = '2026-08-24T00:00:00.000Z';
const DAY = 86400000;
const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((Date.parse(toISO) - Date.parse(fromISO)) / DAY);

const access = (over: Partial<ExistingAccess> = {}): ExistingAccess => ({
  validFromISO: '2026-08-01T00:00:00.000Z',
  validUntilISO: '2026-09-13T00:00:00.000Z', // NOW から20日後
  planId: 'ai-month',
  ...over,
});

/* ────────────────────────────────────────────────────────────
   1. 期間の延長（残日数あり／期限切れ／行なし）
   ──────────────────────────────────────────────────────────── */
describe('利用期間は延長される（縮まない）', () => {
  it('**残り20日ある人が1か月プランを買うと50日になる**（30日にならない）', () => {
    const r = nextAccessOnPurchase({
      existing: access({ validUntilISO: '2026-09-13T00:00:00.000Z' }),
      accessDays: 30, planId: 'ai-month', nowISO: NOW,
    });
    expect(daysBetween(NOW, r.validUntilISO)).toBe(50);
    expect(r.validUntilISO).toBe('2026-10-13T00:00:00.000Z');
  });

  it('期限切れの人が買うと「今から30日」になる（過去に足さない）', () => {
    const r = nextAccessOnPurchase({
      existing: access({ validUntilISO: '2026-07-01T00:00:00.000Z', planId: 'ai-month' }),
      accessDays: 30, planId: 'ai-month', nowISO: NOW,
    });
    expect(daysBetween(NOW, r.validUntilISO)).toBe(30);
  });

  it('受講権の行がまだ無い人（新規購入）は「今から30日」', () => {
    const r = nextAccessOnPurchase({ existing: null, accessDays: 30, planId: 'ai-month', nowISO: NOW });
    expect(daysBetween(NOW, r.validUntilISO)).toBe(30);
    expect(r.applyPlanAttributes).toBe(true);
  });

  it('ちょうど期限当日でも1日も失わない（境界）', () => {
    const r = nextAccessOnPurchase({
      existing: access({ validUntilISO: NOW }),
      accessDays: 30, planId: 'ai-month', nowISO: NOW,
    });
    expect(daysBetween(NOW, r.validUntilISO)).toBe(30);
  });

  it('体験パスを2回買ったら開始期限が60日ぶんになる（買った日数が消えない）', () => {
    const first = nextAccessOnPurchase({
      existing: null, accessDays: 30, planId: 'ai-trial-pass', nowISO: NOW,
    });
    const second = nextAccessOnPurchase({
      existing: access({ validUntilISO: first.validUntilISO, planId: 'ai-trial-pass' }),
      accessDays: 30, planId: 'ai-trial-pass', nowISO: NOW,
    });
    expect(daysBetween(NOW, second.validUntilISO)).toBe(60);
    // 同格の買い直しなので体験は「開始前」へ戻る（60分がまた使える）
    expect(second.applyPlanAttributes).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────
   2. 格下げ防止（release gate）
   ──────────────────────────────────────────────────────────── */
describe('【release gate】高い権利は安い購入で消えない', () => {
  it('**6か月コース受講中（手動発行・plan_id null）の人が600円の体験パスを買っても権利が消えない**', () => {
    const sixMonth = access({
      // 実データと同じ形: 手動発行は plan_id が null、期限は半年先
      planId: null,
      validFromISO: '2026-08-18T12:59:23.531Z',
      validUntilISO: '2027-02-14T14:59:59.000Z',
    });
    const r = nextAccessOnPurchase({
      existing: sixMonth, accessDays: 30, planId: 'ai-trial-pass', nowISO: NOW,
    });
    // プラン内容は入れ替えない＝plan_id / trial_window_minutes / ai_seconds_limit は据え置き
    expect(r.applyPlanAttributes).toBe(false);
    expect(r.downgradeGuarded).toBe(true);
    // 契約開始日も動かさない
    expect(r.validFromISO).toBe(sixMonth.validFromISO);
    // 期間は「元の期限 + 30日」＝買ったぶんは無駄にならない
    expect(daysBetween(sixMonth.validUntilISO, r.validUntilISO)).toBe(30);
    // **絶対に now+30日 になってはいけない**（これが起きると6か月コースの権利が消える）
    expect(daysBetween(NOW, r.validUntilISO)).toBeGreaterThan(30);
  });

  it('plan_id="coach-6m" を明示された行でも同じく守られる', () => {
    const r = nextAccessOnPurchase({
      existing: access({ planId: 'coach-6m', validUntilISO: '2027-02-14T00:00:00.000Z' }),
      accessDays: 30, planId: 'ai-trial-pass', nowISO: NOW,
    });
    expect(r.applyPlanAttributes).toBe(false);
  });

  it('1か月プラン利用中に体験パスを買っても1か月プランのまま（期間だけ伸びる）', () => {
    const r = nextAccessOnPurchase({
      existing: access({ planId: 'ai-month' }),
      accessDays: 30, planId: 'ai-trial-pass', nowISO: NOW,
    });
    expect(r.downgradeGuarded).toBe(true);
    expect(daysBetween(NOW, r.validUntilISO)).toBe(50);
  });

  it('体験パス利用中に1か月プランを買うのは格上げ＝プラン内容が入れ替わる', () => {
    const r = nextAccessOnPurchase({
      existing: access({ planId: 'ai-trial-pass' }),
      accessDays: 30, planId: 'ai-month', nowISO: NOW,
    });
    expect(r.downgradeGuarded).toBe(false);
    expect(r.applyPlanAttributes).toBe(true);
    expect(daysBetween(NOW, r.validUntilISO)).toBe(50);
  });

  it('**期限切れなら格下げガードは働かない**（買ったプランが正しく入る）', () => {
    const r = nextAccessOnPurchase({
      existing: access({ planId: null, validUntilISO: '2026-07-01T00:00:00.000Z' }),
      accessDays: 30, planId: 'ai-trial-pass', nowISO: NOW,
    });
    expect(r.applyPlanAttributes).toBe(true);
    expect(daysBetween(NOW, r.validUntilISO)).toBe(30);
  });

  it('未知のプランIDは「弱い」と決めつけない（フェイルセーフ）', () => {
    expect(planStrengthRank('ai-someday-plan')).toBe(MANUAL_STRENGTH_RANK);
    expect(planStrengthRank(null)).toBe(MANUAL_STRENGTH_RANK);
    const r = nextAccessOnPurchase({
      existing: access({ planId: 'ai-someday-plan' }),
      accessDays: 30, planId: 'ai-trial-pass', nowISO: NOW,
    });
    expect(r.applyPlanAttributes).toBe(false);
  });

  it('強さの順は 手動(null) > coach-6m > ai-month > ai-trial-pass', () => {
    expect(MANUAL_STRENGTH_RANK).toBeGreaterThan(PLAN_STRENGTH_RANK['coach-6m']);
    expect(PLAN_STRENGTH_RANK['coach-6m']).toBeGreaterThan(PLAN_STRENGTH_RANK['ai-month']);
    expect(PLAN_STRENGTH_RANK['ai-month']).toBeGreaterThan(PLAN_STRENGTH_RANK['ai-trial-pass']);
  });
});

/* ────────────────────────────────────────────────────────────
   3. 本番の実データ11行に対して何が起きるか
      出典: ~/ai-company/backups/kawabado/2026-08-24/ai_course_access.json
      （plan_id / source / valid_until だけを写した。氏名・noteは入れない）
   ──────────────────────────────────────────────────────────── */
const REAL_ROWS: Array<{ id: string; source: string; planId: string | null; validUntilISO: string }> = [
  { id: 'cd039a3b', source: 'manual', planId: null, validUntilISO: '2027-02-17T14:59:59+00:00' },
  { id: '8c0b1a8c', source: 'manual', planId: null, validUntilISO: '2026-11-30T14:59:59+00:00' },
  { id: '747cbbef', source: 'manual', planId: null, validUntilISO: '2026-10-31T14:59:59+00:00' },
  { id: 'dcd33433', source: 'manual', planId: null, validUntilISO: '2027-02-14T14:59:59+00:00' },
  { id: '3b4ab796', source: 'test', planId: null, validUntilISO: '2027-12-31T14:59:59+00:00' },
  { id: '428b2030', source: 'test', planId: null, validUntilISO: '2027-12-31T14:59:59+00:00' },
  { id: 'ed618c2a', source: 'test', planId: null, validUntilISO: '2027-12-31T14:59:59+00:00' },
  { id: '7c63a736', source: 'purchase', planId: 'ai-trial-pass', validUntilISO: '2026-08-19T17:20:51.880866+00:00' },
  { id: '4d7f2553', source: 'manual', planId: null, validUntilISO: '2026-11-22T14:59:59+00:00' },
  { id: 'f227b3aa', source: 'manual', planId: null, validUntilISO: '2027-02-14T14:59:59+00:00' },
  { id: '984fca5f', source: 'manual', planId: null, validUntilISO: '2026-11-23T14:59:59+00:00' },
];

describe('本番の実データ11行に対する影響', () => {
  it('11行・内訳は manual 7 / test 3 / purchase 1（バックアップと一致）', () => {
    expect(REAL_ROWS).toHaveLength(11);
    expect(REAL_ROWS.filter((r) => r.source === 'manual')).toHaveLength(7);
    expect(REAL_ROWS.filter((r) => r.source === 'test')).toHaveLength(3);
    expect(REAL_ROWS.filter((r) => r.source === 'purchase')).toHaveLength(1);
  });

  it('**利用中の10行は、どのセルフサービス商品を買っても権利を失わない**', () => {
    const selfServe = (['ai-trial-pass', 'ai-month'] as const);
    const activeRows = REAL_ROWS.filter((r) => Date.parse(r.validUntilISO) > Date.parse(NOW));
    expect(activeRows).toHaveLength(10); // 期限切れは購入行1件だけ

    for (const row of activeRows) {
      for (const planId of selfServe) {
        const r = nextAccessOnPurchase({
          existing: { validFromISO: '2026-08-18T12:59:23.531Z', validUntilISO: row.validUntilISO, planId: row.planId },
          accessDays: planById(planId)!.accessDays!, planId, nowISO: NOW,
        });
        // 期限は必ず今より伸びる（1日も減らない）
        expect(Date.parse(r.validUntilISO), `${row.id}/${planId} で期限が縮んだ`)
          .toBeGreaterThan(Date.parse(row.validUntilISO));
        // plan_id が null の手動発行行は、プラン属性を上書きされない
        // ＝ai_start_session の「plan_id が null ならフェイルオープン」が維持される
        if (row.planId === null) {
          expect(r.applyPlanAttributes, `${row.id} の手動発行行が ${planId} に化けた`).toBe(false);
        }
      }
    }
  });

  it('期限切れの購入行（体験パス）は、次の購入で正しく買ったプランになる', () => {
    const expired = REAL_ROWS.find((r) => r.source === 'purchase')!;
    expect(Date.parse(expired.validUntilISO)).toBeLessThan(Date.parse(NOW));
    const r = nextAccessOnPurchase({
      existing: { validFromISO: '2026-08-20T02:49:02.34+00:00', validUntilISO: expired.validUntilISO, planId: expired.planId },
      accessDays: 30, planId: 'ai-month', nowISO: NOW,
    });
    expect(r.applyPlanAttributes).toBe(true);
    expect(daysBetween(NOW, r.validUntilISO)).toBe(30);
  });

  it('migration は ai_course_access の既存行を UPDATE / DELETE しない', () => {
    expect(MIGRATION).not.toMatch(/update\s+public\.ai_course_access\s+set(?![\s\S]{0,40}grants)/i);
    expect(MIGRATION).not.toMatch(/delete\s+from\s+public\.ai_course_access/i);
    expect(MIGRATION).not.toMatch(/truncate/i);
    // 破壊的な列の付け替えもしない
    expect(MIGRATION).not.toMatch(/drop\s+column/i);
    expect(MIGRATION).not.toMatch(/drop\s+table\s+(?!if exists public\.__never)/i);
  });
});

/* ────────────────────────────────────────────────────────────
   4. 冪等性（同じ session_id の再送で二重延長しない）
   ──────────────────────────────────────────────────────────── */
describe('冪等性', () => {
  it('DB側の直列化点がある（purchase_id unique ＋ on conflict do nothing）', () => {
    expect(MIGRATION).toMatch(/purchase_id\s+uuid\s+not null\s+unique/i);
    expect(MIGRATION).toMatch(/on conflict \(purchase_id\) do nothing/i);
    // 反映済みなら期間を足さずに現状を返す
    expect(MIGRATION).toMatch(/if v_grant_id is null then/);
    expect(MIGRATION).toMatch(/'already', true/);
  });

  it('Webhook 側の「発行済みなら何もしない」防御も残っている', () => {
    expect(WEBHOOK).toMatch(/if \(row\.status === "provisioned"\) return json\(\{ received: true, already: true \}\)/);
  });

  it('**Webhookはアプリ側で valid_until を組み立てない**（read-modify-write を作らない）', () => {
    // 旧実装の痕跡（now + accessDays を JS で作って upsert）が消えていること
    expect(WEBHOOK).not.toMatch(/ai_course_access\?on_conflict=user_id/);
    expect(WEBHOOK).not.toMatch(/plan\.accessDays \?\? 30\) \* 24 \* 3600 \* 1000/);
    // 受講権の反映はRPC経由
    expect(WEBHOOK).toMatch(/rpc\/ai_grant_purchase_access/);
    expect(WEBHOOK).toMatch(/const validUntilISO: string \| null =\s*\n?\s*typeof grant\.validUntil === "string"/);
  });

  it('期限は「greatest(現在の期限, now) + 日数」でDBが計算する', () => {
    expect(MIGRATION).toMatch(/greatest\(a\.valid_until, now\(\)\) \+ make_interval\(hours => v_days \* 24\)/);
  });
});

/* ────────────────────────────────────────────────────────────
   5. SQL と TS のずれ検出
   ──────────────────────────────────────────────────────────── */
describe('ai_plan_rank（SQL）と PLAN_STRENGTH_RANK（TS）が一致する', () => {
  const sqlRank = (key: string): number => {
    const m = MIGRATION.match(new RegExp(`when '${key}'\\s*then\\s*(\\d+)`));
    if (!m) throw new Error(`ai_plan_rank に ${key} が無い`);
    return Number(m[1]);
  };

  it('プランごとの数字が同じ', () => {
    for (const [planId, rank] of Object.entries(PLAN_STRENGTH_RANK)) {
      expect(sqlRank(planId), `${planId} の rank がSQLとTSでずれている`).toBe(rank);
    }
  });

  it('手動発行（空文字＝NULL）と未知プランは最強で一致', () => {
    expect(sqlRank('')).toBe(MANUAL_STRENGTH_RANK);
    expect(MIGRATION).toMatch(new RegExp(`else ${MANUAL_STRENGTH_RANK}\\s`));
  });
});

/* ────────────────────────────────────────────────────────────
   6. 非同期決済（Alipay / WeChat Pay）
   ──────────────────────────────────────────────────────────── */
describe('非同期決済で未払いのままアカウントを発行しない', () => {
  it('**payment_status が paid でなければ発行処理へ進まない**', () => {
    const gate = WEBHOOK.indexOf('if (session.payment_status !== "paid")');
    const create = WEBHOOK.indexOf('authAdmin("/admin/users"');
    const grant = WEBHOOK.indexOf('rpc/ai_grant_purchase_access');
    expect(gate, '未払いゲートが消えている').toBeGreaterThan(0);
    expect(gate, 'アカウント作成より前に未払いを弾くこと').toBeLessThan(create);
    expect(gate, '受講権の付与より前に未払いを弾くこと').toBeLessThan(grant);
  });

  it('未払いの completed は「入金待ち」として台帳に残す（離脱と区別する）', () => {
    expect(WEBHOOK).toMatch(/status: "awaiting_payment"/);
    expect(WEBHOOK).toMatch(/waiting: "payment"/);
  });

  it('入金確定（async_payment_succeeded）と失敗（async_payment_failed）の両方を扱う', () => {
    expect(WEBHOOK).toMatch(/checkout\.session\.async_payment_succeeded/);
    expect(WEBHOOK).toMatch(/event\.type === "checkout\.session\.async_payment_failed"/);
    expect(WEBHOOK).toMatch(/error: `async_payment_failed/);
  });

  it('台帳のCHECKに awaiting_payment と refunded がある（返金の記録が落ちない）', () => {
    expect(MIGRATION).toMatch(/check \(status in \('pending', 'awaiting_payment', 'paid', 'provisioned', 'failed', 'refunded'\)\)/);
  });

  it('金額・通貨の突き合わせは非同期決済でも同じく効く', () => {
    expect(WEBHOOK).toMatch(/session\.amount_total !== plan\.priceJpy/);
    expect(WEBHOOK).toMatch(/currency !== "jpy"/);
  });

  /**
   * 中国決済を足すのに **checkout 関数は変えない**。
   * 決済手段を列挙すると「書いていない手段が消える」（Link決済が消えた事故）。
   * 有効化はStripeダッシュボード側だけで行う。
   * 列挙してしまうことの検知は paymentMethodsNote.test.tsx が担当しているので、
   * ここでは「増やす作業がコード変更を伴わない形になっている」ことだけ確認する。
   */
  it('決済手段はStripeダッシュボード任せ（checkout関数は手段を列挙しない）', () => {
    expect(CHECKOUT).not.toMatch(/payment_method_types/);
    expect(CHECKOUT).not.toMatch(/payment_method_options/);
    // 通貨はJPY固定（承認が要る決済手段でも請求はJPYのまま）
    expect(CHECKOUT).toMatch(/\[price_data\]\[currency\]": "jpy"/);
  });
});

/* ────────────────────────────────────────────────────────────
   7. 連絡先が取れない購入
   ──────────────────────────────────────────────────────────── */
describe('購入者メールが取れないとき', () => {
  it('Customer からメールを取り直す（customer_creation=always の保険を実際に使う）', () => {
    expect(CHECKOUT).toMatch(/customer_creation: "always"/);
    expect(WEBHOOK).toMatch(/api\.stripe\.com\/v1\/customers\//);
  });

  it('**新規発行はメールが取れないと保留する**（誰も入れないアカウントを作らない）', () => {
    const hold = WEBHOOK.indexOf('if (!userId && !buyerEmail)');
    const create = WEBHOOK.indexOf('authAdmin("/admin/users"');
    expect(hold, '保留の分岐が無い').toBeGreaterThan(0);
    expect(hold, 'アカウント作成より前に保留すること').toBeLessThan(create);
    expect(WEBHOOK).toMatch(/kind: "provision_held_no_email"/);
    expect(WEBHOOK).toMatch(/severity: "critical"/);
  });

  it('既存アカウントの引き継ぎ購入は止めない（パスワードは既に本人が持っている）', () => {
    // 保留の条件は !userId（＝新規発行になる場合）だけ
    expect(WEBHOOK).toMatch(/if \(!userId && !buyerEmail\) \{/);
  });
});
