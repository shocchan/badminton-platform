// 単語学習の材料づくり（重いバンクを読むので dynamic import で使う）。
//
// 何を選ぶか:
// - **まだ出会っていない語**が最優先。すでに図鑑にある語をもう一度「新しいことば」として
//   出すと、学習者は前に進んでいる感じを持てない
// - その中で**目標の級に近い順**（N1目標ならN1→N2→…）。下の級から順に埋めさせない。
//   目標に効く語から覚えるほうが、残り時間の使い方として正しい
// - 出会った語しか残っていない場合は、**間違えたことがある語**を混ぜる（復習として成立する）
import { vocabScopedActive, type VocabScopeLevel } from './vocabQuestions';
import { buildVocabQuestions } from './vocabQuestions';
import type { VocabOriginalContent } from './vocabContent';
import type { AdvMasteryLedger } from '../advTypes';
import { collectDexEntries, dexIdOf } from './vocabDex';
import { presentBattle } from '../advChoiceOrder';
import type { LearnQuestion, LearnSession, LearnWord } from './vocabLearn';

/** 1回のセッションで扱う語数。3〜4分で終わる量にする */
export const LEARN_BATCH_SIZE = 5;

/** 確認で使う観点。意味 → 用法/文脈 の順で「分かる → 使える」へ寄せる */
const QUIZ_ASPECTS = ['vocab-meaning', 'vocab-context', 'vocab-usage', 'vocab-reading', 'vocab-orthography'];

/**
 * 出す順。**自分の級から**始める（2026-09-06 CEO指摘）。
 *
 * 以前は N5/N4 の学習者もスコープが 'N3' に丸められ、さらに N3 の優先順が
 * ['N3','N4','N5'] だったため、**目標N5の人に「申込書・委任状・受理・交付」**が出ていた。
 * 上の級を目標にする人は上から、下の級の人は自分の級から。どちらも「いま要る語」から始める。
 */
const LEVEL_PRIORITY: Record<string, string[]> = {
  N1: ['N1', 'N2', 'N3', 'N4', 'N5'],
  N2: ['N2', 'N3', 'N4', 'N5'],
  N3: ['N3', 'N4', 'N5'],
  N4: ['N4', 'N5', 'N3'],
  N5: ['N5', 'N4'],
};

const LOW_TO_HIGH = ['N5', 'N4', 'N3', 'N2', 'N1'];

/**
 * 出す順を**実力から積み上げる**形に組み替える（2026-09-06 CEO確認で発覚）。
 *
 * 李さんは「目標N3 / 診断の実力n5」。先生プランには
 * 「N3を攻略するために、まず土台のことばを短期間で固めます」と書いてあるのに、
 * 単語学習だけがその方針に従わず、初回から **申込書・委任状・受理・交付** を出していた。
 * ジャンさんで直したのと同じ語が、李さんにはそのまま残っていた。
 *
 * startLevel（実力）から目標級まで**下から上へ**並べ、その下の級は最後に回す。
 * startLevel が無い／目標と同じなら、これまでの順（目標級から）と完全に一致する。
 */
const priorityFor = (level: VocabScopeLevel, startLevel?: VocabScopeLevel | null): string[] => {
  const base = LEVEL_PRIORITY[level] ?? ['N5', 'N4', 'N3'];
  if (!startLevel || startLevel === level) return base;
  const from = LOW_TO_HIGH.indexOf(startLevel);
  const to = LOW_TO_HIGH.indexOf(level);
  if (from < 0 || to < 0 || from > to) return base;
  const climb = LOW_TO_HIGH.slice(from, to + 1);
  return [...climb, ...base.filter((l) => !climb.includes(l))];
};

const toWord = (c: VocabOriginalContent): LearnWord => ({
  id: dexIdOf(c.surface, c.reading),
  surface: c.surface, reading: c.reading, level: c.level,
  glossZh: c.glossZh, exampleJa: c.exampleJa, exampleZh: c.exampleZh,
  explanationJa: c.explanationJa ?? '', explanationZh: c.explanationZh ?? '',
  collocationsJa: c.collocationsJa ?? [],
});

/**
 * 初級コアのバッチ番号（2026-09-06）。CEOが用意した初級リスト由来の語。
 * 同じ級の中でも**この語から先に出す**。
 */
export const STARTER_BATCH_NOS = [50, 51, 52];
const isStarter = (c: VocabOriginalContent): boolean =>
  typeof c.batchNo === 'number' && STARTER_BATCH_NOS.includes(c.batchNo);

/** 決定的な並び替え（seedのみに依存。同じ日に開き直しても同じ語が出る） */
const rotate = <T,>(arr: T[], seed: number): T[] => {
  if (arr.length === 0) return arr;
  const at = ((seed % arr.length) + arr.length) % arr.length;
  return [...arr.slice(at), ...arr.slice(0, at)];
};

export interface LearnPick {
  session: LearnSession;
  /** まだ出会っていない語が尽きたので復習を混ぜたか（画面で正直に言うため） */
  mixedReview: boolean;
  /** このスコープに残っている未出会いの語数 */
  remainingUnseen: number;
}

export const pickLearnSession = (
  level: VocabScopeLevel, ledger: AdvMasteryLedger, seed: number, size = LEARN_BATCH_SIZE,
  /** 診断で出た実力。目標より低いとき、ここから積み上げる（図鑑や錯題本のスコープは変えない） */
  startLevel?: VocabScopeLevel | null,
): LearnPick => {
  const bank = vocabScopedActive(level);
  const scope = new Set(bank.map((c) => dexIdOf(c.surface, c.reading)));
  const dex = collectDexEntries(ledger, scope);

  const unseen: VocabOriginalContent[] = [];
  const wrongBefore: VocabOriginalContent[] = [];
  for (const c of bank) {
    const e = dex.get(dexIdOf(c.surface, c.reading));
    if (!e) unseen.push(c);
    else if (e.wrongCount > 0 && e.state !== 'mastered') wrongBefore.push(c);
  }

  const order = priorityFor(level, startLevel);
  const byPriority = (arr: VocabOriginalContent[]): VocabOriginalContent[] => {
    const out: VocabOriginalContent[] = [];
    for (const lv of order) {
      const inLevel = arr.filter((c) => c.level === lv);
      // **初級コアを先に出す**（2026-09-06）。行く・見る・食べる のような
      // 生活の土台になる語を、九つ・コップ・財布 より先に出す。
      // 同じ級の中でも「先に覚えてほしい順」があるので、そこだけ固定する
      out.push(...rotate(inLevel.filter((c) => isStarter(c)), seed));
      out.push(...rotate(inLevel.filter((c) => !isStarter(c)), seed));
    }
    return out;
  };

  const picked = byPriority(unseen).slice(0, size);
  const mixedReview = picked.length < size;
  if (mixedReview) picked.push(...byPriority(wrongBefore).slice(0, size - picked.length));

  const raw: { q: ReturnType<typeof buildVocabQuestions>[number]; wordId: string }[] = [];
  for (const [i, c] of picked.entries()) {
    const all = buildVocabQuestions(c, bank, seed + i * 31);
    // 観点の優先順に2問。作れない語は作れるぶんだけ（無い観点を作らない）
    const chosen = QUIZ_ASPECTS
      .map((t) => all.find((q) => q.type === t))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .slice(0, 2);
    for (const q of chosen) raw.push({ q, wordId: dexIdOf(c.surface, c.reading) });
  }

  /**
   * **選択肢の並びは必ず presentBattle に通す**（2026-09-06 CEO指摘）。
   *
   * 生成器は「正解＋ダミー」の順で配列を作る（正解が必ず先頭）。
   * バトル・模試は表示のたびに presentBattle でシャッフルしているが、
   * この画面は生の配列をそのまま並べていたため、**10問すべて1番目が正解**だった。
   * 実測: 40セッション400問すべてで正解が1番目。
   * 位置の均し（同じ位置が3連続しない等）も presentBattle が持っている。
   */
  const presented = presentBattle(raw.map((r) => r.q), seed);
  const questions: LearnQuestion[] = raw.map((r, i) => ({
    key: r.q.key,
    wordId: r.wordId,
    type: r.q.type,
    promptJa: r.q.questionJa,
    promptZh: r.q.questionZh,
    targetJapanese: r.q.targetJapanese,
    choices: presented[i].choices.map((ch) => ({ choiceId: ch.choiceId, textJa: ch.textJa, isCorrect: ch.isCorrect })),
    explanationZh: r.q.explanation.meaningZh,
  }));

  return {
    session: { words: picked.map(toWord), questions },
    mixedReview,
    remainingUnseen: unseen.length,
  };
};
