import { describe, it, expect } from 'vitest';
import { LP, VARIANTS } from './lpContent';
import { PLAN_CATALOG } from '../../../lib/aiLesson/course/plans/planCatalog';

// LP コンテンツの本番事故防止テスト（DB/認証に依存しない純粋データ検証）

const collectStrings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
};

describe('LP pricing', () => {
  it('**LPの料金セクションコピーに商品価格を書かない**（正準は planCatalog）', () => {
    // ここに金額を書き戻すと、カタログを直したのにLPだけ古い、という食い違いが起きる
    for (const s of collectStrings(LP.pricing)) {
      expect(s, `LP.pricing に金額が書かれている: "${s}"`).not.toMatch(/[0-9][0-9,]*\s*(円|日元)/);
    }
  });
  it('「授業料ではなく学習環境への料金」コピーがある', () => {
    expect(LP.pricing.keyCopy.ja).toContain('授業料ではなく');
  });
  it('合格を保証しない旨のディスクレーマーがある', () => {
    expect(LP.pricing.disclaimer.ja).toContain('保証するものではありません');
  });
});

describe('LPコピー内の価格表記', () => {
  // ヒーローやFAQで価格に触れるのは集客上必要。ただし**カタログに無い金額は書けない**
  // ようにする（カタログ改定時にLPコピーの数字だけ古いまま、という事故を機械で検出）
  it('**登場する金額はすべて planCatalog の価格と一致する**', () => {
    const catalogPrices = new Set(
      PLAN_CATALOG.flatMap((p) => (p.priceJpy === null ? [] : [p.priceJpy])),
    );
    const all = [...collectStrings(LP), ...collectStrings(VARIANTS)];
    for (const s of all) {
      for (const m of s.matchAll(/([0-9][0-9,]*)\s*(円|日元)/g)) {
        const n = Number(m[1].replace(/,/g, ''));
        expect(catalogPrices.has(n), `カタログに無い金額がLPコピーにある: "${m[0]}" in "${s}"`).toBe(true);
      }
    }
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
    ['features', LP.features.items.ja, LP.features.items.zh],
    ['flow.steps', LP.flow.steps.ja, LP.flow.steps.zh],
    ['roadmap.phases', LP.roadmap.phases.ja, LP.roadmap.phases.zh],
    ['heroChips', LP.heroChips.ja, LP.heroChips.zh],
    ['testimonials.entries', LP.testimonials.entries.ja, LP.testimonials.entries.zh],
    ['planFit.notFitItems', LP.planFit.notFitItems.ja, LP.planFit.notFitItems.zh],
    ['planFit.trial', LP.planFit.byPlan.ja['ai-trial-pass'], LP.planFit.byPlan.zh['ai-trial-pass']],
    ['planFit.month', LP.planFit.byPlan.ja['ai-month'], LP.planFit.byPlan.zh['ai-month']],
    ['planFit.coach', LP.planFit.byPlan.ja['coach-6m'], LP.planFit.byPlan.zh['coach-6m']],
    // 価格・含まれるもの・比較表のセルは planCatalog / planEntitlements 側でテスト
  ];
  it.each(pairs)('%s の ja/zh 件数が一致', (_label, ja, zh) => {
    expect((ja as unknown[]).length).toBe((zh as unknown[]).length);
    expect((ja as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('相談モーダルの必須要素', () => {
  it('WeChat ID・メール・フォーム・むりな勧誘をしない旨がそろっている', () => {
    expect(LP.consultation.wechatIdPlaceholder.length).toBeGreaterThan(0);
    expect(LP.consultation.email).toContain('@');
    for (const lang of ['ja', 'zh'] as const) {
      expect(LP.consultation.searchHint[lang]).toBeTruthy();  // 「無料相談希望」と送ればよい案内
      expect(LP.consultation.emailCta[lang]).toBeTruthy();
      expect(LP.consultation.formCta[lang]).toBeTruthy();     // 問い合わせフォームへのリンク
      expect(LP.consultation.fallbackNote[lang]).toBeTruthy(); // むりな勧誘をしない
    }
  });
  it('相談CTAの文言が実際の動作（WeChat・メール相談）と一致している', () => {
    // 「予約」と書くと予約カレンダーを期待させる（実際はモーダル）。文言と動作を一致させる
    expect(LP.ctaPrimary.ja).not.toContain('予約');
    expect(LP.ctaPrimary.ja).toContain('WeChat');
    expect(LP.ctaPrimary.ja).toContain('無料相談');
  });
});

describe('主役の序列（人間コーチ > AI）', () => {
  it('ヒーローのキーメッセージは「人間が方向・AIが毎日」', () => {
    expect(LP.heroKeyMessage.ja).toBe('人間が方向を決め、AIが毎日支える。');
    expect(LP.roles.heading.ja).toBe(LP.heroKeyMessage.ja);
  });
});

describe('料金への導線（2026-08-20）', () => {
  it('**体験CTAは価格を直書きせず {price} で受け取る**（カタログ改定に自動追従させる）', () => {
    for (const lang of ['ja', 'zh'] as const) {
      expect(LP.ctaTrial[lang]).toContain('{price}');
      expect(LP.ctaTrial[lang]).not.toMatch(/[0-9]/);
    }
  });

  it('価格プレビュー帯・固定バーの文言が ja/zh そろっている', () => {
    for (const lang of ['ja', 'zh'] as const) {
      expect(LP.priceTeaser.eyebrow[lang]).toBeTruthy();
      expect(LP.priceTeaser.note[lang]).toBeTruthy();
      expect(LP.priceTeaser.cta[lang]).toBeTruthy();
      expect(LP.stickyBar.note[lang]).toBeTruthy();
      expect(LP.stickyBar.consult[lang]).toBeTruthy();
    }
  });

  it('価格プレビュー帯にも金額を書かない（正準は planCatalog）', () => {
    for (const s of collectStrings(LP.priceTeaser)) {
      expect(s, `LP.priceTeaser に金額が書かれている: "${s}"`).not.toMatch(/[0-9][0-9,]*\s*(円|日元)/);
    }
  });
});
