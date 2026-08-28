// 体験（600円）のライフサイクル（2026-08-26 CEO指示 Phase S2）。
//
// 60分の実時間制 → 開始から7日間へ移した。目的は1つだけ:
// **会話 → フィードバック → 復習予定 → 翌日の復習 → 定着確認 を一周できるようにする。**
// 60分ではこの一周が構造上できず、実測でも唯一の体験購入者は
// 4個が復習予定に入って1個も受け取れていない。
//
// ここで固定するのは「7日という数字」ではなく、
//   ① 一周できる形になっていること（日数制・翌日が来る）
//   ② 旧仕様の受講権を壊していないこと
//   ③ AI原価が方針の上限を超えないこと
// の3つ。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { trialShapeOf, isTrialAccess, reviewUnreachable, type CourseAccessRow } from './courseAccess';
import { planById } from './plans/planCatalog';
import { planEconomics, aiBudgetFor } from './plans/planAiBudget';

const row = (o: Partial<CourseAccessRow>): CourseAccessRow => ({
  validFromISO: '2026-08-26T00:00:00Z',
  validUntilISO: '2026-09-25T00:00:00Z',
  note: null, ...o,
});

describe('体験の形の判定', () => {
  it('日数制の行は days', () => {
    expect(trialShapeOf(row({ trialDays: 7 }))).toEqual({ kind: 'days', days: 7 });
  });

  it('旧仕様（実時間制）の行は minutes のまま動く', () => {
    expect(trialShapeOf(row({ trialWindowMinutes: 60 }))).toEqual({ kind: 'minutes', minutes: 60 });
  });

  it('両方入っている行は日数制を優先する（移行中の行で60分に落とさない）', () => {
    expect(trialShapeOf(row({ trialDays: 7, trialWindowMinutes: 60 })))
      .toEqual({ kind: 'days', days: 7 });
  });

  it('体験でない受講権は none', () => {
    expect(trialShapeOf(row({}))).toEqual({ kind: 'none' });
    expect(trialShapeOf(null)).toEqual({ kind: 'none' });
    expect(isTrialAccess(row({}))).toBe(false);
  });

  it('どちらの体験も「体験である」ことは変わらない', () => {
    expect(isTrialAccess(row({ trialDays: 7 }))).toBe(true);
    expect(isTrialAccess(row({ trialWindowMinutes: 60 }))).toBe(true);
  });
});

describe('翌日の復習が届くか', () => {
  it('日数制では届く（＝復習日を隠さない）', () => {
    expect(reviewUnreachable(row({ trialDays: 7 }))).toBe(false);
  });

  it('実時間制では届かない（＝復習日を約束しない）', () => {
    expect(reviewUnreachable(row({ trialWindowMinutes: 60 }))).toBe(true);
  });

  it('通常プランでは当然届く', () => {
    expect(reviewUnreachable(row({}))).toBe(false);
  });
});

describe('学習サイクルを一周できる形になっている', () => {
  const trial = planById('ai-trial-pass')!;
  const budget = aiBudgetFor('ai-trial-pass');

  it('体験の期間が1日より長い（翌日が来る）', () => {
    expect(trial.trialDays ?? 0).toBeGreaterThan(1);
  });

  it('音声会話を初日に使い切れない配分になっている', () => {
    // 1日の上限 < 合計。これが崩れると初日で終わり、翌日の復習に出会えない
    expect(budget.voiceSessionsPerDay).toBeLessThan(budget.voiceSessionsTotal);
  });

  it('音声会話が2回以上ある（1回だと「復習で使い切る」か「初回だけ」になる）', () => {
    expect(budget.voiceSessionsTotal).toBeGreaterThanOrEqual(2);
  });
});

describe('AI原価が方針の上限を超えない', () => {
  it('体験パスが上限内（日数を伸ばすとテキスト会話ぶんが伸びる）', () => {
    const e = planEconomics('ai-trial-pass');
    const cap = aiBudgetFor('ai-trial-pass').maxAiCostRatio;
    expect(e.costRatio).not.toBeNull();
    expect(e.costRatio!).toBeLessThanOrEqual(cap);
  });

  it('原価の計算に、開始期限（30日）ではなく体験日数を使っている', () => {
    // ここを取り違えると原価率87%と出て、実際には起こりえない赤字で商品を殺す
    const e = planEconomics('ai-trial-pass');
    expect(e.breakdown.days).toBe(planById('ai-trial-pass')!.trialDays);
    expect(e.breakdown.days).not.toBe(planById('ai-trial-pass')!.accessDays);
  });

  it('音声の原価は日数に依存しない（合計回数で頭打ち）', () => {
    const e = planEconomics('ai-trial-pass');
    const b = aiBudgetFor('ai-trial-pass');
    // 音声＝合計回数 × 1回の最長。日数が増えても変わらない
    expect(e.breakdown.voiceUsd).toBeCloseTo(b.voiceSessionsTotal * 4 * 0.1344, 3);
  });
});

describe('サーバー側（migration）と食い違わない', () => {
  const SQL = readFileSync('supabase/migrations/20260826150000_ai_trial_seven_days.sql', 'utf8');

  it('開始RPCが日数を優先し、旧仕様にフォールバックする', () => {
    expect(SQL).toMatch(/when v_row\.trial_days is not null then now\(\) \+ make_interval\(days => v_row\.trial_days\)/);
    expect(SQL).toMatch(/else now\(\) \+ make_interval\(mins => v_row\.trial_window_minutes\)/);
  });

  it('開始済みの行には触らない（連打・リロードで期間が縮まない）', () => {
    expect(SQL).toMatch(/if v_row\.trial_started_at is not null then[\s\S]{0,200}already_started/);
  });

  it('列の追加だけで、既存の列を落としていない', () => {
    expect(SQL).toContain('add column if not exists trial_days');
    expect(SQL).not.toMatch(/drop\s+column/i);
    expect(SQL).not.toMatch(/drop\s+table/i);
  });

  it('rollback が用意されている', () => {
    const rb = readFileSync('supabase/migrations/20260826150000_ai_trial_seven_days.rollback.sql', 'utf8');
    expect(rb).toContain('create or replace function public.ai_start_trial');
    // 期間を戻せない人がいるので、列は落とさない方針を明記していること
    expect(rb).toContain('trial_days 列は**落とさない**');
  });
});
