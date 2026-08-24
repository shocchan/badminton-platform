// AIコースの provider が、バドミントン団体と**別の実体**として名乗れているか（2026-08-24）。
//
// 【なぜ要るか】
// ここが壊れると、Google と ChatGPT・Claude に
// 「バドミントン競技団体が日本語教育コースを提供している」と読ませることになる。
// 実際に 2026-08-24 の監査でその状態だった:
//   - courseSchema の provider が url: https://kawabado.com の Organization
//   - その URL のノードは HomePage が SportsOrganization / sport: 'バドミントン' と宣言
// ドメインは分けない方針なので、この境界は**構造化データだけで**保つしかない。
// 人の目には見えない壊れ方なので、テストで縛る。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCourseSchema,
  buildCourseProvider,
  AI_COURSE_PROVIDER_ID,
  KAWABADO_ORGANIZATION_ID,
} from './courseSchema';
import { LEGAL_FACTS } from '../../../lib/aiLesson/course/legal/legalFacts';

const source = readFileSync(join(__dirname, 'courseSchema.ts'), 'utf8');
/** コメントを除いたコード部分だけ（説明文の中の語を誤検出しないため） */
const code = source
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

/** 実際に <script type="application/ld+json"> に入るのと同じ形にする */
const emitted = (lang: 'ja' | 'zh') =>
  JSON.parse(JSON.stringify(buildCourseSchema({ lang, name: 'n', description: 'd' })));

describe('provider は #organization と別の entity', () => {
  it('provider の @id が付いている', () => {
    expect(emitted('ja').provider['@id']).toBe(AI_COURSE_PROVIDER_ID);
  });

  it('@id が バドミントン側の #organization と違う', () => {
    expect(AI_COURSE_PROVIDER_ID).not.toBe(KAWABADO_ORGANIZATION_ID);
    // フラグメントも別（#organization を使い回すと同じノードに合流してしまう）
    expect(AI_COURSE_PROVIDER_ID).not.toContain('#organization');
    expect(AI_COURSE_PROVIDER_ID).toMatch(/^https:\/\/kawabado\.com\/.+#provider$/);
  });

  it('Course のどこからも #organization を参照していない', () => {
    for (const lang of ['ja', 'zh'] as const) {
      expect(JSON.stringify(emitted(lang)), 'バドミントン団体のノードに繋がっている')
        .not.toContain(KAWABADO_ORGANIZATION_ID);
    }
  });

  it('ja と zh で同じ @id（同じ組織が2つあることにしない）', () => {
    expect(emitted('zh').provider['@id']).toBe(emitted('ja').provider['@id']);
  });

  it('バドミントンの語を持ち込まない', () => {
    const json = JSON.stringify(emitted('ja'));
    for (const ng of ['SportsOrganization', 'バドミントン', '羽毛球', 'sport']) {
      expect(json, `provider 側に「${ng}」が混ざっている`).not.toContain(ng);
    }
  });

  it('教育の主体だと分かる型になっている', () => {
    const t = emitted('ja').provider['@type'];
    expect(t).toContain('EducationalOrganization');
    // Organization 型を期待する実装（Google の Course リッチリザルト）にも素直に通す
    expect(t).toContain('Organization');
  });
});

describe('provider の事実は確定済みのものだけ', () => {
  const p = buildCourseProvider();

  it('事業者名は特商法表記（legalFacts）と同じ', () => {
    expect(p.legalName).toBe(LEGAL_FACTS.operatorName);
  });

  it('窓口は legalFacts の contactEmail と同じ', () => {
    expect(p.email).toBe(LEGAL_FACTS.contactEmail);
    expect(p.contactPoint.email).toBe(LEGAL_FACTS.contactEmail);
  });

  it('事業者名・メールをここにベタ書きしていない（事実の正準を1か所に保つ）', () => {
    for (const fact of [LEGAL_FACTS.operatorName, LEGAL_FACTS.contactEmail]) {
      expect(code, `「${fact}」が courseSchema.ts に直接書かれている`).not.toContain(fact!);
    }
  });

  it('存在しない実体情報を作っていない（住所・電話・SNSは出さない）', () => {
    const json = JSON.stringify(p);
    for (const ng of ['address', 'telephone', 'sameAs', 'founder', 'foundingDate']) {
      expect(json, `未確認の ${ng} を主張している`).not.toContain(ng);
    }
  });

  it('url は LP の canonical（/ja/ai-course）と同じ', () => {
    expect(p.url).toBe('https://kawabado.com/ja/ai-course');
  });

  it('日本語と中国語の対応を宣言している（実際に対応している事実）', () => {
    expect(p.knowsLanguage).toEqual(['ja', 'zh-Hans']);
  });
});

describe('組織の親子関係は主張しない', () => {
  it('parentOrganization / subOrganization を張っていない', () => {
    // 同一運営者であることは legalName と同一ドメインで辿れる。
    // schema の親子関係は「SportsOrganization の配下が日本語教育をしている」と読まれるので張らない
    const json = JSON.stringify(emitted('ja'));
    expect(json).not.toContain('parentOrganization');
    expect(json).not.toContain('subOrganization');
  });
});

describe('JSON-LD として壊れていない', () => {
  for (const lang of ['ja', 'zh'] as const) {
    it(`${lang}: JSON.stringify → parse が通り、必須要素が残る`, () => {
      const raw = JSON.stringify(buildCourseSchema({ lang, name: 'タイトル', description: '説明' }));
      const parsed = JSON.parse(raw);
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('Course');
      expect(parsed.provider['@id']).toBeTruthy();
      // 既存の構造（CourseInstance / Offer / PriceSpecification）を壊していない
      expect(parsed.hasCourseInstance['@type']).toBe('CourseInstance');
      expect(parsed.offers.length).toBeGreaterThan(0);
      for (const o of parsed.offers) {
        expect(o['@type']).toBe('Offer');
        expect(o.priceSpecification['@type']).toBe('PriceSpecification');
      }
      // undefined が混ざって値が消えていないこと（legalName は確定済みなので残る）
      expect(parsed.provider.legalName).toBeTruthy();
    });
  }
});
