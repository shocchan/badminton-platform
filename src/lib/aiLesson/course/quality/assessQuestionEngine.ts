// Assess問題の生成エンジン（§11-§13）。
//
// 原則:
// 1. assess画面には答えを載せない（中国語訳・注記・ふりがなを出さない）。teach画面と分離する。
// 2. 語ごとに「測る価値のある次元」だけを出す（cognateProfile）。
//    中国語と同じ漢字の語に「意味を選ぶだけ」の問題を出さない。
// 3. 生成は決定的（乱数なし）。同じ入力からは常に同じ問題が出る。
import type { FoundationItem } from '../foundationTypes';
import { cognateProfileFor, allowsCoreMeaningQuestion, type LearningDimension, type CognateProfile } from './cognateProfile';
import { contrastQuestionsFor } from './cognateContrastBank';

export interface AssessQuestion {
  questionId: string;
  itemId: string;
  dimension: LearningDimension;
  promptJa: string;
  promptZh: string;
  choices: string[];
  answerIndex: number;
  /** 解説は回答後にのみ表示する（事前表示はleakage） */
  explanationJa: string;
  explanationZh: string;
}

const hasKanji = (s: string) => /[一-鿿]/.test(s);

/** 決定的な他選択肢の選び方（乱数を使わず、id順で近いものから採る） */
const pickDistractors = <T>(pool: T[], exclude: (t: T) => boolean, n: number): T[] =>
  pool.filter(t => !exclude(t)).slice(0, n);

/** 選択肢の並びを決定的に整える（正解の位置が常に同じにならないよう、idのhashで回転） */
const arrange = (correct: string, distractors: string[], seed: string): { choices: string[]; answerIndex: number } => {
  const all = [correct, ...distractors];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const shift = h % all.length;
  const choices = [...all.slice(shift), ...all.slice(0, shift)];
  return { choices, answerIndex: choices.indexOf(correct) };
};

/** 読み問題（漢字語のみ）。ふりがなを出さない画面でのみ成立する */
const readingQuestion = (item: FoundationItem, pool: FoundationItem[]): AssessQuestion | null => {
  if (!hasKanji(item.lemma)) return null;
  const distractors = pickDistractors(pool,
    p => p.id === item.id || p.readingKana === item.readingKana || Math.abs(p.readingKana.length - item.readingKana.length) > 1, 2)
    .map(p => p.readingKana);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(item.readingKana, distractors, item.id + 'r');
  return {
    questionId: `aq-${item.id}-reading`, itemId: item.id, dimension: 'reading',
    promptJa: `「${item.displayForm}」の読み方は？`, promptZh: `「${item.displayForm}」怎么读？`,
    choices, answerIndex,
    explanationJa: `${item.displayForm}＝${item.readingKana}`,
    explanationZh: `${item.displayForm} 读作「${item.readingKana}」。`,
  };
};

/**
 * 文脈（穴埋め）問題。例文から対象語を伏せ、同じ品詞の語と選ばせる。
 * 中国語訳を出さないので答えが漏れない。活用形は例文の実表記を使う。
 */
const clozeQuestion = (item: FoundationItem, pool: FoundationItem[]): AssessQuestion | null => {
  const sentence = item.exampleJa;
  if (!sentence) return null;
  // 例文中の実際の表記を探す（活用で語尾が変わるため、語幹から順に試す）
  const stem = item.lemma.length > 2 ? item.lemma.slice(0, item.lemma.length - 1) : item.lemma;
  const surface = [item.displayForm, item.lemma, stem].find(s => s && sentence.includes(s));
  if (!surface) return null;
  const blanked = sentence.replace(surface, '＿＿');
  const distractors = pickDistractors(pool,
    p => p.id === item.id || p.partOfSpeech !== item.partOfSpeech || p.meaningZh === item.meaningZh, 2)
    .map(p => {
      const st = p.lemma.length > 2 ? p.lemma.slice(0, p.lemma.length - 1) : p.lemma;
      return surface === item.displayForm ? p.displayForm : (surface === item.lemma ? p.lemma : st);
    })
    .filter(s => s && s !== surface);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(surface, distractors, item.id + 'c');
  return {
    questionId: `aq-${item.id}-context`, itemId: item.id, dimension: 'context',
    promptJa: `${blanked}\n＿＿に入る言葉は？`, promptZh: `＿＿处应该填哪个词？`,
    choices, answerIndex,
    explanationJa: `${sentence}`,
    explanationZh: item.exampleZh ?? '',
  };
};

/** コロケーション問題（commonFormsJaがある語） */
const collocationQuestion = (item: FoundationItem, pool: FoundationItem[]): AssessQuestion | null => {
  const forms = item.commonFormsJa ?? [];
  if (forms.length === 0) return null;
  const correct = forms[0];
  const distractors = pickDistractors(pool, p => p.id === item.id || !(p.commonFormsJa ?? []).length, 2)
    .map(p => (p.commonFormsJa ?? [])[0]).filter((s): s is string => !!s && s !== correct);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(correct, distractors, item.id + 'k');
  return {
    questionId: `aq-${item.id}-collocation`, itemId: item.id, dimension: 'collocation',
    promptJa: `「${item.displayForm}」を使う自然な言い方はどれ？`,
    promptZh: `哪个是「${item.displayForm}」的自然搭配？`,
    choices, answerIndex,
    explanationJa: `よく使う形: ${forms.join('・')}`,
    explanationZh: `常用搭配：${forms.join('・')}`,
  };
};

/** 中心意味問題（japanese_specificの初回のみ）。中国語訳を選ばせる */
const coreMeaningQuestion = (item: FoundationItem, pool: FoundationItem[], profile: CognateProfile, introduced: boolean): AssessQuestion | null => {
  if (!allowsCoreMeaningQuestion(profile, introduced)) return null;
  const distractors = pickDistractors(pool, p => p.id === item.id || p.meaningZh === item.meaningZh, 2)
    .map(p => p.meaningZh);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(item.meaningZh, distractors, item.id + 'm');
  return {
    questionId: `aq-${item.id}-meaning`, itemId: item.id, dimension: 'core_meaning',
    promptJa: `「${item.displayForm}」の意味は？`, promptZh: `「${item.displayForm}」是什么意思？`,
    choices, answerIndex,
    explanationJa: `${item.displayForm}（${item.readingKana}）`,
    explanationZh: item.meaningZh,
  };
};

/** contrast bank由来（false_friend・partial_overlapの高リスク語） */
const contrastQuestions = (item: FoundationItem): AssessQuestion[] =>
  contrastQuestionsFor(item.id).map((c, i) => ({
    questionId: `aq-${item.id}-contrast${i}`, itemId: item.id, dimension: c.dimension,
    promptJa: c.promptJa, promptZh: c.promptZh, choices: c.choices, answerIndex: c.answerIndex,
    explanationJa: c.explanationJa, explanationZh: c.explanationZh,
  }));

export interface BuildOptions {
  /** その語を既に導入済みか（core_meaningの可否に影響） */
  introduced: boolean;
  /** 最大問題数（Unit全体の分量調整用） */
  max?: number;
}

/**
 * 1語ぶんのassess問題を、cognate classに応じた優先順で生成する。
 * 生成できない次元は静かにskipされる（データが足りない語で無理に出題しない）。
 */
export const buildAssessQuestions = (
  item: FoundationItem, pool: FoundationItem[], opts: BuildOptions,
): AssessQuestion[] => {
  const profile = cognateProfileFor(item);
  const out: AssessQuestion[] = [];
  const push = (q: AssessQuestion | null) => { if (q) out.push(q); };

  switch (profile.cognateClass) {
    case 'false_friend':
      // 転移誤用が最優先。意味当ては出さない
      out.push(...contrastQuestions(item));
      push(clozeQuestion(item, pool));
      push(readingQuestion(item, pool));
      break;
    case 'partial_overlap':
      out.push(...contrastQuestions(item));
      push(clozeQuestion(item, pool));
      push(collocationQuestion(item, pool));
      push(readingQuestion(item, pool));
      break;
    case 'mostly_same':
      // 意味は推測できるので、読みと文脈で測る
      push(readingQuestion(item, pool));
      push(clozeQuestion(item, pool));
      push(collocationQuestion(item, pool));
      break;
    case 'japanese_specific':
      push(coreMeaningQuestion(item, pool, profile, opts.introduced));
      push(clozeQuestion(item, pool));
      push(readingQuestion(item, pool));
      push(collocationQuestion(item, pool));
      break;
  }
  const deduped = out.filter((q, i) => out.findIndex(o => o.questionId === q.questionId) === i);
  return opts.max ? deduped.slice(0, opts.max) : deduped;
};

/** その語をassessできるか（1問も作れない語はCoverage上 untested になる） */
export const canAssess = (item: FoundationItem, pool: FoundationItem[]): boolean =>
  buildAssessQuestions(item, pool, { introduced: false }).length > 0;
