// 音声レッスン画面の見た目の約束（2026-09-11 CEO 実機報告より）。
//
// 1. スマホの下部ステータスバー: 接続中だけ出る「言い方がわからない」と「テキストで練習する」で1行を使い切り、
//    状態の文字が1文字ずつ縦に並んで重なっていた（iPhone Safari / WeChat）。
//    状態表示に最低幅を持たせ、足りなければボタンを2行目へ折り返す形を固定する。
// 2. 会話の吹き出しの話者名が「翔子先生」固定だった（悠斗先生を選んだ人にも翔子先生と出ていた）。
// 3. 割り込み QA パネルは ?interruptDebug=1 のときだけ（staging や ?interrupt= だけでは出さない）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./CourseVoiceLesson.tsx', import.meta.url), 'utf8');

describe('スマホの下部ステータスバー', () => {
  const bar = (() => {
    const start = SRC.indexOf('data-testid="voice-mobile-status-bar"');
    return start < 0 ? '' : SRC.slice(SRC.lastIndexOf('<div', start), start + 1200);
  })();

  it('折り返せる行になっている（状態表示とボタンを1行に押し込まない）', () => {
    expect(bar, 'ステータスバーが見つからない').not.toBe('');
    expect(bar).toMatch(/flex-wrap/);
    // 状態表示に最低幅がある＝ボタンに幅を取られて 0 にならない
    expect(bar).toMatch(/flex-1 min-w-\[12rem\]">\{statusIndicator\(false\)\}/);
  });

  it('ボタン群も折り返せる（320px 幅でもはみ出さない）', () => {
    expect(bar).toMatch(/ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">\s*\{stuckBtn\}/);
  });

  it('元の押し込み型（flex-1 min-w-0 の状態表示の隣に shrink-0 ボタンを並べる）に戻っていない', () => {
    expect(SRC).not.toMatch(/<div className="flex items-center gap-3">\s*<div className="flex-1 min-w-0">\{statusIndicator\(false\)\}<\/div>\s*\{stuckBtn\}/);
  });
});

describe('話者名', () => {
  it('吹き出しの先生の名前は、選んだ先生の名前を使う（翔子先生に固定しない）', () => {
    expect(SRC).toMatch(/teacher\.nameZh : teacher\.nameJa/);
    expect(SRC).not.toMatch(/'翔子老师' : '翔子先生'/);
  });
});

describe('割り込み QA パネル', () => {
  it('?interruptDebug=1 のときだけ出す', () => {
    expect(SRC).toMatch(/show: interruptionDebugFrom\(window\.location\.search, store\),/);
    expect(SRC).not.toMatch(/interruptionDebugFrom\([^)]*\) \|\| override/);
  });
});
