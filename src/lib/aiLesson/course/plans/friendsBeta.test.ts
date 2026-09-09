import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FRIENDS_BETA_BUDGET, FRIENDS_BETA_PLAN_ID, FRIENDS_BETA_DAYS, FRIENDS_BETA_SOURCE,
  voiceUsdPerSession, toJpy, estimateCost, estimateScenarios, SCENARIOS,
  seatsAffordable, guardLevel, GUARD_MESSAGE, OBSERVED,
} from './friendsBeta';
import { VOICE_USD_PER_MINUTE, TEXT_USD_PER_SESSION, JPY_PER_USD } from './planAiBudget';

const BUDGET = 10_000;
const PEOPLE = 100;

describe('原価の単位（推定であることを崩さない）', () => {
  it('音声1回（4分）は、テキスト1回よりはるかに高い＝削る場所は音声しかない', () => {
    expect(voiceUsdPerSession()).toBeGreaterThan(TEXT_USD_PER_SESSION * 30);
  });

  it('音声は¥80台/回、テキストは¥2程度（数字が動いたら気づく）', () => {
    expect(toJpy(voiceUsdPerSession())).toBeGreaterThanOrEqual(75);
    expect(toJpy(voiceUsdPerSession())).toBeLessThanOrEqual(95);
    expect(toJpy(TEXT_USD_PER_SESSION)).toBeLessThanOrEqual(5);
  });

  it('円換算は固定レート（実レートで計算して円安の月に黙って赤字にしない）', () => {
    expect(JPY_PER_USD).toBe(155);
    expect(toJpy(1)).toBe(155);
  });
});

describe('Friends Beta の枠', () => {
  it('音声は総枠3回・1日1回。1日で使い切らせない（翌日の復習に出会わせる）', () => {
    expect(FRIENDS_BETA_BUDGET.voiceSessionsTotal).toBe(3);
    expect(FRIENDS_BETA_BUDGET.voiceSessionsPerDay).toBe(1);
    expect(FRIENDS_BETA_BUDGET.voiceSessionsPerDay)
      .toBeLessThan(FRIENDS_BETA_BUDGET.voiceSessionsTotal);
  });

  it('会話→feedback→翌日復習→定着 を一周できる最低限は残す（音声0回にしない）', () => {
    expect(FRIENDS_BETA_BUDGET.voiceSessionsTotal).toBeGreaterThanOrEqual(1);
    expect(FRIENDS_BETA_BUDGET.textSessionsPerDay).toBeGreaterThanOrEqual(1);
  });

  it('migration が ai_config へ入れる値と一致している（片方だけ直す事故を止める）', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260909120000_ai_friends_beta.sql'), 'utf8',
    );
    expect(sql).toContain(`'voiceSessionsTotal', ${FRIENDS_BETA_BUDGET.voiceSessionsTotal}`);
    expect(sql).toContain(`'voiceSessionsPerDay', ${FRIENDS_BETA_BUDGET.voiceSessionsPerDay}`);
    expect(sql).toContain(`'textSessionsPerDay', ${FRIENDS_BETA_BUDGET.textSessionsPerDay}`);
    expect(sql).toContain(`'${FRIENDS_BETA_PLAN_ID}'`);
    expect(sql).toContain(`'days', ${FRIENDS_BETA_DAYS}`);
    expect(sql).toContain(`'budgetJpy', ${BUDGET}`);
    expect(sql).toContain(FRIENDS_BETA_SOURCE);
  });

  it('カタログ商品としては足さない（LP・法務・価格テストに波及させない）', () => {
    const catalog = readFileSync(
      join(process.cwd(), 'src/lib/aiLesson/course/plans/planCatalog.ts'), 'utf8',
    );
    expect(catalog.includes(FRIENDS_BETA_PLAN_ID)).toBe(false);
  });
});

describe('100人 / ¥10,000 は成り立つか', () => {
  const rows = estimateScenarios(PEOPLE, BUDGET);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

  it('低め・見込みは予算内に収まる', () => {
    expect(byKey.low.estimate.withinBudget).toBe(true);
    expect(byKey.expected.estimate.withinBudget).toBe(true);
  });

  it('高め（全員が枠を使い切る）は予算を超える＝cost guard が必要', () => {
    // ここが true になったら、それは枠が小さすぎて商品として成立していない側の疑い
    expect(byKey.high.estimate.withinBudget).toBe(false);
    expect(byKey.high.estimate.ratioToBudget).toBeGreaterThan(1);
  });

  it('見込みは1人あたり¥100前後（¥10,000 ÷ 100人）に収まる', () => {
    expect(byKey.expected.estimate.jpyPerInvited).toBeLessThanOrEqual(100);
    // 0円になっていたら仮定が壊れている（無料に見えて実は計算していない、を防ぐ）
    expect(byKey.expected.estimate.jpyPerInvited).toBeGreaterThan(20);
  });

  it('見込みの仮定は実測に基づく（起動率は実測値そのもの）', () => {
    expect(SCENARIOS.find((s) => s.key === 'expected')!.assumption.activationRate)
      .toBeCloseTo(OBSERVED.activationRate, 6);
  });

  it('シナリオはすべて根拠の文を持つ（数字だけ置かない）', () => {
    for (const s of SCENARIOS) {
      expect(s.basisJa.length).toBeGreaterThan(15);
    }
  });
});

describe('estimateCost', () => {
  it('安全率を掛けている（素の掛け算より必ず大きい）', () => {
    const a = { activationRate: 1, voiceSessionsPerActive: 1, voiceMinutesPerSession: 1, textSessionsPerActive: 0 };
    const e = estimateCost(a, 1, BUDGET);
    expect(e.usdPerInvited).toBeGreaterThan(VOICE_USD_PER_MINUTE);
  });

  it('人数に比例する', () => {
    const a = SCENARIOS[1].assumption;
    const one = estimateCost(a, 1, BUDGET).usdTotal;
    const hundred = estimateCost(a, 100, BUDGET).usdTotal;
    expect(hundred).toBeCloseTo(one * 100, 6);
  });

  it('予算0でも落ちない', () => {
    expect(() => estimateCost(SCENARIOS[0].assumption, 10, 0)).not.toThrow();
  });
});

describe('seatsAffordable', () => {
  it('使った分だけ招待できる席が減る', () => {
    const full = seatsAffordable(0, BUDGET);
    const half = seatsAffordable(BUDGET / 2, BUDGET);
    expect(full).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });

  it('使い切ったら0（マイナスにしない）', () => {
    expect(seatsAffordable(BUDGET, BUDGET)).toBe(0);
    expect(seatsAffordable(BUDGET * 2, BUDGET)).toBe(0);
  });
});

describe('guardLevel（F-1 Cost Guard）', () => {
  it('70 / 85 / 100 の3段階で上がる', () => {
    expect(guardLevel(0, BUDGET)).toBe('ok');
    expect(guardLevel(6_999, BUDGET)).toBe('ok');
    expect(guardLevel(7_000, BUDGET)).toBe('warn70');
    expect(guardLevel(8_500, BUDGET)).toBe('warn85');
    expect(guardLevel(10_000, BUDGET)).toBe('over');
    expect(guardLevel(20_000, BUDGET)).toBe('over');
  });

  it('予算0でも落ちない', () => {
    expect(guardLevel(100, 0)).toBe('ok');
  });

  it('超過しても「利用者を止める」とは言わない（止めるのは新規招待だけ）', () => {
    expect(GUARD_MESSAGE.over.action).toContain('止めません');
    expect(GUARD_MESSAGE.over.action).toContain('新しい招待');
  });

  it('どの段階にも次の行動が書いてある', () => {
    for (const v of Object.values(GUARD_MESSAGE)) {
      expect(v.action.length).toBeGreaterThan(8);
    }
  });
});
