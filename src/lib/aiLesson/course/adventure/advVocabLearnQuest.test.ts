// 「学ぶ」枠に新しいことばが入ること（2026-09-06）。
//
// これまで、新しい文法も単元も無い日は「学ぶ」枠が空だった。N3以上の学習者は
// 文法を攻略し終えると、語彙は**問題として出会うだけ**になっていた。
// その日は「新しいことば5語」を出す。
import { describe, it, expect } from 'vitest';
import { generateTodayQuest, learnBatchSizeFor } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';

const NOW = '2026-09-06T00:00:00.000Z';
const route = generateRoute({
  goalType: 'jlpt', targetJlpt: 'N1',
  knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW,
});

const quest = (
  over: { nextGrammarIds?: string[]; nextUnitIds?: string[] },
  minutes: 5 | 15 | 30 = 15, dateKey = '2026-09-06',
) => generateTodayQuest({
  profile: {
    ...defaultAdvProfile(NOW), goalType: 'jlpt', targetJlpt: 'N1',
    dailyMinutes: minutes, route, kana: { needed: false, doneRowIds: [], checkedAt: NOW },
  },
  route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey, nowISO: NOW,
  daysToExam: null, masteredStageIds: new Set(), contentStage: route.stages[0],
  availability: {
    nextGrammarIds: [], nextUnitIds: [], conversationTargets: [],
    confirmTargetIds: [], vocabBattleTargetId: null, kanjiBattleTargetId: null,
    ...over,
  } as never,
});

describe('「学ぶ」枠', () => {
  // 2026-09-06: 「学ぶ」枠は文法が優先（従来どおり）。新しいことばはそれとは**別枠**で
  // 毎日入るようになったので、両方出るのが正しい
  it('新しい文法があるときは「学ぶ」枠は文法。ことばは別枠で並ぶ', () => {
    const kinds = quest({ nextGrammarIds: ['n1g-001'] }).steps.map((s) => s.kind);
    expect(kinds).toContain('grammar_new');
    expect(kinds).toContain('vocab_learn');
  });

  it('**学ぶ材料が無い日は「新しいことば5語」が入る**（空にしない）', () => {
    const q = quest({});
    const learn = q.steps.find((s) => s.kind === 'vocab_learn');
    expect(learn, '学ぶ枠が空のままになっている').toBeTruthy();
    expect(learn!.titleJa).toBe('新しいことば5語');
    expect(learn!.titleZh).toBe('记5个新单词');
  });
});

/** 9日ぶんの日付（曜日ではなく通日で回している） */
const DAYS = Array.from({ length: 9 }, (_, i) =>
  new Date(Date.parse('2026-09-06T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));

describe('冒険の一部として回ってくる（2026-09-06）', () => {
  for (const minutes of [5, 15, 30] as const) {
    // 2026-09-06 CEO要望「今日の冒険に必ず出す」。以前は 3〜4日に1回で、
    // 開いた日にほとんど入っていなかった
    it(`${minutes}分設定で、**毎日**新しいことばが出る`, () => {
      const missing = DAYS.filter((d) => !quest({ nextGrammarIds: ['n1g-001'] }, minutes, d)
        .steps.some((s) => s.kind === 'vocab_learn'));
      expect(missing, `${minutes}分: 出ない日がある`).toEqual([]);
    });

    it(`${minutes}分設定の語数と題名が一致する`, () => {
      const n = minutes === 5 ? 3 : 5;
      const s = quest({ nextGrammarIds: ['n1g-001'] }, minutes, DAYS[0])
        .steps.find((x) => x.kind === 'vocab_learn')!;
      expect(s.titleJa).toBe(`新しいことば${n}語`);
      expect(s.titleZh).toBe(`记${n}个新单词`);
      expect(learnBatchSizeFor(minutes)).toBe(n);
    });

    it(`${minutes}分設定の1日の見積もりが設定時間を大きく超えない`, () => {
      for (const d of DAYS) {
        const q = quest({ nextGrammarIds: ['n1g-001'] }, minutes, d);
        // 5分設定は1ステップの最小単位（バトル6分）があるので少し超える。
        // 「設定＋バトル1本ぶん」を上限として、新しいことばを足しても溢れないことを見る
        expect(q.estimatedMinutes, `${minutes}分 ${d}: ${q.estimatedMinutes}分`)
          .toBeLessThanOrEqual(minutes + 6);
      }
    });
  }

  /**
   * 2026-09-06 に方針を変えた。以前は5分設定で「新しいことば」と文法を**入れ替えて**いたが、
   * それだと4日に1回しか出ず、CEOの「毎日の冒険に入れてほしい」を満たせない。
   * いまは両方入れ、そのかわり5分の人だけ **3語（2分）** にして時間の約束を守る。
   */
  it('5分設定は3語（2分）なので、文法と並べても時間が溢れない', () => {
    for (const d of DAYS) {
      const q = quest({ nextGrammarIds: ['n1g-001'] }, 5, d);
      const learn = q.steps.find((s) => s.kind === 'vocab_learn');
      expect(learn, `${d}: 出ていない`).toBeTruthy();
      expect(learn!.estMinutes).toBe(2);
    }
  });
});
