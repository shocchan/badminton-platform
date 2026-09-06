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

const toWord = (c: VocabOriginalContent): LearnWord => ({
  id: dexIdOf(c.surface, c.reading),
  surface: c.surface, reading: c.reading, level: c.level,
  glossZh: c.glossZh, exampleJa: c.exampleJa, exampleZh: c.exampleZh,
  explanationJa: c.explanationJa ?? '', explanationZh: c.explanationZh ?? '',
  collocationsJa: c.collocationsJa ?? [],
});

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

  const order = LEVEL_PRIORITY[level] ?? ['N5', 'N4', 'N3'];
  const byPriority = (arr: VocabOriginalContent[]): VocabOriginalContent[] => {
    const out: VocabOriginalContent[] = [];
    for (const lv of order) out.push(...rotate(arr.filter((c) => c.level === lv), seed));
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
