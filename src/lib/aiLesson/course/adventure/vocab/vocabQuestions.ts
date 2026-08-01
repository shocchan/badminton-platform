// 層Cコンテンツ → 語彙問題（EXAM COVERAGE CLOSURE §6）。
//
// 鉄則:
// - **選択式のみ**。自由入力はJLPTルートに置かない。
// - 採点は choiceId のみ。表示位置は使わない（提示順は advChoiceOrder が決める）。
// - 誤答は「意味が近すぎて正解が2つになる」ものを避ける。作れなければその観点は出さない。
// - 決定的に生成する（seedのみに依存。実行時LLMは使わない）。
import type { AdvBattleQuestion, AdvChoice } from '../advVariants';
import type { VocabOriginalContent, VocabAspect } from './vocabContent';
import { VOCAB_ASPECT_LABELS } from './vocabContent';
import { activeContent } from './vocabContent';
import { ALL_VOCAB_CONTENT } from './content/vocabContentBank';

const LEVEL_TO_BAND: Record<string, AdvBattleQuestion['level']> = {
  N5: 'foundation', N4: 'foundation', N3: 'n3', N2: 'n2', N1: 'n2',
};

/** 決定的な擬似乱数（seedのみに依存） */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const pickDistinct = <T>(pool: T[], count: number, seed: number, exclude: (t: T) => boolean): T[] => {
  const usable = pool.filter((t) => !exclude(t));
  const r = rng(seed);
  const out: T[] = [];
  const used = new Set<number>();
  let guard = 0;
  while (out.length < count && used.size < usable.length && guard < 500) {
    guard += 1;
    const i = Math.floor(r() * usable.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(usable[i]);
  }
  return out;
};

const choice = (id: string, textJa: string, isCorrect: boolean, whyWrongZh?: string): AdvChoice => ({
  choiceId: id, textJa, isCorrect, whyWrongZh,
});

/**
 * 訳が実質同じかどうか。
 *
 * 完全一致だけを見ていたため、「学习」（勉強）と「学习（有计划地学）」（学習）が
 * 別物として扱われ、**意味問題に正解が2つ**入っていた（Pilotサンプル監査で発覚）。
 * 括弧の補足・区切り記号を落とし、語義の中心が重なるかで判定する。
 */
const glossCore = (g: string): string[] => g
  .replace(/[（(][^）)]*[）)]/g, '')     // 括弧の補足は語義の中心ではない
  .split(/[；;、,／/]/)
  .map((x) => x.trim())
  .filter((x) => x.length > 0);

/** どちらかの語義がもう一方に含まれていたら「近すぎる」＝誤答に使わない */
const glossTooClose = (a: string, b: string): boolean => {
  const A = glossCore(a); const B = glossCore(b);
  if (A.length === 0 || B.length === 0) return a === b;
  return A.some((x) => B.some((y) => x === y || (x.length >= 2 && y.includes(x)) || (y.length >= 2 && x.includes(y))));
};

/**
 * 中国語の訳が日本語表記をそのまま含む語（日中同形語）。
 * 「表示『温泉』的词是哪个？→ 温泉」のように、**中国語の設問文に答えがそのまま出る**ため、
 * 訳を手がかりにする観点（意味・紛らわしい語）は出題しない。
 */
const glossRevealsSurface = (c: VocabOriginalContent): boolean =>
  c.glossZh.includes(c.surface) || c.surface.includes(c.glossZh);

/**
 * 選択肢を確定する。表示テキストが重複したものは落とす
 * （同じ表記で読みが違う語がプールに並ぶため。例: 一日 いちにち／ついたち）。
 * 4択にならなければ null を返し、その観点は出題しない。
 */
const finalizeChoices = (choices: AdvChoice[]): AdvChoice[] | null => {
  const seen = new Set<string>();
  const out: AdvChoice[] = [];
  for (const c of choices) {
    const text = c.textJa.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(c);
  }
  if (out.length !== 4) return null;
  if (out.filter((c) => c.isCorrect).length !== 1) return null;
  return out;
};

const baseQuestion = (
  c: VocabOriginalContent, aspect: VocabAspect, i: number,
  questionJa: string, questionZh: string, choices: AdvChoice[],
): AdvBattleQuestion => ({
  key: `vocab:${c.surface}:${c.reading}:${aspect}`,
  type: `vocab-${aspect}`,
  level: LEVEL_TO_BAND[c.level] ?? 'n3',
  skill: 'charactersVocabulary',
  examSection: 'languageKnowledge',
  targetJapanese: aspect === 'meaning' || aspect === 'reading' || aspect === 'orthography' ? c.surface : null,
  questionJa,
  questionZh,
  choices,
  explanation: {
    meaningJa: `${c.surface}（${c.reading}）`,
    meaningZh: c.glossZh,
    whyCorrectJa: c.exampleJa,
    whyCorrectZh: c.exampleZh,
    exampleJa: c.exampleJa,
    exampleZh: c.exampleZh,
    sourceItemId: c.wordId,
    sourceLabel: c.surface,
  },
  sourceItemId: c.wordId,
  difficulty: c.level === 'N5' || c.level === 'N4' ? 1 : c.level === 'N3' ? 2 : 3,
  timed: false,
  variantId: `${c.wordId}-${aspect}-${i}`,
  reviewState: 'validated_beta',
  status: 'validated_beta',
});

/**
 * 1語ぶんの観点別問題を作る。
 * 誤答が作れない観点は**出さない**（無理に作って正解が2つになるのを避ける）。
 */
export const buildVocabQuestions = (
  c: VocabOriginalContent, pool: VocabOriginalContent[], seed: number,
): AdvBattleQuestion[] => {
  if (c.state !== 'active_beta') return [];
  const out: AdvBattleQuestion[] = [];
  const sameLevel = pool.filter((o) => o.level === c.level && o.surface !== c.surface && o.state === 'active_beta');

  // ① 意味: 見出し語 → 正しい中国語訳
  //   日中同形語（訳が表記をそのまま含む）は、設問を読むだけで答えが分かるので出さない
  const meaningWrong = pickDistinct(sameLevel, 3, seed + 1, (o) => glossTooClose(o.glossZh, c.glossZh));
  if (!glossRevealsSurface(c) && meaningWrong.length === 3) {
    const ch = finalizeChoices([
      choice(`${c.wordId}-m0`, c.glossZh, true),
      ...meaningWrong.map((o, i) => choice(`${c.wordId}-m${i + 1}`, o.glossZh, false, `这是「${o.surface}」的意思`)),
    ]);
    if (ch) {
      out.push(baseQuestion(c, 'meaning', 0,
        `「${c.surface}」の意味はどれですか。`, `「${c.surface}」是什么意思？`, ch));
    }
  }

  // ② 読み: 漢字を含む語だけ（かな語は読み問題にならない）
  //   誤答は**実在する語の読み**から採る。かなを1文字ずらした「ふきゅぬ」のような
  //   非語を並べると、日本語を知らなくても消去法で当たってしまい、何も測れない
  //   （Pilotサンプル監査: reading観点38問中28問が機能していなかった）。
  if (/[一-鿿]/.test(c.surface)) {
    const realReadings = pickDistinct(
      sameLevel.filter((o) => Math.abs([...o.reading].length - [...c.reading].length) <= 1),
      3, seed + 17, (o) => o.reading === c.reading,
    ).map((o) => o.reading);
    const uniq = [...new Set(realReadings)].filter((r) => r !== c.reading);
    if (uniq.length === 3) {
      const ch = finalizeChoices([
        choice(`${c.wordId}-r0`, c.reading, true),
        ...uniq.map((r, i) => choice(`${c.wordId}-r${i + 1}`, r, false, '这是别的词的读音')),
      ]);
      if (ch) {
        out.push(baseQuestion(c, 'reading', 1,
          `「${c.surface}」の読み方はどれですか。`, `「${c.surface}」怎么读？`, ch));
      }
    }
  }

  // ③ 表記: 読み → 正しい漢字表記
  if (/[一-鿿]/.test(c.surface)) {
    const orthWrong = pickDistinct(
      sameLevel.filter((o) => /[一-鿿]/.test(o.surface)), 3, seed + 2,
      (o) => o.surface === c.surface,
    );
    if (orthWrong.length === 3) {
      const ch = finalizeChoices([
        choice(`${c.wordId}-o0`, c.surface, true),
        ...orthWrong.map((o, i) => choice(`${c.wordId}-o${i + 1}`, o.surface, false, `这是「${o.reading}」`)),
      ]);
      if (ch) {
        out.push(baseQuestion(c, 'orthography', 2,
          `「${c.reading}」を漢字で書くとどれですか。`, `「${c.reading}」的汉字写法是哪个？`, ch));
      }
    }
  }

  // ④ 用法: よく一緒に使う形
  if (c.collocationsJa.length > 0 && !glossRevealsSurface(c)) {
    const usageWrong = pickDistinct(
      sameLevel.filter((o) => o.collocationsJa.length > 0), 3, seed + 3,
      (o) => o.collocationsJa.some((x) => c.collocationsJa.includes(x)),
    );
    if (usageWrong.length === 3) {
      const ch = finalizeChoices([
        choice(`${c.wordId}-u0`, c.collocationsJa[0], true),
        ...usageWrong.map((o, i) => choice(`${c.wordId}-u${i + 1}`, o.collocationsJa[0], false, `这是「${o.surface}」的搭配`)),
      ]);
      if (ch) {
        out.push(baseQuestion(c, 'usage', 3,
          `「${c.surface}」を使う言い方はどれですか。`, `哪个是「${c.surface}」的常用搭配？`, ch));
      }
    }
  }

  // ⑤ 文脈: 例文の見出し語を空欄にして選ばせる
  if (c.exampleJa.includes(c.surface)) {
    const ctxWrong = pickDistinct(sameLevel, 3, seed + 4, (o) => glossTooClose(o.glossZh, c.glossZh));
    if (ctxWrong.length === 3) {
      const blanked = c.exampleJa.replace(c.surface, '＿＿＿');
      const ch = finalizeChoices([
        choice(`${c.wordId}-c0`, c.surface, true),
        ...ctxWrong.map((o, i) => choice(`${c.wordId}-c${i + 1}`, o.surface, false, `「${o.surface}」的意思是${o.glossZh}`)),
      ]);
      if (ch) {
        out.push(baseQuestion(c, 'context', 4,
          `${blanked}\n＿＿＿に入る言葉はどれですか。`, `${blanked}\n空格里应该填哪个词？`, ch));
      }
    }
  }

  // ⑥ 紛らわしい語: 明示的に登録したものだけ（勝手に近い語を選ばない）
  const confusables = c.confusableSurfaces
    .map((s) => pool.find((o) => o.surface === s && o.state === 'active_beta'))
    .filter((o): o is VocabOriginalContent => !!o && !glossTooClose(o.glossZh, c.glossZh));
  if (confusables.length >= 2 && !glossRevealsSurface(c)) {
    const extra = pickDistinct(sameLevel, 3 - confusables.length, seed + 5,
      (o) => glossTooClose(o.glossZh, c.glossZh) || confusables.some((x) => x.surface === o.surface));
    const wrong = [...confusables, ...extra].slice(0, 3);
    if (wrong.length === 3) {
      const ch = finalizeChoices([
        choice(`${c.wordId}-x0`, c.surface, true),
        ...wrong.map((o, i) => choice(`${c.wordId}-x${i + 1}`, o.surface, false, `「${o.surface}」是${o.glossZh}`)),
      ]);
      if (ch) {
        out.push(baseQuestion(c, 'confusable', 5,
          `「${c.glossZh}」という意味の言葉はどれですか。`, `表示「${c.glossZh}」的词是哪个？`, ch));
      }
    }
  }

  return out;
};

/**
 * 生成結果のキャッシュ。
 *
 * 層Cが2,000語規模になり、1回の `vocabPool()` で1万問前後を組み立てるようになった。
 * 生成は **seed から決定的** なので、同じ (level, seed) の結果を使い回してよい。
 * バトル・模試・カバレッジ表示で何度も呼ばれるため、これが無いと毎回まるごと作り直す。
 */
const poolCache = new Map<string, Map<string, AdvBattleQuestion[]>>();

/** targetId（`vocab-<level>`）→ 問題。バトル・模試の出題プールに載せる */
export const vocabPool = (level: 'N2' | 'N3', seed = 20260801): Map<string, AdvBattleQuestion[]> => {
  const cacheKey = `${level}:${seed}`;
  const hit = poolCache.get(cacheKey);
  if (hit) return hit;
  const scope = level === 'N3' ? ['N5', 'N4', 'N3'] : ['N5', 'N4', 'N3', 'N2'];
  const active = activeContent(ALL_VOCAB_CONTENT).filter((c) => scope.includes(c.level));
  const map = new Map<string, AdvBattleQuestion[]>();
  active.forEach((c, i) => {
    const qs = buildVocabQuestions(c, active, seed + i * 31);
    if (qs.length === 0) return;
    const target = `vocab-${c.level.toLowerCase()}`;
    map.set(target, [...(map.get(target) ?? []), ...qs]);
  });
  poolCache.set(cacheKey, map);
  return map;
};

export interface VocabQuestionCoverage {
  level: 'N2' | 'N3';
  activeWords: number;
  wordsWithQuestions: number;
  questions: number;
  byAspect: Record<string, number>;
  /** §6: CORE は 4〜6観点。満たしていない語 */
  belowAspectTarget: string[];
}

export const vocabQuestionCoverage = (level: 'N2' | 'N3', seed = 20260801): VocabQuestionCoverage => {
  const scope = level === 'N3' ? ['N5', 'N4', 'N3'] : ['N5', 'N4', 'N3', 'N2'];
  const active = activeContent(ALL_VOCAB_CONTENT).filter((c) => scope.includes(c.level));
  const byAspect: Record<string, number> = {};
  const below: string[] = [];
  let questions = 0; let withQ = 0;
  active.forEach((c, i) => {
    const qs = buildVocabQuestions(c, active, seed + i * 31);
    if (qs.length > 0) withQ += 1;
    questions += qs.length;
    const aspects = new Set(qs.map((q) => q.type.replace('vocab-', '')));
    for (const a of aspects) byAspect[a] = (byAspect[a] ?? 0) + 1;
    if (aspects.size < 4) below.push(`${c.surface}(${aspects.size})`);
  });
  return {
    level, activeWords: active.length, wordsWithQuestions: withQ,
    questions, byAspect, belowAspectTarget: below,
  };
};

export { VOCAB_ASPECT_LABELS };
