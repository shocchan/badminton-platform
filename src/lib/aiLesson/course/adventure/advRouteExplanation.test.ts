// ルート説明文が実際のルートと食い違わないこと（2026-09-05 N1解禁で見つかった穴）。
//
// 以前は N2/N3 以外の目標だと、基礎の回り道が入っていても
// 「直行できる状態です」と書いていた。目標を増やすたびに同じ穴が空くので、
// 「回り道があるなら直行とは書かない」を全レベルで固定する。
import { describe, it, expect } from 'vitest';
import { generateRoute } from './advRoute';
import { ACTIVE_TARGET_LEVELS } from './advTypes';

const NOW = '2026-09-05T00:00:00.000Z';

describe('ルート説明文と実際のルートが食い違わない', () => {
  for (const target of ACTIVE_TARGET_LEVELS) {
    it(`目標${target}: 基礎の回り道があるなら「直行」と書かない`, () => {
      const r = generateRoute({
        goalType: 'jlpt', targetJlpt: target,
        knowledgeBand: 'needs_assessment', conversationBand: 'needs_assessment',
        diagnosis: null, nowISO: NOW,
      });
      const detour = r.stages.some((s) => s.kind === 'foundation_camp' || s.kind === 'n3_bridge');
      if (detour) {
        expect(r.explanationJa, `${target}: 回り道があるのに直行と書いている`).not.toContain('直行');
        expect(r.explanationZh, `${target}: 回り道があるのに直接进入と书いている`).not.toContain('直接进入');
      }
    });
  }

  // 2026-09-06: N2帯と判定された人にN3の区間を課さない
  it('N2帯でN1目標なら、N3文法攻略とN2の門を通らない', () => {
    const r = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N1',
      knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW,
    });
    const ids = r.stages.map((s) => s.stageId);
    expect(ids).not.toContain('stg-n3grammar');
    expect(ids).not.toContain('stg-n2gate');
    expect(ids).toContain('stg-n1grammar');
    expect(ids).toContain('stg-n1reading');
    expect(ids).toContain('stg-n1boss');
  });

  it('目標がN3ならN2帯でもN3文法攻略は残る（本丸なので飛ばさない）', () => {
    const r = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N3',
      knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW,
    });
    expect(r.stages.map((s) => s.stageId)).toContain('stg-n3grammar');
  });

  it('回り道が無い場合は直行と書いてよい', () => {
    const r = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N1',
      knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW,
    });
    const detour = r.stages.some((s) => s.kind === 'foundation_camp' || s.kind === 'n3_bridge');
    expect(detour).toBe(false);
    expect(r.explanationJa).toContain('直行');
  });
});
