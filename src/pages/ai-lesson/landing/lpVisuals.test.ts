// LPの視覚設計（2026-08-27）。
//
// 本番の実測: スマホで 22,301px＝27画面ぶん、画像は9枚だけ、
// 14セクション中12が画像ゼロ。文字が続くだけのページになっていた。
//
// ここで守るのは3つ。
//   ① 使う絵は**アプリで実際に使っているもの**（LPで見た絵が買った後に出てくる）
//   ② ページ先頭に出るものは画像にしない（全訪問者の初回表示に乗るため）
//   ③ 装飾は支援技術に読ませない・動きは reduced-motion を尊重する
import { describe, it, expect } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { LP } from './lpContent';

const FLOW = readFileSync('src/pages/ai-lesson/landing/sectionsA.tsx', 'utf8');
const ROADMAP = readFileSync('src/pages/ai-lesson/landing/sectionsB.tsx', 'utf8');
const TRAIL = readFileSync('src/pages/ai-lesson/landing/lpTrail.tsx', 'utf8');
/** 説明コメントを除いた実コード。コメントの語に反応して落ちるのを防ぐ */
const TRAIL_CODE = TRAIL.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const PAGE = readFileSync('src/pages/ai-lesson/landing/AiCourseLandingPage.tsx', 'utf8');

describe('使う絵はアプリの実物', () => {
  /** FLOW_STEP_ICONS の中身。null はアイコン無しを表す */
  const flowIcons = (): (string | null)[] => {
    const block = /const FLOW_STEP_ICONS: \(string \| null\)\[\] = \[([\s\S]*?)\n\];/.exec(FLOW);
    expect(block, 'FLOW_STEP_ICONS が見つからない').toBeTruthy();
    // コメント行を落としてから、要素だけを拾う
    const body = block![1].split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    return [...body.matchAll(/'([a-z-]+)'|(\bnull\b)/g)].map((m) => m[1] ?? null);
  };

  it('学習サイクルのアイコンが全部存在する', () => {
    const names = flowIcons().filter((n): n is string => n !== null);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const p = `public/ai-course/step/${n}@2x.webp`;
      expect(existsSync(p), `${p} が無いのにLPが参照している`).toBe(true);
    }
  });

  it('アイコンの数がステップ数と合っている（片方だけ増やさない）', () => {
    expect(flowIcons()).toHaveLength(LP.flow.steps.ja.length);
    expect(LP.flow.steps.ja.length).toBe(LP.flow.steps.zh.length);
  });

  it('同じアイコンを隣り合わせで使わない（見間違いになる）', () => {
    const names = flowIcons();
    for (let i = 1; i < names.length; i += 1) {
      if (names[i] === null) continue;
      expect(names[i], `${i + 1}番目が1つ前と同じアイコン`).not.toBe(names[i - 1]);
    }
  });

  it('ロードマップの背景がアプリの世界地図と同じファイル', () => {
    expect(ROADMAP).toContain('/ai-course/map/world-bg@1x.webp');
    expect(existsSync('public/ai-course/map/world-bg@1x.webp')).toBe(true);
  });

  it('背景はAVIFを先に出してWebPへ落とす（軽いほうを先に）', () => {
    expect(ROADMAP).toMatch(/<source srcSet="\/ai-course\/map\/world-bg@1x\.avif" type="image\/avif"/);
    expect(existsSync('public/ai-course/map/world-bg@1x.avif')).toBe(true);
    const avif = statSync('public/ai-course/map/world-bg@1x.avif').size;
    const webp = statSync('public/ai-course/map/world-bg@1x.webp').size;
    expect(avif, 'AVIFのほうが大きいなら先に出す意味がない').toBeLessThan(webp);
  });
});

describe('重くしない', () => {
  it('LPが足した画像はどれも80KB以下', () => {
    const added = [
      'public/ai-course/map/world-bg@1x.avif',
      'public/ai-course/map/world-bg@1x.webp',
      ...['goal-chest', 'step-talk', 'step-words', 'step-review']
        .map((n) => `public/ai-course/step/${n}@2x.webp`),
    ];
    for (const p of added) {
      expect(statSync(p).size, `${p} が大きすぎる`).toBeLessThanOrEqual(80 * 1024);
    }
  });

  it('学習サイクルのアイコンは合計30KB以下', () => {
    const total = ['goal-chest', 'step-talk', 'step-words', 'step-review']
      .reduce((a, n) => a + statSync(`public/ai-course/step/${n}@2x.webp`).size, 0);
    expect(total).toBeLessThanOrEqual(30 * 1024);
  });

  it('あとから出る絵は遅延読み込みにする', () => {
    expect(FLOW).toMatch(/loading="lazy"/);
    expect(ROADMAP).toMatch(/loading="lazy"/);
  });

  it('サイズを指定している（読み込み中に行がずれない）', () => {
    expect(FLOW).toMatch(/width=\{36\} height=\{36\}/);
    expect(ROADMAP).toMatch(/width=\{512\} height=\{768\}/);
    // 帯の高さを固定して、読み込み中に下の文字がずれないようにする
    expect(ROADMAP).toMatch(/h-\[140px\] sm:h-\[200px\]/);
  });

  it('ページ先頭に出る道しるべは画像を使わない（全訪問者の初回表示に乗るため）', () => {
    expect(TRAIL_CODE).not.toMatch(/<img|\.webp|\.png|\.avif|url\(/);
  });
});

describe('装飾は装飾として扱う', () => {
  it('飾りの絵は支援技術に読ませない', () => {
    expect(FLOW).toMatch(/alt="" aria-hidden="true"/);
    expect(ROADMAP).toMatch(/alt="" aria-hidden="true"/);
  });

  it('道しるべは進捗として読める（役割と値がある）', () => {
    expect(TRAIL).toContain('role="progressbar"');
    expect(TRAIL).toContain('aria-valuenow');
    expect(TRAIL).toContain('aria-label={label}');
  });

  it('道しるべのラベルが ja/zh 両方ある', () => {
    expect(LP.trailProgressLabel.ja.length).toBeGreaterThan(0);
    expect(LP.trailProgressLabel.zh.length).toBeGreaterThan(0);
    expect(PAGE).toContain('LP.trailProgressLabel[lang]');
  });

  it('動きを減らす設定を尊重する', () => {
    expect(TRAIL).toContain('prefers-reduced-motion: reduce');
    expect(TRAIL).toMatch(/reduce \? 'none' :/);
  });

  it('スクロール処理を間引いている（値が変わったときだけ再描画）', () => {
    expect(TRAIL).toMatch(/\{ passive: true \}/);
    expect(TRAIL).toMatch(/if \(next !== lastPct\)/);
  });

  it('間引きに requestAnimationFrame を使わない（裏タブで止まり、値が古いまま残る）', () => {
    expect(TRAIL_CODE).not.toContain('requestAnimationFrame');
  });

  it('読み始める前は道しるべを出さない', () => {
    // 最初から出すと「まだ何も読んでいない」を突きつけることになる
    expect(TRAIL_CODE).toMatch(/const nextShow = y > \d+;/);
  });
});
