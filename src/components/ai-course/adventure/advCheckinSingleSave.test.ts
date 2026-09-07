// 開いた日の保存を**1回にまとめておく**ための機械チェック（2026-09-07）。
//
// なぜソースを読んで検査するか:
//   これは「動くかどうか」ではなく「書き方」の事故で、実行結果からは見えにくい。
//   同じcommitで走る2つの useEffect は**どちらも同じ古い profile を見ている**ので、
//   あとから呼んだ save が先の save の変更を丸ごと消す。画面は次の描画で自己修復するため、
//   手で触っても気づきにくく、サーバーへの書き込みだけが1回増える。
//
//   まったく同じ事故が 2026-08-17 の監査でも起きている
//   （markStep→save の2連続で、かな学習者の「今日の冒険」が永遠に完了しなかった）。
//   2026-09-07 に「来た日の記録」と「今日のことばの受け取り」で再発させたので、
//   分けて書けないように固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'AdvShell.tsx'), 'utf8');

/** `useEffect(() => { ... }, [deps])` の本体だけを取り出す（素朴な括弧数え） */
const effectBodies = (code: string): string[] => {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = code.indexOf('useEffect(() => {', from);
    if (i < 0) break;
    let depth = 0;
    let j = code.indexOf('{', i);
    const start = j;
    for (; j < code.length; j += 1) {
      if (code[j] === '{') depth += 1;
      else if (code[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(code.slice(start, j + 1));
    from = j + 1;
  }
  return out;
};

describe('開いた日の保存は1回にまとめる', () => {
  const bodies = effectBodies(src);

  it('effectを取り出せている（この検査自体が空振りしていない）', () => {
    expect(bodies.length).toBeGreaterThan(3);
  });

  it('来た日の記録と今日のことばの受け取りは、同じeffectの中にある', () => {
    const visitEffects = bodies.filter((b) => b.includes('recordVisit('));
    expect(visitEffects, 'recordVisit を呼ぶeffectが見つからない').toHaveLength(1);
    expect(
      visitEffects[0].includes('collectProverb('),
      '来た日とことばの受け取りが別のeffectに分かれている。'
      + '同じcommitで走ると、あとの save が先の save を上書きする（このファイル冒頭の説明）',
    ).toBe(true);
  });

  it('そのeffectの中で save を呼ぶのは1回だけ', () => {
    const body = bodies.find((b) => b.includes('recordVisit('))!;
    const saves = body.match(/\bsave\(/g) ?? [];
    expect(saves.length, `save( が ${saves.length} 回ある。1回にまとめること`).toBe(1);
  });

  it('effectの中の save は、積み上げた next を渡している（片方だけ渡していない）', () => {
    const body = bodies.find((b) => b.includes('recordVisit('))!;
    expect(body).toContain('if (next !== profile) save(next);');
    // profile を直接ばらして渡す書き方（= 片方の更新を落とす形）に戻っていないこと
    expect(body).not.toMatch(/save\(\{\s*\.\.\.profile/);
  });
});
