// 「赤字になる商品設計を出荷できなくする」テスト（2026-08-23 CEO指示）。
//
// ここが落ちたら、直すのはテストではなく**商品の中身か価格**。
// 枠を広げたい / 値下げしたいときは、原価がいくらになるかを先にこの数字で見る。
import { describe, it, expect } from 'vitest';
import {
  PLAN_AI_BUDGETS, aiBudgetFor, planEconomics,
  VOICE_USD_PER_MINUTE, VOICE_SESSION_MAX_SECONDS, JPY_PER_USD, COST_SAFETY_MARGIN,
} from './planAiBudget';
import { PLAN_CATALOG } from './planCatalog';
import { DEFAULT_USAGE_LIMITS } from '../courseConfig';

const published = PLAN_CATALOG.filter((p) => p.status === 'published');

describe('原価のモデルが実測と合っている', () => {
  it('音声は約 $8.1/時間（本番実測 $9.25 ÷ 1.14時間 = $8.11 と一致する）', () => {
    expect(VOICE_USD_PER_MINUTE * 60).toBeGreaterThan(7.5);
    expect(VOICE_USD_PER_MINUTE * 60).toBeLessThan(8.7);
  });
  it('1回の最長は利用上限の設定と同じ（枠の計算と実際の遮断がずれない）', () => {
    expect(VOICE_SESSION_MAX_SECONDS).toBe(DEFAULT_USAGE_LIMITS.session_max_seconds);
  });
  it('円換算は円安側に固定してある（実レート追従で黙って赤字に入らない）', () => {
    expect(JPY_PER_USD).toBeGreaterThanOrEqual(150);
  });
  it('安全率が1以上（見積り漏れを吸収する向きにかかっている）', () => {
    expect(COST_SAFETY_MARGIN).toBeGreaterThanOrEqual(1);
  });
});

describe('公開中の全プランが、上限まで使われても黒字', () => {
  it.each(published.map((p) => [p.nameJa, p.id] as const))('%s', (_name, id) => {
    const e = planEconomics(id);
    expect(e.priceJpy).not.toBeNull();
    expect(e.profitable).toBe(true);
  });

  it.each(published.map((p) => [p.nameJa, p.id] as const))(
    '%s は決めた原価率の範囲に収まっている', (_name, id) => {
      const e = planEconomics(id);
      const budget = aiBudgetFor(id);
      expect(e.costRatio).not.toBeNull();
      expect(e.costRatio!).toBeLessThanOrEqual(budget.maxAiCostRatio);
    });
});

describe('枠の作りが破綻していない', () => {
  it('全プランに枠がある（カタログに商品を足して枠を忘れると落ちる）', () => {
    for (const p of PLAN_CATALOG) expect(PLAN_AI_BUDGETS[p.id]).toBeDefined();
  });

  it('1日の上限が総枠を超えない（上限を書いたのに効かない状態を作らない）', () => {
    for (const p of PLAN_CATALOG) {
      const b = aiBudgetFor(p.id);
      expect(b.voiceSessionsPerDay).toBeLessThanOrEqual(b.voiceSessionsTotal);
    }
  });

  it('音声より先にテキストが尽きない（原価ゼロ側を狭くしない）', () => {
    for (const p of PLAN_CATALOG) {
      const b = aiBudgetFor(p.id);
      expect(b.textSessionsPerDay).toBeGreaterThan(b.voiceSessionsPerDay);
    }
  });

  it('どのプランも音声が1回以上できる（会話を売っているのに0回にしない）', () => {
    for (const p of PLAN_CATALOG) expect(aiBudgetFor(p.id).voiceSessionsTotal).toBeGreaterThan(0);
  });

  it('なぜその数字かが書いてある（根拠なく動かされないように）', () => {
    for (const p of PLAN_CATALOG) expect(aiBudgetFor(p.id).rationale.length).toBeGreaterThan(30);
  });
});

describe('従来の上限が赤字だったことを記録として固定する', () => {
  it('月6時間（旧上限）を1か月プランに当てると売値を超える', () => {
    const oldMonthlyMinutes = DEFAULT_USAGE_LIMITS.monthly_max_seconds / 60;   // 360分
    const oldCostJpy = oldMonthlyMinutes * VOICE_USD_PER_MINUTE * JPY_PER_USD;
    const monthPrice = PLAN_CATALOG.find((p) => p.id === 'ai-month')!.priceJpy!;
    expect(oldCostJpy).toBeGreaterThan(monthPrice);
  });
});

describe('権限（entitlements）に枠がそのまま出ている', () => {
  it('画面もサーバーも同じ数字を見る（表示と判定の食い違いを作らない）', async () => {
    const { entitlementsFor } = await import('./planEntitlements');
    for (const p of PLAN_CATALOG) {
      const e = entitlementsFor(p.id);
      const b = aiBudgetFor(p.id);
      expect(e.aiVoiceSessionsTotal, p.id).toBe(b.voiceSessionsTotal);
      expect(e.aiVoiceSessionsPerDay, p.id).toBe(b.voiceSessionsPerDay);
      expect(e.aiTextSessionsPerDay, p.id).toBe(b.textSessionsPerDay);
    }
  });
});

describe('サーバー側の設定とずれていない', () => {
  // ai_config.plan_ai_budgets はこのTSの写し。数字が2か所にあるので、ずれたら落とす。
  const SQL_PATH = 'supabase/migrations/20260823120000_ai_plan_voice_budget.sql';

  it('マイグレーションが seed する値が PLAN_AI_BUDGETS と一致する', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync(SQL_PATH, 'utf8');
    const m = sql.match(/'plan_ai_budgets',\s*'(\{[\s\S]*?\})'::jsonb/);
    expect(m, 'seed の JSON が見つからない').not.toBeNull();
    const seeded = JSON.parse(m![1]) as Record<string, {
      voiceSessionsTotal: number; voiceSessionsPerDay: number; textSessionsPerDay: number;
    }>;
    for (const p of PLAN_CATALOG) {
      const b = aiBudgetFor(p.id);
      expect(seeded[p.id], `${p.id} が seed に無い`).toBeDefined();
      expect(seeded[p.id].voiceSessionsTotal, p.id).toBe(b.voiceSessionsTotal);
      expect(seeded[p.id].voiceSessionsPerDay, p.id).toBe(b.voiceSessionsPerDay);
      expect(seeded[p.id].textSessionsPerDay, p.id).toBe(b.textSessionsPerDay);
    }
    expect(Object.keys(seeded).sort()).toEqual(PLAN_CATALOG.map((p) => p.id).sort());
  });
});
