// 試験対策を目的に含む人にはAI会話を出さない（CEO決定 2026-08-25）。
//
// 【なぜ】CEOの言葉:「試験対策を選んだ人はAI会話は完全に入れないようにしよう」
// 「試験対策と会話両方を目的にした人には会話が出ないようにしてみよう」
// ＝ jlpt だけでなく hybrid も出さない。会話は先生が人の授業でやる。
//
// 【2026-08-22 の判断との関係】あちらは「N5・N4を目標にした人には出さない」という**級**の線引きで、
// このテストの旧名 advNoAiConversationN5N4 はそれを指していた。今回の目的での線引きがそれを覆う
// （jlpt/hybrid は級によらず false、conversation は元から級を持たない）ので、級の条件は消えた。
// 名前を級のままにしておくと、次に読む人が「N3なら出る」と誤解する。
//
// このテストが守るもの:
//  1. jlpt・hybrid では、どの級・どの条件でも会話stepが1つも出ない（教材が尽きた日でも）
//  2. 会話目的の人には今までどおり出る（会話を消したことが唯一の対象者に波及していない）
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
/** 試験対策を目的に含む目的（＝会話を出さない側） */
const EXAM_GOALS: AdvGoalType[] = ['jlpt', 'hybrid'];
/** 全級を回す。会話が出ないのは級によらないので、上の級も総当たりに入れる */
const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

const routeOf = (target: JlptLevel | null, band: AdvBand, goalType: AdvGoalType): AdvRoute =>
  generateRoute({ goalType, targetJlpt: target, knowledgeBand: band, conversationBand: band, diagnosis: null, nowISO: NOW });

/** 教材がある日／尽きた日の両方を作れるようにする */
const questOf = (opts: {
  target: JlptLevel | null; band: AdvBand; goalType: AdvGoalType; minutes: 5 | 15 | 30;
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
  it('試験対策を目的に含む人（jlpt・hybrid）には出さない', () => {
    for (const goal of EXAM_GOALS) {
      expect(aiConversationAvailable(goal), goal).toBe(false);
    }
  });

  it('会話が目的の人にだけ出す', () => {
    expect(aiConversationAvailable('conversation')).toBe(true);
  });
});

describe('今日の冒険: 試験対策目的にAI会話stepが出ない', () => {
  it('級・帯・時間・日付・教材の有無を総当たりしても1つも出ない', () => {
    const bad: string[] = [];
    for (const target of LEVELS) {
      for (const band of BANDS) {
        for (const goalType of EXAM_GOALS) {
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
    expect(bad, `試験対策目的にAI会話が出ている:\n${bad.slice(0, 10).join('\n')}`).toEqual([]);
  });

  it('会話を消しても今日の冒険が空にならない', () => {
    for (const target of LEVELS) {
      for (const goalType of EXAM_GOALS) {
        for (const minutes of MINUTES) {
          const q = questOf({ target, band: 'pre_n5', goalType, minutes, dateKey: DATES[0], withContent: false });
          expect(q.steps.length, `${target}/${goalType}/${minutes}分 が空`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('「今日のゴール」も対象能力も、出ない会話を約束しない', () => {
    for (const target of LEVELS) {
      for (const goalType of EXAM_GOALS) {
        const q = questOf({ target, band: 'n3', goalType, minutes: 30, dateKey: DATES[0], withContent: true });
        expect(q.successConditionJa, `${target}/${goalType}`).not.toContain('AI会話');
        expect(q.targetSkills, `${target}/${goalType}`).not.toContain('conversation');
      }
    }
  });

  it('会話目的の人には今までどおり出る（唯一の対象者まで消していない）', () => {
    const route = routeOf(null, 'n3', 'conversation');
    const q = questOf({
      target: null, band: 'n3', goalType: 'conversation', minutes: 30,
      // createdAt（NOW）と同じ日＝会話の日。会話は隔日なので日付を固定して確かめる
      dateKey: DATES[0], withContent: true, route,
    });
    expect(convSteps(q).length, '会話目的の人からAI会話が消えた').toBeGreaterThan(0);
  });
});

describe('攻略ルート: 試験対策目的に会話stageを入れない', () => {
  it('hybridでも会話stageが混ざらない（提示した道と毎日の中身を一致させる）', () => {
    for (const target of LEVELS) {
      const route = routeOf(target, 'pre_n5', 'hybrid');
      const conv = route.stages.filter((s) => s.kind === 'conversation_start' || s.kind === 'conversation_growth');
      expect(conv, `${target} に会話stageが入っている`).toEqual([]);
      expect(route.explanationJa).toContain('先生の授業');
      expect(route.explanationJa).not.toContain('会話ミッションを毎日の冒険に組み込みます');
      // 級を条件にした文言に戻さない（「N4のあいだ」だと級が上がれば出ると読める）
      expect(route.explanationJa, `${target} の説明が級で条件づけている`).not.toContain(`${target}のあいだ`);
    }
  });

  it('会話目的のルートには会話stageが入る', () => {
    const route = routeOf(null, 'n3', 'conversation');
    expect(route.stages.some((s) => s.kind === 'conversation_start')).toBe(true);
  });
});

describe('保存済みの古いルート（会話stageが残っている人）', () => {
  it('会話stageが現在地でも、会話ではないstepが出て先へ進める', () => {
    // 2026-08-25 より前に hybrid でN3・N2を選んだ人は、保存済みルートに会話stageを持っている
    // （08-22 の級での線引きでは N3・N2 の hybrid に会話stageが入っていた）。
    // その人が会話stageに立ったとき、会話が出ない＝押すものが無い、にしてはいけない
    const legacy = routeOf('N2', 'n3', 'hybrid');
    const convStage = routeOf(null, 'n3', 'conversation')
      .stages.find((s) => s.kind === 'conversation_start')!;
    const route: AdvRoute = { ...legacy, stages: [convStage, ...legacy.stages] };
    const q = questOf({
      target: 'N2', band: 'n3', goalType: 'hybrid', minutes: 15,
      dateKey: DATES[0], withContent: true, route, contentStage: convStage,
    });
    expect(convSteps(q)).toEqual([]);
    expect(q.steps.length).toBeGreaterThan(0);
  });
});
