// 「1回しくじると二度と攻略できない束」が生まれていないことの回帰テスト（2026-08-18 P0）。
//
// 起きていたこと: 攻略条件の unseenRatio>=0.3 は「問題IDの丸暗記で攻略させない」壁だが、
// プールを解き尽くすと未出問題が物理的に供給できなくなり、以後どれだけ満点を取っても
// 永久に攻略が確定しなくなっていた（実測で33束中5束。最も基礎の n5g-unit-1 と敬語の n4g-unit-4 を含む）。
// まじめに毎日やる生徒ほど不合格を1回は踏むので、努力した人ほど詰むという最悪の壊れ方だった。
//
// このテストは**全束**について「初日に1回不合格 → 以後満点」で攻略に到達することを確認する。
// 束を増やす・問題を減らす改修でここが再発したら落ちる。
import { describe, it, expect } from 'vitest';
import { loadGrammarPools } from './advContent';
import { buildEncounter, gradeEncounter } from './advBattle';
import { recordAttempt, computeMastery, seenQuestionKeys } from './advMastery';
import type { AdvMasteryLedger } from './advTypes';

/** 初日だけ45%を落とし、以後は満点。20日以内に攻略できたらその日数を返す */
const daysToMastery = (
  target: string, pool: Map<string, { key: string }[]>, failFirst: boolean,
): number | null => {
  let ledger: AdvMasteryLedger = {};
  for (let day = 1; day <= 20; day += 1) {
    const dateKey = `2026-09-${String(day).padStart(2, '0')}`;
    const enc = buildEncounter({
      tier: 'normal', targetIds: [target], pool: pool as never,
      seenKeys: seenQuestionKeys(ledger, [target]), recentWrongKeys: new Set(),
      seed: day * 13, attemptSeed: day,
    });
    if (enc.questions.length === 0) return null;
    const wrong = failFirst && day === 1 ? Math.ceil(enc.questions.length * 0.45) : 0;
    const answers = enc.presented.map((p, i) => ({
      key: p.key, choiceId: i < wrong ? '__wrong__' : p.correctChoiceId,
    }));
    const r = gradeEncounter(enc, answers, dateKey, `${dateKey}T09:00:00.000Z`, null, new Set());
    ledger = recordAttempt(ledger, target, r.attempt);
    if (computeMastery(ledger[target], `${dateKey}T23:00:00.000Z`).state === 'mastered') return day;
  }
  return null;
};

describe('文法束に行き止まりが無い', () => {
  it('全束が「初日に1回しくじっても」攻略に到達する', async () => {
    const pools = await loadGrammarPools();
    const bundles = [...new Set(pools.n3BundleByItem.values())].sort();
    expect(bundles.length).toBeGreaterThan(20);   // 束の取り違えで空振りしないための番人

    const stuck: string[] = [];
    for (const b of bundles) {
      if (daysToMastery(b, pools.byItem as never, true) === null) stuck.push(b);
    }
    expect(stuck, `1回の不合格で永久に詰む束: ${stuck.join(', ')}`).toEqual([]);
  }, 600_000);

  it('満点なら全束が攻略できる（下限の確認）', async () => {
    const pools = await loadGrammarPools();
    const bundles = [...new Set(pools.n3BundleByItem.values())].sort();
    const stuck = bundles.filter((b) => daysToMastery(b, pools.byItem as never, false) === null);
    expect(stuck, `満点でも詰む束: ${stuck.join(', ')}`).toEqual([]);
  }, 600_000);
});

describe('未出問題の免除は、プールに余裕があるうちは効かない', () => {
  it('初回（全問が未出）は免除フラグが立たない', async () => {
    const pools = await loadGrammarPools();
    const target = [...new Set(pools.n3BundleByItem.values())].find((b) => (pools.byItem.get(b) ?? []).length >= 30);
    expect(target).toBeTruthy();
    const enc = buildEncounter({
      tier: 'normal', targetIds: [target as string], pool: pools.byItem,
      seenKeys: new Set(), recentWrongKeys: new Set(), seed: 1, attemptSeed: 1,
    });
    // 未出が潤沢にある＝暗記対策の壁は従来どおり効いたまま
    expect(enc.unseenCapped).toBe(false);
    expect(enc.unseenRatio).toBe(1);
  }, 120_000);

  it('プールを解き尽くしたときだけ免除フラグが立つ', async () => {
    const pools = await loadGrammarPools();
    const target = [...new Set(pools.n3BundleByItem.values())][0];
    const all = new Set((pools.byItem.get(target) ?? []).map((q) => q.key));
    const enc = buildEncounter({
      tier: 'normal', targetIds: [target], pool: pools.byItem,
      seenKeys: all, recentWrongKeys: new Set(), seed: 1, attemptSeed: 1,
    });
    expect(enc.unseenCapped).toBe(true);
    expect(enc.unseenRatio).toBe(0);
  }, 120_000);
});
