// 途中でやめた回の記録（2026-08-18 監査P1「実行中の離脱口が無い」の対応）。
//
// 守りたいこと:
// ① 中断した回は**解いた問題だけ**を記録する。画面に出てもいない問題を
//    「間違えた問題」として錯題本・台帳へ載せない（やっていないことを記録しない）
// ② 中断した回は攻略（別の日に3回80%）の証拠に数えない。
//    数えると「解けそうな2問だけ答えて抜ける」で攻略が進む抜け道になる
import { describe, it, expect } from 'vitest';
import { buildEncounter, gradeEncounter, truncateEncounter } from './advBattle';
import { isQualifyingAttempt } from './advMastery';
import type { AdvMasteryAttempt } from './advTypes';
import type { AdvBattleQuestion } from './advVariants';

const q = (i: number, type: string): AdvBattleQuestion => ({
  key: `t:q${i}`,
  type,
  level: 'n3',
  skill: 'grammar',
  examSection: 'languageKnowledge',
  targetJapanese: `対象${i}`,
  questionJa: `設問${i}`,
  questionZh: `问题${i}`,
  choices: [
    { choiceId: `q${i}-ok`, textJa: '正しい', isCorrect: true },
    { choiceId: `q${i}-x1`, textJa: 'ちがう一', isCorrect: false },
    { choiceId: `q${i}-x2`, textJa: 'ちがう二', isCorrect: false },
    { choiceId: `q${i}-x3`, textJa: 'ちがう三', isCorrect: false },
  ],
  explanation: {
    meaningJa: '意味', meaningZh: '意思',
    whyCorrectJa: '正解の理由', whyCorrectZh: '正确的理由',
    exampleJa: null, exampleZh: null,
    sourceItemId: `src-${i}`, sourceLabel: `出典${i}`,
  },
  sourceItemId: `src-${i}`,
  difficulty: 2,
  timed: false,
  variantId: `q${i}-v`,
  reviewState: 'authored',
  status: 'authored',
});

const encounter = (seen: Set<string> = new Set()) => buildEncounter({
  tier: 'normal',
  targetIds: ['t1'],
  pool: new Map([['t1', Array.from({ length: 10 }, (_, i) => q(i, i % 2 === 0 ? 'rec' : 'use'))]]),
  seenKeys: seen,
  recentWrongKeys: new Set(),
  seed: 7,
  attemptSeed: 11,
});

describe('truncateEncounter（中断時の採点対象）', () => {
  it('解いた問題数まで切り詰める（問題と提示順が1対1のまま）', () => {
    const enc = encounter();
    expect(enc.questions.length).toBe(7);
    const cut = truncateEncounter(enc, 3, new Set());
    expect(cut.questions.map((x) => x.key)).toEqual(enc.questions.slice(0, 3).map((x) => x.key));
    expect(cut.presented.map((p) => p.key)).toEqual(cut.questions.map((x) => x.key));
  });

  it('未出比率は切り詰めた集合で測り直す（残りぶんの見た目を持ち込まない）', () => {
    const enc = encounter();
    const firstTwo = enc.questions.slice(0, 2).map((x) => x.key);
    expect(truncateEncounter(enc, 2, new Set()).unseenRatio).toBe(1);
    expect(truncateEncounter(enc, 2, new Set(firstTwo)).unseenRatio).toBe(0);
  });

  it('最後まで解いた場合は元の編成をそのまま返す', () => {
    const enc = encounter();
    expect(truncateEncounter(enc, enc.questions.length, new Set())).toBe(enc);
  });

  it('**未提示の問題を誤答にしない**（切り詰めずに採点すると錯題本が汚れる）', () => {
    const enc = encounter();
    const answers = enc.questions.slice(0, 2).map((x, i) => ({
      key: x.key,
      choiceId: enc.presented[i].correctChoiceId,
    }));
    const cut = gradeEncounter(truncateEncounter(enc, 2, new Set()), answers, '2026-08-18', '2026-08-18T10:00:00.000Z', 40, new Set());
    expect(cut.attempt.questionKeys.length).toBe(2);
    expect(cut.wrongKeys).toEqual([]);
    expect(cut.scorePct).toBe(100);

    // 切り詰めないと、見てもいない5問が「まちがえた問題」として残る
    const raw = gradeEncounter(enc, answers, '2026-08-18', '2026-08-18T10:00:00.000Z', 40, new Set());
    expect(raw.wrongKeys.length).toBe(5);
  });
});

describe('中断した回は攻略の証拠に数えない', () => {
  const base: AdvMasteryAttempt = {
    dateKey: '2026-08-18', scorePct: 100, unseenRatio: 1,
    questionKeys: ['rec:a', 'cloze:a:1'],
    tier: 'normal', timed: false, completedAt: '2026-08-18T10:00:00.000Z', wrongKeys: [],
  };

  it('partial=true の試行は qualifying にならない（2問だけ答えて抜ける抜け道を塞ぐ）', () => {
    expect(isQualifyingAttempt(base, true)).toBe(true);
    expect(isQualifyingAttempt({ ...base, partial: true }, true)).toBe(false);
  });
});
