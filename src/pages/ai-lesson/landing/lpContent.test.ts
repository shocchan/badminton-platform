import { describe, it, expect } from 'vitest';
import { LP, VARIANTS } from './lpContent';

// LP コンテンツの本番事故防止テスト（DB/認証に依存しない純粋データ検証）

const collectStrings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
};

describe('LP pricing', () => {
  it('主商品は100,000円のまま', () => {
    expect(LP.pricing.price).toBe('100,000');
  });
  it('月額換算を明示している', () => {
    expect(LP.pricing.monthly.ja).toMatch(/16,700/);
    expect(LP.pricing.monthly.zh).toMatch(/16,700/);
  });
  it('「授業料ではなく学習環境への料金」コピーがある', () => {
    expect(LP.pricing.keyCopy.ja).toContain('授業料ではなく');
  });
  it('合格を保証しない旨のディスクレーマーがある', () => {
    expect(LP.pricing.disclaimer.ja).toContain('保証するものではありません');
  });
});

describe('禁止表現（無条件保証・情報商材的）', () => {
  // 「保証しますか？」等の質問文（？終わり）は正当なので除外し、断定的な主張のみ検査
  const all = [...collectStrings(LP), ...collectStrings(VARIANTS)].filter((s) => !/[？?]\s*$/.test(s));
  const banned = ['合格を保証します', '必ず合格できます', '必ず話せるように', '完全監修', '圧倒的', '誰でも必ず', '最短で必ず'];
  it.each(banned)('「%s」を含まない', (phrase) => {
    const hit = all.find((s) => s.includes(phrase));
    expect(hit, `禁止表現を検出: ${hit}`).toBeUndefined();
  });
});

describe('variant 設定（shoko / yuto）', () => {
  it.each(['shoko', 'yuto'] as const)('%s は名前・画像・SEOが揃っている', (key) => {
    const v = VARIANTS[key];
    expect(v.name.ja).toBeTruthy();
    expect(v.name.zh).toBeTruthy();
    expect(Object.values(v.images)).toHaveLength(4);
    Object.values(v.images).forEach((n) => expect(n).toMatch(/-(base|wave|cheer|teaching)$/));
    expect(Object.keys(v.imageSize)).toEqual(['base', 'wave', 'cheer', 'teaching']);
    expect(v.seo.title.ja).toBeTruthy();
    expect(v.seo.title.zh).toBeTruthy();
    expect(v.seo.ogImage).toMatch(/^\/images\/ai-course\//);
  });
});

describe('ja / zh パリティ（訳の抜け防止）', () => {
  const pairs: [string, unknown, unknown][] = [
    ['faq', LP.faq.items.ja, LP.faq.items.zh],
    ['pain', LP.pain.items.ja, LP.pain.items.zh],
    ['comparison.rows', LP.comparison.rows.ja, LP.comparison.rows.zh],
    ['features', LP.features.items.ja, LP.features.items.zh],
    ['contents', LP.contents.items.ja, LP.contents.items.zh],
    ['outcomes', LP.outcomes.items.ja, LP.outcomes.items.zh],
    ['flow.steps', LP.flow.steps.ja, LP.flow.steps.zh],
    ['roadmap.phases', LP.roadmap.phases.ja, LP.roadmap.phases.zh],
    ['heroChips', LP.heroChips.ja, LP.heroChips.zh],
    ['pricing.includes', LP.pricing.includes.ja, LP.pricing.includes.zh],
  ];
  it.each(pairs)('%s の ja/zh 件数が一致', (_label, ja, zh) => {
    expect((ja as unknown[]).length).toBe((zh as unknown[]).length);
    expect((ja as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('比較表の記号', () => {
  it('全セルが ◯ / △ / × のいずれか', () => {
    for (const lang of ['ja', 'zh'] as const) {
      for (const row of LP.comparison.rows[lang]) {
        for (const cell of [row.a, row.b, row.c]) {
          expect(['◯', '△', '×']).toContain(cell);
        }
      }
    }
  });
});
