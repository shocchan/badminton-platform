// WorkerのOGP文言が、LPの実際のSEO文言とズレていないか（2026-08-22）。
//
// 【なぜ要るか】
// LPのタイトル・説明は react-helmet-async で入る＝**JS実行後**。
// WeChat・LINE・X のクローラーはJSを実行しないので、素のHTMLに何が書いてあるかで
// シェアカードが決まる。そこは Worker（scripts/generate-worker.mjs）が差し込んでいる。
//
// Worker はビルド時に埋め込む独立したJSなので lpContent.ts を import できず、
// 文言を**書き写して**持っている。書き写しは必ずズレるので、機械で突き合わせる。
// LP側の文言を直したら、このテストが落ちて Worker 側も直すよう促す。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VARIANTS } from './lpContent';
import { buildLegalPages } from '../../../lib/aiLesson/course/legal/legalContent';

const workerSource = readFileSync(
  join(__dirname, '../../../../scripts/generate-worker.mjs'), 'utf8',
);

/** Worker側の AI_COURSE_SEO から値を1つ取り出す（テスト用の素朴な抜き出し） */
const workerValue = (key: string): string | null => {
  const m = new RegExp(`${key}: '([^']*)'`).exec(workerSource);
  return m ? m[1] : null;
};

describe('AIコースLPのOGP: WorkerとLPで文言が一致する', () => {
  const shoko = VARIANTS.shoko;

  it('LP側にSEO文言がある（前提が消えたら気づく）', () => {
    expect(shoko.seo.title.ja.length).toBeGreaterThan(10);
    expect(shoko.seo.description.zh.length).toBeGreaterThan(20);
  });

  it('Workerに AI_COURSE_SEO がある', () => {
    expect(workerSource).toContain('const AI_COURSE_SEO');
  });

  it('日本語のタイトル・説明が一致する', () => {
    expect(workerSource, 'Workerのjaタイトルが古い').toContain(shoko.seo.title.ja);
    expect(workerSource, 'Workerのja説明が古い').toContain(shoko.seo.description.ja);
  });

  it('中国語のタイトル・説明が一致する', () => {
    expect(workerSource, 'Workerのzhタイトルが古い').toContain(shoko.seo.title.zh);
    expect(workerSource, 'Workerのzh説明が古い').toContain(shoko.seo.description.zh);
  });

  it('OG画像のパスが一致する', () => {
    expect(workerValue('ogImage')).toBe(shoko.seo.ogImage);
  });

  it('Workerが /ja|zh/ai-course を差し替え対象にしている', () => {
    expect(workerSource).toContain("kind: 'aiCourse'");
    expect(workerSource).toMatch(/ai-course/);
  });

  it('sitemapにAIコースの主ページが入っている', () => {
    expect(workerSource, 'sitemapにai-courseが無い＝Googleが見つけられない').toContain("path: 'ai-course'");
  });
});

describe('先生別ページ: それぞれの先生の文言で出る', () => {
  it('悠斗先生のページに翔子先生のタイトルを出さない', () => {
    const yuto = VARIANTS.yuto;
    expect(workerSource, 'Workerに悠斗先生のjaタイトルが無い').toContain(yuto.seo.title.ja);
    expect(workerSource, 'Workerに悠斗先生のzhタイトルが無い').toContain(yuto.seo.title.zh);
    expect(workerSource, '悠斗先生のOG画像が無い').toContain(yuto.seo.ogImage);
  });
});

/**
 * 法務ページ（利用規約・特商法など）は sitemap に載せている。
 * 素のHTMLのタイトルが全部同じだと、**同一タイトルの重複ページ**として扱われる。
 * 実際 2026-08-22 に sitemap へ足した直後、12ページ全部が
 * 「川口・蕨バドミントン交流会」で出ていた（本番実測で発見）。
 */
describe('法務ページ: sitemapに載せた分のタイトルがWorkerにある', () => {
  for (const lang of ['ja', 'zh'] as const) {
    it(`${lang}: 全ページのタイトルがWorkerに書かれている`, () => {
      const missing = buildLegalPages(lang)
        .filter((page) => !workerSource.includes(page.title))
        .map((page) => `${page.id}: ${page.title}`);
      expect(missing, `Workerに無い法務ページのタイトル:\n${missing.join('\n')}`).toEqual([]);
    });
  }

  it('sitemapに載せたページは全部Worker側の対象になっている', () => {
    const listed = [...workerSource.matchAll(/path: 'ai-course\/([a-z-]+)'/g)].map((m) => m[1]);
    const legalIds: string[] = buildLegalPages('ja').map((p) => p.id);
    const notHandled = listed
      .filter((p) => p !== 'shoko' && p !== 'yuto')
      .filter((p) => !legalIds.includes(p));
    expect(notHandled, `sitemapにあるのにWorkerが扱っていない: ${notHandled.join(', ')}`).toEqual([]);
  });
});
