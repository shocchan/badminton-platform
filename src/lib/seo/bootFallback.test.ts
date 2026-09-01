// 起動できなかったときの案内（2026-09-01）。
//
// 【なぜ作ったか】
// 実在の生徒がPCからログインできず、画面が真っ白のままだった。
// このサイトはJavaScriptで描くので、ブラウザがバンドルを実行できないと
// **エラーも出ずに何も起きない**。本人には「壊れている」としか見えない。
//
// 本番のバンドルは <script type="module"> だけで読み込まれ、
// ?. が55箇所・?? が71箇所・||= ??= が19箇所（Chrome 80〜85以降が必要）。
// 古いブラウザはバンドルを1行も実行しないので、この案内だけが頼りになる。
//
// 【ここで守ること】
// 案内そのものが古いブラウザで動かなければ、何の意味もない。
// **ES5 の範囲で書かれていること**を機械で確かめる。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const HTML = readFileSync('index.html', 'utf8');

/** 起動案内のスクリプト本体（説明コメントは含めない） */
const bootScript = (): string => {
  const m = /<script>\s*\(function \(\) \{\s*var WAIT_MS[\s\S]*?<\/script>/.exec(HTML);
  expect(m, '起動案内のスクリプトが index.html に無い').toBeTruthy();
  return m![0];
};

describe('起動できなかったときの案内', () => {
  it('index.html に入っている（バンドルとは別に届く必要がある）', () => {
    expect(bootScript().length).toBeGreaterThan(200);
  });

  it('type="module" ではない（古いブラウザは module を丸ごと無視する）', () => {
    // ここが module だと、案内そのものが実行されない
    expect(bootScript()).toMatch(/^<script>/);
  });

  it('日本語と中国語の両方を出す', () => {
    const s = bootScript();
    expect(s).toContain('ページが開けませんでした');
    expect(s).toContain('页面没能正常打开');
  });

  it('何をすればよいかを具体的に書く（「エラーです」で終わらせない）', () => {
    const s = bootScript();
    expect(s).toContain('Chrome');
    expect(s).toContain('Edge');
    // 中国でよく使われるブラウザの互換モードは、実際にこの症状を出す
    expect(s).toContain('极速模式');
    expect(s).toContain('極速モード');
  });

  it('連絡先へつなぐ（本人が詰まったまま終わらせない）', () => {
    expect(bootScript()).toContain('先生');
  });

  it('いまのURLを出す（何を開いていたのか本人も分からなくなるため）', () => {
    expect(bootScript()).toContain('location.href');
  });

  it('起動できていれば何も出さない', () => {
    expect(bootScript()).toMatch(/if \(!root \|\| root\.firstChild\) return;/);
  });
});

describe('案内そのものが古いブラウザで動く（ES5の範囲）', () => {
  const es5Only = (): string => bootScript()
    // 文字列リテラルの中身は判定から外す（日本語・中国語の文にも記号が入るため）
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

  it('アロー関数を使わない', () => {
    expect(es5Only()).not.toMatch(/=>/);
  });

  it('let / const を使わない', () => {
    expect(es5Only()).not.toMatch(/\b(let|const)\s/);
  });

  it('テンプレート文字列を使わない', () => {
    expect(es5Only()).not.toContain('`');
  });

  it('?. や ?? を使わない（この症状の原因そのもの）', () => {
    const s = es5Only();
    expect(s).not.toMatch(/\?\./);
    expect(s).not.toMatch(/\?\?/);
  });

  it('addEventListener が無い環境にも落とし先がある', () => {
    // 本当に古い環境では addEventListener すら無い
    expect(bootScript()).toMatch(/if \(window\.addEventListener\)[\s\S]*?else setTimeout/);
  });
});

describe('古いブラウザ向けの控えを出す設定になっている', () => {
  const VITE = readFileSync('vite.config.ts', 'utf8');

  it('plugin-legacy を入れている', () => {
    expect(VITE).toContain("from '@vitejs/plugin-legacy'");
    expect(VITE).toMatch(/legacy\(\{/);
  });

  it('使っている構文を自動で補う（手で列挙すると漏れる）', () => {
    expect(VITE).toContain('modernPolyfills: true');
  });

  it('なぜ要るのかが設定に書いてある（次に読む人が外さないように）', () => {
    expect(VITE).toContain('nomodule');
    expect(VITE).toContain('兼容模式');
  });
});
