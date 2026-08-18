// 保存済みルートの取り込み時補正（migrateSavedRoute）。2026-08-18 新設。
//
// 直した問題（実在の有料生徒1名が実際にこの状態だった）:
// ルートは生成時のスナップショットとして jsonb に保存され、generateRoute は
// 「冒険の準備」でしか走らない。2026-08-17 に foundation_camp / n3_bridge へ
// 初級文法を足したが、それ以前に準備を終えた学習者のルートは basicUnits を持たないままで、
// ステージ名は「N3語彙・文法の橋」なのに文法が1項目も出ず、
// 今日の冒険の学習stepが毎日まったく同じ `vocab_new[n3u-03-move]` に固定されていた。
//
// ここで守るのは3つ:
// 1. 新規ルートには何もしない（冪等・生成直後の姿を壊さない）
// 2. 古いルートは**新規ルートとまったく同じ targets**まで補われる
//    （BASIC_UNITS_BY_STAGE_ID と jlptStages がズレたらここで落ちる）
// 3. 補正の結果、文法が実際に供給される（stageContent が空を返さない）
import { describe, it, expect } from 'vitest';
import { generateRoute, migrateSavedRoute } from './advRoute';
import { readAdvProfile } from './advProfile';
import { stageContent } from './advContent';
import { N5_UNIT_IDS, N4_UNIT_IDS } from '../basicGrammarChunks';
import type { AdvRoute, AdvBand, JlptLevel } from './advTypes';
import type { LearnerSettings } from '../types';

const NOW = '2026-08-18T09:00:00.000Z';

/** 保存済み（2026-08-17より前の）ルート＝basicUnits を落としたもの */
const asLegacy = (route: AdvRoute): AdvRoute => ({
  ...route,
  stages: route.stages.map((s) => {
    const rest = { ...s.targets };
    delete rest.basicUnits;
    return { ...s, targets: rest };
  }),
});

const routeOf = (targetJlpt: JlptLevel, knowledgeBand: AdvBand): AdvRoute => generateRoute({
  goalType: 'jlpt', targetJlpt, knowledgeBand,
  conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
});

/**
 * 目標×帯×goalの**全組み合わせ**を通す。手で選んだケース表だと、
 * 新しいstageにbasicUnitsを足したときに取りこぼす（実際 stg-n5boss を取りこぼした）。
 */
const ALL_BANDS: AdvBand[] = [
  'needs_assessment', 'pre_n5', 'n5', 'n4', 'n4_late',
  'n3_early', 'n3', 'n3_late', 'n2_early', 'n2', 'n2_plus',
];
const ALL_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2'];
const ALL_ROUTES = (): AdvRoute[] => {
  const out: AdvRoute[] = [];
  for (const goalType of ['jlpt', 'hybrid', 'conversation'] as const) {
    for (const lvl of ALL_LEVELS) {
      for (const band of ALL_BANDS) {
        out.push(generateRoute({
          goalType, targetJlpt: goalType === 'conversation' ? null : lvl,
          knowledgeBand: band, conversationBand: band, diagnosis: null, nowISO: NOW,
        }));
      }
    }
  }
  return out;
};

describe('migrateSavedRoute', () => {
  it('新規ルートには何もしない（同一オブジェクトを返す＝冪等）', () => {
    for (const fresh of ALL_ROUTES()) expect(migrateSavedRoute(fresh)).toBe(fresh);
  });

  it('古いルートを補正すると、新規ルートとまったく同じ targets になる', () => {
    for (const fresh of ALL_ROUTES()) {
      const migrated = migrateSavedRoute(asLegacy(fresh));
      expect(migrated.stages.map((s) => s.targets)).toEqual(fresh.stages.map((s) => s.targets));
    }
  });

  it('補正をもう一度かけても変わらない（二重適用でも安全）', () => {
    for (const fresh of ALL_ROUTES()) {
      const once = migrateSavedRoute(asLegacy(fresh));
      expect(migrateSavedRoute(once)).toBe(once);
    }
  });

  it('補正しても stage の並び・ID・攻略条件は変わらない（道のりを作り替えない）', () => {
    const fresh = routeOf('N3', 'n5');
    const migrated = migrateSavedRoute(asLegacy(fresh));
    expect(migrated.stages.map((s) => s.stageId)).toEqual(fresh.stages.map((s) => s.stageId));
    expect(migrated.generatedAt).toBe(fresh.generatedAt);
    expect(migrated.destinationJlpt).toBe(fresh.destinationJlpt);
  });

  it('会話・N3文法・N2・N3ボスのstageには basicUnits を足さない', () => {
    const migrated = migrateSavedRoute(asLegacy(generateRoute({
      goalType: 'hybrid', targetJlpt: 'N2', knowledgeBand: 'n3',
      conversationBand: 'n4', diagnosis: null, nowISO: NOW,
    })));
    for (const s of migrated.stages) {
      if (s.stageId === 'stg-foundation' || s.stageId === 'stg-n3bridge') continue;
      expect(s.targets.basicUnits).toBeUndefined();
    }
  });

  it('壊れた保存データでも落ちない（stagesが配列でない・targetsが無い・未知のstageId）', () => {
    expect(() => migrateSavedRoute({ stages: null } as unknown as AdvRoute)).not.toThrow();
    expect(() => migrateSavedRoute(undefined as unknown as AdvRoute)).not.toThrow();
    // targets ごと欠けていても、補う対象のstageなら復元する
    const noTargets = { generatedAt: NOW, stages: [{ stageId: 'stg-n3bridge', kind: 'n3_bridge' }] } as unknown as AdvRoute;
    expect(migrateSavedRoute(noTargets).stages[0].targets.basicUnits).toEqual(N4_UNIT_IDS);
    // 知らないstageIdには触らない（勝手に文法を生やさない）
    const unknown = { generatedAt: NOW, stages: [{ stageId: 'stg-mystery', kind: 'n3_bridge', targets: {} }] } as unknown as AdvRoute;
    expect(migrateSavedRoute(unknown).stages[0].targets.basicUnits).toBeUndefined();
  });
});

describe('readAdvProfile が保存済みルートを補正して返す', () => {
  // 李さんの実データと同じ形（2026-08-15生成・basicUnits なし）
  const savedRoute = {
    generatedAt: '2026-08-15T06:37:43.850Z',
    destinationJlpt: 'N3', destinationAreaId: 'area07-katachi',
    destinationLabelJa: '', destinationLabelZh: '',
    explanationJa: '', explanationZh: '',
    stages: [{
      stageId: 'stg-n3bridge', kind: 'n3_bridge', areaId: 'area03-toorimichi',
      titleJa: 'N3語彙・文法の橋', titleZh: 'N3词汇语法之桥',
      purposeJa: '', purposeZh: '', clearConditionJa: '', clearConditionZh: '',
      targets: { n3UnitIds: ['n3u-03-move', 'n3u-04-things'], vocabularyIds: ['fi-joukyou'] },
    }],
  };
  const settings = {
    adventureV2: {
      schemaVersion: 1, enabled: true, goalType: 'jlpt', targetJlpt: 'N3',
      dailyMinutes: 15, route: savedRoute, mastery: {},
    },
  } as unknown as LearnerSettings;

  it('N3の橋にN4文法8束が補われる', () => {
    const prof = readAdvProfile(settings);
    expect(prof?.route?.stages[0].targets.basicUnits).toEqual(N4_UNIT_IDS);
    // 保存済みの targets は消さない
    expect(prof?.route?.stages[0].targets.n3UnitIds).toEqual(['n3u-03-move', 'n3u-04-things']);
  });

  it('補正後は文法が実際に供給される（毎日同じ単元1本のループを抜ける）', async () => {
    const prof = readAdvProfile(settings)!;
    const before = await stageContent(savedRoute.stages[0] as never, new Set(), new Set());
    const after = await stageContent(prof.route!.stages[0], new Set(), new Set());
    expect(before.nextGrammarIds.length).toBe(0); // 補正前は0件＝文法が1つも出ない
    expect(after.nextGrammarIds.length).toBeGreaterThan(50);
    // 初級文法バンク全体をロードするので既定の5秒では足りない（全suite並列時に落ちる）
  }, 60_000);

  it('基礎キャンプにはN5文法6束が補われる', () => {
    const camp = {
      ...savedRoute,
      stages: [{ ...savedRoute.stages[0], stageId: 'stg-foundation', kind: 'foundation_camp' }],
    };
    const prof = readAdvProfile({
      adventureV2: { schemaVersion: 1, enabled: true, route: camp, mastery: {} },
    } as unknown as LearnerSettings);
    expect(prof?.route?.stages[0].targets.basicUnits).toEqual(N5_UNIT_IDS);
  });
});
