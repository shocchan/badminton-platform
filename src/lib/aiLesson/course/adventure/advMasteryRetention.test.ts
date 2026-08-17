// 台帳の上限で「攻略の証拠」が消えないこと（2026-08-18 監査P0）。
//
// 以前は1target24試行の上限を単純に古い順で切っていたため、
// 練習を重ねた生徒ほど「別の日に80%以上を3回」の達成日が台帳から消え、
// 7日後の確認が振り出しに戻り、**練習するほど攻略が遠のく**状態だった。
import { describe, it, expect } from 'vitest';
import { recordAttempt, computeMastery, MASTERY_RULES } from './advMastery';
import type { AdvMasteryAttempt, AdvMasteryLedger } from './advTypes';

const at = (dateKey: string, scorePct: number, unseenRatio = 1): AdvMasteryAttempt => ({
  dateKey, scorePct, unseenRatio,
  questionKeys: ['a', 'b', 'c', 'd', 'e'], tier: 'normal', timed: false,
  completedAt: `${dateKey}T09:00:00.000Z`, wrongKeys: [],
});

describe('上限を超えても攻略の証拠は残る', () => {
  it('**80%以上を取った日の最初の1回**は、古くても落とさない', () => {
    let ledger: AdvMasteryLedger = {};
    // 最初の3日で合格（これが攻略の証拠）
    for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) {
      ledger = recordAttempt(ledger, 't1', at(d, 90));
    }
    // そのあと大量に練習する（上限24を大きく超える）
    for (let i = 0; i < 40; i += 1) {
      ledger = recordAttempt(ledger, 't1', at(`2026-02-${String((i % 27) + 1).padStart(2, '0')}`, 60, 0));
    }
    const kept = ledger.t1;
    expect(kept.length).toBeLessThanOrEqual(MASTERY_RULES.maxAttemptsKept);
    // 3日ぶんの合格記録が生き残っている
    for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) {
      expect(kept.some((a) => a.dateKey === d && a.scorePct >= MASTERY_RULES.passPct), d).toBe(true);
    }
  });

  it('**練習を重ねても攻略判定が振り出しに戻らない**（7日後の確認が開いたまま）', () => {
    let ledger: AdvMasteryLedger = {};
    for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) {
      ledger = recordAttempt(ledger, 't1', at(d, 90));
    }
    const before = computeMastery(ledger.t1, '2026-01-05T09:00:00.000Z');
    expect(before.qualifyingDays.length).toBe(MASTERY_RULES.requiredDays);

    for (let i = 0; i < 40; i += 1) {
      ledger = recordAttempt(ledger, 't1', at(`2026-02-${String((i % 27) + 1).padStart(2, '0')}`, 60, 0));
    }
    const after = computeMastery(ledger.t1, '2026-03-05T09:00:00.000Z');
    expect(after.qualifyingDays.length, '達成日が消えている').toBe(MASTERY_RULES.requiredDays);
    expect(after.delayCheckOpensAt).toBe(before.delayCheckOpensAt);
  });

  it('時系列の並びは崩さない（あとの計算が前提にしている）', () => {
    let ledger: AdvMasteryLedger = {};
    for (let i = 0; i < 30; i += 1) {
      ledger = recordAttempt(ledger, 't1', at(`2026-01-${String(i + 1).padStart(2, '0')}`, i < 3 ? 90 : 50));
    }
    const times = ledger.t1.map((a) => a.completedAt);
    expect([...times].sort()).toEqual(times);
  });

  it('上限以下なら1件も落とさない', () => {
    let ledger: AdvMasteryLedger = {};
    for (let i = 0; i < 5; i += 1) ledger = recordAttempt(ledger, 't1', at(`2026-01-0${i + 1}`, 80));
    expect(ledger.t1.length).toBe(5);
  });
});
