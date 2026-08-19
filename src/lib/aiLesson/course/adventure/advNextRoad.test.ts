// 「次の道」判定の受入テスト。
// いちばん守りたいこと: **実測（試験系stage全攻略）以外でカードを出さない**（原則13・偽陽性ゼロ）。
import { describe, it, expect } from 'vitest';
import { nextRoadOf, nextTargetOf } from './advNextRoad';
import { defaultAdvProfile } from './advProfile';
import type { AdvRoute, AdvRouteStage, AdvStageKind, AdvGoalType, JlptLevel } from './advTypes';

const NOW = '2026-08-19T10:00:00.000Z';

const stg = (stageId: string, kind: AdvStageKind): AdvRouteStage => ({
  stageId, kind, areaId: 'area01-minato',
  titleJa: 't', titleZh: 't', purposeJa: 'p', purposeZh: 'p',
  targets: {}, clearConditionJa: 'c', clearConditionZh: 'c',
});

const routeOf = (stages: AdvRouteStage[], dest: JlptLevel): AdvRoute => ({
  generatedAt: NOW, destinationJlpt: dest, destinationAreaId: 'area01-minato',
  destinationLabelJa: 'd', destinationLabelZh: 'd', stages,
  explanationJa: 'e', explanationZh: 'e',
});

const profOf = (goal: AdvGoalType, target: JlptLevel | null) => ({
  ...defaultAdvProfile(NOW), enabled: true, goalType: goal, targetJlpt: target,
});

// N5相当の最小ルート: 試験系2つ（基礎キャンプ＋模試ボス）＋会話1つ
const n5route = routeOf([
  stg('stg-foundation', 'foundation_camp'),
  stg('stg-mock', 'mock_boss'),
  stg('stg-conv-start', 'conversation_start'),
], 'N5');

describe('nextTargetOf（次の目標レベル）', () => {
  it('N5→N4→N3→N2 と進み、N2の先は正直に null（N1未対応）', () => {
    expect(nextTargetOf('N5')).toBe('N4');
    expect(nextTargetOf('N4')).toBe('N3');
    expect(nextTargetOf('N3')).toBe('N2');
    expect(nextTargetOf('N2')).toBeNull();
    expect(nextTargetOf(null)).toBeNull();
  });
});

describe('nextRoadOf（次の道カードを出す条件）', () => {
  it('試験系stage（mock_boss含む）を全攻略 → 次の道が出る。会話stageは未攻略でも妨げない', () => {
    const done = new Set(['stg-foundation', 'stg-mock']);
    expect(nextRoadOf(profOf('jlpt', 'N5'), n5route, done)).toEqual({ clearedLevel: 'N5', nextLevel: 'N4' });
  });

  it('ボス（mock_boss）が未攻略なら出ない', () => {
    const done = new Set(['stg-foundation']);
    expect(nextRoadOf(profOf('jlpt', 'N5'), n5route, done)).toBeNull();
  });

  it('会話のみの目標では出ない（試験の道の概念が無い）', () => {
    const done = new Set(['stg-foundation', 'stg-mock']);
    expect(nextRoadOf(profOf('conversation', null), n5route, done)).toBeNull();
    // goalTypeがconversationなら targetJlpt が残っていても出さない
    expect(nextRoadOf(profOf('conversation', 'N5'), n5route, done)).toBeNull();
  });

  it('N2を全攻略 → clearedLevel=N2・nextLevel=null（N1未対応を正直に）', () => {
    const n2route = routeOf([stg('stg-n2', 'n2_grammar'), stg('stg-mock', 'mock_boss')], 'N2');
    const done = new Set(['stg-n2', 'stg-mock']);
    expect(nextRoadOf(profOf('jlpt', 'N2'), n2route, done)).toEqual({ clearedLevel: 'N2', nextLevel: null });
  });

  it('pools未ロードのフォールバック（targetID集合。stageIdを含まない）では出ない＝偽陽性なし', () => {
    const targetIdsOnly = new Set(['n5g-unit-01', 'n5g-unit-02', 'vocab-n5-foundation']);
    expect(nextRoadOf(profOf('jlpt', 'N5'), n5route, targetIdsOnly)).toBeNull();
  });

  it('route無し・目標未設定では出ない', () => {
    const done = new Set(['stg-foundation', 'stg-mock']);
    expect(nextRoadOf(profOf('jlpt', 'N5'), null, done)).toBeNull();
    expect(nextRoadOf(profOf('jlpt', null), n5route, done)).toBeNull();
  });
});
