// advPace（残り量・実測ペース・逆算）の受入テスト。
//
// いちばん守りたいこと（原則13: 数字を作らない）:
// - 実測2週未満でペース・予測・onTrack を出さない
// - 残り量（地域・項目）は常に正確
// - 週次まとめの「今週あたらしく定着」が時点評価で正しく数えられる
//   （旧実装は全attempt評価だったため常に0件になっていた回帰の固定）
import { describe, it, expect } from 'vitest';
import { computePace, MIN_PACE_DAYS } from './advPace';
import { masteredTargetIds, masteredTargetIdsAsOf } from './advMastery';
import type { AdvMasteryAttempt, AdvMasteryLedger, AdvRoute, AdvRouteStage, AdvStageKind, AdvStageTargets } from './advTypes';

const NOW = '2026-08-14T12:00:00.000Z';
const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();
const keyOf = (iso: string): string => iso.slice(0, 10);

const attempt = (completedAt: string, scorePct = 90): AdvMasteryAttempt => ({
  dateKey: keyOf(completedAt),
  scorePct,
  unseenRatio: 1,
  questionKeys: ['q:a', 'q:b', 'q:c'],
  tier: 'normal',
  timed: false,
  completedAt,
});

/** 「別の日に3回＋7日後確認」を満たすattempt列。confirmDaysAgo に遅延確認日を置く */
const masteredAttempts = (confirmDaysAgo: number): AdvMasteryAttempt[] => [
  attempt(daysAgo(confirmDaysAgo + 13)),
  attempt(daysAgo(confirmDaysAgo + 12)),
  attempt(daysAgo(confirmDaysAgo + 11)),
  attempt(daysAgo(confirmDaysAgo)),
];

const stage = (stageId: string, kind: AdvStageKind, targets: AdvStageTargets): AdvRouteStage => ({
  stageId, kind, areaId: 'area', titleJa: stageId, titleZh: stageId,
  purposeJa: '', purposeZh: '', targets, clearConditionJa: '', clearConditionZh: '',
});

const route: AdvRoute = {
  generatedAt: NOW,
  destinationJlpt: 'N3',
  destinationAreaId: 'dest',
  destinationLabelJa: 'N3', destinationLabelZh: 'N3',
  explanationJa: '', explanationZh: '',
  stages: [
    stage('stg-a', 'foundation_camp', { n3UnitIds: ['u1', 'u2'] }),
    stage('stg-b', 'n3_practice', { n3UnitIds: ['u3', 'u4'] }),
    stage('stg-conv', 'conversation_start', { conversationThemeIds: ['c1'] }),
  ],
};

const paceOf = (ledger: AdvMasteryLedger, daysToExam: number | null = null, stageDone = new Set<string>()) =>
  computePace({
    route, ledger, nowISO: NOW, daysToExam, stageDone,
    n3Ids: [], n2ByUnit: new Map(),
  });

describe('advPace: 残り量', () => {
  it('会話レーンを除いた未攻略stage数と未定着項目数を数える', () => {
    const p = paceOf({ u1: masteredAttempts(1) });
    expect(p.remainingStages).toBe(2);
    expect(p.remainingTargets).toBe(3); // u2, u3, u4
  });

  it('stageDone（ボス撃破記録含む）のstageは残りから除く', () => {
    const p = paceOf({}, null, new Set(['stg-a']));
    expect(p.remainingStages).toBe(1);
    expect(p.remainingTargets).toBe(2); // u3, u4
  });

  it('全部攻略済みなら残り0・推定0週', () => {
    const p = paceOf(
      { u1: masteredAttempts(1), u2: masteredAttempts(1), u3: masteredAttempts(1), u4: masteredAttempts(1) },
      30,
    );
    expect(p.remainingTargets).toBe(0);
    expect(p.estWeeksLeft).toBe(0);
    expect(p.neededPerWeek).toBe(0);
    expect(p.onTrack).toBe(true);
  });
});

describe('advPace: 実測ペースと予測（数字を作らない）', () => {
  it(`実測${MIN_PACE_DAYS}日未満ではペース・予測・onTrackを出さない`, () => {
    const p = paceOf({ u1: masteredAttempts(1).map((a) => ({ ...a, completedAt: daysAgo(3), dateKey: keyOf(daysAgo(3)) })) });
    expect(p.measuredPerWeek).toBeNull();
    expect(p.estWeeksLeft).toBeNull();
    expect(p.onTrack).toBeNull();
  });

  it('直近windowの新規定着から週あたりペースと残り週数を出す', () => {
    // 16日前から学習。u1は3日前に遅延確認済（=window内の新規定着1件）
    const ledger: AdvMasteryLedger = { u1: masteredAttempts(3) };
    const p = paceOf(ledger);
    expect(p.measuredPerWeek).toBeCloseTo(7 / 16, 1); // 1件 / (16日÷7)
    expect(p.estWeeksLeft).toBe(Math.ceil(3 / (p.measuredPerWeek as number)));
  });

  it('受験日があると必要ペースとonTrackが出る', () => {
    const ledger: AdvMasteryLedger = { u1: masteredAttempts(3) };
    const tight = paceOf(ledger, 7);   // 残り3項目を1週間で
    expect(tight.neededPerWeek).toBe(3);
    expect(tight.onTrack).toBe(false); // 実測 週0.3 では届かない
    const loose = paceOf(ledger, 365);
    expect(loose.onTrack).toBe(true);
  });

  it('受験日が無ければ necessary/onTrack は null（断定しない）', () => {
    const p = paceOf({ u1: masteredAttempts(3) }, null);
    expect(p.neededPerWeek).toBeNull();
    expect(p.onTrack).toBeNull();
  });
});

describe('masteredTargetIdsAsOf: 時点評価', () => {
  it('今週遅延確認が通った項目は「週初め時点」ではmasteredでない（週次まとめが0件になる回帰の固定）', () => {
    const ledger: AdvMasteryLedger = { u1: masteredAttempts(1) }; // 確認は昨日
    const weekStart = daysAgo(4);
    expect(masteredTargetIds(ledger, NOW).has('u1')).toBe(true);
    // 旧実装相当（全attempt評価）だと過去時点でもtrueになってしまう
    expect(masteredTargetIds(ledger, weekStart).has('u1')).toBe(true);
    // 時点評価なら週初めにはまだ確認attemptが存在しない＝false
    expect(masteredTargetIdsAsOf(ledger, weekStart).has('u1')).toBe(false);
  });
});
