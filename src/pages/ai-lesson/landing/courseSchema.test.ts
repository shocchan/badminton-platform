// Course 構造化データの価格が、実際に売っているものと一致するか（2026-08-24）。
//
// 【なぜ要るか】
// ここに書いた価格は Google の検索結果と、ChatGPT・Claude 等の回答に出る。
// カタログの価格を変えたのに schema が古いままだと、
// **利用者は古い値段を見て問い合わせてくる**。サイト本文より気づきにくい嘘になる。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCourseSchema, buildCourseOffers } from './courseSchema';
import { publishedPlans, allPlans } from '../../../lib/aiLesson/course/plans/planCatalog';

const source = readFileSync(join(__dirname, 'courseSchema.ts'), 'utf8');
/** コメントを除いたコード部分だけ（説明文に出てくる金額を誤検出しないため） */
const code = source
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');
const priced = () => publishedPlans().filter((p) => typeof p.priceJpy === 'number' && p.priceJpy > 0);

describe('価格はカタログから読む（ここに数値を書かない）', () => {
  it('実装に金額がベタ書きされていない', () => {
    // **禁止する文字列もカタログから導く。** ここに金額を書くと、
    // このテスト自身が「価格は planCatalog の外に書かない」規則を破ることになる
    const forbidden = publishedPlans().flatMap((p) => [
      String(p.priceJpy ?? ''), p.priceLabelJa, p.priceLabelZh,
    ]).filter((x) => x.length > 2);
    for (const n of forbidden) {
      expect(code, `courseSchema.ts のコードに金額 ${n} がベタ書きされている`).not.toContain(n);
    }
  });

  it('publishedPlans から読んでいる', () => {
    expect(source).toContain('publishedPlans()');
  });
});

describe('offers の中身', () => {
  it('前提: 価格が確定した公開プランがある', () => {
    expect(priced().length).toBeGreaterThan(0);
  });

  it('公開中で金額が確定したプランぶんだけ出る', () => {
    expect(buildCourseOffers('ja')).toHaveLength(priced().length);
  });

  it('価格がカタログと一致する', () => {
    const got = new Map(buildCourseOffers('ja').map((o) => [o.name, o.price]));
    for (const p of priced()) {
      expect(got.get(p.nameJa), `${p.nameJa} の価格が schema と食い違う`).toBe(p.priceJpy);
    }
  });

  it('通貨はJPYで、税込であることを明示している', () => {
    for (const o of buildCourseOffers('ja')) {
      expect(o.priceCurrency).toBe('JPY');
      expect(o.priceSpecification.valueAddedTaxIncluded, '表示が「税込」なのでschemaでも明示する').toBe(true);
      expect(o.priceSpecification.price).toBe(o.price);
    }
  });

  it('公開していないプランを載せない（売っていないものを検索結果に出さない）', () => {
    const names = new Set(buildCourseOffers('ja').map((o) => o.name));
    for (const p of allPlans().filter((x) => x.status !== 'published')) {
      expect(names.has(p.nameJa), `未公開の「${p.nameJa}」が schema に出ている`).toBe(false);
    }
  });

  it('金額が未確定のプランを載せない（存在しない値段を出さない）', () => {
    for (const o of buildCourseOffers('ja')) {
      expect(typeof o.price).toBe('number');
      expect(o.price).toBeGreaterThan(0);
    }
  });

  it('相談が必要な商品と、その場で買える商品を区別している', () => {
    const byName = new Map(buildCourseOffers('ja').map((o) => [o.name, o.category]));
    for (const p of priced()) {
      const expected = p.ctaMode === 'consult' ? 'Consultation required' : 'Online purchase';
      expect(byName.get(p.nameJa), `${p.nameJa} の購入方法の区別が違う`).toBe(expected);
    }
  });

  it('中国語では中国語のプラン名で出る', () => {
    const names = new Set(buildCourseOffers('zh').map((o) => o.name));
    for (const p of priced()) {
      expect(names.has(p.nameZh), `中国語名「${p.nameZh}」で出ていない`).toBe(true);
    }
  });
});

describe('Course 本体', () => {
  const schema = buildCourseSchema({ lang: 'ja', name: 'テスト用タイトル', description: 'テスト用の説明' });

  it('リッチリザルトの必須要素が揃っている', () => {
    expect(schema['@type']).toBe('Course');
    expect(schema.name).toBe('テスト用タイトル');
    expect(schema.description).toBe('テスト用の説明');
    expect(schema.provider).toBeTruthy();
    // hasCourseInstance が無いと Google の Course リッチリザルトの対象外
    expect(schema.hasCourseInstance).toBeTruthy();
  });

  it('タイトルは呼び出し側（ページの<title>）から受け取る', () => {
    // schema 側で独自にタイトルを組むと、ページの表示と食い違う。
    // Course 直下の name は引数の短縮記法（`name,`）であること
    expect(code, 'Course の name を内部で組み立てている').toMatch(/'@type':\s*'Course',\s*\n\s*name,/);
    // 実際に渡した値がそのまま出る
    expect(buildCourseSchema({ lang: 'ja', name: '渡した値', description: 'd' }).name).toBe('渡した値');
  });

  it('中国語では inLanguage が zh-Hans', () => {
    expect(buildCourseSchema({ lang: 'zh', name: 'x', description: 'y' }).inLanguage).toBe('zh-Hans');
  });
});
