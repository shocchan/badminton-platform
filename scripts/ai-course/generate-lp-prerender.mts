// 販売LPの本文を、JSを実行しないクローラー向けに書き出す（2026-08-26）。
//
// 【解く問題】
// https://kawabado.com/ja/ai-course の素のHTML本文は**212文字**しかなかった。
// title/description/OGP/Course schema はWorkerが差し込んでいるが、
// 本文（見出し・悩み・利用シーン・体験の中身・ロードマップ・FAQ）は
// すべてReactのクライアント描画で、JSを実行しないクローラーには存在しない。
//
// AIクローラー（GPTBot/ClaudeBot/PerplexityBot）は基本的にJSを実行しないので、
// robots.txt で招き入れ llms.txt を置いても、**肝心の販売ページが読めていなかった**。
//
// 【方式】
// LPの文言（lpContent.ts が正準）から本文だけを取り出してJSONにし、
// Worker が <noscript> として素のHTMLへ入れる。
//   - 見える内容は実際のページと同じ（クローキングにならない）
//   - <noscript> なのでブラウザでは描画されず、二重表示にならない
//   - Reactアプリ全体のSSR化はしない（リスクに見合わない）
//
// 実行: vite-node scripts/ai-course/generate-lp-prerender.mts
// 出力: src/lib/seo/lpPrerender.json（generate-worker.mjs が読む）
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LP, VARIANTS } from '../../src/pages/ai-lesson/landing/lpContent';
import { publishedPlans } from '../../src/lib/aiLesson/course/plans/planCatalog';

type Lang = 'ja' | 'zh';

/** 見出しと段落の並び。Workerはこれをそのまま h2/p として書き出す */
interface Block { h?: string; p?: string[] }

const buildBlocks = (lang: Lang): Block[] => {
  const blocks: Block[] = [];

  // 見出し（3行を1つのH1相当に）
  blocks.push({
    h: LP.heroTitleLines[lang].join(''),
    p: [LP.heroKeyMessage[lang], LP.heroSub[lang], LP.heroChips[lang].join(' / ')],
  });

  blocks.push({
    h: LP.pain.heading[lang],
    p: [LP.pain.lead[lang], ...LP.pain.items[lang].map((i) => `${i.scene}: ${i.text}`)],
  });

  // 日本生活の利用シーン（2026-08-26 新設。ここが「自分ごと」になる本文）
  blocks.push({
    h: LP.scenes.heading[lang],
    p: [
      LP.scenes.lead[lang],
      ...LP.scenes.items[lang].map((i) => `${i.place}「${i.line}」${i.body}`),
    ],
  });

  blocks.push({
    h: LP.roles.heading[lang],
    p: [
      LP.roles.sub[lang],
      `${LP.roles.ai.name[lang]}: ${LP.roles.ai.items[lang].join(' / ')}`,
      `${LP.roles.human.name[lang]}: ${LP.roles.human.items[lang].join(' / ')}`,
    ],
  });

  blocks.push({
    h: LP.features.heading[lang],
    p: [LP.features.lead[lang], ...LP.features.items[lang].map((i) => `${i.title}: ${i.value}`)],
  });

  blocks.push({
    h: LP.flow.heading[lang],
    p: [LP.flow.lead[lang], ...LP.flow.steps[lang].map((s, i) => `${i + 1}. ${s.title} — ${s.body}`)],
  });

  // 600円の体験で起きること（2026-08-26 新設）
  blocks.push({
    h: LP.trialContents.heading[lang],
    p: [
      LP.trialContents.lead[lang],
      ...LP.trialContents.steps[lang].map((s, i) => `${i + 1}. ${s}`),
      LP.trialContents.note[lang],
    ],
  });

  blocks.push({
    h: LP.roadmap.heading[lang],
    p: [
      LP.roadmap.note[lang],
      ...LP.roadmap.phases[lang].map((ph) => `${ph.span}: ${ph.items.join(' / ')}`),
    ],
  });

  // 料金は**カタログから**組む（LP文言に金額を書かない規律を守る）
  blocks.push({
    h: LP.pricing.heading[lang],
    p: [
      LP.pricing.lead[lang],
      ...publishedPlans().map((pl) => {
        const name = lang === 'zh' ? pl.nameZh : pl.nameJa;
        const price = lang === 'zh' ? pl.priceLabelZh : pl.priceLabelJa;
        const duration = lang === 'zh' ? pl.durationLabelZh : pl.durationLabelJa;
        return `${name}: ${price}（${duration}）`;
      }),
      LP.priceTeaser.note[lang],
    ],
  });

  blocks.push({
    h: LP.faq.heading[lang],
    p: LP.faq.items[lang].map((f) => `${f.q} ${f.a}`),
  });

  return blocks;
};

const out = {
  _readme: [
    '販売LPの本文（JSを実行しないクローラー向け）。lpContent.ts と planCatalog が正準。',
    'このファイルは自動生成。手で編集しないこと（次のビルドで上書きされる）。',
    '生成: vite-node scripts/ai-course/generate-lp-prerender.mts',
  ],
  ja: { title: VARIANTS.shoko.seo.title.ja, blocks: buildBlocks('ja') },
  zh: { title: VARIANTS.shoko.seo.title.zh, blocks: buildBlocks('zh') },
};

const path = join(import.meta.dirname, '../../src/lib/seo/lpPrerender.json');
writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);

const chars = (l: Lang) =>
  out[l].blocks.reduce((n, b) => n + (b.h?.length ?? 0) + (b.p ?? []).join('').length, 0);
console.log(`✅ lpPrerender.json: ja ${chars('ja')}文字 / zh ${chars('zh')}文字（旧: 素のHTML本文 212文字）`);
