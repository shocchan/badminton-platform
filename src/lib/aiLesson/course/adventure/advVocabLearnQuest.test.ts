// 「学ぶ」枠に新しいことばが入ること（2026-09-06）。
//
// これまで、新しい文法も単元も無い日は「学ぶ」枠が空だった。N3以上の学習者は
// 文法を攻略し終えると、語彙は**問題として出会うだけ**になっていた。
// その日は「新しいことば5語」を出す。
import { describe, it, expect } from 'vitest';
import { generateTodayQuest } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';

const NOW = '2026-09-06T00:00:00.000Z';
const route = generateRoute({
  goalType: 'jlpt', targetJlpt: 'N1',
  knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW,
});

const quest = (over: { nextGrammarIds?: string[]; nextUnitIds?: string[] }) => generateTodayQuest({
  profile: {
    ...defaultAdvProfile(NOW), goalType: 'jlpt', targetJlpt: 'N1',
    dailyMinutes: 15, route, kana: { needed: false, doneRowIds: [], checkedAt: NOW },
  },
  route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey: '2026-09-06', nowISO: NOW,
  daysToExam: null, masteredStageIds: new Set(), contentStage: route.stages[0],
  availability: {
    nextGrammarIds: [], nextUnitIds: [], conversationTargets: [],
    confirmTargetIds: [], vocabBattleTargetId: null, kanjiBattleTargetId: null,
    ...over,
  } as never,
});

describe('「学ぶ」枠', () => {
  it('新しい文法があるときは文法が優先される（従来どおり）', () => {
    const q = quest({ nextGrammarIds: ['n1g-001'] });
    expect(q.steps.map((s) => s.kind)).toContain('grammar_new');
    expect(q.steps.map((s) => s.kind)).not.toContain('vocab_learn');
  });

  it('**学ぶ材料が無い日は「新しいことば5語」が入る**（空にしない）', () => {
    const q = quest({});
    const learn = q.steps.find((s) => s.kind === 'vocab_learn');
    expect(learn, '学ぶ枠が空のままになっている').toBeTruthy();
    expect(learn!.titleJa).toBe('新しいことば5語');
    expect(learn!.titleZh).toBe('记5个新单词');
  });
});
