// N5・N4目標にはAI会話を出さない（CEO決定 2026-08-22）。
//
// 【なぜ】語彙・文法・読解・聴解は初級まで作り込んであるが、AI会話の中身はそこに届いていない。
// 届いていないものを毎日の冒険に混ぜると、生徒の時間を薄いところに使わせることになる。
// この時期の会話は先生が人の授業でやる。
//
// このテストが守るもの:
//  1. N5・N4では、どの条件でも会話stepが1つも出ない（目的がhybridでも、教材が尽きた日でも）
//  2. N3・N2では今までどおり出る（会話を消したことが上の級に波及していない）
//  3. ルートに会話stageを入れない＝提示した道と毎日の中身が食い違わない
//  4. 会話stepが消えても今日の冒険が空にならない（行き止まりを作らない・原則15）
import { describe, it, expect } from 'vitest';
import { generateTodayQuest } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';
import { aiConversationAvailable } from './advTypes';
import type { AdvBand, AdvGoalType, AdvRoute, JlptLevel } from './advTypes';

const NOW = '2026-09-01T09:00:00.000Z';
const BANDS: AdvBand[] = ['needs_assessment', 'pre_n5', 'n5', 'n4', 'n4_late', 'n3', 'n2'];
const MINUTES: (5 | 15 | 30)[] = [5, 15, 30];
const DATES = ['2026-09-01', '2026-09-02', '2026-09-03'];

const routeOf = (target: JlptLevel, band: AdvBand, goalType: AdvGoalType): AdvRoute =>
  generateRoute({ goalType, targetJlpt: target, knowledgeBand: band, conversationBand: band, diagnosis: null, nowISO: NOW });

/** 教材がある日／尽きた日の両方を作れるようにする */
const questOf = (opts: {
  target: JlptLevel; band: AdvBand; goalType: AdvGoalType; minutes: 5 | 15 | 30;
  dateKey: string; withContent: boolean; route?: AdvRoute; contentStage?: AdvRoute['stages'][number];
}) => {
  const route = opts.route ?? routeOf(opts.target, opts.band, opts.goalType);
  const profile = {
    ...defaultAdvProfile(NOW),
    goalType: opts.goalType, targetJlpt: opts.target,
    dailyMinutes: opts.minutes, route,
    // かな確認で今日の冒険がかな道場1本に絞られると会話の有無を確かめられないので、読める状態にする
    kana: { needed: false, doneRowIds: [], checkedAt: NOW },
  };
  return generateTodayQuest({
    profile, route, reviewQuestionCount: 0, weakGrammarIds: [],
    dateKey: opts.dateKey, nowISO: NOW, daysToExam: null,
    masteredStageIds: new Set(),
    contentStage: opts.contentStage ?? route.stages[0],
    availability: opts.withContent
      ? {
        nextGrammarIds: ['n5g-01'], nextUnitIds: ['unit-1'],
        conversationTargets: [{ refId: 'conv-1', expression: 'これをください', themeJa: '買い物', themeZh: '购物' }],
        confirmTargetIds: [], vocabBattleTargetId: 'vocab-1',
      }
      : {
        nextGrammarIds: [], nextUnitIds: [], conversationTargets: [],
        confirmTargetIds: [], vocabBattleTargetId: null,
      },
  });
};

const convSteps = (q: { steps: { kind: string }[] }) => q.steps.filter((s) => s.kind === 'conversation_mission');

describe('aiConversationAvailable', () => {
  it('N5・N4はどの目的でも会話を出さない', () => {
    for (const target of ['N5', 'N4'] as JlptLevel[]) {
      for (const goal of ['jlpt', 'hybrid'] as AdvGoalType[]) {
        expect(aiConversationAvailable(goal, target), `${goal}/${target}`).toBe(false);
      }
    }
  });

  it('N3・N2・N1は今までどおり出す', () => {
    for (const target of ['N3', 'N2', 'N1'] as JlptLevel[]) {
      for (const goal of ['jlpt', 'hybrid'] as AdvGoalType[]) {
        expect(aiConversationAvailable(goal, target), `${goal}/${target}`).toBe(true);
      }
    }
  });

  it('会話そのものが目的の人は対象外（レベルを持たない）', () => {
    expect(aiConversationAvailable('conversation', null)).toBe(true);
  });
});

describe('今日の冒険: N5・N4にAI会話stepが出ない', () => {
  it('目的・帯・時間・日付・教材の有無を総当たりしても1つも出ない', () => {
    const bad: string[] = [];
    for (const target of ['N5', 'N4'] as JlptLevel[]) {
      for (const band of BANDS) {
        for (const goalType of ['jlpt', 'hybrid'] as AdvGoalType[]) {
          for (const minutes of MINUTES) {
            for (const dateKey of DATES) {
              for (const withContent of [true, false]) {
                const q = questOf({ target, band, goalType, minutes, dateKey, withContent });
                if (convSteps(q).length > 0) bad.push(`${target}/${band}/${goalType}/${minutes}分/${dateKey}/教材${withContent}`);
              }
            }
          }
        }
      }
    }
    expect(bad, `N5・N4にAI会話が出ている:\n${bad.slice(0, 10).join('\n')}`).toEqual([]);
  });

  it('会話を消しても今日の冒険が空にならない', () => {
    for (const target of ['N5', 'N4'] as JlptLevel[]) {
      for (const goalType of ['jlpt', 'hybrid'] as AdvGoalType[]) {
        for (const minutes of MINUTES) {
          const q = questOf({ target, band: 'pre_n5', goalType, minutes, dateKey: DATES[0], withContent: false });
          expect(q.steps.length, `${target}/${goalType}/${minutes}分 が空`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('「今日のゴール」も対象能力も、出ない会話を約束しない', () => {
    for (const target of ['N5', 'N4'] as JlptLevel[]) {
      const q = questOf({ target, band: 'pre_n5', goalType: 'hybrid', minutes: 30, dateKey: DATES[0], withContent: true });
      expect(q.successConditionJa).not.toContain('AI会話');
      expect(q.targetSkills).not.toContain('conversation');
    }
  });

  it('N3・N2では今までどおり出る（上の級に波及していない）', () => {
    for (const target of ['N3', 'N2'] as JlptLevel[]) {
      const q = questOf({ target, band: 'n3', goalType: 'hybrid', minutes: 30, dateKey: DATES[0], withContent: true });
      expect(convSteps(q).length, `${target} で会話が消えた`).toBeGreaterThan(0);
    }
  });
});

describe('攻略ルート: N5・N4に会話stageを入れない', () => {
  it('hybridでも会話stageが混ざらない（提示した道と毎日の中身を一致させる）', () => {
    for (const target of ['N5', 'N4'] as JlptLevel[]) {
      const route = routeOf(target, 'pre_n5', 'hybrid');
      const conv = route.stages.filter((s) => s.kind === 'conversation_start' || s.kind === 'conversation_growth');
      expect(conv, `${target} に会話stageが入っている`).toEqual([]);
      expect(route.explanationJa).toContain('先生の授業');
      expect(route.explanationJa).not.toContain('会話ミッションを毎日の冒険に組み込みます');
    }
  });

  it('N3・N2のhybridには今までどおり会話stageが入る', () => {
    for (const target of ['N3', 'N2'] as JlptLevel[]) {
      const route = routeOf(target, 'n3', 'hybrid');
      expect(route.stages.some((s) => s.kind === 'conversation_start'), `${target} の会話stageが消えた`).toBe(true);
    }
  });
});

describe('保存済みの古いルート（会話stageが残っている人）', () => {
  it('会話stageが現在地でも、会話ではないstepが出て先へ進める', () => {
    // 2026-08-22 より前にhybridでN4を選んだ人は、保存済みルートに会話stageを持っている。
    // その人が会話stageに立ったとき、会話が出ない＝押すものが無い、にしてはいけない
    const legacy = routeOf('N4', 'pre_n5', 'hybrid');
    const convStage = generateRoute({
      goalType: 'hybrid', targetJlpt: 'N3', knowledgeBand: 'n3',
      conversationBand: 'n3', diagnosis: null, nowISO: NOW,
    }).stages.find((s) => s.kind === 'conversation_start')!;
    const route: AdvRoute = { ...legacy, stages: [convStage, ...legacy.stages] };
    const q = questOf({
      target: 'N4', band: 'pre_n5', goalType: 'hybrid', minutes: 15,
      dateKey: DATES[0], withContent: true, route, contentStage: convStage,
    });
    expect(convSteps(q)).toEqual([]);
    expect(q.steps.length).toBeGreaterThan(0);
  });
});
