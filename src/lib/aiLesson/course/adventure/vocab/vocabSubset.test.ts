// 部分生成（lazy-subset）の受入テスト。
//
// FAIL条件（落ちたら生徒へ出さない）:
// - 部分生成の問題が全量生成と1バイトでも違う（出題の中身が変わっている）
// - 1バンドの候補が定員（rankboss 20問）や観点2種を割る（空バトル／攻略判定の緩み）
// - 1回の生成で材料化する語数が上限を超える（＝また重くなった）
// - 全量生成に対する速度差が縮んだ（＝また重くなった）
// - ミニ模試のプールが attemptSeed 以外に依存する（＝途中保存した答案が消える）
// - AdvShell が描画中に出題プールを作っている（＝画面が固まる）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import type { AdvBattleQuestion } from '../advVariants';
import { vocabPool } from './vocabQuestions';
import {
  vocabSubsetPool, mockVocabPool, vocabBands, clearVocabSubsetCache,
  VOCAB_WORDS_PER_BAND, VOCAB_SUBSET_MIN_QUESTIONS, VOCAB_SUBSET_MIN_TYPES,
} from './vocabSubset';
import { buildMockSpec } from '../advMock';
import { startMockSession, restoreMockSession } from '../advMockSession';

const srcOf = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const flat = (m: Map<string, AdvBattleQuestion[]>): AdvBattleQuestion[] => [...m.values()].flat();
const wordsOf = (qs: AdvBattleQuestion[]): Set<string> => new Set(qs.map((q) => q.sourceItemId));

/**
 * 速度は**同一プロセス内の比**でだけ見る。
 * このMacは他セッションと共用で load average が 7〜216 まで振れる。絶対値は環境依存だが、
 * 「全量生成に対して何倍速いか」は負荷が上がっても崩れない（実測: load 7 で18倍 / load 166 で20倍）。
 */
let coldSubsetMs = 0;
let coldFullMs = 0;
let coldSubsetQuestions = 0;

beforeAll(() => {
  // 冷えた状態で部分生成 → 冷えた状態で全量生成、の順で1回ずつ（生徒の実際の順序）
  const t0 = performance.now();
  const subset = vocabSubsetPool('N3', { seed: 20260817, onlyBands: ['vocab-n3'], oneAspectPerWord: true });
  coldSubsetMs = performance.now() - t0;
  coldSubsetQuestions = flat(subset).length;

  const t1 = performance.now();
  vocabPool('N3');
  coldFullMs = performance.now() - t1;
}, 300_000);

describe('出題の中身は全量生成と同一', () => {
  it('N3: 全語をquotaにした部分生成は vocabPool と1バイトも違わない', () => {
    const full = new Map<string, string>();
    for (const q of flat(vocabPool('N3'))) full.set(q.key, JSON.stringify(q));
    const lazy = new Map<string, string>();
    for (const q of flat(vocabSubsetPool('N3', { seed: 7, wordsPerBand: 1_000_000 }))) {
      lazy.set(q.key, JSON.stringify(q));
    }
    expect(lazy.size).toBe(full.size);
    const diff = [...lazy].filter(([k, v]) => full.get(k) !== v).map(([k]) => k);
    expect(diff).toEqual([]);
  }, 300_000);

  it('N2: どのseedで抜き取っても、各問は全量生成の同じキーの問題と一致する', () => {
    const full = new Map<string, string>();
    for (const q of flat(vocabPool('N2'))) full.set(q.key, JSON.stringify(q));
    const mismatched: string[] = [];
    let checked = 0;
    for (let r = 0; r < 6; r++) {
      const pool = vocabSubsetPool('N2', { seed: 31337 + r * 613, oneAspectPerWord: r % 2 === 0 });
      for (const q of flat(pool)) {
        checked += 1;
        if (full.get(q.key) !== JSON.stringify(q)) mismatched.push(q.key);
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(mismatched).toEqual([]);
  }, 300_000);
});

describe('1バンドの候補が痩せない', () => {
  it.each(['N3', 'N2'] as const)('%s: 全バンドが定員20問・観点2種を満たす', (level) => {
    for (const band of vocabBands(level).keys()) {
      for (const seed of [1, 90210, 20260817]) {
        const qs = vocabSubsetPool(level, { seed, onlyBands: [band], oneAspectPerWord: true }).get(band) ?? [];
        expect(qs.length, `${level}/${band}/seed${seed} の候補数`).toBeGreaterThanOrEqual(VOCAB_SUBSET_MIN_QUESTIONS);
        const types = new Set(qs.map((q) => q.type));
        // AdvBattleRunner の types.size>=2 が computeMastery の攻略ゲートへ直結している
        expect(types.size, `${level}/${band}/seed${seed} の観点数`).toBeGreaterThanOrEqual(VOCAB_SUBSET_MIN_TYPES);
      }
    }
  }, 300_000);

  it('1バトル内に同じ語が2問出ない（1語1観点）', () => {
    for (const band of vocabBands('N2').keys()) {
      const qs = vocabSubsetPool('N2', { seed: 4242, onlyBands: [band], oneAspectPerWord: true }).get(band) ?? [];
      expect(wordsOf(qs).size, `${band} の異なり語`).toBe(qs.length);
    }
  }, 300_000);
});

describe('生成が重くなったら落ちる', () => {
  it('1バトルで材料化する語は1バンドあたり上限まで', () => {
    for (const band of vocabBands('N2').keys()) {
      const qs = vocabSubsetPool('N2', { seed: 555, onlyBands: [band], oneAspectPerWord: true }).get(band) ?? [];
      expect(wordsOf(qs).size, `${band} で材料化した語数`).toBeLessThanOrEqual(VOCAB_WORDS_PER_BAND);
    }
  }, 300_000);

  it('ミニ模試で材料化する語は全バンド合計でも上限内', () => {
    const qs = flat(mockVocabPool('N2', 998877));
    const bandCount = vocabBands('N2').size;
    expect(wordsOf(qs).size).toBeLessThanOrEqual(VOCAB_WORDS_PER_BAND * bandCount);
    // 模試の言語知識は10問。候補がその数十倍あれば層化選択は成立する
    expect(qs.length).toBeGreaterThan(100);
  }, 300_000);

  it('全量生成より桁で速い（同一プロセス内の比で見る）', () => {
    const ratio = coldFullMs / Math.max(coldSubsetMs, 0.001);
    // 実測 7.6〜26倍（Mac・load 7〜166）。4倍を割ったら「また重くなった」
    expect(ratio, `全量 ${coldFullMs.toFixed(0)}ms / 部分 ${coldSubsetMs.toFixed(0)}ms = ${ratio.toFixed(1)}倍`)
      .toBeGreaterThan(4);
    expect(coldSubsetQuestions).toBeGreaterThanOrEqual(VOCAB_SUBSET_MIN_QUESTIONS);
  });
});

describe('ミニ模試の答案を消さない', () => {
  it('模試プールは attemptSeed だけで決まる（キャッシュを捨てても同じ）', () => {
    const keys = (seed: number) => flat(mockVocabPool('N3', seed)).map((q) => q.key).sort();
    const a = keys(123456);
    clearVocabSubsetCache();
    const b = keys(123456);
    expect(b).toEqual(a);
    expect(keys(654321)).not.toEqual(a);
  }, 300_000);

  it('途中まで答えた模試が復元できる（advMockSession の復元条件を満たす）', () => {
    const spec = buildMockSpec('N3', { vocabCount: 999, grammarCount: 0, readingCount: 0, listeningCount: 0 });
    const seed = 555111;
    const started = startMockSession(spec, mockVocabPool('N3', seed), 'short', seed, '2026-08-17T00:00:00Z');
    expect(started).not.toBeNull();
    const answers: Record<string, string> = {};
    for (const q of started!.sections[0].questions.slice(0, 5)) answers[q.key] = q.choices[0].choiceId;
    expect(Object.keys(answers).length).toBe(5);
    const state = { ...started!.state, answers };
    // リロード相当: キャッシュを捨てて、保存された attemptSeed だけからプールを作り直す
    clearVocabSubsetCache();
    const restored = restoreMockSession(spec, mockVocabPool('N3', state.attemptSeed), state);
    expect(restored, '保存した答案が復元できない＝時間制限つき模試の答案が消える').not.toBeNull();
    expect(restored!.state.answers).toEqual(answers);
  }, 300_000);
});

describe('描画中に出題プールを作らない（AdvShell）', () => {
  const shell = srcOf('../../../../../components/ai-course/adventure/AdvShell.tsx');

  it('語彙bank・出題生成を静的importしていない（Homeの初回転送に載せない）', () => {
    expect(shell).not.toMatch(/^import[^\n]*vocab\/(vocabQuestions|vocabSubset|content\/)/m);
  });

  it('出題プールの生成関数を直接呼んでいない（呼べるのは動的importのnamespace経由だけ）', () => {
    const bare = shell.match(/(?<![.\w])(vocabPool|vocabSubsetPool|mockVocabPool)\(/g) ?? [];
    expect(bare, '描画式から生成関数を呼ぶと、その間ローディングすら描けない').toEqual([]);
  });

  it('namespace経由の生成は動的importのすぐ後（effect内）にしかない', () => {
    const at = shell.indexOf("import('../../../lib/aiLesson/course/adventure/vocab/vocabSubset')");
    expect(at, '語彙プールの動的importが見つからない').toBeGreaterThan(0);
    for (const m of shell.matchAll(/\bm\.(vocabSubsetPool|mockVocabPool)\(/g)) {
      expect(m.index, `${m[0]} が動的importから離れた場所にある`).toBeGreaterThan(at);
      expect(m.index! - at).toBeLessThan(2000);
    }
    expect([...shell.matchAll(/\bm\.(vocabSubsetPool|mockVocabPool)\(/g)].length).toBe(2);
  });

  it('模試の試行seedは呼び出し側が決める（AdvMockRunnerが自分で作らない）', () => {
    const runner = srcOf('../../../../../components/ai-course/adventure/AdvMockRunner.tsx');
    expect(runner).toMatch(/attemptSeed: number/);
    expect(runner, 'seedを内部で作ると、先に作ったプールと食い違って答案が消える')
      .not.toMatch(/Date\.now\(\)|\.getTime\(\)/);
  });
});
