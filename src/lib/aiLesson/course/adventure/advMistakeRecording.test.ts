// 錯題（誤答）の記録が、採点 → 台帳 → 错题本まで通っていることの受入テスト。2026-08-17 新設。
//
// ここが切れると錯題本は永遠に「まだ記録がありません」のままになる。
// 逆に「全問正解だったのに記録が無い」と区別できないと、克服したのに未確認と表示される。
import { describe, it, expect } from 'vitest';
import { buildEncounter, gradeEncounter } from './advBattle';
import { recordAttempt } from './advMastery';
import { buildMistakeNotebook, pendingMistakeKeySet } from './advMistakeNotebook';
import type { AdvBattleQuestion } from './advVariants';
import type { AdvMasteryLedger } from './advTypes';

const NOW = '2026-08-17T09:00:00.000Z';

const q = (n: number, correctId = 'c1'): AdvBattleQuestion => ({
  key: `rec:item-${n}`, type: 'rec', level: 'n3', skill: 'grammar', examSection: 'languageKnowledge',
  targetJapanese: null, questionJa: null, questionZh: `题${n}`,
  choices: [
    { choiceId: 'c1', textJa: 'A', isCorrect: correctId === 'c1' },
    { choiceId: 'c2', textJa: 'B', isCorrect: correctId === 'c2' },
    { choiceId: 'c3', textJa: 'C', isCorrect: correctId === 'c3' },
  ],
  explanation: {
    meaningJa: '', meaningZh: '', whyCorrectJa: '', whyCorrectZh: '',
    exampleJa: null, exampleZh: null, sourceItemId: `item-${n}`, sourceLabel: `item-${n}`,
  },
  sourceItemId: `item-${n}`, difficulty: 1, timed: false, variantId: `v${n}`,
  reviewState: 'authored', status: 'authored',
});

const pool = new Map<string, AdvBattleQuestion[]>([
  ['t1', Array.from({ length: 8 }, (_, i) => q(i + 1))],
]);

const runBattle = (wrongIdx: number[], dateKey: string, nowISO: string, seed = 1) => {
  const enc = buildEncounter({
    tier: 'normal', targetIds: ['t1'], pool, seenKeys: new Set(), recentWrongKeys: new Set(), seed,
  });
  const answers = enc.questions.map((question, i) => ({
    key: question.key,
    choiceId: wrongIdx.includes(i) ? 'c2' : 'c1',   // c1が正解・c2は誤答
  }));
  return gradeEncounter(enc, answers, dateKey, nowISO, null);
};

describe('採点結果が台帳に残る', () => {
  it('間違えた問題キーが attempt.wrongKeys に入る', () => {
    const r = runBattle([0, 2], '2026-08-17', NOW);
    expect(r.attempt.wrongKeys).toEqual(r.wrongKeys);
    expect(r.attempt.wrongKeys?.length).toBe(2);
  });

  it('**全問正解でも空配列が入る**（記録した試行だと分かるように）', () => {
    const r = runBattle([], '2026-08-17', NOW);
    expect(Array.isArray(r.attempt.wrongKeys)).toBe(true);
    expect(r.attempt.wrongKeys).toEqual([]);
  });
});

describe('错题本まで届く', () => {
  it('間違えた問題がノートに載り、優先再出題の集合に入る', () => {
    const r = runBattle([0, 1], '2026-08-17', NOW);
    const ledger: AdvMasteryLedger = recordAttempt({}, 't1', r.attempt);
    const nb = buildMistakeNotebook(ledger, NOW);
    expect(nb.recordingAvailable).toBe(true);
    expect(nb.entries.length).toBe(2);
    const pending = pendingMistakeKeySet(nb);
    for (const k of r.wrongKeys) expect(pending.has(k)).toBe(true);
    // 正解した問題はノートに載らない
    for (const k of r.correctKeys) expect(pending.has(k)).toBe(false);
  });

  it('別の日に2回正解すると克服になり、優先再出題から外れる', () => {
    let ledger: AdvMasteryLedger = {};
    const day1 = runBattle([0], '2026-08-17', NOW, 1);
    const wrongKey = day1.wrongKeys[0];
    ledger = recordAttempt(ledger, 't1', day1.attempt);

    // 同じ問題を含む編成で、別の日に2回とも正解する
    for (const [dateKey, iso] of [['2026-08-18', '2026-08-18T09:00:00.000Z'], ['2026-08-19', '2026-08-19T09:00:00.000Z']] as const) {
      const r = runBattle([], dateKey, iso, 1);
      expect(r.attempt.questionKeys).toContain(wrongKey);
      ledger = recordAttempt(ledger, 't1', r.attempt);
    }
    const nb = buildMistakeNotebook(ledger, '2026-08-19T10:00:00.000Z');
    const entry = nb.entries.find((e) => e.questionKey === wrongKey);
    expect(entry?.resolution).toBe('overcome');
    expect(pendingMistakeKeySet(nb).has(wrongKey)).toBe(false);
  });

  it('同じ日に2回正解しただけでは克服にしない（おかわりバトルで水増しできない）', () => {
    let ledger: AdvMasteryLedger = recordAttempt({}, 't1', runBattle([0], '2026-08-17', NOW, 1).attempt);
    const wrongKey = buildMistakeNotebook(ledger, NOW).entries[0].questionKey;
    for (const iso of ['2026-08-17T10:00:00.000Z', '2026-08-17T11:00:00.000Z']) {
      ledger = recordAttempt(ledger, 't1', runBattle([], '2026-08-17', iso, 1).attempt);
    }
    const nb = buildMistakeNotebook(ledger, '2026-08-17T12:00:00.000Z');
    expect(nb.entries.find((e) => e.questionKey === wrongKey)?.resolution).not.toBe('overcome');
  });
});
