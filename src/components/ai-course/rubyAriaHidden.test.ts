// ルビ（<rt>）は支援技術へ二重読みさせない、という全社ルールをソースで固定する（2026-08-23）。
//
// なぜ要るか: RubyText.tsx のファイル冒頭は「読みをalt/ariaへ漏らさない」と宣言し、
// AdvRuby.tsx は `<rt aria-hidden>` に「RubyText.tsx と同じ方針」とコメントしている。
// ところが実際には RubyText.tsx と CourseTextLesson.tsx の <rt> に aria-hidden が無く、
// スクリーンリーダーが「疲れる → つかれる」と本文と読みを二度読みしていた（方針とコードの食い違い）。
//
// 個々のコンポーネントを描画して検査してもよいが、それだと**新しく足したルビ描画**が漏れる。
// ソースを読んで「src 配下の <rt> は必ず aria-hidden を持つ」を機械で固定する。
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC_ROOT = resolve(process.cwd(), 'src');

/** src 配下の .ts/.tsx を全部集める（テストは除く） */
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [full];
  });

/** コメントを落とす（AdvRuby.tsx の解説コメントに `<ruby>/<rt>` と書いてあり、素の走査だと誤検知する） */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 開始タグ `<rt ...>` を全部拾う（閉じタグ </rt> は拾わない） */
const rtOpenTags = (src: string): string[] =>
  [...stripComments(src).matchAll(/<rt(?![a-zA-Z])[^>]*>/g)].map((m) => m[0]);

describe('ルビの読みは支援技術へ二重読みさせない', () => {
  const files = sourceFiles(SRC_ROOT);

  it('src 配下の <rt> は例外なく aria-hidden を持つ', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const tag of rtOpenTags(readFileSync(file, 'utf8'))) {
        if (!/aria-hidden/.test(tag)) offenders.push(`${file.slice(SRC_ROOT.length + 1)}: ${tag}`);
      }
    }
    expect(offenders, `aria-hidden の無い <rt>（読みが二重に読み上げられる）:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('検査対象の <rt> が実際に存在する（正規表現が壊れたら気づけるように）', () => {
    const total = files.reduce((n, f) => n + rtOpenTags(readFileSync(f, 'utf8')).length, 0);
    expect(total).toBeGreaterThanOrEqual(3); // RubyText×2・CourseTextLesson×1・AdvRuby×1
  });
});
