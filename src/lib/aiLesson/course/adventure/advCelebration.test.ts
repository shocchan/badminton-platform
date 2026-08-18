// 祝いセレモニー（純関数）の受入テスト（2026-08-19）。
//
// いちばん守りたいこと:
// - **初期化直後（prev=null）は祝わない**: 起動時に過去の攻略を祝い直す偽演出をしない（原則13）
// - conquest は新しくdoneになった地域だけ・chapterは章内**全done**のときだけ1回
// - mapに見つからないid（会話レイヤー等）は黙って捨てる（会話は攻略計測をしていない）
import { describe, it, expect } from 'vitest';
import { diffNewlyDone, conquestCelebrations } from './advCelebration';
import { buildAdventureMap } from './advMapModel';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile } from './advTypes';

const NOW = '2026-08-19T00:00:00.000Z';

/** advMapModel.test.ts と同じ作り: N2目標のjlptルート */
const profileFor = (): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType: 'jlpt',
  targetJlpt: 'N2',
  dailyMinutes: 15,
  route: generateRoute({
    goalType: 'jlpt', targetJlpt: 'N2',
    knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

describe('diffNewlyDone', () => {
  it('**prev=null（初期化直後）は必ず空**＝起動時に祝わない', () => {
    expect(diffNewlyDone(null, new Set(['a', 'b']))).toEqual([]);
  });

  it('新しくdoneになったidだけを返す', () => {
    expect(diffNewlyDone(new Set(['a']), new Set(['a', 'b', 'c'])).sort()).toEqual(['b', 'c']);
    expect(diffNewlyDone(new Set(['a']), new Set(['a']))).toEqual([]);
  });
});

describe('conquestCelebrations', () => {
  it('新規doneの地域に conquest を1つ（章が残っていれば chapter は出ない）', () => {
    const prof = profileFor();
    // 章内に2地域以上ある章を選ぶ（N2ルートには必ずある。無ければfixtureが壊れている）
    const probe = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam', NOW);
    const byChapter = new Map<string, string[]>();
    for (const r of probe.regions) {
      byChapter.set(r.chapterJa, [...(byChapter.get(r.chapterJa) ?? []), r.id]);
    }
    const multi = [...byChapter.values()].find((ids) => ids.length >= 2);
    expect(multi, '2地域以上の章が見つからない（fixture異常）').toBeTruthy();

    const first = multi![0];
    const m = buildAdventureMap(prof, prof.route, new Set([first]), 1, 'exam', NOW);
    const items = conquestCelebrations(m, [first]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'conquest', regionId: first });
    if (items[0].kind === 'conquest') {
      expect(items[0].nameJa.length).toBeGreaterThan(0);
      expect(items[0].abilityJa.length).toBeGreaterThan(0);
    }
  });

  it('**章内が全doneになったときだけ chapter が付き、同一章は重複しない**', () => {
    const prof = profileFor();
    const probe = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam', NOW);
    const byChapter = new Map<string, string[]>();
    for (const r of probe.regions) {
      byChapter.set(r.chapterJa, [...(byChapter.get(r.chapterJa) ?? []), r.id]);
    }
    const [chapterJa, ids] = [...byChapter.entries()].find(([, v]) => v.length >= 2)!;
    // 実際の進行と同じく**先頭からの前進**でdoneが積み上がった状態を作る
    // （buildAdventureMap は現在地の直後を'next'に上書きするため、飛び石のdoneは実運用に無い形）
    const lastIdx = probe.regions.map((r) => r.chapterJa).lastIndexOf(chapterJa);
    const mastered = new Set(probe.regions.slice(0, lastIdx + 1).map((r) => r.id));
    const m = buildAdventureMap(prof, prof.route, mastered, 1, 'exam', NOW);
    // 章の締めの攻略で章内全地域がdoneになったとして、章のidを新規done扱いで渡す
    const items = conquestCelebrations(m, ids);
    const conquests = items.filter((i) => i.kind === 'conquest');
    const chapters = items.filter((i) => i.kind === 'chapter');
    expect(conquests).toHaveLength(ids.length);
    expect(chapters).toHaveLength(1); // 同一章の重複なし
    expect(chapters[0]).toMatchObject({ kind: 'chapter', chapterJa });
    if (chapters[0].kind === 'chapter') {
      expect(chapters[0].regions).toHaveLength(ids.length);
    }
  });

  it('mapに無いid（会話レイヤー等）は黙って捨てる', () => {
    const prof = profileFor();
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam', NOW);
    expect(conquestCelebrations(m, ['conv-w1', 'no-such-stage'])).toEqual([]);
  });
});
