// 冒険マップの演出（2026-08-24）が、止めたい人にはちゃんと止まるか。
//
// 【なぜテストにするか】
// 地図に動きを足したのは「冒険している感じ」を出すため。ただし学習アプリなので、
// 動きが苦手な人（前庭障害・乗り物酔い・集中が切れる人）には**完全に止まる**必要がある。
// 装飾なので止まって困るものは1つも無い。
// アニメーションを @media (prefers-reduced-motion: no-preference) の外に書くと
// この配慮が消えるが、見た目では気づけない。ソースで縛る。
//
// もう1つ: 位相のずらしに乱数を使うと、再描画のたびに霧がワープする。
// 座標から導く（決定的）ことも合わせて固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../..');
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8');
const map = readFileSync(join(__dirname, 'AdvWorldMap.tsx'), 'utf8');

const MOTION_CLASSES = ['kb-map-fog', 'kb-map-beacon', 'kb-map-glow', 'kb-map-trail'];

/** prefers-reduced-motion: no-preference のブロックだけを取り出す */
const reducedMotionBlock = (): string => {
  const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  expect(start, '@media (prefers-reduced-motion: no-preference) が無い').toBeGreaterThan(-1);
  // 対応する閉じ括弧まで数える
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error('@media ブロックが閉じていない');
};

describe('動きを止めたい人には止まる', () => {
  const block = reducedMotionBlock();

  for (const cls of MOTION_CLASSES) {
    it(`.${cls} は prefers-reduced-motion の中だけで定義されている`, () => {
      expect(block, `.${cls} が @media の中に無い`).toContain(`.${cls}`);
      // @media の外に同じクラスの animation 指定が漏れていないか
      const outside = css.replace(block, '');
      expect(outside, `.${cls} の指定が @media の外にもある＝止まらない`)
        .not.toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*animation`));
    });
  }

  it('すべての演出クラスに animation がある（クラスだけあって効かない、を防ぐ）', () => {
    for (const cls of MOTION_CLASSES) {
      const m = new RegExp(`\\.${cls}\\s*\\{[^}]*animation`);
      expect(block, `.${cls} に animation が無い`).toMatch(m);
    }
  });
});

describe('地図が演出クラスを使っている', () => {
  for (const cls of MOTION_CLASSES) {
    it(`AdvWorldMap が .${cls} を付けている`, () => {
      expect(map, `${cls} を使っていない＝CSSだけあって適用されていない`).toContain(cls);
    });
  }

  it('次の目的地（next）にだけ灯りを出す', () => {
    expect(map).toMatch(/state === 'next'[\s\S]{0,400}kb-map-beacon/);
  });

  it('歩いてきた道（done）にだけ描画演出をつける', () => {
    expect(map).toMatch(/s\.state === 'done'[\s\S]{0,200}kb-map-trail|drawIn/);
  });
});

describe('ちらつかない', () => {
  it('位相のずらしに乱数を使わない（再描画のたびに霧がワープしない）', () => {
    // 演出用の style を組む付近で Math.random を使っていないこと
    expect(map, '乱数で位相を決めると再描画で位置が飛ぶ').not.toContain('Math.random');
  });

  it('レイアウトを起こすプロパティでアニメーションしない（transform / opacity のみ）', () => {
    const block = reducedMotionBlock();
    for (const prop of ['width:', 'height:', 'top:', 'left:', 'margin']) {
      // keyframes 側も含めて、動かす対象に入っていないこと
      expect(block, `${prop} を animation で動かすと毎フレーム再レイアウトが起きる`)
        .not.toMatch(new RegExp(`animation[^;]*${prop}`));
    }
  });
});
