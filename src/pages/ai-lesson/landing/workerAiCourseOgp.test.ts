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
