// 「押しても何も起きない」を今日の冒険に混ぜない（2026-08-18 P0）。
//
// 実測で見つかった2つ:
// ① 学習対象が全部「7日後の確認待ち」になった日、バトルの対象が `stage.stageId`
//    （例 `stg-foundation`）へ落ちていた。stageIdは出題プールのキーではないので
//    **0問のバトル**になり、押すと「まだ出題できる問題がありません」で終わる。
//    毎日満点のシミュレーションで、4目標すべての最後の1週間に4〜5日発生していた。
// ② N5/N4目標のルートは stage が基礎キャンプ／N4文法しか無く、そこで読解・聴解を
//    一律に外していたため **読解stepが一度も出ない**（N5=52日完走で0回）。
//    2026-08-18 に追加したN5/N4読解96セットが丸ごと死蔵されていた。
import { describe, it, expect } from 'vitest';
import { generateRoute } from './advRoute';
import { generateTodayQuest } from './advQuest';
import { defaultAdvProfile } from './advProfile';
import { ACTIVE_TARGET_LEVELS, type AdvBand, type AdvGoalType, type JlptLevel, type AdvRoute } from './advTypes';

const NOW = '2026-09-01T09:00:00.000Z';
const DATE_KEY = '2026-09-01';   // 奇数日＝試験技能を出す日（advQuest の examDay 条件）
const BANDS: AdvBand[] = [
  'needs_assessment', 'pre_n5', 'n5', 'n4', 'n4_late',
  'n3_early', 'n3', 'n3_late', 'n2_early', 'n2', 'n2_plus',
];
const MINUTES: (5 | 15 | 30)[] = [5, 15, 30];

const routeOf = (target: JlptLevel, band: AdvBand, goalType: AdvGoalType = 'jlpt'): AdvRoute =>
  generateRoute({
    goalType, targetJlpt: goalType === 'conversation' ? null : target,
    knowledgeBand: band, conversationBand: band, diagnosis: null, nowISO: NOW,
  });

/** 学習対象が尽きた日（全部が攻略済み or 7日待ち）の今日の冒険 */
const questWithNoContent = (target: JlptLevel, band: AdvBand, minutes: 5 | 15 | 30, goalType: AdvGoalType = 'jlpt') => {
  const route = routeOf(target, band, goalType);
  const profile = {
    ...defaultAdvProfile(NOW),
    goalType, targetJlpt: goalType === 'conversation' ? null : target,
    dailyMinutes: minutes, route,
  };
  return generateTodayQuest({
    profile, route, reviewQuestionCount: 0, weakGrammarIds: [],
    dateKey: DATE_KEY, nowISO: NOW, daysToExam: null,
    masteredStageIds: new Set(),
    contentStage: route.stages[0],
    availability: {
      nextGrammarIds: [], nextUnitIds: [], conversationTargets: [],
      confirmTargetIds: [], vocabBattleTargetId: null,
    },
  });
};

describe('バトルstepの対象は必ず出題プールを持つ', () => {
  it('学習対象が尽きた日に stageId を対象にしたバトルを出さない（4目標×11帯×3分量）', () => {
    const bad: string[] = [];
    for (const target of ACTIVE_TARGET_LEVELS) {
      for (const band of BANDS) {
        for (const minutes of MINUTES) {
          for (const goalType of ['jlpt', 'hybrid'] as AdvGoalType[]) {
            const q = questWithNoContent(target, band, minutes, goalType);
            for (const s of q.steps) {
              // stg-* は攻略ルートのstageIdであって、出題プールのキーではない
              if (s.kind === 'battle' && (s.refIds.length === 0 || s.refIds.some((r) => r.startsWith('stg-')))) {
                bad.push(`${goalType}/${target}/${band}/${minutes}分: ${JSON.stringify(s.refIds)}`);
              }
            }
          }
        }
      }
    }
    expect(bad, `0問になるバトル: ${bad.slice(0, 5).join(' , ')}`).toEqual([]);
  });

  it('対象がある日は従来どおりバトルが出る（バトルを消してしまっていないことの番人）', () => {
    const route = routeOf('N5', 'pre_n5');
    const profile = { ...defaultAdvProfile(NOW), goalType: 'jlpt' as const, targetJlpt: 'N5' as const, dailyMinutes: 15 as const, route };
    const q = generateTodayQuest({
      profile, route, reviewQuestionCount: 0, weakGrammarIds: [],
      dateKey: '2026-09-02', nowISO: NOW, daysToExam: null,   // 偶数日＝試験技能を出さない日
      masteredStageIds: new Set(), contentStage: route.stages[0],
      availability: {
        nextGrammarIds: ['n5g-a-01'], nextUnitIds: [], conversationTargets: [],
        grammarBundleByItem: new Map([['n5g-a-01', 'n5g-unit-1']]),
        confirmTargetIds: [], vocabBattleTargetId: null,
      },
    });
    const battle = q.steps.find((s) => s.kind === 'battle');
    expect(battle?.refIds).toEqual(['n5g-unit-1']);
  });
});

describe('N5/N4 目標には自分のレベルの読解が出る', () => {
  const questWithReading = (target: JlptLevel) => {
    const route = routeOf(target, 'pre_n5');
    const profile = { ...defaultAdvProfile(NOW), goalType: 'jlpt' as const, targetJlpt: target, dailyMinutes: 15 as const, route };
    return generateTodayQuest({
      profile, route, reviewQuestionCount: 0, weakGrammarIds: [],
      dateKey: DATE_KEY, nowISO: NOW, daysToExam: null,
      masteredStageIds: new Set(),
      contentStage: route.stages[0],   // 基礎キャンプ
      availability: {
        nextGrammarIds: ['n5g-a-01'], nextUnitIds: [], conversationTargets: [],
        grammarBundleByItem: new Map([['n5g-a-01', 'n5g-unit-1']]),
        confirmTargetIds: [], vocabBattleTargetId: null,
      },
      examSkills: {
        weakestSkill: null, readingEvidence: 0, listeningEvidence: 0,
        readingTargetIds: [`read-${target.toLowerCase()}-shortPassage`], listeningTargetIds: [],
      },
    });
  };

  it('N5・N4 は基礎キャンプ中でも読解stepが出る', () => {
    for (const target of ['N5', 'N4'] as JlptLevel[]) {
      const q = questWithReading(target);
      const reading = q.steps.find((s) => s.kind === 'reading_short');
      expect(reading, `${target} で読解stepが出ない`).toBeTruthy();
      expect(reading!.refIds[0]).toBe(`read-${target.toLowerCase()}-shortPassage`);
    }
  });

  it('N3・N2 目標は基礎固め中に上のレベルの読解を出さない（従来どおり）', () => {
    for (const target of ['N3', 'N2'] as JlptLevel[]) {
      const q = questWithReading(target);
      expect(q.steps.some((s) => s.kind === 'reading_short'), `${target} で読解が出ている`).toBe(false);
    }
  });
});
