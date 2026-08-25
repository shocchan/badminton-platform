// @vitest-environment node
//
// ブログ中国語訳（scripts/blog/zh/*.zh.json）の検品。ネットワークには触らない。
//
// 【なぜ機械で見るか】
// CEOの指示は2つだけ:
//   「右上の言語変更したときに、ブログ文章も中国語に切り替わるように」
//   「固有名詞とかはそのままで！変に訳しちゃだめね」
// このうち後者は目で見ても抜ける。会場名が1か所だけ「芝园公民馆」に化けても、
// 日本語話者は気づかないし、中国語話者は**その名前で地図を検索できなくなる**。
// 訳文が増えるほど人力では守れないので、ここで固定する。
//
// 【言語整合性は既存の実装を使う】
// U+FFFD・文字化け・許可していないUnicode Script・引用外の仮名は
// src/lib/aiLesson/course/adventure/advLanguageIntegrity.ts の checkText が既に見ている。
// 同じ判定を書き直さず、その関数をそのまま呼ぶ（scripts/blog/verify.mjs 経由）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error -- .mjs（型定義は持たない運用スクリプト）
import { verifyTranslation } from './verify.mjs';
// @ts-expect-error -- .mjs
import { KEEP_JA, FORBIDDEN_VARIANTS } from './glossary.mjs';
// @ts-expect-error -- .mjs
import { extractTextNodes, applyTextNodes, structureFingerprint } from './htmlText.mjs';

const DIR = join(__dirname, 'zh');

/**
 * 訳し終えた記事。**訳した記事はここへ足す**（足さないと検品が一切走らない）。
 * 第1陣がPVの87%をカバーする8本、第2陣で id 16（ばりかた屋）・id 20（カード決済）・
 * id 23（火瓶杯 団体戦）を追加。
 * id 7（通常活動の案内）・id 11（ばりかた屋コラボ特典）は集客の入口になる案内記事。
 * 会場の住所・アクセス・参加費が並ぶので、固有名詞が1つ訳されるだけで現地に着けなくなる。
 * id 32（数字の振り返り）・33（大事にしている3つのこと）・34（バド対決ゲーム）・
 * 29（サークル案内）・30（シャトル供養カウンター）・31（コートの上の言葉）・
 * 25（蕨市民体育館への行き方）・26（一人参加）・27（初めての大会の持ち物）・
 * 28（ブランクからの再開）は まだ status=draft。公開前に訳を用意しておくためここへ入れている
 * （下書きは anon で読めないので、todo/source は読み取り専用のSQL経由で書き出した）。
 */
const TRANSLATED_IDS = [7, 9, 11, 12, 13, 16, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];

interface Todo { id: number; title: string; excerpt: string; skeleton: string; contentHash: string; nodes: { index: number; ja: string }[] }
interface ZhDoc { id: number; skeleton: string; contentHash: string; title_zh: string; excerpt_zh: string; nodes: { index: number; zh: string }[] }

const load = (id: number) => {
  const todo: Todo = JSON.parse(readFileSync(join(DIR, `${id}.todo.json`), 'utf8'));
  const zh: ZhDoc = JSON.parse(readFileSync(join(DIR, `${id}.zh.json`), 'utf8'));
  const source = readFileSync(join(DIR, `${id}.source.html`), 'utf8');
  return { todo, zh, source };
};

describe('前提: 訳す対象がそろっている', () => {
  it('全IDぶんの日本語スナップショットと訳文がある', () => {
    for (const id of TRANSLATED_IDS) {
      expect(existsSync(join(DIR, `${id}.todo.json`)), `${id}.todo.json`).toBe(true);
      expect(existsSync(join(DIR, `${id}.zh.json`)), `${id}.zh.json`).toBe(true);
      expect(existsSync(join(DIR, `${id}.source.html`)), `${id}.source.html`).toBe(true);
    }
  });
});

describe.each(TRANSLATED_IDS)('記事 id=%i', (id) => {
  const { todo, zh, source } = load(id);
  const post = { id, title: todo.title, excerpt: todo.excerpt, content: source };

  it('全ノードに訳がある（訳し漏れは日本語のまま混ざる）', () => {
    const missing = todo.nodes.filter((n) => !zh.nodes.some((z) => z.index === n.index && z.zh.trim()));
    expect(missing.map((n) => `${n.index}: ${n.ja.slice(0, 24)}`)).toEqual([]);
  });

  it('タイトル・抜粋も訳してある', () => {
    expect(zh.title_zh.trim(), 'title_zh が空').not.toBe('');
    expect(zh.excerpt_zh.trim(), 'excerpt_zh が空').not.toBe('');
  });

  it('固有名詞が日本語のまま残っている（CEO指示）', () => {
    const pairs: [string, string, string][] = [
      ['title', todo.title, zh.title_zh],
      ['excerpt', todo.excerpt, zh.excerpt_zh],
      ...todo.nodes.map((n) => [
        `node ${n.index}`, n.ja, zh.nodes.find((z) => z.index === n.index)?.zh ?? '',
      ] as [string, string, string]),
    ];
    const broken: string[] = [];
    for (const [where, ja, zhText] of pairs) {
      if (!zhText) continue;
      for (const term of KEEP_JA) {
        if (ja.includes(term) && !zhText.includes(term)) broken.push(`${where}: 「${term}」が消えている`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('簡体字で統一されている（繁体字・台湾表記が混ざらない）', () => {
    const all = [zh.title_zh, zh.excerpt_zh, ...zh.nodes.map((n) => n.zh)].join('\n');
    for (const bad of FORBIDDEN_VARIANTS) {
      expect(all.includes(bad), `「${bad}」が混ざっている`).toBe(false);
    }
  });

  it('訳を骨格へ戻してもタグ・URL・iframe属性が1つも動かない', () => {
    const map = Object.fromEntries(zh.nodes.map((n) => [n.index, n.zh]));
    const out = applyTextNodes(source, map);
    expect(structureFingerprint(out)).toBe(structureFingerprint(source));
    expect(out).not.toBe(source); // 何も変わっていない＝index の取り違え
  });

  it('日本語の文がそのまま残っていない（訳し忘れの検出）', () => {
    const map = Object.fromEntries(zh.nodes.map((n) => [n.index, n.zh]));
    const out = applyTextNodes(source, map);
    const outNodes = extractTextNodes(out).map((n: { text: string }) => n.text);
    // 固有名詞・URL・数字だけのノードは日本語のままでよい。
    // 「仮名を含み、かつ固有名詞リストで説明がつかない」ノードだけを訳し忘れとみなす
    const leftover = outNodes.filter((t: string) => {
      let s = t;
      for (const term of [...KEEP_JA].sort((a: string, b: string) => b.length - a.length)) s = s.split(term).join('');
      return /[ぁ-ゟァ-ヺ]/.test(s);
    });
    expect(leftover).toEqual([]);
  });

  it('言語整合性（checkText）に引っかからない', async () => {
    const r = await verifyTranslation(post, zh);
    expect(r.integrityRan, 'checkText を読めていない（--experimental-strip-types）').toBe(true);
    expect(r.issues.map((i: { kind: string; where: string; detail: string }) => `${i.kind} ${i.where} ${i.detail}`)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('日本語スナップショットと訳文の指紋が一致する（片方だけ更新した事故の検出）', () => {
    expect(zh.skeleton).toBe(todo.skeleton);
    expect(zh.contentHash).toBe(todo.contentHash);
    expect(todo.skeleton).toBe(structureFingerprint(source));
  });
});

describe('訳してはいけない語の登録漏れ', () => {
  it('固有名詞リストに会場名・大会名・店名が入っている', () => {
    for (const must of ['芝園公民館', '蕨市民体育館', '川口・蕨バド交流杯', 'kawabado', 'ばりかた屋', '火瓶杯', '第2種検定球']) {
      expect(KEEP_JA, `${must} が KEEP_JA に無い`).toContain(must);
    }
  });
});
