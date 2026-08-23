// 静的ページのtitle/descriptionが「画面・JSON・Worker」の3か所でズレていないか。
//
// 【なぜ要るか】
// title・descriptionはこれまで画面（react-helmet-async）にしか無く、
// JSを実行しないクローラー（WeChat・小紅書・LINE・X・Baidu）には
// index.html のフォールバックしか届いていなかった。
// そこを Worker が埋めるようにしたが、Worker はビルド時に生成される独立ファイルで
// 画面のコードを import できない。＝ 文言を持つ場所が2つに増えた。
// 2つあるものは必ずズレるので、機械で突き合わせる。
//
// 落ちたときは「JSONと画面の文言を揃える」。Worker側は自動でJSONから生成されるので
// 触る必要はない（scripts/generate-worker.mjs がJSONを読んでいる）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import staticSeo from './staticSeo.json';

const ROOT = join(__dirname, '../../..');
const workerSource = readFileSync(join(ROOT, 'scripts/generate-worker.mjs'), 'utf8');
const pages = staticSeo.pages as Record<
  string,
  { source: string; ja: { title: string; description: string }; zh: { title: string; description: string } }
>;

describe('静的ページSEO: JSONと画面の文言が一致する', () => {
  it('前提: ページが登録されている（消えたら気づく）', () => {
    expect(Object.keys(pages).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(pages)).toContain('');
    expect(Object.keys(pages)).toContain('ai-course' in pages ? 'ai-course' : 'venues');
  });

  for (const [path, entry] of Object.entries(pages)) {
    const label = path === '' ? '(トップ)' : path;
    describe(label, () => {
      const src = readFileSync(join(ROOT, entry.source), 'utf8');

      for (const lang of ['ja', 'zh'] as const) {
        it(`${lang}のtitleが ${entry.source} にある`, () => {
          expect(src, `${entry.source} の${lang} titleが staticSeo.json と違う`).toContain(entry[lang].title);
        });
        it(`${lang}のdescriptionが ${entry.source} にある`, () => {
          expect(src, `${entry.source} の${lang} descriptionが staticSeo.json と違う`).toContain(entry[lang].description);
        });
      }

      it('ja/zhで違う文言になっている（訳し忘れを検出）', () => {
        expect(entry.ja.title).not.toBe(entry.zh.title);
        expect(entry.ja.description).not.toBe(entry.zh.description);
      });
    });
  }
});

describe('静的ページSEO: WorkerがJSONを読んで差し込んでいる', () => {
  it('WorkerがstaticSeo.jsonを読み込んでいる', () => {
    expect(workerSource).toContain("readFileSync('src/lib/seo/staticSeo.json'");
    expect(workerSource).toContain('const STATIC_SEO = ${STATIC_SEO_JSON};');
  });

  it('Workerが静的ページを差し替え対象にしている', () => {
    expect(workerSource).toContain("kind: 'static'");
  });

  it('中国語URLでは <html lang> と og:locale を差し替える', () => {
    expect(workerSource, '素のHTMLが全ページ lang="ja" のままだと中国語ページが日本語として配られる')
      .toContain(`'<html lang="ja">', '<html lang="zh">'`);
    expect(workerSource).toContain('zh_CN');
  });

  it('canonicalとhreflangを素のHTMLにも入れる', () => {
    expect(workerSource).toContain('rel="canonical"');
    expect(workerSource).toContain('hreflang="x-default"');
  });
});

describe('sitemap: 自分でnoindexにしたURLを送信しない', () => {
  it('広告用variant LP（/ai-course/shoko・/yuto）はsitemapに載せない', () => {
    // 載せると Search Console が「送信されたURLがnoindexです」を毎回出す
    expect(workerSource).not.toContain("{ path: 'ai-course/shoko'");
    expect(workerSource).not.toContain("{ path: 'ai-course/yuto'");
  });

  it('ブログ記事そのものがsitemapに入る', () => {
    expect(workerSource, '一覧だけで記事が1本も入っていないと大会レポートが検索に出ない')
      .toContain('/rest/v1/blog_posts?select=id,updated_at,created_at');
  });

  it('ブログは日本語のみ（中国語URLは日本語版へcanonical）', () => {
    expect(workerSource).toContain('jaOnlyUrls');
  });
});
