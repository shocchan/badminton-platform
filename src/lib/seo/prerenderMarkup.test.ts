// 素のHTML（kb-prerender）が壊れた形で出ていないか（2026-09-01）。
//
// 【なぜ作ったか】
// 読み込み中に見せるスタイルを足したとき、style属性の中でフォント名を
// 二重引用符で囲んでしまい、**そこで属性が閉じて以降の指定が全部落ちる**
// HTMLを生成していた。目で見て気づいたが、次は気づけない。
//
//   style="...font-family:system-ui,-apple-system,"Hiragino Sans",..."
//                                                 ↑ ここで終わる
//
// 生成した文字列そのものを検査して、同じ形を止める。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/generate-worker.mjs', 'utf8');

/** style="..." の中身を全部集める（テンプレート内の生成コードも含む） */
const styleAttrValues = (): string[] =>
  [...SRC.matchAll(/style=\\"([^"]*)/g)].map((m) => m[1]);

describe('style属性が途中で切れる形になっていない', () => {
  it('style属性の中に二重引用符を書かない', () => {
    // 生成コード側の定数も見る（連結で組み立てるため属性の形にはなっていない）
    const bad = [
      /font-family:[^']*"[^']*"/,   // font-family の中の "..."
    ];
    for (const re of bad) {
      const m = re.exec(SRC);
      expect(m, `style属性の中に二重引用符がある: ${m?.[0]}`).toBeNull();
    }
  });

  it('フォント名はシングルクォートで囲む', () => {
    expect(SRC).toMatch(/font-family:system-ui,-apple-system,'Hiragino Sans','Microsoft YaHei',sans-serif/);
  });

  it('組み立てた style 値の中に " が残っていない', () => {
    for (const v of styleAttrValues()) {
      expect(v.includes('"'), `style属性に " が入っている: ${v.slice(0, 60)}`).toBe(false);
    }
  });
});

describe('素のHTMLに必要なものが入っている', () => {
  it('読み込み中の帯を出す（一瞬見えても壊れて見えないように）', () => {
    expect(SRC).toContain('prerenderLoadingBar');
    expect(SRC).toContain('正在打开页面');
    expect(SRC).toContain('ページを開いています');
  });

  it('申込ボタンが出ない人への出口がある（行き止まりを作らない）', () => {
    // 「このページから申し込めます」と書いてあるのに手段が無い状態を作らない
    expect(SRC).toContain('prerenderStuckHelp');
    expect(SRC).toContain('看不到报名按钮时');
    expect(SRC).toContain('申し込みボタンが出ないときは');
  });

  it('出口に「ブラウザで開く」と連絡先が両方ある', () => {
    expect(SRC).toContain('在浏览器中打开');
    expect(SRC).toContain('ブラウザで開く');
    expect(SRC).toMatch(/主办人|主催者/);
  });

  it('サイト内リンクを減らしていない（検索向けの価値を落とさない）', () => {
    // 見た目だけ畳む。リンクの中身は NAV のまま
    expect(SRC).toMatch(/for \(const n of \(list \|\| NAV\)\)/);
  });

  it('動きを減らす設定を尊重する', () => {
    expect(SRC).toContain('prefers-reduced-motion:reduce');
  });
});

describe('React が描けたら消える仕組みは残っている', () => {
  it('MutationObserver で消す（時間で消さない）', () => {
    // 時間で消すと、まだ描けていないときに最悪の状態（真っ白）になる
    expect(SRC).toContain('MutationObserver');
    expect(SRC).toContain('kb-prerender');
  });

  it('掃除スクリプトは #root の後ろに置く', () => {
    // 前に置くと #root がまだ無く、監視相手が null になって永久に消えない
    expect(SRC).toMatch(/return block \+ m \+ '\\\\n    ' \+ PRERENDER_CLEANUP;/);
  });
});
