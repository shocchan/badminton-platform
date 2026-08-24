// 単価表とトークン→コスト計算のテスト（2026-08-24 WAVE 4-4）。
//
// ここが守るのは「原価の数字が、どこから来たか説明できる状態」。
// 単価が2か所にあると必ずズレるので、TS と migration の seed の一致も機械で見る。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  MODEL_PRICES, UNKNOWN_MODEL_PRICE, resolvePrice, costUsdForTokens,
  tokensFromChatUsage, estimateRealtimeTokens, realtimeUsdPerMinute, DEFAULT_REALTIME_MODEL,
} from './aiModelPricing';
import { REALTIME_COST } from './courseConfig';
import { estimateSessionCost } from './courseStats';

const MIGRATION = 'supabase/migrations/20260824150000_ai_usage_events.sql';

describe('トークン数 → コスト（モデル別）', () => {
  it('gpt-4o-mini: 1M入力 = $0.15 / 1M出力 = $0.60', () => {
    expect(costUsdForTokens('gpt-4o-mini', { inputTokens: 1_000_000 })).toBeCloseTo(0.15, 10);
    expect(costUsdForTokens('gpt-4o-mini', { outputTokens: 1_000_000 })).toBeCloseTo(0.60, 10);
  });

  it('gpt-4o は gpt-4o-mini のちょうど 16.667 倍（監査の「17倍」の正体はここ）', () => {
    const t = { inputTokens: 40_000, outputTokens: 3_000 };
    const ratio = costUsdForTokens('gpt-4o', t) / costUsdForTokens('gpt-4o-mini', t);
    expect(ratio).toBeCloseTo(2.5 / 0.15, 6);
    expect(ratio).toBeCloseTo(10 / 0.6, 6);
  });

  it('キャッシュ済み入力は通常入力と別単価で数える（同じ単価で数えると原価を盛る）', () => {
    const plain = costUsdForTokens('gpt-4o-mini', { inputTokens: 100_000 });
    const cached = costUsdForTokens('gpt-4o-mini', { cachedInputTokens: 100_000 });
    expect(cached).toBeLessThan(plain);
    expect(cached).toBeCloseTo(plain * 0.5, 10);
  });

  it('音声は audio 単価で数える（text 単価と混ぜない）', () => {
    const audio = costUsdForTokens('gpt-realtime-2.1', { audioInputTokens: 1_000_000 });
    const text = costUsdForTokens('gpt-realtime-2.1', { inputTokens: 1_000_000 });
    expect(audio).toBeCloseTo(32, 10);
    expect(text).toBeCloseTo(4, 10);
  });

  it('負値・undefined は 0 として扱う（マイナスの原価を作らない）', () => {
    expect(costUsdForTokens('gpt-4o-mini', { inputTokens: -100 })).toBe(0);
    expect(costUsdForTokens('gpt-4o-mini', {})).toBe(0);
  });
});

describe('モデル名の照合', () => {
  it('版つきの名前は前方一致で拾う（OpenAI は gpt-4o-mini-2024-07-18 を返すことがある）', () => {
    const r = resolvePrice('gpt-4o-mini-2024-07-18');
    expect(r.known).toBe(true);
    expect(r.matchedBy).toBe('prefix');
    expect(r.price.model).toBe('gpt-4o-mini');
  });

  it('前方一致は「いちばん長い」を採る（mini を無印 gpt-4o と取り違えない）', () => {
    expect(resolvePrice('gpt-4o-mini-2024-07-18').price.model).toBe('gpt-4o-mini');
    expect(resolvePrice('gpt-realtime-2.1-mini-2025-06-03').price.model).toBe('gpt-realtime-2.1-mini');
  });

  it('知らないモデルは 0 ではなく「表の最大単価」で見積もる', () => {
    const r = resolvePrice('some-new-model-2027');
    expect(r.known).toBe(false);
    expect(costUsdForTokens('some-new-model-2027', { inputTokens: 1_000_000 }))
      .toBeCloseTo(UNKNOWN_MODEL_PRICE.inputPerMillion, 10);
    // 0 にすると「知らないモデルを使った月だけ原価が消える」＝いちばん危ない向きに外れる
    expect(costUsdForTokens('some-new-model-2027', { inputTokens: 1_000_000 })).toBeGreaterThan(0);
  });

  it('最大単価は表の中で本当に最大（新しい高いモデルを足したら自動で追随する）', () => {
    for (const p of Object.values(MODEL_PRICES)) {
      expect(UNKNOWN_MODEL_PRICE.inputPerMillion).toBeGreaterThanOrEqual(p.inputPerMillion);
      expect(UNKNOWN_MODEL_PRICE.outputPerMillion).toBeGreaterThanOrEqual(p.outputPerMillion);
      expect(UNKNOWN_MODEL_PRICE.audioInputPerMillion).toBeGreaterThanOrEqual(p.audioInputPerMillion);
    }
  });
});

describe('OpenAI の usage → トークン数', () => {
  it('prompt_tokens からキャッシュ済みぶんを引く（引かないと二重計上）', () => {
    const t = tokensFromChatUsage({
      prompt_tokens: 1000, completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 400 },
    });
    expect(t.inputTokens).toBe(600);
    expect(t.cachedInputTokens).toBe(400);
    expect(t.outputTokens).toBe(200);
    expect((t.inputTokens ?? 0) + (t.cachedInputTokens ?? 0)).toBe(1000);
  });

  it('usage が無い/壊れていても 0 で通る（記録の失敗で会話を止めない）', () => {
    expect(tokensFromChatUsage(null)).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
    expect(tokensFromChatUsage({ prompt_tokens: 'x' })).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });
});

describe('音声の推定は「分数 × 仮定トークン」であることを明示する', () => {
  it('estimateRealtimeTokens は courseConfig の仮定をそのまま使う', () => {
    const t = estimateRealtimeTokens(120);
    expect(t.audioInputTokens).toBeCloseTo(2 * REALTIME_COST.approxInputTokensPerMin, 10);
    expect(t.audioOutputTokens).toBeCloseTo(2 * REALTIME_COST.approxOutputTokensPerMin, 10);
  });

  it('1分あたり $0.1344（＝$8.06/時間）。**これはモデル値で実測ではない**', () => {
    expect(realtimeUsdPerMinute(DEFAULT_REALTIME_MODEL)).toBeCloseTo(0.1344, 6);
  });

  it('estimateSessionCost が単価表と同じ答えを出す（式が2本にならない）', () => {
    for (const sec of [0, 60, 108, 240, 441]) {
      expect(estimateSessionCost(sec))
        .toBeCloseTo(costUsdForTokens(DEFAULT_REALTIME_MODEL, estimateRealtimeTokens(sec)), 12);
    }
  });

  it('循環参照の記録: 441秒 → $0.98784 は「実測」ではなく式の出力そのもの', () => {
    // バックアップ実データの値。式で誤差ゼロに再現できる＝実請求とは無関係だった証拠
    expect(estimateSessionCost(441)).toBeCloseTo(0.98784, 6);
    expect(estimateSessionCost(441)).toBeCloseTo((441 / 60) * 0.1344, 6);
  });
});

describe('単価が1か所にまとまっている', () => {
  it('音声の単価は courseConfig の REALTIME_COST から来ている（写しを作らない）', () => {
    expect(MODEL_PRICES['gpt-realtime-2.1'].audioInputPerMillion).toBe(REALTIME_COST.inputPerMillion);
    expect(MODEL_PRICES['gpt-realtime-2.1'].audioOutputPerMillion).toBe(REALTIME_COST.outputPerMillion);
  });

  it('全モデルに出典が書いてある（根拠なく数字を動かされないように）', () => {
    for (const p of Object.values(MODEL_PRICES)) {
      expect(p.provenance.length, p.model).toBeGreaterThan(15);
      expect(/repo:|list:|derived:/.test(p.provenance), p.model).toBe(true);
    }
  });

  it('migration の seed と TS の単価表が一致する（DBが正・TSは写し）', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const m = sql.match(/jsonb_to_recordset\('(\[[\s\S]*?\])'::jsonb\)/);
    expect(m, 'seed の JSON が見つからない').not.toBeNull();
    const seeded = JSON.parse(m![1]) as {
      model: string; input_per_million: number; cached_input_per_million: number;
      output_per_million: number; audio_input_per_million: number; audio_output_per_million: number;
    }[];
    expect(seeded.map((s) => s.model).sort()).toEqual(Object.keys(MODEL_PRICES).sort());
    for (const s of seeded) {
      const p = MODEL_PRICES[s.model];
      expect(s.input_per_million, s.model).toBe(p.inputPerMillion);
      expect(s.cached_input_per_million, s.model).toBe(p.cachedInputPerMillion);
      expect(s.output_per_million, s.model).toBe(p.outputPerMillion);
      expect(s.audio_input_per_million, s.model).toBe(p.audioInputPerMillion);
      expect(s.audio_output_per_million, s.model).toBe(p.audioOutputPerMillion);
    }
  });

  it('音声の「分数→トークン」の仮定も migration と一致する', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const m = sql.match(/'realtime_token_estimate',\s*'(\{[\s\S]*?\})'::jsonb/);
    expect(m).not.toBeNull();
    const seeded = JSON.parse(m![1]) as Record<string, number>;
    expect(seeded.approx_input_tokens_per_min).toBe(REALTIME_COST.approxInputTokensPerMin);
    expect(seeded.approx_output_tokens_per_min).toBe(REALTIME_COST.approxOutputTokensPerMin);
  });
});
