// 語彙の出題プールを「必要な語だけ」材料化する（2026-08-17）。
//
// なぜ要るか:
//   語彙が3,349語（約16,500問）になり、`vocabPool()` の初回生成に Mac で 3.7〜4.5秒かかる。
//   これは AdvShell の**描画中に同期で**呼ばれていたため、生徒（中国在住・WeChat内ブラウザ・
//   中位Android）ではその数倍のあいだ画面が固まり、ローディング表示すら描けなかった。
//   ところが1回のバトルで実際に出すのは 7〜20問、ミニ模試の言語知識でも 10問。
//   **16,500問を作ってから20問選ぶ**必要はまったくない。
//
// 何を保証するか:
//   `buildVocabQuestions(語, active配列, seed)` は3つの引数だけで決まる純関数で、
//   `vocabPool` は `active.forEach((c, i) => buildVocabQuestions(c, active, seed + i * 31))`
//   と呼んでいる。ここでは **同じ active 配列（vocabScopedActive で共有）** と
//   **同じ添字 i の seed** を渡すので、作られる問題オブジェクトは全量生成と1バイトも変わらない。
//   変わるのは「候補プールに何が載るか」だけ（＝1回の出題に使う候補の母集団）。
//   出題生成そのもの（vocabQuestions.ts / 語彙bank）には一切手を入れていない。
import type { AdvBattleQuestion } from '../advVariants';
import type { VocabOriginalContent } from './vocabContent';
import { VOCAB_ASPECTS } from './vocabContent';
import { buildVocabQuestions, vocabScopedActive, VOCAB_POOL_SEED } from './vocabQuestions';

/** 1バンドあたり材料化する語数。下の下限テスト（候補≧20問・観点≧2）を満たす実測値 */
export const VOCAB_WORDS_PER_BAND = 60;

/**
 * 1バンドの候補が必ず満たすべき下限。
 * ・20問: 最大編成（rankboss）の定員。割ると「問題が足りないバトル」になる
 * ・2観点: AdvBattleRunner が `types.size >= 2` を computeMastery の
 *   minQuestionTypes ゲートへ渡している。1観点に痩せると攻略判定が黙って緩む
 */
export const VOCAB_SUBSET_MIN_QUESTIONS = 20;
export const VOCAB_SUBSET_MIN_TYPES = 2;

/** バンドID（`vocab-n5` 等）→ scope済み active 配列内の添字。**添字を保つのが肝**（seedが決まる） */
const bandCache = new Map<string, Map<string, number[]>>();
export const vocabBands = (level: 'N2' | 'N3'): Map<string, number[]> => {
  const hit = bandCache.get(level);
  if (hit) return hit;
  const active = vocabScopedActive(level);
  const byBand = new Map<string, number[]>();
  active.forEach((c, i) => {
    const key = `vocab-${c.level.toLowerCase()}`;
    const list = byBand.get(key);
    if (list) list.push(i); else byBand.set(key, [i]);
  });
  bandCache.set(level, byBand);
  return byBand;
};

/** 決定的な擬似乱数（advDiagnosis.seededShuffle / vocabQuestions と同じ式） */
const shuffleIndices = (src: readonly number[], seed: number): number[] => {
  const a = [...src];
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 語1つが持ちうる問題キーの接頭辞。**問題を作らずに**既出・誤答が判定できる */
export const vocabKeyPrefixOf = (c: VocabOriginalContent): string => `vocab:${c.surface}:${c.reading}:`;

export interface VocabSubsetOptions {
  /** この編成固有のseed。バトルは buildEncounter と同じ値、模試は attemptSeed を渡す */
  seed: number;
  /** mastery台帳の既出キー。未出の語を優先する（buildEncounter のスコアと同じ考え方） */
  seenKeys?: ReadonlySet<string>;
  /** 错题本の未克服キー。その語を優先する */
  recentWrongKeys?: ReadonlySet<string>;
  /** 1バンドあたりの語数（既定 60） */
  wordsPerBand?: number;
  /** このバンドだけ作る（バトル用）。未指定なら全バンド（模試用） */
  onlyBands?: readonly string[];
  /**
   * 1語につき1観点だけ候補に載せる。
   * buildEncounter には同一語ガードが無く、候補を素直に絞ると1バトル内で
   * 「経済の読み」「経済の表記」が並ぶ（2026-08-14 にCEOが模試で指摘した欠陥と同じ形）。
   * 実測では、これを外すと同一語連打が90日で51回・365日で202回起きる（現行は5回/12回）。
   * **任意オプションではなく、実運用では必ず true にする。**
   */
  oneAspectPerWord?: boolean;
}

/**
 * 材料化する語の添字を決める（ここでは問題を1つも作らない＝整数処理だけ）。
 *
 * 選び方は buildEncounter の問題スコアリングを**語の段階へ持ち上げた**もの:
 *   ① 毎回バンド全体を seed でシャッフルする（固定順で頭から取ると、台帳が24試行しか
 *      残らないためバンド先頭付近を巡り続け、90日カバレッジが 49.4% → 28.9% へ崩れる。実測）
 *   ② 未出 +3 / 直近誤答 +2 を語に付け、安定ソートで上位 quota 語を取る
 */
export const selectVocabWordIndices = (
  level: 'N2' | 'N3', band: string, opts: VocabSubsetOptions,
): number[] => {
  const active = vocabScopedActive(level);
  const all = vocabBands(level).get(band) ?? [];
  const seen = opts.seenKeys;
  const wrong = opts.recentWrongKeys;
  const quota = opts.wordsPerBand ?? VOCAB_WORDS_PER_BAND;
  if (all.length === 0) return [];
  // 語数が quota 以下でも必ずシャッフルする（固定順だと1語1観点の巡回位置まで
  // 毎回同じになり、その語からは同じ観点しか出なくなる）
  const order = shuffleIndices(all, opts.seed);
  const hasSeen = !!seen && seen.size > 0;
  const hasWrong = !!wrong && wrong.size > 0;
  if (!hasSeen && !hasWrong) return order.slice(0, quota);
  const scored = order.map((i) => {
    const prefix = vocabKeyPrefixOf(active[i]);
    let unseen = 3;
    let missed = 0;
    for (const aspect of VOCAB_ASPECTS) {
      const key = prefix + aspect;
      if (hasSeen && unseen === 3 && seen.has(key)) unseen = 0;
      if (hasWrong && missed === 0 && wrong.has(key)) missed = 2;
    }
    return { i, score: unseen + missed };
  });
  // 安定ソート（ES2019以降は仕様保証）＝同点はシャッフル順のまま
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, quota).map((x) => x.i);
};

/**
 * 生成結果のキャッシュ（LRU）。
 * 同じバトルへ入り直したときに作り直さないため。無制限にすると保持オブジェクトが増えて
 * GC圧で**逆に遅くなる**（実測: 90回で 46ms/回 → 305ms/回）。
 * 模試が4バンド同時に要るので、模試1回＋バトル数本ぶんの 8 に留める。
 */
const CACHE_MAX = 8;
const resultCache = new Map<string, AdvBattleQuestion[]>();
const cacheGet = (key: string): AdvBattleQuestion[] | undefined => {
  const hit = resultCache.get(key);
  if (!hit) return undefined;
  resultCache.delete(key);      // 参照したものを末尾へ（＝最古から捨てる）
  resultCache.set(key, hit);
  return hit;
};
const cacheSet = (key: string, value: AdvBattleQuestion[]): void => {
  if (resultCache.size >= CACHE_MAX) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  resultCache.set(key, value);
};
/** テスト用。生成回数を数えたいときにキャッシュを空にする */
export const clearVocabSubsetCache = (): void => { resultCache.clear(); };

/** 1語ぶんの問題から、位置 n に応じて観点を1つだけ選ぶ（観点が偏らないよう巡回する） */
const pickOneAspect = (built: AdvBattleQuestion[], n: number): AdvBattleQuestion | null => {
  for (let k = 0; k < VOCAB_ASPECTS.length; k++) {
    const want = `vocab-${VOCAB_ASPECTS[(n + k) % VOCAB_ASPECTS.length]}`;
    const q = built.find((x) => x.type === want);
    if (q) return q;
  }
  return null;
};

const buildBand = (
  level: 'N2' | 'N3', idxs: number[], oneAspectPerWord: boolean,
): AdvBattleQuestion[] => {
  const active = vocabScopedActive(level);
  const all: AdvBattleQuestion[] = [];
  const picked: AdvBattleQuestion[] = [];
  idxs.forEach((i, n) => {
    // ★ vocabPool と同じ引数（同じ配列・同じ seed + i*31）＝ 同じ問題オブジェクト
    const built = buildVocabQuestions(active[i], active, VOCAB_POOL_SEED + i * 31);
    if (built.length === 0) return;
    all.push(...built);
    if (!oneAspectPerWord) return;
    const one = pickOneAspect(built, n);
    if (one) picked.push(one);
  });
  if (!oneAspectPerWord) return all;
  // 1語1観点にすると定員（20問）や観点数（2）を割ることがありうる。
  // そのときだけ全観点へ戻す＝**空のバトル・攻略判定の緩みを作らない**（原則15）
  const types = new Set(picked.map((q) => q.type));
  if (picked.length < VOCAB_SUBSET_MIN_QUESTIONS || types.size < VOCAB_SUBSET_MIN_TYPES) return all;
  return picked;
};

/**
 * 選んだ語だけを問題化する。返り値の形は `vocabPool` と同一（targetId → 問題）。
 * バトル1回ぶん（1バンド60語）で Mac 実測 16〜115ms。全量生成は 3,975〜4,873ms。
 */
export const vocabSubsetPool = (
  level: 'N2' | 'N3', opts: VocabSubsetOptions,
): Map<string, AdvBattleQuestion[]> => {
  const bands = opts.onlyBands ?? [...vocabBands(level).keys()];
  const oneAspect = opts.oneAspectPerWord === true;
  const map = new Map<string, AdvBattleQuestion[]>();
  for (const band of bands) {
    if (!vocabBands(level).has(band)) continue;
    const idxs = selectVocabWordIndices(level, band, opts);
    const cacheKey = `${level}|${band}|${oneAspect ? 1 : 0}|${idxs.join(',')}`;
    const hit = cacheGet(cacheKey);
    const qs = hit ?? buildBand(level, idxs, oneAspect);
    if (!hit) cacheSet(cacheKey, qs);
    if (qs.length > 0) map.set(band, qs);
  }
  return map;
};

/**
 * ミニ模試の語彙プール。**attemptSeed だけから決まる**こと。
 *
 * ここに seenKeys 等を混ぜると、保存した答案のキーが再構成したプールに入らなくなり、
 * `restoreMockSession`（advMockSession.ts の「答えたキーが1つでも無ければ null」）が
 * 復元失敗を返す＝**時間制限つき模試の答案が丸ごと消える**。実測で再現済み。
 */
export const mockVocabPool = (
  level: 'N2' | 'N3', attemptSeed: number,
): Map<string, AdvBattleQuestion[]> =>
  vocabSubsetPool(level, { seed: attemptSeed, oneAspectPerWord: true });
