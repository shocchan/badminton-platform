// ことば集め（2026-09-07 第2版）。
//
// ここで固定するのは、集める仕組みが**嘘をつかない**こと:
//   - 「おぼえた」は自己申告で、数え方もそれ以上にしない
//   - 戻ってくるのは1回だけ（何度も出して重くしない）
//   - 配列から消したことばの記録は残さない（画面に空欄を出さない）
import { describe, it, expect } from 'vitest';
import {
  restoreProverbDex, collectProverb, markProverbLearned, markProverbRecalled,
  dueProverbRecall, proverbStats, collectedProverbs, crossedProverbMilestone,
  todaysProverbMilestone, PROVERB_RECALL_DAYS, PROVERB_KEEP,
} from './advProverbDex';
import { PROVERBS } from './advProverbs';
import type { AdvProverbEntry } from './advTypes';

const ID = PROVERBS[0].id;
const ID2 = PROVERBS[1].id;
const e = (over: Partial<AdvProverbEntry> = {}): AdvProverbEntry => ({
  id: ID, day: '2026-09-01', learned: false, recalledDay: null, ...over,
});

describe('復元', () => {
  it('壊れた値は空で返す', () => {
    expect(restoreProverbDex(null)).toEqual([]);
    expect(restoreProverbDex('x')).toEqual([]);
  });

  it('配列から消したことばの記録は落とす（画面に空欄を出さない）', () => {
    expect(restoreProverbDex([{ id: 'もう無いid', day: '2026-09-01' }])).toEqual([]);
  });

  it('日付が壊れた行・重複は落とす', () => {
    const r = restoreProverbDex([
      { id: ID, day: 'ダメ' }, { id: ID, day: '2026-09-01' }, { id: ID, day: '2026-09-02' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ id: ID, day: '2026-09-01', learned: false, recalledDay: null });
  });

  it(`保持は${PROVERB_KEEP}件まで（jsonbを太らせない）`, () => {
    const many = PROVERBS.map((p, i) => ({ id: p.id, day: `2026-09-${String((i % 28) + 1).padStart(2, '0')}` }));
    expect(restoreProverbDex(many).length).toBeLessThanOrEqual(PROVERB_KEEP);
  });
});

describe('集める', () => {
  it('持っていないことばは足す', () => {
    expect(collectProverb([], ID, '2026-09-07')).toHaveLength(1);
  });

  it('すでに持っていれば書かない（1日1回しか保存が増えない）', () => {
    expect(collectProverb([e()], ID, '2026-09-07')).toBeNull();
  });

  it('実在しないidは足さない', () => {
    expect(collectProverb([], 'ない', '2026-09-07')).toBeNull();
  });

  it('日付が壊れていたら足さない', () => {
    expect(collectProverb([], ID, 'ダメ')).toBeNull();
  });
});

describe('おぼえた（自己申告）', () => {
  it('立てる・下ろすができる', () => {
    const on = markProverbLearned([e()], ID, true);
    expect(on?.[0].learned).toBe(true);
    expect(markProverbLearned(on!, ID, false)?.[0].learned).toBe(false);
  });

  it('変化が無ければ保存しない', () => {
    expect(markProverbLearned([e()], ID, false)).toBeNull();
    expect(markProverbLearned([], ID, true)).toBeNull();
  });

  it('数え方は自己申告の印だけ（持っている数と混ぜない）', () => {
    const dex = [e({ learned: true }), e({ id: ID2, learned: false })];
    expect(proverbStats(dex, PROVERBS.length)).toEqual({
      collected: 2, learned: 1, total: PROVERBS.length,
    });
  });
});

describe('しばらくして1回だけ戻ってくる', () => {
  const learned = [e({ day: '2026-09-01', learned: true })];

  it('「おぼえた」と言っていないものは戻ってこない', () => {
    expect(dueProverbRecall([e({ day: '2026-08-01' })], '2026-09-07')).toBeNull();
  });

  it(`${PROVERB_RECALL_DAYS}日たつまでは戻ってこない`, () => {
    expect(dueProverbRecall(learned, '2026-09-05')).toBeNull();
  });

  it('日数がたてば戻ってくる', () => {
    expect(dueProverbRecall(learned, '2026-09-11')?.id).toBe(ID);
  });

  it('毎日開かない人でも取りこぼさない（ちょうどその日に限定しない）', () => {
    expect(dueProverbRecall(learned, '2026-10-20')?.id).toBe(ID);
  });

  it('一度出したら、もう出さない（「まだ終わらないのか」を作らない）', () => {
    const after = markProverbRecalled(learned, ID, '2026-09-11');
    expect(after?.[0].recalledDay).toBe('2026-09-11');
    expect(dueProverbRecall(after!, '2026-09-30')).toBeNull();
    expect(markProverbRecalled(after!, ID, '2026-09-30')).toBeNull();
  });

  it('1日に出すのは1つだけ', () => {
    const two = [
      e({ id: ID, day: '2026-09-01', learned: true }),
      e({ id: ID2, day: '2026-09-02', learned: true }),
    ];
    const got = dueProverbRecall(two, '2026-09-20');
    expect(got?.id).toBe(ID);   // 古いほうから
  });
});

describe('節目', () => {
  it('ちょうど到達した回だけ祝う', () => {
    expect(crossedProverbMilestone(4, 5)).toBe(5);
    expect(crossedProverbMilestone(5, 6)).toBeNull();
    expect(crossedProverbMilestone(5, 5)).toBeNull();
  });

  /** 状態ではなく記録から導く版（再読み込みで祝いが消えないこと） */
  const five = PROVERBS.slice(0, 5).map((x, i) => e({
    id: x.id, day: i === 4 ? '2026-09-07' : '2026-09-01',
  }));

  it('今日受け取って節目に達した日は祝う', () => {
    expect(todaysProverbMilestone(five, '2026-09-07')).toBe(5);
  });

  it('同じ記録で開き直しても祝いは消えない（状態で持たないので）', () => {
    expect(todaysProverbMilestone(five, '2026-09-07')).toBe(5);
    expect(todaysProverbMilestone(five, '2026-09-07')).toBe(5);
  });

  it('翌日には祝わない（今日受け取っていない）', () => {
    expect(todaysProverbMilestone(five, '2026-09-08')).toBeNull();
  });

  it('節目でない数では祝わない', () => {
    const four = PROVERBS.slice(0, 4).map((x) => e({ id: x.id, day: '2026-09-07' }));
    expect(todaysProverbMilestone(four, '2026-09-07')).toBeNull();
  });
});

describe('棚に並べる', () => {
  it('新しい順に並び、本文はPROVERBSから引く', () => {
    const dex = [e({ id: ID, day: '2026-09-01' }), e({ id: ID2, day: '2026-09-05' })];
    const list = collectedProverbs(dex);
    expect(list.map((x) => x.entry.id)).toEqual([ID2, ID]);
    expect(list[0].proverb.ja).toBe(PROVERBS.find((p) => p.id === ID2)!.ja);
  });
});

/*
 * 1日に増えるのは1つだけ（2026-09-10 実測の不具合）。
 *
 * 全員の図鑑が初回から「60 / 60」になっていた。本番実測: 学習者ぜんぶが
 * dex 60件・すべて同じ日付・learned は0件。
 * 「今日のことば」は手元にあるものを除いて選ぶので、
 *   足す → 手元が変わる → 別のことばが選ばれる → また足す
 * が1回のページ表示で回っていた。
 */
describe('1日に増えるのは1つだけ', () => {
  const day = '2026-09-10';
  const ids = PROVERBS.slice(0, 3).map((p) => p.id);

  it('その日ぶんを受け取ったあとは、別のことばでも増えない', () => {
    const first = collectProverb([], ids[0]!, day);
    expect(first).not.toBe(null);
    expect(first!.length).toBe(1);
    // ここが null にならないと、呼び出し側のループで全部入ってしまう
    expect(collectProverb(first!, ids[1]!, day)).toBe(null);
    expect(collectProverb(first!, ids[2]!, day)).toBe(null);
  });

  it('**60個いっぺんに入らない**（実際に起きたループを再現しても1件で止まる）', () => {
    let dex: AdvProverbEntry[] = [];
    for (const p of PROVERBS) {
      const next = collectProverb(dex, p.id, day);
      if (next) dex = next;   // 呼び出し側と同じで、変化があれば入れ替える
    }
    expect(dex.length).toBe(1);
  });

  it('日が変われば、また1つ増える', () => {
    const d1 = collectProverb([], ids[0]!, '2026-09-10')!;
    const d2 = collectProverb(d1, ids[1]!, '2026-09-11');
    expect(d2).not.toBe(null);
    expect(d2!.length).toBe(2);
    expect(collectProverb(d2!, ids[2]!, '2026-09-11')).toBe(null);
  });

  it('同じことばは、日が変わっても二重に入らない', () => {
    const d1 = collectProverb([], ids[0]!, '2026-09-10')!;
    expect(collectProverb(d1, ids[0]!, '2026-09-11')).toBe(null);
  });
});
