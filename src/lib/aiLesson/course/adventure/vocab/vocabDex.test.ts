// 単語図鑑の段階判定（2026-09-06）。
// 「出会った」「正解した」は台帳にある事実だけから決める。推測で上げない。
import { describe, it, expect } from 'vitest';
import type { AdvMasteryLedger, AdvMasteryAttempt } from '../advTypes';
import { collectDexEntries, dexProgress, parseVocabKey, dexIdOf } from './vocabDex';

const attempt = (dateKey: string, questionKeys: string[], wrongKeys?: string[]): AdvMasteryAttempt => ({
  dateKey, scorePct: 100, unseenRatio: 1, questionKeys, tier: 'normal', timed: false,
  completedAt: `${dateKey}T00:00:00.000Z`, ...(wrongKeys ? { wrongKeys } : {}),
});

const K = (s: string, r: string, a: string) => `vocab:${s}:${r}:${a}`;

describe('語彙キーの分解', () => {
  it('表記・よみ・観点を取り出す', () => {
    expect(parseVocabKey('vocab:懸念:けねん:reading')).toEqual({ surface: '懸念', reading: 'けねん', aspect: 'reading' });
  });
  it('語彙以外のキーは null', () => {
    expect(parseVocabKey('rec:n1g-001')).toBeNull();
    expect(parseVocabKey('read:n1r-theme-01')).toBeNull();
    expect(parseVocabKey('vocab:壊れた')).toBeNull();
  });
});

describe('図鑑の段階', () => {
  it('出題されれば「出会った」', () => {
    const ledger: AdvMasteryLedger = { t1: [attempt('2026-09-01', [K('懸念', 'けねん', 'reading')], [])] };
    const e = collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!;
    expect(e.state).toBe('met');
    expect(e.metCount).toBe(1);
    expect(e.correctCount).toBe(1);
  });

  it('別の日に2回正解で「手ごたえあり」', () => {
    const k = K('懸念', 'けねん', 'reading');
    const ledger: AdvMasteryLedger = {
      t1: [attempt('2026-09-01', [k], []), attempt('2026-09-02', [k], [])],
    };
    expect(collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!.state).toBe('familiar');
  });

  it('同じ日に3回正解しても「手ごたえあり」止まり（別日でなければ上げない）', () => {
    const k = K('懸念', 'けねん', 'reading');
    const ledger: AdvMasteryLedger = {
      t1: [attempt('2026-09-01', [k], []), attempt('2026-09-01', [k], []), attempt('2026-09-01', [k], [])],
    };
    expect(collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!.state).toBe('met');
  });

  it('別の日に3回正解で「習得」', () => {
    const k = K('懸念', 'けねん', 'reading');
    const ledger: AdvMasteryLedger = {
      t1: [attempt('2026-09-01', [k], []), attempt('2026-09-02', [k], []), attempt('2026-09-03', [k], [])],
    };
    expect(collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!.state).toBe('mastered');
  });

  it('最後に間違えたままなら「習得」に上げない', () => {
    const k = K('懸念', 'けねん', 'reading');
    const ledger: AdvMasteryLedger = {
      t1: [
        attempt('2026-09-01', [k], []), attempt('2026-09-02', [k], []), attempt('2026-09-03', [k], []),
        attempt('2026-09-04', [k], [k]),
      ],
    };
    const e = collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!;
    expect(e.state).toBe('familiar');
    expect(e.wrongCount).toBe(1);
    expect(e.lastWrongDateKey).toBe('2026-09-04');
  });

  it('間違えたあとに別の日で正解し直せば「習得」に戻る', () => {
    const k = K('懸念', 'けねん', 'reading');
    const ledger: AdvMasteryLedger = {
      t1: [
        attempt('2026-09-01', [k], []), attempt('2026-09-02', [k], []),
        attempt('2026-09-03', [k], [k]), attempt('2026-09-04', [k], []),
      ],
    };
    expect(collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!.state).toBe('mastered');
  });

  it('**正誤を記録していない古い試行は正解にも不正解にも数えない**', () => {
    const k = K('懸念', 'けねん', 'reading');
    // wrongKeys が無い＝正誤不明。何回出ても「出会った」まで
    const ledger: AdvMasteryLedger = {
      t1: [attempt('2026-09-01', [k]), attempt('2026-09-02', [k]), attempt('2026-09-03', [k])],
    };
    const e = collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!;
    expect(e.state).toBe('met');
    expect(e.correctCount).toBe(0);
    expect(e.wrongCount).toBe(0);
    expect(e.metCount).toBe(3);
  });

  it('観点ちがいは同じ語にまとまる', () => {
    const ledger: AdvMasteryLedger = {
      t1: [attempt('2026-09-01', [K('懸念', 'けねん', 'reading'), K('懸念', 'けねん', 'meaning')], [])],
    };
    const e = collectDexEntries(ledger).get(dexIdOf('懸念', 'けねん'))!;
    expect(e.aspects).toEqual(['meaning', 'reading']);
    expect(e.metCount).toBe(2);
  });

  it('スコープ外の語は図鑑に入れない', () => {
    const ledger: AdvMasteryLedger = {
      t1: [attempt('2026-09-01', [K('懸念', 'けねん', 'reading'), K('猫', 'ねこ', 'reading')], [])],
    };
    const scope = new Set([dexIdOf('懸念', 'けねん')]);
    const entries = collectDexEntries(ledger, scope);
    expect([...entries.keys()]).toEqual([dexIdOf('懸念', 'けねん')]);
  });

  it('文法や読解の出題は図鑑に入らない', () => {
    const ledger: AdvMasteryLedger = {
      t1: [attempt('2026-09-01', ['rec:n1g-001', 'read:n1r-theme-01', 'cloze:n2g-010'], [])],
    };
    expect(collectDexEntries(ledger).size).toBe(0);
  });
});

describe('図鑑の進捗', () => {
  it('未発見も分母に入れる（何語中いくつ集めたかを出す）', () => {
    const k1 = K('懸念', 'けねん', 'reading');
    const k2 = K('危惧', 'きぐ', 'reading');
    const ledger: AdvMasteryLedger = {
      t1: [
        attempt('2026-09-01', [k1, k2], []), attempt('2026-09-02', [k1], []),
        attempt('2026-09-03', [k1], []),
      ],
    };
    const p = dexProgress(collectDexEntries(ledger), 4546);
    expect(p.total).toBe(4546);
    expect(p.discovered).toBe(2);
    expect(p.mastered).toBe(1);
    expect(p.met).toBe(1);
  });
});
