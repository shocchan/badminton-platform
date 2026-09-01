// LPの見た目（2026-08-27 試作 → 2026-08-28 冒険を既定に）。
//
// CEOが2案を見比べて「冒険の方がいい」と決定。何も指定しない訪問者には冒険が出る。
//
// 【何を守るか】
//   ① 何もしない訪問者に冒険が出る
//   ② 暖色へ戻す道が残っている（PCの見え方が未解決なので、消すのは次の課題）
//   ③ 既定が変わっても古い保存値が残り続けない
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveLpTheme, DEFAULT_LP_THEME } from './lpTheme';

const CSS = readFileSync('src/index.css', 'utf8');
const HERO = readFileSync('src/pages/ai-lesson/landing/AiCourseHero.tsx', 'utf8');
const PAGE = readFileSync('src/pages/ai-lesson/landing/AiCourseLandingPage.tsx', 'utf8');

describe('どの見た目になるか', () => {
  it('既定は冒険（2026-08-28 CEO決定）', () => {
    expect(DEFAULT_LP_THEME).toBe('adventure');
  });

  it('何も指定しない訪問者に冒険が出る', () => {
    expect(resolveLpTheme('', null)).toBe('adventure');
  });

  it('URLで暖色に戻せる', () => {
    expect(resolveLpTheme('?theme=default', null)).toBe('default');
  });

  it('暖色に戻した指定を覚えている（毎回URLに付け直さなくてよい）', () => {
    expect(resolveLpTheme('', 'default')).toBe('default');
  });

  it('URLの指定が保存より強い（いつでも切り替えられる）', () => {
    expect(resolveLpTheme('?theme=adventure', 'default')).toBe('adventure');
  });

  it('知らない値は既定に倒す（壊れた指定で見た目が壊れない）', () => {
    expect(resolveLpTheme('?theme=neon', null)).toBe('adventure');
    expect(resolveLpTheme('', 'neon')).toBe('adventure');
  });

  it('既定と同じ指定なら保存を消す（既定が変わったとき古い保存が残らない）', () => {
    const src = readFileSync('src/pages/ai-lesson/landing/lpTheme.ts', 'utf8');
    expect(src).toMatch(/if \(fromUrl === DEFAULT_LP_THEME\) localStorage\.removeItem\(KEY\)/);
  });
});

describe('戻り道が残っている', () => {
  it('暖色パレットの定義を消していない（URL1本で戻せる）', () => {
    expect(CSS).toMatch(/--color-lp-ivory: #FBF5EC;/);
    expect(CSS).toMatch(/--color-lp-coral: #EE7A56;/);
  });

  it('冒険は data-lp-theme="adventure" の中でだけ効く', () => {
    const block = /\[data-lp-theme='adventure'\] \{([\s\S]*?)\n\}/.exec(CSS);
    expect(block, '試作パレットのブロックが見つからない').toBeTruthy();
    expect(block![1]).toContain('--color-lp-coral: #C25B3C');
  });

  it('暖色に戻したときは風景の読み込みごと止まる', () => {
    // display:none なら画像そのものを取りに行かない＝暖色を選んだ人の重さは増えない
    expect(CSS).toMatch(/\.lp-adv-hero-bg, \.lp-adv-hero-strip \{ display: none !important; \}/);
    expect(CSS).toMatch(/\[data-lp-theme='adventure'\] \.lp-adv-hero-bg \{ display: block !important; \}/);
    expect(CSS).toMatch(/\[data-lp-theme='adventure'\] \.lp-adv-hero-strip \{ display: block !important; \}/);
  });

  it('スマホとPCで風景の出し方を分ける', () => {
    /*
     * 2026-09-01 訂正: 以前は「縦長の原画は横帯にできない」としてPCから消していたが、
     * 同じ画像をロードマップで 1110×200 に切って出しており、実測すると
     * 上下の色差80で地平線が見える＝絵として成立していた。
     * 本当の原因は「全幅1440まで広げ、ベールを重ねて文字を乗せた」こと。
     * PCは**本文と同じ幅の帯**にして文字を重ねない。
     */
    expect(HERO).toMatch(/lp-adv-hero-bg md:hidden/);
    expect(HERO).toMatch(/lp-adv-hero-strip hidden md:block/);
  });

  it('PCの帯に文字を重ねない（重ねると風景が霞んで見える）', () => {
    const strip = /lp-adv-hero-strip[\s\S]*?<\/div>/.exec(HERO);
    expect(strip, 'PC用の帯が見つからない').toBeTruthy();
    expect(strip![0]).not.toMatch(/bg-gradient-to-b/);
  });

  it('PCの帯は本文と同じ幅の中に置く（全幅へ広げない）', () => {
    expect(HERO).toMatch(/max-w-6xl px-5">[\s\S]{0,400}lp-adv-hero-strip/);
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
