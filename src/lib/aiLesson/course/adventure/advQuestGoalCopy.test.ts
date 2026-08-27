// 「今日のゴール」は、実装している完了条件と一致していなければならない。2026-08-18 監査P2。
//
// 旧文言は「バトルで80%以上を取る」だったが、実装ではバトルを最後まで解けば
// 0%でも step に✓が付き、全step✓で「今日の冒険を締めくくる」が出る。
// 満たしていない条件を「今日のゴール」に掲げたまま達成として締めくくらせない。
// 80%は攻略（別日3回＋遅延確認）が1日ぶん進む条件なので、そちらの意味で書く。
import { describe, it, expect } from 'vitest';
import { generateTodayQuest, type GenerateQuestInput } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile } from './advTypes';
import { PASS_LABEL } from './advMastery';

const NOW = '2026-08-18T09:00:00.000Z';

const mkInput = (over: Partial<GenerateQuestInput> = {}): GenerateQuestInput => {
  const profile: AdventureV2Profile = {
    ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N2', dailyMinutes: 15,
  };
  const route = generateRoute({
    goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n4',
    conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
  });
  return {
    profile, route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey: '2026-08-18', nowISO: NOW,
    availability: {
      nextGrammarIds: ['n3g-bbb', 'n3g-ccc'], nextUnitIds: ['n3u-01-self'],
      conversationTargets: [],
    },
    daysToExam: 100, ...over,
  };
};

describe('今日のゴールは、実装している完了条件と一致する', () => {
  it('バトルの日は「80%以上を取る」を達成条件として掲げない', () => {
    const q = generateTodayQuest(mkInput());
    expect(q.steps.some((s) => s.kind === 'battle')).toBe(true);
    // 旧文言（実装と食い違っていた）
    expect(q.successConditionJa).not.toBe('バトルで80%以上を取る');
    expect(q.successConditionZh).not.toBe('战斗拿到80%以上');
    expect(q.successConditionJa).not.toMatch(/^バトルで80%以上/);
    expect(q.successConditionZh).not.toMatch(/^战斗拿到80%以上/);
  });

  it('実際の完了条件（バトルを最後まで解く）を書き、80%は「攻略が進む条件」として添える', () => {
    const q = generateTodayQuest(mkInput());
    expect(q.successConditionJa).toContain('最後まで');
    expect(q.successConditionJa).toContain('攻略');
    expect(q.successConditionZh).toContain('攻略');
    // 80%の意味は残す（消して伝えないのも不誠実）
    expect(q.successConditionJa).toContain(PASS_LABEL.ja);
    expect(q.successConditionZh).toContain(PASS_LABEL.zh);
  });

  it('AI会話が入る日も同じ（会話は「1回終える」で実測できる）', () => {
    // AI会話が出るのは会話目的の人だけになった（CEO決定 2026-08-25）ので、
    // 会話の日の文言はその人で確かめる。jlpt目標のまま書くと、会話stepが出ずに
    // 「AI会話の日の文言」を一度も通らないテストになる
    const convRoute = generateRoute({
      goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n3',
      conversationBand: 'n3', diagnosis: null, nowISO: NOW,
    });
    const q = generateTodayQuest(mkInput({
      profile: { ...defaultAdvProfile(NOW), enabled: true, goalType: 'conversation', targetJlpt: null, dailyMinutes: 15 },
      route: convRoute,
      daysToExam: null,
      availability: {
        nextGrammarIds: ['n3g-bbb'], nextUnitIds: ['n3u-01-self'],
        conversationTargets: [{ refId: 'ctx-1', expression: '〜てもらえますか', themeJa: '仕事のお願い', themeZh: '工作请求' }],
      },
    }));
    expect(q.steps.some((s) => s.kind === 'conversation_mission')).toBe(true);
    expect(q.successConditionJa).toContain('AI会話を1回終える');
    expect(q.successConditionJa).not.toMatch(/^バトルで80%以上/);
  });

  it('AI会話が出ない人（試験対策が目的）のゴールにAI会話を書かない', () => {
    // 出ないものを「今日のゴール」に掲げない（原則13）
    for (const goalType of ['jlpt', 'hybrid'] as const) {
      const q = generateTodayQuest(mkInput({
        profile: { ...defaultAdvProfile(NOW), enabled: true, goalType, targetJlpt: 'N2', dailyMinutes: 15 },
        availability: {
          nextGrammarIds: ['n3g-bbb'], nextUnitIds: ['n3u-01-self'],
          conversationTargets: [{ refId: 'ctx-1', expression: '〜てもらえますか', themeJa: '仕事のお願い', themeZh: '工作请求' }],
        },
      }));
      expect(q.successConditionJa, goalType).not.toContain('AI会話');
      expect(q.successConditionZh, goalType).not.toContain('AI会话');
    }
  });
});
