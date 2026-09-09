/*
 * AI会話の回数券（2026-09-09 CEO決定「都度300円 / 5回券1,350円 / 1回6分」）。
 *
 * 守りたいこと:
 *  - 値段の正準が1つ（クライアントとEdge Functionでズレない）
 *  - **上限まで使われても赤字にならない**（原価率60%以内）
 *  - 商品説明に「1回あたり何分か」が書いてある（何を買うのか分からないまま買わせない）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONVERSATION_TOPUPS, PAID_SESSION_MINUTES, topupById, isTopupId, topupView,
} from './conversationTopups';
import { VOICE_USD_PER_MINUTE, COST_SAFETY_MARGIN, JPY_PER_USD } from './planAiBudget';

/** Stripeの決済手数料（国内カード）。実際の料率は契約で変わるので、ここは検算の前提値 */
const STRIPE_FEE_RATE = 0.036;
/** 音声1分の原価（円）。planAiBudget のモデル値から導く（数字をここに直書きしない） */
const YEN_PER_MINUTE = VOICE_USD_PER_MINUTE * COST_SAFETY_MARGIN * JPY_PER_USD;

describe('回数券のかたち', () => {
  it('2種類だけ（都度と5回券）', () => {
    expect(CONVERSATION_TOPUPS.map((t) => t.id)).toEqual(['conv-topup-1', 'conv-topup-5']);
  });

  it('CEO決定どおりの値段と回数', () => {
    expect(topupById('conv-topup-1')).toMatchObject({ credits: 1, priceJpy: 300 });
    expect(topupById('conv-topup-5')).toMatchObject({ credits: 5, priceJpy: 1350 });
  });

  it('券のほうが1回あたり安い（券にする理由がある）', () => {
    const single = topupById('conv-topup-1')!;
    const pack = topupById('conv-topup-5')!;
    expect(pack.priceJpy / pack.credits).toBeLessThan(single.priceJpy);
  });

  it('知らないIDは通さない', () => {
    expect(isTopupId('conv-topup-1')).toBe(true);
    expect(isTopupId('ai-month')).toBe(false);
    expect(isTopupId('')).toBe(false);
    expect(topupById('nope')).toBe(null);
  });
});

describe('**上限まで使われても赤字にならない**', () => {
  /*
   * 1回6分＝原価 約¥150。CEOと確認した表:
   *   都度300円  … 原価率 約52%
   *   5回券1,350 … 原価率 約58%
   * 体験パスに設けた上限60%の内側に収まっていること。
   */
  const costPerSession = YEN_PER_MINUTE * PAID_SESSION_MINUTES;

  it('1回の原価は約150円（モデル値）', () => {
    expect(costPerSession).toBeGreaterThan(140);
    expect(costPerSession).toBeLessThan(160);
  });

  for (const t of CONVERSATION_TOPUPS) {
    it(`${t.id} は原価率60%以内（手数料込みで黒字が残る）`, () => {
      const net = t.priceJpy * (1 - STRIPE_FEE_RATE);
      const cost = costPerSession * t.credits;
      expect(cost / net, `${t.id} の原価率`).toBeLessThan(0.6);
      expect(net - cost, `${t.id} の粗利`).toBeGreaterThan(0);
    });
  }
});

describe('商品の説明', () => {
  it('**1回あたり何分か**を必ず書く（特商法の表示・画面に出さないぶんここで言う）', () => {
    for (const t of CONVERSATION_TOPUPS) {
      expect(t.descriptionJa, t.id).toContain(`${PAID_SESSION_MINUTES}分`);
      expect(t.descriptionZh, t.id).toContain(`${PAID_SESSION_MINUTES}分钟`);
    }
  });

  it('自動更新でないことを書く（買い切り）', () => {
    for (const t of CONVERSATION_TOPUPS) {
      expect(t.descriptionJa, t.id).toContain('自動更新はありません');
      expect(t.descriptionZh, t.id).toContain('不会自动续费');
    }
  });

  it('言語ぶんが両方そろっている', () => {
    for (const t of CONVERSATION_TOPUPS) {
      const zh = topupView(t, 'zh');
      const ja = topupView(t, 'ja');
      expect(zh.name).not.toBe(ja.name);
      expect(/[ぁ-んァ-ヴ]/.test(zh.name + zh.description), `${t.id} 中国語にかな`).toBe(false);
    }
  });
});

describe('Edge Function 側の写しとズレていない', () => {
  /*
   * サーバーは自分のカタログから金額を読む（クライアントの金額を信じない）。
   * その写しがズレると、**画面の値段と実際の請求額が食い違う**。
   */
  const shared = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/conversationTopups.ts'), 'utf8',
  );

  for (const t of CONVERSATION_TOPUPS) {
    it(`${t.id}: id・回数・金額・版がサーバー側と一致する`, () => {
      expect(shared).toContain(`id: "${t.id}"`);
      expect(shared).toContain(`credits: ${t.credits}`);
      expect(shared).toContain(`priceJpy: ${t.priceJpy}`);
      expect(shared).toContain(`version: ${t.version}`);
      expect(shared, `${t.id} の説明文（分数）`).toContain(`${PAID_SESSION_MINUTES}分`);
    });
  }

  it('サーバー側に余分な商品が紛れていない', () => {
    const ids = [...shared.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual(CONVERSATION_TOPUPS.map((t) => t.id).sort());
  });
});
