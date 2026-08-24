// llms.txt に書いた「行き先」と「引用」が実在するか（2026-08-24）。
//
// 【なぜ要るか】
// 本文のプリレンダが無いので、llms.txt は LLM が読める唯一の本文になっている。
// ここに存在しないURLを書けば、AIは利用者に**存在しないページを案内する**。
// FAQを手で書き写せば、いつか実際の回答とズレて、AIが古い案内を配り続ける。
// どちらも人の目には見えない壊れ方なので、機械で縛る。
//
// 落ちたときの直し方:
//   - URLで落ちた → llms.txt から消すか、App.tsx に実際のルートを作る
//   - FAQで落ちた → FaqPage.tsx の文言をそのままコピーし直す（llms.txt 側で言い換えない）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KAWABADO_LEGAL_PUBLISH } from '../legal/kawabadoLegalFacts';

const ROOT = join(__dirname, '../../..');
const llms = readFileSync(join(ROOT, 'public/llms.txt'), 'utf8');
const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
const faqSource = readFileSync(join(ROOT, 'src/pages/FaqPage.tsx'), 'utf8');
const robots = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8');

/** llms.txt に出てくる kawabado.com のパス（重複なし） */
const paths = [...new Set(
  [...llms.matchAll(/https:\/\/kawabado\.com(\/[^\s)）」、]*)/g)].map((m) => m[1])
)];

/** `/ja/foo/bar` → `foo/bar`（App.tsx の入れ子ルートは相対パスで書かれている） */
const relative = (p: string) => p.replace(/^\/(ja|zh)\/?/, '').replace(/\/$/, '');

describe('llms.txt: 案内しているURLが実在する', () => {
  it('前提: URLを列挙できている', () => {
    expect(paths.length).toBeGreaterThan(10);
  });

  it('すべて言語プレフィックス付き（/ja/ か /zh/）', () => {
    for (const p of paths) {
      expect(p, `${p} に言語プレフィックスが無い`).toMatch(/^\/(ja|zh)(\/|$)/);
    }
  });

  for (const p of paths) {
    it(`${p} が App.tsx のルートに存在する`, () => {
      const rel = relative(p);
      if (rel === '') {
        // 言語トップは index ルート
        expect(app, 'index ルートが無い').toContain('<Route index');
        return;
      }
      expect(app, `path="${rel}" が App.tsx に無い（存在しないURLをLLMに教えている）`)
        .toContain(`path="${rel}"`);
    });
  }

  it('robots.txt で塞いだURLを案内していない', () => {
    for (const p of paths) {
      expect(robots, `${p} は robots.txt で Disallow なのに llms.txt に載っている`)
        .not.toContain(`Disallow: ${p}\n`);
    }
  });

  it('法務3ページは公開状態のときだけ載せる', () => {
    const listed = paths.some((p) => p === '/ja/tokushoho');
    expect(listed, '公開フラグと llms.txt の記載が食い違っている')
      .toBe(KAWABADO_LEGAL_PUBLISH);
  });
});

/* ────────────────────────────────────────────────────────────
   FAQ の引用が FaqPage.tsx の実文言そのままか
   ──────────────────────────────────────────────────────────── */

const quoted = (() => {
  const lines = llms.split('\n');
  const out: { q: string; a: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const q = /^- Q: (.+)$/.exec(lines[i]);
    if (!q) continue;
    const a = /^ {2}A: (.+)$/.exec(lines[i + 1] ?? '');
    out.push({ q: q[1], a: a ? a[1] : '' });
  }
  return out;
})();

/**
 * FaqPage.tsx が持っている q の総数（ja + zh）。
 * ja は複数行、zh は `{ q: '...', a: '...' }` の1行なので、行頭に縛らずに数える
 */
const faqPageCount = [...faqSource.matchAll(/(?:^|[\s{])q:\s*'/g)].length;

describe('llms.txt: FAQ は FaqPage.tsx の実文言', () => {
  it('前提: Q&Aを抜き出せている', () => {
    expect(quoted.length).toBeGreaterThan(0);
  });

  it('質問と答えが対になっている（A行の抜け落ちが無い）', () => {
    for (const { q, a } of quoted) {
      expect(a, `「${q}」に A 行が無い`).not.toBe('');
    }
  });

  for (const { q, a } of quoted) {
    it(`「${q}」が FaqPage.tsx に存在する`, () => {
      expect(faqSource, `質問「${q}」は FaqPage.tsx に無い（創作）`).toContain(q);
      expect(faqSource, `「${q}」の答えが FaqPage.tsx と一字一句一致しない`).toContain(a);
    });
  }

  it('FaqPage.tsx の全問を載せている（実装が増えたら llms.txt も追う）', () => {
    expect(quoted.length, 'FaqPage.tsx にある問いの数と llms.txt の数が違う')
      .toBe(faqPageCount);
  });
});

/* ────────────────────────────────────────────────────────────
   鮮度・事業の切り分け
   ──────────────────────────────────────────────────────────── */

describe('llms.txt: LLMが鮮度と実体を判断できる', () => {
  it('更新日を ISO 形式で書いている', () => {
    expect(llms).toMatch(/最終更新: \d{4}-\d{2}-\d{2}/);
  });

  it('バドミントンと日本語教育が別事業だと明記している', () => {
    expect(llms).toContain('別の事業');
  });

  it('推測で実績を書かせない注意を入れている', () => {
    expect(llms).toContain('推測して補わないでください');
  });
});
