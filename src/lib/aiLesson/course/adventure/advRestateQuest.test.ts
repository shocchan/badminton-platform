// 言い直しが実際に生徒の前に出ること（2026-09-09・P1-4）。
//
// これまで言い直しstepは 15分・30分設定にしか置かれておらず、しかも
// 「弱点文法」か「今日の対象表現」がある日にしか出なかった。
// 実在の生徒の半分は5分設定なので、canon §4 の毎日ループにある
// 「レポート → 言い直し → 復習登録」が**一度も出ない人**がいた。
//
// 直したあと守ること:
//   - 会話で直された言い方が今日出る番なら、5分設定でも必ず出す
//   - ただし**足さない**。5分の約束を壊さないよう、新しいことばと入れ替える
//   - 素材が無い日は出さない（空カードを作らない）
import { describe, it, expect } from 'vitest';
import { generateTodayQuest } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';

const NOW = '2026-09-09T00:00:00.000Z';
const route = generateRoute({
  goalType: 'jlpt', targetJlpt: 'N3',
  knowledgeBand: 'n3', conversationBand: 'n3', diagnosis: null, nowISO: NOW,
});

const quest = (
  minutes: 5 | 15 | 30, restateDueCount: number,
  over: { weakGrammarIds?: string[]; nextGrammarIds?: string[] } = {},
) => generateTodayQuest({
  profile: {
    ...defaultAdvProfile(NOW), goalType: 'jlpt', targetJlpt: 'N3',
    dailyMinutes: minutes, route, kana: { needed: false, doneRowIds: [], checkedAt: NOW },
  },
  route, reviewQuestionCount: 0,
  weakGrammarIds: over.weakGrammarIds ?? [],
  restateDueCount,
  dateKey: '2026-09-09', nowISO: NOW,
  daysToExam: null, masteredStageIds: new Set(), contentStage: route.stages[0],
  availability: {
    nextGrammarIds: over.nextGrammarIds ?? [], nextUnitIds: [], conversationTargets: [],
    confirmTargetIds: [], vocabBattleTargetId: 'vocab-n3', kanjiBattleTargetId: null,
  } as never,
});

const kindsOf = (minutes: 5 | 15 | 30, due: number, over = {}) =>
  quest(minutes, due, over).steps.map((s) => s.kind);

describe('5分設定でも言い直しが出る（P1-4）', () => {
  it('会話で直された言い方が今日ある日は、5分設定でも言い直しが出る', () => {
    expect(kindsOf(5, 1)).toContain('restate');
  });

  it('素材が無い日は出さない（空カードを作らない）', () => {
    expect(kindsOf(5, 0)).not.toContain('restate');
  });

  it('新しいことばの枠と**入れ替わる**（学ぶ材料がある日は時間が増えない）', () => {
    const over = { nextGrammarIds: ['n3g-tearu'] };
    const without = quest(5, 0, over);
    const withRestate = quest(5, 1, over);
    expect(without.steps.map((s) => s.kind)).toContain('vocab_learn');
    expect(withRestate.steps.map((s) => s.kind)).not.toContain('vocab_learn');
    expect(withRestate.steps).toHaveLength(without.steps.length);
    expect(withRestate.estimatedMinutes).toBeLessThanOrEqual(without.estimatedMinutes);
  });

  it('学ぶ材料が無い日は並ぶが、5分の約束の中に収まる', () => {
    const q = quest(5, 1);
    expect(q.steps.map((s) => s.kind)).toEqual(['vocab_learn', 'restate']);
    expect(q.estimatedMinutes).toBeLessThanOrEqual(5);
  });
});

describe('15分・30分設定（従来の条件は壊さない）', () => {
  it('弱点も対象表現も無くても、会話の直しがあれば言い直しが出る', () => {
    expect(kindsOf(15, 1)).toContain('restate');
    expect(kindsOf(30, 1)).toContain('restate');
  });

  it('従来どおり、弱点文法がある日は言い直しが出る（直しが無くても）', () => {
    expect(kindsOf(15, 0, { weakGrammarIds: ['n3g-tearu'] })).toContain('restate');
  });

  it('素材がまったく無い日は出さない', () => {
    expect(kindsOf(15, 0)).not.toContain('restate');
    expect(kindsOf(30, 0)).not.toContain('restate');
  });
});
