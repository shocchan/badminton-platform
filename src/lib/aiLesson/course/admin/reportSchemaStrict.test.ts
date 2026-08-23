// ai-lesson-report の structured output schema の不変条件（2026-08-23 実生徒監査P0）。
//
// OpenAI の strict モードは「properties に書いた項目を全部 required に入れる」ことを要求する。
// 中国語補助の2項目を required から抜いた版が 2026-08-23 07:16 に本番へ再デプロイされ、
// その日の全セッションのレポートが 502（OpenAI 400）→ 汎用フォールバックになった
// （corrections/naturalPhrases が空＝言い直し素材が一切出ない）。
// 同じ事故は 8/04 にも起きて f011e44 で直っていたが、別ブランチだったため当ブランチに無かった。
// ソースを読んで「properties ⊆ required」を機械で固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'supabase/functions/ai-lesson-report/index.ts'), 'utf8');

const schemaBlock = (): string => {
  const m = /const REPORT_SCHEMA = \{[\s\S]*?\n\};/.exec(SRC);
  if (!m) throw new Error('REPORT_SCHEMA が見つからない');
  return m[0];
};

describe('ai-lesson-report: strict schema は properties を全部 required に入れる', () => {
  it('トップレベルの properties と required が一致する', () => {
    const block = schemaBlock();
    const propsPart = /properties: \{([\s\S]*?)\n  \},\n  required:/.exec(block);
    expect(propsPart, 'properties ブロックが見つからない').toBeTruthy();
    // 2スペース+4スペースのインデント＝トップレベルのキーだけを拾う（corrections.items 内は8スペース）
    const keys = [...propsPart![1].matchAll(/^ {4}([A-Za-z]+): \{/gm)].map((x) => x[1]);
    const reqPart = /required: \[([\s\S]*?)\],\n\};/.exec(block);
    expect(reqPart, 'required が見つからない').toBeTruthy();
    const required = [...reqPart![1].matchAll(/"([A-Za-z]+)"/g)].map((x) => x[1]);
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const k of keys) expect(required, `required に ${k} が無い（OpenAI が 400 を返す）`).toContain(k);
  });

  it('中国語補助の2項目は null を許す（required に入れても「無し」を表せる）', () => {
    const block = schemaBlock();
    expect(block).toMatch(/achievementsZh: \{ type: \["array", "null"\]/);
    expect(block).toMatch(/encouragementZh: \{ type: \["string", "null"\]/);
  });

  it('strict: true のまま（検証を外して通すのではない）', () => {
    expect(SRC).toMatch(/strict: true/);
  });
});
