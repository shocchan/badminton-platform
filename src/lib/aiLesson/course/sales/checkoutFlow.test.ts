// 自動販売Journey の受入テスト（§14 §20）。
//
// ここで実証するのは1点に尽きる。
//   **人が一度も介在せずに、決済 → 利用権付与 → 学習開始 まで到達すること。**
// あわせて、そこに開く穴（金額の改ざん・二重付与・失敗時の付与）が塞がっていること。

import { describe, it, expect } from 'vitest';
import {
  startCheckout, completeCheckout, onboardingStepsFor, purchaseCompleteMessage,
  isPlausibleEmail, ONBOARDING_STEPS,
  type SalesRepository, type PurchaseRecord, type CheckoutDeps,
} from './checkoutFlow';
import { SimulatedTestGateway, estimatedFee, failureMessage, SIMULATED_TEST_CARDS } from './paymentGateway';
import { resolveEntitlement, emptyConsumption, type EntitlementGrant } from './entitlement';
import { salesPlanById } from './planConfig';

const T0 = 1_700_000_000_000;

/** テスト用の永続化。Supabase 実装と同じ interface を満たす */
class MemoryRepo implements SalesRepository {
  purchases = new Map<string, PurchaseRecord>();
  grants: EntitlementGrant[] = [];
  learners = new Map<string, string>();   // email -> learnerId
  createdLearners = 0;

  async findPurchase(orderId: string) { return this.purchases.get(orderId) ?? null; }
  async savePurchase(r: PurchaseRecord) { this.purchases.set(r.orderId, { ...r }); }
  async listGrants(learnerId: string) { return this.grants.filter((g) => g.learnerId === learnerId); }
  async insertGrant(g: EntitlementGrant) { this.grants.push(g); }
  async findLearnerIdByEmail(email: string) { return this.learners.get(email) ?? null; }
  async createLearner(email: string) {
    this.createdLearners += 1;
    const id = `learner_${this.createdLearners}`;
    this.learners.set(email, id);
    return id;
  }
}

const makeDeps = (card?: string, repo = new MemoryRepo()): CheckoutDeps & { repo: MemoryRepo } => ({
  repo,
  gateway: new SimulatedTestGateway({ cardNumber: card }),
  now: () => T0,
  newOrderId: () => 'ord_test_1',
});

const buy = async (
  planId: string,
  deps: CheckoutDeps,
  over: Partial<{ email: string; orderId: string; forcePriceConfirmed: boolean }> = {},
) => {
  // 価格が未確定のプランを「確定した後」の想定で通すための一時差し替え。
  // 実データは書き換えたままにしない
  const plan = salesPlanById(planId) as { priceStatus: 'confirmed' | 'draft' } | null;
  const original = plan?.priceStatus;
  if (over.forcePriceConfirmed && plan) plan.priceStatus = 'confirmed';
  try {
    const started = await startCheckout({
      planId, email: over.email ?? 'learner@example.com', lang: 'ja',
      termsVersion: '2026-08-02', orderId: over.orderId,
    }, deps);
    if (!started.ok) return { started, completed: null };
    const completed = await completeCheckout(started.purchase!.orderId, deps);
    return { started, completed };
  } finally {
    if (plan && original) plan.priceStatus = original;
  }
};

describe('相談なしで購入から利用開始まで到達する（§20 完了条件2・3）', () => {
  it('60分パス: test決済が成功すると、その場で利用権が付く', async () => {
    const deps = makeDeps();
    const { started, completed } = await buy('ai-hour-pass', deps);

    expect(started.ok).toBe(true);
    expect(started.purchase!.amount).toBe(salesPlanById('ai-hour-pass')!.priceAmount);
    expect(completed!.outcome).toBe('granted');
    expect(completed!.grant!.activeSeconds).toBe(3600);

    // 実際に「使える」状態になっているか（利用権の解決まで通す）
    const snapshot = resolveEntitlement(deps.repo.grants, emptyConsumption(), T0);
    expect(snapshot.hasAccess).toBe(true);
    expect(snapshot.remainingActiveSeconds).toBe(3600);
  });

  it('1か月プランは価格がCEO未確定なので、いま決済に進めない', async () => {
    // 2026-08-02 CEO指示。候補値のまま課金しない。
    // 画面だけでなく決済開始の関数そのものが止めることを確認する
    const deps = makeDeps();
    const started = await startCheckout(
      { planId: 'ai-month', email: 'a@example.com', lang: 'ja', termsVersion: '2026-08-02' },
      deps,
    );
    expect(started.ok).toBe(false);
    expect(started.error).toBe('price_not_confirmed');
    expect(deps.repo.purchases.size, '注文レコードすら作らない').toBe(0);
  });

  it('価格が確定すれば、1か月プランも同じ流れで自動付与される', async () => {
    // 価格確定後に自動付与まで通ることは、今のうちに固定しておく。
    // ここが壊れたまま値段だけ決まる、という順序を避けるため
    const deps = makeDeps();
    const { completed } = await buy('ai-month', deps, { forcePriceConfirmed: true });
    expect(completed!.outcome).toBe('granted');
    const snapshot = resolveEntitlement(deps.repo.grants, emptyConsumption(), T0);
    expect(snapshot.activePlanId).toBe('ai-month');
    expect(snapshot.periodEndsAtMs).toBe(T0 + 30 * 86_400_000);
  });

  it('人の操作を1つも挟まない（管理者の承認・招待コードの発行が経路に無い）', async () => {
    const deps = makeDeps();
    const { completed } = await buy('ai-hour-pass', deps);
    // 付与に必要だったのは決済確認だけ。手動フラグの類は存在しない
    expect(completed!.outcome).toBe('granted');
    expect(Object.keys(completed!.grant!)).not.toContain('approvedBy');
    expect(deps.repo.purchases.get('ord_test_1')!.status).toBe('granted');
  });

  it('初回購入者にはアカウントが自動で作られる', async () => {
    const deps = makeDeps();
    const { completed } = await buy('ai-hour-pass', deps);
    expect(completed!.learnerCreated).toBe(true);
    expect(deps.repo.createdLearners).toBe(1);
  });

  it('6か月伴走はこの経路に入れない（相談導線で受ける・§1 §14）', async () => {
    const deps = makeDeps();
    const started = await startCheckout({
      planId: 'coach-6m', email: 'a@example.com', lang: 'ja', termsVersion: 'v1',
    }, deps);
    expect(started.ok).toBe(false);
    expect(started.error).toBe('consultation_only');
    expect(deps.repo.grants).toEqual([]);
  });
});

describe('金額の権威はサーバー（PlanConfig）にある', () => {
  it('注文額は PlanConfig から決まり、入力で上書きできない', async () => {
    const deps = makeDeps();
    // StartCheckoutInput に amount を渡す口が無い
    const started = await startCheckout({
      planId: 'ai-hour-pass', email: 'a@example.com', lang: 'ja', termsVersion: 'v1',
    }, deps);
    expect(started.purchase!.amount).toBe(600 * 1);   // PlanConfig の値と一致
    expect(started.purchase!.amount).toBe(salesPlanById('ai-hour-pass')!.priceAmount);
  });

  it('支払額が注文額と違えば利用権を付けない', async () => {
    const repo = new MemoryRepo();
    const deps = makeDeps(undefined, repo);
    const started = await startCheckout({
      planId: 'ai-hour-pass', email: 'a@example.com', lang: 'ja', termsVersion: 'v1',
    }, deps);
    // 注文額だけを後から吊り上げる＝ゲートウェイの支払額と食い違う状況を作る
    await repo.savePurchase({ ...started.purchase!, amount: 99_999 });

    const completed = await completeCheckout(started.purchase!.orderId, deps);
    expect(completed.outcome).toBe('amount_mismatch');
    expect(repo.grants).toEqual([]);
    expect(repo.purchases.get(started.purchase!.orderId)!.status).toBe('failed');
  });
});

describe('二重付与を作らない（§14 決済Webhookの再送・画面の再読込）', () => {
  it('完了処理を何度呼んでも利用権は1つだけ', async () => {
    const deps = makeDeps();
    await buy('ai-hour-pass', deps);
    for (let i = 0; i < 5; i++) {
      const again = await completeCheckout('ord_test_1', deps);
      expect(again.outcome).toBe('already_granted');
    }
    expect(deps.repo.grants.length).toBe(1);
    expect(resolveEntitlement(deps.repo.grants, emptyConsumption(), T0).remainingActiveSeconds).toBe(3600);
  });

  it('同じ注文IDで開始し直しても、決済セッションが増えない', async () => {
    const deps = makeDeps();
    const a = await startCheckout({ planId: 'ai-hour-pass', email: 'a@example.com', lang: 'ja', termsVersion: 'v1', orderId: 'ord_same' }, deps);
    const b = await startCheckout({ planId: 'ai-hour-pass', email: 'a@example.com', lang: 'ja', termsVersion: 'v1', orderId: 'ord_same' }, deps);
    expect(b.purchase!.reference).toBe(a.purchase!.reference);
    expect(deps.repo.purchases.size).toBe(1);
  });

  it('再購入では新しいアカウントを作らない（§11）', async () => {
    const repo = new MemoryRepo();
    await buy('ai-hour-pass', makeDeps(undefined, repo), { orderId: 'ord_1' });
    const second = makeDeps(undefined, repo);
    const { completed } = await buy('ai-hour-pass', second, { orderId: 'ord_2' });

    expect(completed!.learnerCreated).toBe(false);
    expect(repo.createdLearners).toBe(1);
    expect(repo.grants.length).toBe(2);
    // 残り時間は加算される
    expect(resolveEntitlement(repo.grants, emptyConsumption(), T0).remainingActiveSeconds).toBe(7200);
  });
});

describe('支払いが通らなかったとき', () => {
  it('カードが拒否されたら利用権は付かない', async () => {
    const deps = makeDeps('4000000000000002');
    const { completed } = await buy('ai-hour-pass', deps);
    expect(completed!.outcome).toBe('payment_failed');
    expect(completed!.failureCode).toBe('card_declined');
    expect(deps.repo.grants).toEqual([]);
    expect(resolveEntitlement(deps.repo.grants, emptyConsumption(), T0).hasAccess).toBe(false);
  });

  it('結果が出ていない間は、付与も失敗扱いもしない', async () => {
    const deps = makeDeps('4000000000000010');
    const { completed } = await buy('ai-hour-pass', deps);
    expect(completed!.outcome).toBe('pending');
    expect(deps.repo.grants).toEqual([]);
    // 注文は生きたまま（あとで確認できる）
    expect(deps.repo.purchases.get('ord_test_1')!.status).toBe('created');
  });

  it('失敗理由は、次に何をすればよいか分かる文言になる（生の英語を見せない）', () => {
    for (const code of ['card_declined', 'insufficient_funds', 'expired_card', 'processing_error', 'authentication_required'] as const) {
      for (const lang of ['ja', 'zh'] as const) {
        const msg = failureMessage(code, lang);
        expect(msg.length).toBeGreaterThan(5);
        expect(/[a-z_]{6,}/.test(msg), `${code}/${lang} に生のコードが混じる`).toBe(false);
      }
    }
    expect(failureMessage(undefined, 'ja')).toContain('もう一度');
  });

  it('失敗のあとで、同じ注文IDのままやり直せる', async () => {
    const repo = new MemoryRepo();
    const failing = makeDeps('4000000000000002', repo);
    await buy('ai-hour-pass', failing, { orderId: 'ord_retry' });
    expect(repo.grants).toEqual([]);

    const succeeding = makeDeps('4242424242424242', repo);
    const { completed } = await buy('ai-hour-pass', succeeding, { orderId: 'ord_retry' });
    expect(completed!.outcome).toBe('granted');
    expect(repo.grants.length).toBe(1);
  });
});

describe('入力の検証（最小入力・§14）', () => {
  it('メールの形式だけを見る（氏名・住所は取らない）', () => {
    expect(isPlausibleEmail('a@b.co')).toBe(true);
    expect(isPlausibleEmail('学習者@例え.jp')).toBe(true);
    expect(isPlausibleEmail('a@b')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
  });

  it('メールが不正なら決済へ進まない', async () => {
    const deps = makeDeps();
    const r = await startCheckout({ planId: 'ai-hour-pass', email: 'not-an-email', lang: 'ja', termsVersion: 'v1' }, deps);
    expect(r.error).toBe('invalid_email');
    expect(deps.repo.purchases.size).toBe(0);
  });

  it('規約の同意が無ければ決済へ進まない', async () => {
    const deps = makeDeps();
    const r = await startCheckout({ planId: 'ai-hour-pass', email: 'a@example.com', lang: 'ja', termsVersion: '' }, deps);
    expect(r.error).toBe('terms_not_accepted');
  });

  it('存在しない・非公開のプランは買えない', async () => {
    const deps = makeDeps();
    expect((await startCheckout({ planId: 'nope', email: 'a@example.com', lang: 'ja', termsVersion: 'v1' }, deps)).error)
      .toBe('unknown_plan');
  });

  it('注文には同意した規約バージョンが残る（あとから条件を特定できる）', async () => {
    const deps = makeDeps();
    const r = await startCheckout({ planId: 'ai-hour-pass', email: 'a@example.com', lang: 'ja', termsVersion: '2026-08-02' }, deps);
    expect(r.purchase!.termsVersion).toBe('2026-08-02');
    expect(r.purchase!.planVersion).toBe(salesPlanById('ai-hour-pass')!.version);
  });
});

describe('購入後オンボーディング（§7 §14）', () => {
  it('初回は 目的 → 現在地 → 今日の時間 → 開始 の順', () => {
    expect(onboardingStepsFor({ returningLearner: false }).map((s) => s.id))
      .toEqual(['choose_goal', 'quick_placement', 'choose_minutes', 'start_learning']);
  });

  it('再購入者に診断をやり直させない（§11）', () => {
    expect(onboardingStepsFor({ returningLearner: true }).map((s) => s.id))
      .toEqual(['choose_minutes', 'start_learning']);
  });

  it('手順に「教材一覧を見る」が無い（§7 権利は情報の取得ではなく学習の前進）', () => {
    const text = ONBOARDING_STEPS.flatMap((s) => [s.titleJa, s.bodyJa, s.titleZh, s.bodyZh]).join('\n');
    for (const w of ['一覧', '全部', 'ダウンロード', '题库', '下载']) {
      expect(text.includes(w), `オンボーディングに「${w}」`).toBe(false);
    }
  });

  it('購入直後の文言に売り込みを入れない（§12）', () => {
    const plan = salesPlanById('ai-hour-pass')!;
    for (const lang of ['ja', 'zh'] as const) {
      for (const returning of [true, false]) {
        const msg = purchaseCompleteMessage(plan, returning, lang);
        for (const w of ['1か月', '1个月', 'アップグレード', '升级', 'お得', '优惠']) {
          expect(msg.includes(w), `${lang}/${returning} に売り込み「${w}」`).toBe(false);
        }
      }
    }
  });

  it('再購入者には「続きから」と伝える', () => {
    const plan = salesPlanById('ai-hour-pass')!;
    expect(purchaseCompleteMessage(plan, true, 'ja')).toContain('前回の続き');
    expect(purchaseCompleteMessage(plan, true, 'zh')).toContain('上次');
  });
});

describe('採算に使う数字が購入記録に残る（§16）', () => {
  it('支払額と手数料見込みが記録される', async () => {
    const deps = makeDeps();
    const { completed } = await buy('ai-hour-pass', deps);
    const rec = completed!.purchase!;
    expect(rec.paidAmount).toBe(600 * 1);
    expect(rec.feeAmount).toBe(estimatedFee(rec.amount));
    expect(rec.feeAmount).toBeGreaterThan(0);
  });
});

describe('模擬ゲートウェイ', () => {
  it('本物のカード番号を扱わない（テスト番号だけを解釈する）', () => {
    // 未知の番号は必ず拒否側に倒れる＝「たまたま通る」ことがない
    expect(Object.keys(SIMULATED_TEST_CARDS).every((n) => n.startsWith('4'))).toBe(true);
    expect(SIMULATED_TEST_CARDS['4242424242424242']).toBe('succeeded');
  });

  it('未知のカードは拒否される', async () => {
    const deps = makeDeps('5555555555554444');
    const { completed } = await buy('ai-hour-pass', deps);
    expect(completed!.outcome).toBe('payment_failed');
  });
});
