// @vitest-environment node
//
// SEO表記規約の自動検証（2026-08-29）。
//
// 【なぜ要るか】
// title / description は人が手で書くので、書いた人ごとに型がばらける。
// 実際 2026-08-29 の点検で、日本語トップだけ重複を直して**中国語トップは
// 「川口」「蕨」「羽毛球」が2回ずつ残ったまま**になっていたし、
// 戸田ページは title に「戸田」が3回入っていた。
// 人の目で毎回そろえるのは無理なので、機械が守れる分だけ機械に守らせる。
//
// 【ここで縛らないこと】
// 文章の良し悪し・訴求力は縛れない。ここが見るのは「型」だけ。
// 規約の全文（なぜそうするかを含む）は src/lib/seo/staticSeo.json の _readme にある。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildWorkerSource } from '../../../scripts/generate-worker.mjs';
import staticSeo from './staticSeo.json' with { type: 'json' };

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const pages = staticSeo.pages;
const entries = Object.entries(pages).flatMap(([key, v]) =>
  ['ja', 'zh'].map((lang) => ({ key, label: key === '' ? '(トップ)' : key, lang, ...v[lang] }))
);

/** title / description で反復を数える語。地域名と競技名＝詰め込みが起きる語 */
const WATCHED = ['川口', '蕨', '戸田', 'バドミントン', '羽毛球', '交流会', '大会', '会場', '公民館', '体育館', 'サークル', '社团'];

let W;
beforeAll(async () => {
  const src = buildWorkerSource(readFileSync(join(ROOT, 'index.html'), 'utf8'))
    + '\nexport { generateSitemap, STATIC_SEO, NAV, KNOWN_LEAVES, BRAND_SAME_AS };\n';
  W = await import(/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
});

describe('規約1: titleの区切りは半角パイプ', () => {
  for (const e of entries) {
    it(`${e.label} ${e.lang}`, () => {
      expect(e.title, '全角の｜は使わない（半角の | に統一）').not.toContain('｜');
      expect(e.title, '／ や / を区切りに使わない').not.toMatch(/[／]/);
    });
  }
});

describe('規約2: ブランド名を名乗る', () => {
  it('日本語トップの title に「カワバド」が入る', () => {
    // 指名検索の受け皿。2026-08-28まで1度も入っていなかった
    expect(pages[''].ja.title).toContain('カワバド');
  });
  it('中国語トップの title に「kawabado」が入る', () => {
    expect(pages[''].zh.title).toContain('kawabado');
  });
});

describe('規約3: titleで同じ語を3回以上繰り返さない', () => {
  // 2回は「固有名詞の一部＋団体名」のときだけ許容する（例: 芝園公民館・蕨市民体育館 … 川口・蕨）。
  // 3回はどう説明しても詰め込みなので機械で止める。
  for (const e of entries) {
    it(`${e.label} ${e.lang}`, () => {
      const over = WATCHED.filter((w) => e.title.split(w).length - 1 >= 3);
      expect(over, `「${over.join('」「')}」が3回以上出ている: ${e.title}`).toEqual([]);
    });
  }
});

describe('規約4: title は40字以内（目安32字）', () => {
  for (const e of entries) {
    it(`${e.label} ${e.lang}`, () => {
      expect(e.title.length, `${e.title.length}字: ${e.title}`).toBeLessThanOrEqual(40);
    });
  }
});

describe('規約5: description は文であって検索語の羅列ではない', () => {
  for (const e of entries) {
    it(`${e.label} ${e.lang}`, () => {
      // 日本語のSERPは概ね120字前後で切れる。超えると末尾が読まれない
      expect(e.description.length, `${e.description.length}字: ${e.description}`).toBeLessThanOrEqual(120);
      // 句点が1つも無い＝単語を並べただけの疑い
      expect(e.description, '句点が無い（文になっていない）').toContain('。');
      /*
       * 【description の語の反復は機械で見ない（2026-08-29 に一度作って外した）】
       * 「蕨」の出現回数を数えると、蕨市・蕨駅・蕨市民体育館 の3つで3回になる。
       * これは詰め込みではなく別々の固有名詞で、日本語は分かち書きしないので
       * 部分文字列では区別できない。閾値を4字・5字・6字と上げても
       * 「キャンセル」（キャンセルポリシーの説明）や「館まで徒歩約1◯分」（2会場の距離）が
       * 引っかかった。**正しい文で落ちるテストは、いずれ無効化される。**
       * 羅列にしないことは _readme の規約（人が守る側）に置いてある。
       */
    });
  }
});

describe('規約6: 新規ページを足したら、必要な場所を全部直したか', () => {
  // 片方だけ直すと「素のHTMLがトップの文言のまま」「noindexが付く」「検索に送られない」
  // のいずれかが黙って起きる。どれも人の目には見えない壊れ方なので機械で見る。
  let xml;
  beforeAll(async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => [] });
    xml = await W.generateSitemap({ VITE_SUPABASE_URL: 'https://stub.co', VITE_SUPABASE_ANON_KEY: 'k' });
  });

  for (const key of Object.keys(pages)) {
    const label = key === '' ? '(トップ)' : key;
    it(`${label}: sitemap に載っている`, () => {
      expect(xml, `/ja/${key} が sitemap に無い＝検索に送られない`)
        .toContain(`<loc>https://kawabado.com/ja/${key}</loc>`);
    });

    if (key === '') continue;
    it(`${label}: KNOWN_LEAVES に1階層目がある`, () => {
      // ここが漏れると Worker が X-Robots-Tag: noindex を付けて検索から消える
      expect(W.KNOWN_LEAVES, `「${key.split('/')[0]}」が KNOWN_LEAVES に無い`)
        .toContain(key.split('/')[0]);
    });
  }
});

describe('規約7: sameAs は実在URLだけ。画面とWorkerでズレない', () => {
  const src = readFileSync(join(ROOT, 'src/lib/seo/brandSameAs.ts'), 'utf8');

  it('空のあいだは sameAs キー自体を出さない（空配列は「SNSが無い」という主張になる）', () => {
    expect(W.BRAND_SAME_AS).toEqual([]);
    expect(src).toContain('export const BRAND_SAME_AS: string[] = []');
  });

  it('検索結果ページや招待リンクを sameAs に入れない', () => {
    for (const url of W.BRAND_SAME_AS) {
      expect(url, `${url} は検索結果ページ。プロフィールURLではない`).not.toMatch(/[?&]q=|\/search\b/);
      expect(url, `${url} は https で始まっていない`).toMatch(/^https:\/\//);
    }
  });

  it('画面（brandSameAs.ts）とWorkerが同じ本数を持つ', () => {
    const m = /export const BRAND_SAME_AS: string\[\] = \[([\s\S]*?)\];/.exec(src);
    const n = (m?.[1].match(/'https:/g) || []).length;
    expect(n, '片方だけURLを足すと、素のHTMLとJS実行後で名乗る実体が変わる')
      .toBe(W.BRAND_SAME_AS.length);
  });
});
