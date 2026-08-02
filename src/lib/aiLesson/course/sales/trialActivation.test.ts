import { describe, it, expect } from 'vitest';
import {
  createTrialGrant, activateTrial, resolveTrial, pickCurrentTrialGrant, trialStartPreview,
  type TrialGrant,
} from './trialActivation';
import { salesPlanById } from './planConfig';

const plan = salesPlanById('ai-hour-pass')!;
const HOUR = 3_600_000;
const DAY = 86_400_000;
// 2026-08-03 21:30 JST 相当。依頼書の例（21:30開始→翌21:30まで）をそのまま使う
const T_BUY = Date.UTC(2026, 7, 3, 12, 30);

const buy = (atMs = T_BUY): TrialGrant =>
  createTrialGrant({ id: 'g1', learnerId: 'u1', purchaseId: 'p1', plan, purchasedAtMs: atMs });

describe('購入直後は時間が減らない（§4）', () => {
  it('購入した時点では unstarted で、60分がまるごと残っている', () => {
    const r = resolveTrial(buy(), 0, T_BUY + 1000);
    expect(r.state).toBe('unstarted');
    expect(r.remainingActiveSeconds).toBe(3600);
    expect(r.canConsumeContent, '開始前に教材を取れてはいけない').toBe(false);
  });

  it('開始しないまま何日経っても、残り時間は減らない', () => {
    const r = resolveTrial(buy(), 0, T_BUY + 6 * DAY);
    expect(r.state).toBe('unstarted');
    expect(r.remainingActiveSeconds).toBe(3600);
  });

  it('開始期限（購入から7日）を過ぎると start_lapsed', () => {
    const r = resolveTrial(buy(), 0, T_BUY + 7 * DAY + 1);
    expect(r.state).toBe('start_lapsed');
    expect(r.canConsumeContent).toBe(false);
  });
});

describe('開始すると、そこから丸24時間（§4）', () => {
  it('21:30に開始したら翌日21:30まで。その日の終わりではない', () => {
    const res = activateTrial(buy(), plan, T_BUY);
    expect(res.ok).toBe(true);
    expect(res.grant!.activation!.activatedAtMs).toBe(T_BUY);
    expect(res.grant!.activation!.expiresAtMs).toBe(T_BUY + 24 * HOUR);
    // 「その日の23:59まで」だと期限が 12 時間近く短くなる。そうなっていないこと
    const endOfDay = Date.UTC(2026, 7, 3, 23, 59, 59);
    expect(res.grant!.activation!.expiresAtMs).toBeGreaterThan(endOfDay);
  });

  it('開始期限を過ぎてからは開始できない', () => {
    const res = activateTrial(buy(), plan, T_BUY + 7 * DAY + 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('start_deadline_passed');
  });

  it('2回目の開始は拒否する（24時間を押し直せない）', () => {
    const started = activateTrial(buy(), plan, T_BUY).grant!;
    const again = activateTrial(started, plan, T_BUY + 10 * HOUR);
    expect(again.ok).toBe(false);
    expect(again.error).toBe('already_activated');
    // 元の期限が動いていないこと
    expect(started.activation!.expiresAtMs).toBe(T_BUY + 24 * HOUR);
  });
});

describe('24時間以内なら分けて使える（§4）', () => {
  const started = () => activateTrial(buy(), plan, T_BUY).grant!;

  it('少し使っても active のまま、残りが減る', () => {
    const r = resolveTrial(started(), 480, T_BUY + 2 * HOUR);
    expect(r.state).toBe('active');
    expect(r.remainingActiveSeconds).toBe(3120); // 60分 - 8分
    expect(r.canConsumeContent).toBe(true);
  });

  it('間を空けて何度でも再開できる（23時間後でもまだ使える）', () => {
    const r = resolveTrial(started(), 1800, T_BUY + 23 * HOUR);
    expect(r.state).toBe('active');
    expect(r.remainingActiveSeconds).toBe(1800);
  });

  it('3600秒使い切ると consumed', () => {
    const r = resolveTrial(started(), 3600, T_BUY + 3 * HOUR);
    expect(r.state).toBe('consumed');
    expect(r.remainingActiveSeconds).toBe(0);
    expect(r.canConsumeContent).toBe(false);
  });

  it('24時間ちょうどで expired（残り時間があっても使えない）', () => {
    const r = resolveTrial(started(), 600, T_BUY + 24 * HOUR);
    expect(r.state).toBe('expired');
    expect(r.remainingActiveSeconds).toBe(0);
    expect(r.canConsumeContent).toBe(false);
  });

  it('残り0かつ期限切れは expired と呼ぶ（consumed ではない）', () => {
    // consumed と呼ぶと「追加購入すれば続けられる」と誤解させる。
    // 実際には期限も切れているので、追加しても同じ枠では続けられない
    const r = resolveTrial(started(), 3600, T_BUY + 25 * HOUR);
    expect(r.state).toBe('expired');
  });
});

describe('再購入（§5 §11）', () => {
  const g1 = () => activateTrial(buy(), plan, T_BUY).grant!;
  const g2 = (purchasedAtMs: number): TrialGrant =>
    createTrialGrant({ id: 'g2', learnerId: 'u1', purchaseId: 'p2', plan, purchasedAtMs });

  it('使い切った後に買い足すと、新しい枠が未開始で待つ', () => {
    const now = T_BUY + 5 * HOUR;
    const picked = pickCurrentTrialGrant([g1(), g2(now)], 3600, now)!;
    expect(picked.grant.id).toBe('g2');
    expect(picked.resolution.state).toBe('unstarted');
    expect(picked.resolution.remainingActiveSeconds).toBe(3600);
  });

  it('新しい枠を開始するまで、24時間は始まらない', () => {
    const now = T_BUY + 5 * HOUR;
    const picked = pickCurrentTrialGrant([g1(), g2(now)], 3600, now)!;
    expect(picked.resolution.msUntilExpiry).toBeNull();
    expect(picked.resolution.canConsumeContent).toBe(false);
  });

  it('まだ使える枠があるときは、そちらを優先する（新しい枠を無駄に開始させない）', () => {
    const now = T_BUY + 2 * HOUR;
    const picked = pickCurrentTrialGrant([g1(), g2(now)], 600, now)!;
    expect(picked.grant.id).toBe('g1');
    expect(picked.resolution.state).toBe('active');
  });

  it('未開始が2つあるときは、開始期限が近いほうから使う', () => {
    const later = g2(T_BUY + 3 * DAY);
    const earlier = createTrialGrant({
      id: 'g0', learnerId: 'u1', purchaseId: 'p0', plan, purchasedAtMs: T_BUY,
    });
    const picked = pickCurrentTrialGrant([later, earlier], 0, T_BUY + 3 * DAY)!;
    expect(picked.grant.id, '寝かせている枠が黙って失効しないように').toBe('g0');
  });
});

describe('開始前の確認画面に出す値（§4）', () => {
  it('購入日・開始期限・有効時間・累計時間・自動更新なし がそろう', () => {
    const p = trialStartPreview(buy(), plan, T_BUY + HOUR);
    expect(p.purchasedAtMs).toBe(T_BUY);
    expect(p.startDeadlineMs).toBe(T_BUY + 7 * DAY);
    expect(p.validityHours).toBe(24);
    expect(p.includedActiveSeconds).toBe(3600);
    expect(p.autoRenew).toBe(false);
    expect(p.canActivate).toBe(true);
  });

  it('開始期限を過ぎたら開始ボタンを出さない', () => {
    expect(trialStartPreview(buy(), plan, T_BUY + 8 * DAY).canActivate).toBe(false);
  });
});

describe('PlanConfig から読む（§17 別々の値を持たない）', () => {
  it('表示用の分と、正準の秒が食い違わない', () => {
    expect(plan.includedActiveSeconds).toBe((plan.includedActiveMinutes ?? 0) * 60);
  });

  it('時間制でないプランに開始モデルを作らせない', () => {
    const month = salesPlanById('ai-month')!;
    expect(() => createTrialGrant({
      id: 'x', learnerId: 'u1', purchaseId: 'p', plan: month, purchasedAtMs: T_BUY,
    })).toThrow();
  });
});
