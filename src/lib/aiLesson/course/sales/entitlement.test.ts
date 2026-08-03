// 利用権台帳の受入テスト（§4 §11 §20）。

import { describe, it, expect } from 'vitest';
import {
  buildGrant, resolveEntitlement, emptyConsumption, isRepurchase, remainingDays,
  entitlementSummary, CARRIED_OVER_ON_REPURCHASE, RESET_ON_REPURCHASE,
  type EntitlementGrant, type EntitlementConsumption,
} from './entitlement';
import { salesPlanById } from './planConfig';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

const hourPass = salesPlanById('ai-hour-pass')!;
const month = salesPlanById('ai-month')!;

const grantFor = (planId: 'ai-hour-pass' | 'ai-month', purchaseId: string, atMs: number, existing: EntitlementGrant[] = []) => {
  const p = salesPlanById(planId)!;
  return buildGrant({
    learnerId: 'L1', planId, planVersion: p.version, purchaseId, nowMs: atMs,
    activeMinutes: p.includedActiveMinutes, validityDays: p.validityDays, durationDays: p.durationDays,
    voiceMinutesCap: p.cost.voiceMinutesCap, aiReportCap: p.cost.aiReportCap,
  }, existing);
};

describe('付与（§4-3 自動付与できる構造）', () => {
  // 期限の日数は planConfig から取る。ここに数字を直書きすると、
  // 方針を変えたときに「テストだけ古い」状態になる（30日→8日の変更で実際に起きた）
  it('60分パスは 3600 秒・台帳の期限つきで付与される', () => {
    const { grant } = grantFor('ai-hour-pass', 'pay_1', T0);
    expect(grant!.activeSeconds).toBe(3600);
    expect(grant!.expiresAtMs).toBe(T0 + hourPass.validityDays * DAY);
    expect(grant!.periodEndsAtMs).toBeNull();          // 期間契約ではない
    expect(grant!.status).toBe('active');
  });

  it('1か月プランは期間で付与される（時間制ではない）', () => {
    const { grant } = grantFor('ai-month', 'pay_2', T0);
    expect(grant!.activeSeconds).toBeNull();
    expect(grant!.periodEndsAtMs).toBe(T0 + 30 * DAY);
  });

  it('購入時の PlanConfig.version が記録される（後から条件を特定できる）', () => {
    const { grant } = grantFor('ai-hour-pass', 'pay_3', T0);
    expect(grant!.planVersion).toBe(hourPass.version);
  });

  it('同じ purchaseId では二重付与しない（Webhook再送・二重送信対策）', () => {
    const first = grantFor('ai-hour-pass', 'pay_dup', T0);
    const second = grantFor('ai-hour-pass', 'pay_dup', T0 + 1000, [first.grant!]);
    expect(second.duplicated).toBe(true);
    expect(second.grant).toBeNull();
  });

  it('音声とレポートの上限が grant に焼き付く（後からプランを変えても既存購入者の条件は動かない）', () => {
    const { grant } = grantFor('ai-hour-pass', 'pay_4', T0);
    expect(grant!.voiceSeconds).toBe(hourPass.cost.voiceMinutesCap * 60);
    expect(grant!.aiReports).toBe(hourPass.cost.aiReportCap);
  });
});

describe('解決（今できること）', () => {
  it('利用権が無ければアクセスできない', () => {
    const s = resolveEntitlement([], emptyConsumption(), T0);
    expect(s.hasAccess).toBe(false);
    expect(s.remainingActiveSeconds).toBe(0);
    expect(s.activePlanId).toBeNull();
  });

  it('60分パスを買うと、すぐ使える', () => {
    const g = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    const s = resolveEntitlement([g], emptyConsumption(), T0);
    expect(s.hasAccess).toBe(true);
    expect(s.remainingActiveSeconds).toBe(3600);
    expect(s.activePlanId).toBe('ai-hour-pass');
    expect(s.remainingVoiceSeconds).toBe(600);
  });

  it('使ったぶんだけ残りが減る', () => {
    const g = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    const used: EntitlementConsumption = { activeSeconds: 1200, voiceSeconds: 300, aiReports: 1 };
    const s = resolveEntitlement([g], used, T0);
    expect(s.remainingActiveSeconds).toBe(2400);
    expect(s.remainingVoiceSeconds).toBe(300);
    expect(s.remainingAiReports).toBe(hourPass.cost.aiReportCap - 1);
  });

  it('期限を過ぎた利用権は使えず、残っていた分は失効として見える', () => {
    const g = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    const s = resolveEntitlement([g], { activeSeconds: 600, voiceSeconds: 0, aiReports: 0 }, T0 + 31 * DAY);
    expect(s.hasAccess).toBe(false);
    expect(s.remainingActiveSeconds).toBe(0);
    expect(s.forfeitedActiveSeconds).toBe(3000);      // 使い切れなかった50分
  });

  it('返金した利用権は無効になる', () => {
    const g = { ...grantFor('ai-hour-pass', 'pay_1', T0).grant!, status: 'refunded' as const };
    const s = resolveEntitlement([g], emptyConsumption(), T0);
    expect(s.hasAccess).toBe(false);
  });

  it('1か月プランは残り日数で見える（残り時間の話を主役にしない）', () => {
    const g = grantFor('ai-month', 'pay_2', T0).grant!;
    const s = resolveEntitlement([g], emptyConsumption(), T0 + 10 * DAY);
    expect(s.hasAccess).toBe(true);
    expect(s.activePlanId).toBe('ai-month');
    expect(remainingDays(s, T0 + 10 * DAY)).toBe(20);
  });

  it('60分パスと1か月を両方持つときは、1か月を主プランにする', () => {
    const a = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    const b = grantFor('ai-month', 'pay_2', T0).grant!;
    const s = resolveEntitlement([a, b], emptyConsumption(), T0 + DAY);
    expect(s.activePlanId).toBe('ai-month');
    expect(s.remainingActiveSeconds).toBe(3600);      // 60分ぶんも残ってはいる
  });
});

describe('再購入（§11）', () => {
  it('60分を追加購入すると、残り時間が加算される', () => {
    const a = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    const used: EntitlementConsumption = { activeSeconds: 3600, voiceSeconds: 0, aiReports: 0 };
    expect(resolveEntitlement([a], used, T0 + DAY).remainingActiveSeconds).toBe(0);

    const b = grantFor('ai-hour-pass', 'pay_2', T0 + DAY, [a]).grant!;
    const s = resolveEntitlement([a, b], used, T0 + DAY);
    expect(s.remainingActiveSeconds).toBe(3600);      // 新しい枠がまるごと残る
    expect(s.hasAccess).toBe(true);
  });

  it('消費は期限の早い枠から引かれる（説明しやすい順序）', () => {
    const V = hourPass.validityDays;                            // 台帳の期限（日）
    const a = grantFor('ai-hour-pass', 'pay_1', T0).grant!;     // 期限 T0+V
    const b = grantFor('ai-hour-pass', 'pay_2', T0 + DAY, [a]).grant!;  // 期限 T0+1+V
    // 両方が生きている時点で30分使うと、古い枠から引かれている
    const s = resolveEntitlement([a, b], { activeSeconds: 1800, voiceSeconds: 0, aiReports: 0 }, T0 + 2 * DAY);
    expect(s.remainingActiveSeconds).toBe(3600 + 1800);

    // 古い枠が失効すると、その未使用分だけが失効し、新しい枠は丸ごと残る
    const after = resolveEntitlement([a, b], { activeSeconds: 1800, voiceSeconds: 0, aiReports: 0 }, T0 + (V + 0.5) * DAY);
    expect(after.remainingActiveSeconds).toBe(3600);
    expect(after.forfeitedActiveSeconds).toBe(1800);
  });

  it('再購入かどうかを判定できる（画面の言い方を変えるため）', () => {
    const a = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    expect(isRepurchase([a], 'ai-hour-pass')).toBe(false);
    const b = grantFor('ai-hour-pass', 'pay_2', T0 + DAY, [a]).grant!;
    expect(isRepurchase([a, b], 'ai-hour-pass')).toBe(true);
  });

  it('付与は append-only。既存の grant を書き換えない（進捗が消える経路を作らない）', () => {
    const a = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    const snapshot = JSON.stringify(a);
    grantFor('ai-hour-pass', 'pay_2', T0 + DAY, [a]);
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it('再購入でリセットされるものは1つも無い（§11「進捗を失わない」）', () => {
    expect(RESET_ON_REPURCHASE).toEqual([]);
    expect(CARRIED_OVER_ON_REPURCHASE).toContain('diagnosis_result');
    expect(CARRIED_OVER_ON_REPURCHASE).toContain('item_progress');
    expect(CARRIED_OVER_ON_REPURCHASE).toContain('review_schedule');
    expect(CARRIED_OVER_ON_REPURCHASE).toContain('adventure_map');
    expect(CARRIED_OVER_ON_REPURCHASE).toContain('learner_account');
  });
});

describe('60分→1か月の進捗引継ぎ（§12）', () => {
  it('1か月を買っても、60分で積んだ進捗の前提（learnerとgrant）は消えない', () => {
    const a = grantFor('ai-hour-pass', 'pay_1', T0).grant!;
    const b = grantFor('ai-month', 'pay_2', T0 + 5 * DAY, [a]).grant!;
    expect(b.learnerId).toBe(a.learnerId);            // 新しいアカウントを作らない
    const s = resolveEntitlement([a, b], { activeSeconds: 1200, voiceSeconds: 0, aiReports: 0 }, T0 + 6 * DAY);
    expect(s.activeGrantCount).toBe(2);
    expect(s.remainingActiveSeconds).toBe(2400);      // 60分の残りも消えない
  });
});

describe('自己解決のための説明文（§15「購入したのに使えない」）', () => {
  it('利用権が無いときは、何をすれば使えるかを言う', () => {
    const s = resolveEntitlement([], emptyConsumption(), T0);
    expect(entitlementSummary(s, T0, 'ja')).toContain('購入');
    expect(entitlementSummary(s, T0, 'zh')).toContain('购买');
  });

  it('期間制は残り日数、時間制は残り分数で答える', () => {
    const m = resolveEntitlement([grantFor('ai-month', 'p', T0).grant!], emptyConsumption(), T0 + 3 * DAY);
    expect(entitlementSummary(m, T0 + 3 * DAY, 'ja')).toBe('あと27日使えます');

    const h = resolveEntitlement([grantFor('ai-hour-pass', 'p2', T0).grant!], { activeSeconds: 600, voiceSeconds: 0, aiReports: 0 }, T0);
    expect(entitlementSummary(h, T0, 'ja')).toBe('あと50分使えます');
  });
});

describe('プラン設定との整合', () => {
  it('1か月プランの音声上限は60分パスより大きい（上位プランで狭くならない）', () => {
    expect(month.cost.voiceMinutesCap).toBeGreaterThan(hourPass.cost.voiceMinutesCap);
  });
});
