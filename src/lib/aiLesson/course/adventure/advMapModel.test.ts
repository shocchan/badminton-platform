// 冒険マップの受入テスト（PRODUCT_CANON 原則11/12/13）。
//
// いちばん守りたいのは「現在地が1つであること」。
// ルートを切り替えても複数の現在地が出ると、学習者はどこにいるのか分からなくなる。
import { describe, it, expect } from 'vitest';
import { buildAdventureMap, availableRouteKinds } from './advMapModel';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile, AdvGoalType, AdvMasteryAttempt } from './advTypes';

const NOW = '2026-08-02T00:00:00.000Z';

/** 攻略にカウントされる試行（80%以上・未出3割以上・複数タイプ） */
const qualifying = (dateKey: string): AdvMasteryAttempt => ({
  dateKey,
  scorePct: 90,
  unseenRatio: 0.5,
  questionKeys: ['rec:a', 'rec:b', 'cloze:c', 'cloze:d', 'meaning:e'],
  tier: 'normal',
  timed: false,
  completedAt: `${dateKey}T09:00:00.000Z`,
});

const profileFor = (goalType: AdvGoalType): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType,
  targetJlpt: goalType === 'conversation' ? null : 'N2',
  dailyMinutes: 15,
  route: generateRoute({
    goalType,
    targetJlpt: goalType === 'conversation' ? null : 'N2',
    knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

describe('冒険マップ — 現在地は必ず1つ', () => {
  for (const goal of ['jlpt', 'conversation', 'hybrid'] as AdvGoalType[]) {
    for (const kind of availableRouteKinds(goal)) {
      it(`${goal} / ${kind}: current が1つだけ`, () => {
        const prof = profileFor(goal);
        const m = buildAdventureMap(prof, prof.route, new Set(), 1, kind);
        expect(m.regions.filter((r) => r.state === 'current')).toHaveLength(1);
        expect(m.currentRegionId).toBeTruthy();
      });
    }
  }

  it('攻略が進んでも current は1つ（先頭の未攻略へ移る）', () => {
    const prof = profileFor('jlpt');
    const first = prof.route!.stages[0].stageId;
    const m = buildAdventureMap(prof, prof.route, new Set([first]), 1, 'exam');
    expect(m.regions.filter((r) => r.state === 'current')).toHaveLength(1);
    expect(m.currentRegionId).toBe(prof.route!.stages[1].stageId);
    expect(m.doneCount).toBe(1);
  });
});

describe('冒険マップ — 表示の誠実さ', () => {
  it('**未解放の地域に定着率を出さない**（0%と見せない・原則13）', () => {
    const prof = profileFor('jlpt');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam');
    for (const r of m.regions.filter((x) => x.state === 'locked')) {
      expect(r.masteryPct).toBeNull();
    }
  });

  it('**会話の地域は定着率を測っていないので必ず未判定**', () => {
    const prof = profileFor('conversation');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'conversation');
    expect(m.regions.length).toBe(18);   // PLACE_NAME と同数（第13〜18週の上級を含む・2026-08-23）
    for (const r of m.regions) expect(r.masteryPct).toBeNull();
  });

  it('全地域が「何の力を鍛えるか」を持つ（世界観の名前だけにしない・原則12）', () => {
    for (const goal of ['jlpt', 'conversation', 'hybrid'] as AdvGoalType[]) {
      const prof = profileFor(goal);
      for (const kind of availableRouteKinds(goal)) {
        for (const r of buildAdventureMap(prof, prof.route, new Set(), 1, kind).regions) {
          expect(r.abilityJa.length, `${goal}/${kind}/${r.id}`).toBeGreaterThan(0);
          expect(r.abilityZh.length, `${goal}/${kind}/${r.id}`).toBeGreaterThan(0);
          expect(r.nameZh.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('地域ごとにランドマークが割り当たる（全部同じ形にしない）', () => {
    const prof = profileFor('hybrid');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'combined');
    expect(new Set(m.regions.map((r) => r.landmark)).size).toBeGreaterThan(4);
  });
});

describe('成長マップ — 行き止まりを作らない（原則15）', () => {
  it('**すべての地域が押せる行動を1つ持つ**（ラベルと理由が空でない）', () => {
    for (const goal of ['jlpt', 'conversation', 'hybrid'] as AdvGoalType[]) {
      const prof = profileFor(goal);
      for (const kind of availableRouteKinds(goal)) {
        for (const r of buildAdventureMap(prof, prof.route, new Set(), 1, kind, NOW).regions) {
          const where = `${goal}/${kind}/${r.id}`;
          expect(r.action.labelJa.length, where).toBeGreaterThan(0);
          expect(r.action.labelZh.length, where).toBeGreaterThan(0);
          expect(r.action.reasonJa.length, where).toBeGreaterThan(0);
          expect(r.action.reasonZh.length, where).toBeGreaterThan(0);
        }
      }
    }
  });

  it('攻略済みの地域は「復習で維持」へ繋がる', () => {
    const prof = profileFor('jlpt');
    const first = prof.route!.stages[0].stageId;
    const m = buildAdventureMap(prof, prof.route, new Set([first]), 1, 'exam', NOW);
    expect(m.regions.find((r) => r.id === first)!.action.kind).toBe('review');
  });

  // 2026-08-18 P0: ボスの入口はミニ模試ではなく今日の冒険（ボス戦step）。
  // ミニ模試の結果は mock-n2/mock-n3 へ入るだけでこのstageの攻略には効かない
  it('ボスの地域が現在地になったら今日の冒険（ボス戦）へ繋がる', () => {
    const prof = profileFor('jlpt');
    const stages = prof.route!.stages;
    const boss = stages[stages.length - 1];
    expect(boss.kind).toBe('mock_boss');
    // 手前を全部攻略すると模試が現在地になる
    const done = new Set(stages.slice(0, -1).map((s) => s.stageId));
    const m = buildAdventureMap(prof, prof.route, done, 1, 'exam', NOW);
    expect(m.currentRegionId).toBe(boss.stageId);
    const act = m.regions.find((r) => r.id === boss.stageId)!.action;
    expect(act.kind).toBe('today');
    // ラベルは現在地カードで「今日の冒険でここを進める」に言い換わるので、理由文で見る
    expect(act.reasonJa).toContain('ボス戦');
  });

  it('会話は**現在地だけ**AI会話へ繋ぐ（先の週の会話へ飛ばさない）', () => {
    const prof = profileFor('conversation');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'conversation', NOW);
    const cur = m.regions.find((r) => r.id === m.currentRegionId)!;
    expect(cur.action.kind).toBe('conversation');
    // まだ着いていない地域から会話を始めると、いまの週の会話が出て話が噛み合わない
    for (const r of m.regions.filter((x) => x.state === 'next' || x.state === 'locked')) {
      expect(r.action.kind, r.id).toBe('today');
    }
  });

  it('**未解放の地域は「どうすれば開くか」を必ず持つ**', () => {
    const prof = profileFor('jlpt');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam', NOW);
    const ahead = m.regions.filter((r) => r.state === 'next' || r.state === 'locked');
    expect(ahead.length).toBeGreaterThan(0);
    for (const r of ahead) {
      expect(r.unlockJa.length, r.id).toBeGreaterThan(0);
      expect(r.unlockZh.length, r.id).toBeGreaterThan(0);
    }
  });
});

describe('成長マップ — 場所の違いが伝わる', () => {
  it('全地域が章・短い説明・色調を持つ', () => {
    for (const goal of ['jlpt', 'conversation', 'hybrid'] as AdvGoalType[]) {
      const prof = profileFor(goal);
      for (const kind of availableRouteKinds(goal)) {
        for (const r of buildAdventureMap(prof, prof.route, new Set(), 1, kind, NOW).regions) {
          const where = `${goal}/${kind}/${r.id}`;
          expect(r.chapterJa.length, where).toBeGreaterThan(0);
          expect(r.chapterZh.length, where).toBeGreaterThan(0);
          expect(r.blurbJa.length, where).toBeGreaterThan(0);
          expect(r.blurbZh.length, where).toBeGreaterThan(0);
          expect(r.tone.length, where).toBeGreaterThan(0);
        }
      }
    }
  });

  it('**隣り合う地域の色調が同じにならない**（並べたとき「どこも同じ」に見せない）', () => {
    const prof = profileFor('hybrid');
    const regions = buildAdventureMap(prof, prof.route, new Set(), 1, 'combined', NOW).regions;
    for (let i = 1; i < regions.length; i += 1) {
      expect(regions[i].tone, `${regions[i - 1].id} → ${regions[i].id}`).not.toBe(regions[i - 1].tone);
    }
  });

  it('章は1つではない（進むと章が変わる）', () => {
    const prof = profileFor('hybrid');
    const regions = buildAdventureMap(prof, prof.route, new Set(), 1, 'combined', NOW).regions;
    expect(new Set(regions.map((r) => r.chapterJa)).size).toBeGreaterThan(2);
  });
});

describe('成長マップ — 現在地の進み具合は実測値', () => {
  it('別日2回の80%で、現在地の定着率が0%より上になる（0%固定にしない）', () => {
    const base = profileFor('jlpt');
    const stageId = base.route!.stages[0].stageId;
    const prof: AdventureV2Profile = {
      ...base,
      mastery: { [stageId]: [qualifying('2026-07-28'), qualifying('2026-07-29')] },
    };
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam', NOW);
    const cur = m.regions.find((r) => r.id === m.currentRegionId)!;
    expect(cur.id).toBe(stageId);
    expect(cur.masteryPct).toBeGreaterThan(0);
    expect(cur.masteryPct).toBeLessThan(100);
    // 何回足りないかを出す（攻略条件の丸写しにしない）
    expect(cur.nextJa).toContain('あと1回');
  });

  it('**まだ一度も測っていなければ現在地は未判定**（測っていないものを0%と見せない）', () => {
    const prof = profileFor('jlpt');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam', NOW);
    expect(m.regions.find((r) => r.id === m.currentRegionId)!.masteryPct).toBeNull();
  });

  it('挑戦したが条件に届かない記録があれば0%（実測の0として出す）', () => {
    const base = profileFor('jlpt');
    const stageId = base.route!.stages[0].stageId;
    const prof: AdventureV2Profile = {
      ...base,
      // 80%に届かない挑戦（回数条件を満たさないスコア）は進捗0だが「測った0」
      mastery: { [stageId]: [{ ...qualifying('2026-07-28'), scorePct: 60 }] },
    };
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam', NOW);
    expect(m.regions.find((r) => r.id === m.currentRegionId)!.masteryPct).toBe(0);
  });

  it('**会話が現在地でも定着率は未判定のまま**（測っていない）', () => {
    const prof = profileFor('conversation');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'conversation', NOW);
    expect(m.regions.find((r) => r.id === m.currentRegionId)!.masteryPct).toBeNull();
  });
});

describe('冒険マップ — ルートの組み立て', () => {
  it('目的が試験なら試験ルートだけ、会話なら会話ルートだけを出す', () => {
    expect(availableRouteKinds('jlpt')).toEqual(['exam']);
    expect(availableRouteKinds('conversation')).toEqual(['conversation']);
    expect(availableRouteKinds('hybrid')).toEqual(['combined', 'exam', 'conversation']);
  });

  it('**Hybridの総合ルートは試験と会話が合流する**（mergeIndexを持つ）', () => {
    const prof = profileFor('hybrid');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'combined');
    expect(m.mergeIndex).not.toBeNull();
    // 合流点より前が試験、後が会話
    expect(m.regions[m.mergeIndex! - 1].layer).toBe('exam');
    expect(m.regions[m.mergeIndex!].layer).toBe('conversation');
    expect(m.totalCount).toBe(m.regions.length);
  });

  it('会話目的でルートが無くても地図が壊れない', () => {
    const prof = { ...profileFor('conversation'), route: null };
    const m = buildAdventureMap(prof, null, new Set(), 1, 'conversation');
    expect(m.regions.length).toBe(18);   // PLACE_NAME と同数（第13〜18週の上級を含む・2026-08-23）
    expect(m.currentRegionId).toBeTruthy();
    expect(m.destinationJa.length).toBeGreaterThan(0);
  });
});

describe('総合ルート — 会話レイヤーは並走レーン（試験の攻略待ちにしない・原則13）', () => {
  it('**hybrid+combined で今週の会話地域は霧にならず「AI会話を始める」を保つ**', () => {
    const prof = profileFor('hybrid');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'combined', NOW);
    const conv = m.regions.find((r) => r.id === 'conv-w1')!;
    expect(conv.state).not.toBe('locked');
    expect(conv.action.kind).toBe('conversation');
  });

  it('**combined の攻略済み会話地域に「先に◯◯を攻略します」が付かない**', () => {
    const prof = profileFor('hybrid');
    const m = buildAdventureMap(prof, prof.route, new Set(), 3, 'combined', NOW);
    const doneConv = m.regions.filter((x) => x.layer === 'conversation' && x.state === 'done');
    // done の会話地域が実際に存在することを保証（空振りテスト防止）
    expect(doneConv.length).toBeGreaterThan(0);
    for (const r of doneConv) {
      expect(r.unlockJa, r.id).toBe('');
      expect(r.unlockZh, r.id).toBe('');
    }
  });
});

// 2026-08-23: 会話レイヤーを第18週まで伸ばしたので、世界地図（絵）は現在地を含む12地域の窓だけを置く
describe('世界地図の窓（worldMapWindow）', () => {
  it('会話18地域のうち、絵に載るのは現在地を含む12地域（一覧は全地域のまま）', async () => {
    const { worldMapWindow } = await import('./advMapModel');
    const prof = { ...profileFor('conversation'), route: null };
    const m = buildAdventureMap(prof, null, new Set(), 13, 'conversation');
    expect(m.regions.length).toBe(18);
    const win = worldMapWindow(m.regions, m.currentRegionId);
    expect(win.length).toBe(12);
    expect(win.some((r) => r.id === m.currentRegionId)).toBe(true);
    // 第13週が現在地なら末尾12（第7〜18週）
    expect(win[0].id).toBe('conv-w7');
    const early = buildAdventureMap(prof, null, new Set(), 1, 'conversation');
    expect(worldMapWindow(early.regions, early.currentRegionId)[0].id).toBe('conv-w1');
  });
});
