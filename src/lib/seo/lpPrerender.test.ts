// 販売LPの本文prerenderを守るテスト（2026-08-26）。
//
// 守るもの:
//   1. lpPrerender.json が lpContent.ts と一致している（＝LP文言を直したら生成し直す）
//   2. 本文が実用的な量ある（元は素のHTML本文が212文字しかなかった）
//   3. 金額が planCatalog と一致する（LPだけ古い値が残る事故を防ぐ）
//   4. ビルド手順に生成コマンドが入っている（＝忘れて古いまま出ない）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LP, VARIANTS } from '../../pages/ai-lesson/landing/lpContent';
import { publishedPlans } from '../aiLesson/course/plans/planCatalog';

const doc = JSON.parse(readFileSync('src/lib/seo/lpPrerender.json', 'utf8')) as {
  ja: { title: string; blocks: { h?: string; p?: string[] }[] };
  zh: { title: string; blocks: { h?: string; p?: string[] }[] };
};

const flat = (lang: 'ja' | 'zh') =>
  doc[lang].blocks.map((b) => [b.h ?? '', ...(b.p ?? [])].join('\n')).join('\n');

describe('販売LPの本文prerender', () => {
  it.each(['ja', 'zh'] as const)('%s: 本文が1,500文字以上ある（旧: 素のHTML本文212文字）', (lang) => {
    expect(flat(lang).length).toBeGreaterThan(1500);
  });

  it.each(['ja', 'zh'] as const)('%s: titleがLPのSEO文言と一致する', (lang) => {
    expect(doc[lang].title).toBe(VARIANTS.shoko.seo.title[lang]);
  });

  it.each(['ja', 'zh'] as const)('%s: LPの主要セクションの見出しがすべて入っている', (lang) => {
    const text = flat(lang);
    // 「H1/Hero/悩み/利用シーン/特徴/600円体験/roadmap/pricing/FAQ を取得可能に」の担保
    for (const heading of [
      LP.pain.heading[lang], LP.scenes.heading[lang], LP.roles.heading[lang],
      LP.features.heading[lang], LP.flow.heading[lang], LP.trialContents.heading[lang],
      LP.roadmap.heading[lang], LP.pricing.heading[lang], LP.faq.heading[lang],
    ]) {
      expect(text).toContain(heading);
    }
  });

  it.each(['ja', 'zh'] as const)('%s: 本文がlpContentと一致している（生成し直し忘れの検出）', (lang) => {
    const text = flat(lang);
    expect(text).toContain(LP.heroKeyMessage[lang]);
    expect(text).toContain(LP.trialContents.note[lang]);
    // 利用シーンは実際に言う日本語まで含める（ここが検索・AI回答で効く本文）
    for (const scene of LP.scenes.items[lang]) expect(text).toContain(scene.line);
    for (const faq of LP.faq.items[lang]) expect(text).toContain(faq.q);
  });

  it.each(['ja', 'zh'] as const)('%s: 金額がplanCatalogと一致する', (lang) => {
    const text = flat(lang);
    for (const plan of publishedPlans()) {
      expect(text).toContain(lang === 'zh' ? plan.priceLabelZh : plan.priceLabelJa);
    }
  });

  it('ビルド手順にprerender生成が入っている', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    for (const key of ['build', 'build:staging']) {
      expect(pkg.scripts[key]).toContain('generate-lp-prerender');
      // 生成 → Worker組み込み の順でないと古い本文が焼き込まれる
      expect(pkg.scripts[key].indexOf('generate-lp-prerender'))
        .toBeLessThan(pkg.scripts[key].indexOf('generate-worker'));
    }
  });

  it('Workerがnoscriptとして入れる（＝ブラウザで二重表示にならない）', () => {
    const worker = readFileSync('scripts/generate-worker.mjs', 'utf8');
    expect(worker).toContain('<noscript>');
    expect(worker).toContain('lpNoscriptHtml');
  });
});
