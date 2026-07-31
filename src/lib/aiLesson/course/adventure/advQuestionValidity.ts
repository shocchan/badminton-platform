// 問題の assessment validity 検査（UX CLARITY §3）。
//
// CEOが実画面で見つけた不正:
//   「日本で働く以上は、＿＿」
//   正解: 敬語を覚えるべきです（義務）
//   誤答: 日本は島国です / 天気がいいです / 桜がきれいです（すべて単なる叙述）
// → N2文法を知らなくても「べきです」だけを見て正解できる＝試験として無効。
//
// 中核ルール:
//   **正解の文末カテゴリが選択肢の中で唯一なら、文末だけで当てられるので FAIL。**
// これに構造均質性・意味的近接・同義重複を加えて機械判定する。

export type EndingCategory =
  | 'obligation'    // 〜べきだ／〜なければならない／〜必要がある
  | 'volition'      // 〜つもりだ／〜たい／〜ようと思う／〜しよう
  | 'request'       // 〜てください／〜てもらえますか
  | 'permission'    // 〜てもいい／〜てはいけない
  | 'past'          // 〜た／〜ました／〜だった
  | 'negative'      // 〜ない／〜ません
  | 'question'      // 〜か？
  | 'plainState'    // 〜です／〜ます／〜だ（単なる叙述）
  | 'nounPhrase'    // 述語で終わらない（名詞・句）
  | 'nonJapanese';  // 日本語文でない（中国語gloss等）

const hasKana = (s: string) => /[぀-ゟ゠-ヿ]/.test(s);

/** 文末カテゴリの判定（前方のカテゴリほど優先＝より強い意味を持つ語尾を先に見る） */
export const endingCategory = (raw: string): EndingCategory => {
  const s = raw.trim().replace(/[。．.！!？?]+$/u, '');
  if (!hasKana(s)) return 'nonJapanese';
  if (/[かの]\s*$/.test(raw.trim()) || /[？?]\s*$/.test(raw.trim())) return 'question';
  if (/(べきだ|べきです|べきではない|なければ(ならない|なりません|いけない|いけません)|ないと(いけない|だめ)|必要がある|必要です|ざるを得ない)$/.test(s)) return 'obligation';
  if (/(つもりだ|つもりです|たいです|たい|ようと思う|ようと思います|ましょう|よう|ます つもり)$/.test(s)) return 'volition';
  if (/(ください|くださいませ|もらえますか|いただけますか|てほしい|ほしいです)$/.test(s)) return 'request';
  if (/(てもいい|てもいいです|てはいけない|てはいけません|ても構わない|ても大丈夫)$/.test(s)) return 'permission';
  if (/(ない|ません|なかった|ませんでした)$/.test(s)) return 'negative';
  if (/(た|ました|だった|でした)$/.test(s)) return 'past';
  if (/(です|ます|だ|である|でしょう|かもしれない|と思う|と思います)$/.test(s)) return 'plainState';
  return 'nounPhrase';
};

/**
 * 内容語の集合。漢字語・カタカナ語に加え、**2文字以上の仮名の連なり**も含める。
 * （文型そのものが仮名のことが多く「〜あげく」等を無視すると誤って断絶と判定するため）
 */
export const contentTokens = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const m of s.match(/[一-鿿]{1,4}|[゠-ヿ]{2,}|[぀-ゟ]{2,}/g) ?? []) out.add(m);
  return out;
};

const overlap = (a: Set<string>, b: Set<string>): number => {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
};

export type ValidityIssue =
  | 'ending_category_giveaway'   // 正解の文末カテゴリが唯一＝語尾で当てられる
  | 'semantic_disconnection'     // 設問と無関係な選択肢が過半
  | 'structural_inhomogeneity'   // 文と句が混在／長さが極端に不揃い
  | 'duplicate_meaning_family'   // 同義の選択肢が複数＝複数正解の危険
  | 'answer_leakage'             // 設問文に正解がそのまま含まれる
  | 'duplicate_choice'           // 同一選択肢
  | 'too_few_choices';

/**
 * 出題を止める（HOLD）issue。
 * ending_category_giveaway は「あげく＝悪い結果」のように
 * 文型の意味そのものが語尾の傾向を決める場合に偽陽性になるため**警告扱い**とし、
 * 監査docsへ出して人間レビューに回す（silent許容ではない）。
 */
export const BLOCKING_ISSUES: ValidityIssue[] = [
  'semantic_disconnection', 'structural_inhomogeneity', 'duplicate_meaning_family',
  'answer_leakage', 'duplicate_choice', 'too_few_choices',
];

export interface ValidityResult {
  ok: boolean;
  issues: ValidityIssue[];
  /** 出題を止めるissue（ok = blocking.length === 0） */
  blocking: ValidityIssue[];
  /** 人間レビューへ回す警告 */
  warnings: ValidityIssue[];
  /** 参考値（監査docs用） */
  detail: {
    endingCategories: EndingCategory[];
    correctCategory: EndingCategory;
    disconnectedCount: number;
    lengthSpread: number;
  };
}

export interface ValidityInput {
  promptJa: string | null;
  promptZh: string;
  choices: string[];
  answerIndex: number;
  /** 同義族の判定に使う（任意） */
  synonymGroups?: string[][];
}

/**
 * 選択肢セットの妥当性検査。
 * 日本語文の選択肢と中国語glossの選択肢で適用ルールを変える
 * （中国語glossに文末カテゴリの概念は無い）。
 */
export const checkQuestionValidity = (input: ValidityInput): ValidityResult => {
  const { promptJa, promptZh, choices, answerIndex } = input;
  const issues: ValidityIssue[] = [];
  const correct = choices[answerIndex] ?? '';
  const distractors = choices.filter((_, i) => i !== answerIndex);

  if (choices.length < 3) issues.push('too_few_choices');
  if (new Set(choices.map((c) => c.trim())).size !== choices.length) issues.push('duplicate_choice');

  const stem = `${promptJa ?? ''} ${promptZh}`;
  if (correct.length >= 2 && stem.includes(correct)) issues.push('answer_leakage');

  const cats = choices.map(endingCategory);
  const correctCat = cats[answerIndex] ?? 'nonJapanese';
  const japaneseSentences = choices.filter((c) => hasKana(c) && c.length >= 4);
  const isJapaneseSentenceSet = japaneseSentences.length === choices.length && choices.length > 0;

  // ── ルール1: 文末カテゴリの一意性（日本語文の選択肢のときだけ） ──
  // plainState / nounPhrase は「素の叙述」なので、これが唯一でも語尾ヒントにはならない。
  if (isJapaneseSentenceSet && correctCat !== 'plainState' && correctCat !== 'nounPhrase' && correctCat !== 'nonJapanese') {
    const sameCat = cats.filter((c, i) => i !== answerIndex && c === correctCat).length;
    if (sameCat === 0) issues.push('ending_category_giveaway');
  }

  // ── ルール2: 意味的断絶（設問＋正解と内容語を1つも共有しない誤答が過半） ──
  const stemTokens = contentTokens(`${promptJa ?? ''}${promptZh}`);
  const correctTokens = contentTokens(correct);
  const ref = new Set<string>([...stemTokens, ...correctTokens]);
  let disconnected = 0;
  if (isJapaneseSentenceSet && ref.size > 0) {
    for (const d of distractors) {
      if (overlap(contentTokens(d), ref) === 0) disconnected += 1;
    }
    if (disconnected > distractors.length / 2) issues.push('semantic_disconnection');
  }

  // ── ルール3: 構造の均質性（文と句の混在・長さの極端な差） ──
  const lens = choices.map((c) => c.length);
  const maxLen = Math.max(...lens);
  const minLen = Math.min(...lens);
  const lengthSpread = maxLen / Math.max(1, minLen);
  if (lengthSpread > 3.2) issues.push('structural_inhomogeneity');
  // 日本語文と中国語glossが混在していたら不均質（片方だけ見れば分かってしまう）
  const kanaFlags = new Set(choices.map((c) => hasKana(c)));
  if (kanaFlags.size > 1) issues.push('structural_inhomogeneity');

  // ── ルール4: 同義族の重複（複数正解の危険） ──
  for (const group of input.synonymGroups ?? []) {
    const hit = choices.filter((c) => group.some((g) => c.includes(g))).length;
    if (hit >= 2) { issues.push('duplicate_meaning_family'); break; }
  }

  const uniq = [...new Set(issues)];
  const blocking = uniq.filter((i) => BLOCKING_ISSUES.includes(i));
  return {
    ok: blocking.length === 0,
    issues: uniq,
    blocking,
    warnings: uniq.filter((i) => !BLOCKING_ISSUES.includes(i)),
    detail: {
      endingCategories: cats,
      correctCategory: correctCat,
      disconnectedCount: disconnected,
      lengthSpread: Math.round(lengthSpread * 100) / 100,
    },
  };
};

/** 接続（formation）の先頭種別。clozeのdistractorが文法的に接続可能かの判定に使う */
export type ConnectionHead =
  | 'verbTa' | 'verbDict' | 'verbNai' | 'verbTe' | 'verbMasu' | 'noun' | 'naAdj' | 'iAdj' | 'plain' | 'unknown';

export const connectionHead = (formation: string): ConnectionHead => {
  const f = formation.replace(/\s/g, '');
  if (/動詞た形|た形/.test(f)) return 'verbTa';
  if (/動詞辞書形|辞書形/.test(f)) return 'verbDict';
  if (/動詞ない形|ない形/.test(f)) return 'verbNai';
  if (/動詞て形|て形/.test(f)) return 'verbTe';
  if (/動詞ます形|ます形|masu/.test(f)) return 'verbMasu';
  if (/普通形/.test(f)) return 'plain';
  if (/な形容詞|ナ形/.test(f)) return 'naAdj';
  if (/い形容詞|イ形/.test(f)) return 'iAdj';
  if (/名詞/.test(f)) return 'noun';
  return 'unknown';
};

/**
 * cloze の distractor が文法的に成立しうるか（§3 grammatical compatibility）。
 * 接続種別が一致（またはどちらかが unknown/plain）なら「文へ接続できる」とみなす。
 */
export const isConnectionCompatible = (a: ConnectionHead, b: ConnectionHead): boolean => {
  if (a === 'unknown' || b === 'unknown') return true;
  if (a === 'plain' || b === 'plain') return true;
  return a === b;
};
