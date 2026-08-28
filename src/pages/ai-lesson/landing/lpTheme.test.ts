// LPの見た目の切り替え（2026-08-27・CEO依頼の試作）。
//
// 【何を守るか】
// これは**見比べるための試作**であって、置き換えではない。
//   ① 何もしない訪問者には、これまでどおりの見た目しか出ない
//   ② 既定を選んだ人の重さが1バイトも増えない（風景の読み込みが起きない）
//   ③ 試作をやめたくなったら default へ戻せる（保存が残って戻れない、を作らない）
//
// CEOが選ぶまで既定は消さない。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveLpTheme } from './lpTheme';

const CSS = readFileSync('src/index.css', 'utf8');
const HERO = readFileSync('src/pages/ai-lesson/landing/AiCourseHero.tsx', 'utf8');
const PAGE = readFileSync('src/pages/ai-lesson/landing/AiCourseLandingPage.tsx', 'utf8');

describe('どの見た目になるか', () => {
  it('何も指定しなければ既定', () => {
    expect(resolveLpTheme('', null)).toBe('default');
  });

  it('URLで指定すれば試作', () => {
    expect(resolveLpTheme('?theme=adventure', null)).toBe('adventure');
  });

  it('保存された指定を覚えている（毎回URLに付け直さなくても見比べられる）', () => {
    expect(resolveLpTheme('', 'adventure')).toBe('adventure');
  });

  it('URLの指定が保存より強い（見比べるときに切り替えられる）', () => {
    expect(resolveLpTheme('?theme=default', 'adventure')).toBe('default');
  });

  it('知らない値は既定に倒す（壊れた指定で見た目が壊れない）', () => {
    expect(resolveLpTheme('?theme=neon', null)).toBe('default');
    expect(resolveLpTheme('', 'neon')).toBe('default');
  });

  it('default を明示したら保存も消す（戻れなくならない）', () => {
    const src = readFileSync('src/pages/ai-lesson/landing/lpTheme.ts', 'utf8');
    expect(src).toMatch(/if \(fromUrl === 'default'\) localStorage\.removeItem\(KEY\)/);
  });
});

describe('既定を壊していない', () => {
  it('既定のパレットが元の値のまま', () => {
    // 試作は別セレクタで上書きするだけ。@theme の値には触らない
    expect(CSS).toMatch(/--color-lp-ivory: #FBF5EC;/);
    expect(CSS).toMatch(/--color-lp-coral: #EE7A56;/);
  });

  it('試作は data-lp-theme="adventure" の中でだけ効く', () => {
    const block = /\[data-lp-theme='adventure'\] \{([\s\S]*?)\n\}/.exec(CSS);
    expect(block, '試作パレットのブロックが見つからない').toBeTruthy();
    expect(block![1]).toContain('--color-lp-coral: #C25B3C');
  });

  it('既定では風景の要素を display:none にして読み込みごと止める', () => {
    expect(CSS).toMatch(/\.lp-adv-hero-bg \{ display: none; \}/);
    expect(CSS).toMatch(/\[data-lp-theme='adventure'\] \.lp-adv-hero-bg \{ display: block; \}/);
  });

  it('紙の質感は同じ要素に効かせる（子孫セレクタにしない）', () => {
    // 空白を入れると自分自身に当たらず、無言で効かなくなる（実機で踏んだ）
    expect(CSS).toContain("[data-lp-theme='adventure'].lp-paper {");
    expect(CSS).not.toContain("[data-lp-theme='adventure'] .lp-paper {");
  });
});

describe('重くしない', () => {
  it('紙の質感に画像を使わない（全訪問者の初回表示に乗るため）', () => {
    const block = /\[data-lp-theme='adventure'\]\.lp-paper \{([\s\S]*?)\n\}/.exec(CSS);
    expect(block).toBeTruthy();
    expect(block![1]).not.toMatch(/\.webp|\.png|\.avif|\.jpg/);
    expect(block![1]).toContain('gradient');
  });

  it('ヒーローの風景はAVIFを先に出す', () => {
    expect(HERO).toMatch(/<source srcSet="\/ai-course\/map\/world-bg@1x\.avif" type="image\/avif"/);
  });

  it('ヒーローの風景に負のz-indexを使わない', () => {
    // 親が背景色を持つので -z-10 にすると背景色の裏へ回り、無言で消える（実機で踏んだ）
    const code = HERO.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\s*\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/lp-adv-hero-bg[^"]*-z-10/);
    expect(code).toMatch(/relative z-10 mx-auto max-w-6xl/);
  });
});

describe('切り替えは読んでいる途中で変わらない', () => {
  it('マウント時に一度だけ決める', () => {
    // 途中で入れ替わると、同じページで色が変わって混乱する
    expect(PAGE).toMatch(/const \[theme\] = useState\(currentLpTheme\);/);
    expect(PAGE).toContain('data-lp-theme={theme}');
  });
});
