// 漢字モジュールの型（vocab/ と同じ階層・同じ考え方）。
//
// 鉄則:
// - 読み・訳・例語・注記はすべて**自社で書き起こす**。他ソースの読み・訳・例文を写さない。
// - 出題は選択式のみ（自由入力はJLPTルートに置かない）。
// - 中国語母語者は漢字の「意味」を既に知っている。意味当てを量産しない。
//   測る価値があるのは 読み（音・訓）／日中の字形差・意味差／送り仮名 の3方向。
//   （src/lib/aiLesson/course/quality/cognateProfile.ts の方針に従う）
// - 画数・部首は正確に書く。自信の無い字は**入れない**（間違いを出すより少ない方がよい）。
import type { JlptLevelTag } from '../vocab/vocabTypes';

/** エントリのレビュー段階（vocabContent の VocabContentState と同じ運用） */
export type KanjiEntryState =
  | 'draft'               // 書いただけ
  | 'validated'           // 機械検査を通過
  | 'active_beta'         // 出題に使ってよい
  | 'excluded_from_core'; // 素材が足りず出題しない

/**
 * 漢字問題の観点。
 *
 * 【最重要】問題キーは `kanji-<aspect>:<char>:<i>` とし、**観点を必ず第1セグメントに置く**。
 * advMastery.ts の `questionTypeOf = (key) => key.split(':')[0]` が
 * `MASTERY_RULES.minQuestionTypes` の判定に使うため、語彙キー（`vocab:表:ひょう:meaning`）の形を
 * 真似ると questionType が常に1種類になり、満点を何日取っても攻略が確定しない（実証済みの既存欠陥）。
 * キーは台帳・错题本・未出判定の共有キーなので、**一度出したら二度と変えない**。
 */
export type KanjiAspect =
  | 'onyomi'       // 音読みを選ぶ
  | 'kunyomi'      // 訓読みを選ぶ
  | 'wordreading'  // 例語の読みを選ぶ
  | 'okurigana'    // 送り仮名を選ぶ
  | 'shape'        // 日本の字体 vs 简体字・似た字の見分け
  | 'contrast';    // 日中で意味・用法がずれる点（false friend）

/** 問題タイプ文字列（AdvBattleQuestion.type に入れる値） */
export const kanjiQuestionType = (aspect: KanjiAspect): string => `kanji-${aspect}`;

/** 問題キー。第1セグメントが観点であることがこの関数で担保される */
export const kanjiQuestionKey = (aspect: KanjiAspect, character: string, index: number): string =>
  `${kanjiQuestionType(aspect)}:${character}:${index}`;

/** 部首（字と、その日本語での呼び名） */
export interface KanjiRadical {
  /** 部首の字形（例: '木'・'刂'・'宀'） */
  form: string;
  /** 日本語での呼び名（例: 'きへん'・'りっとう'・'うかんむり'） */
  readingJa: string;
  /** 部首の意味（簡体字中国語） */
  meaningZh: string;
}

/** excluded_from_core にした理由（vocabContent の VocabExclusionReason と同じ考え方） */
export type KanjiExclusionReason =
  | 'question_unbuildable'        // 品質を満たす選択問題を作れない
  | 'reading_unverifiable'        // 読みを確認できない
  | 'stroke_or_radical_uncertain' // 画数・部首に確信が持てない
  | 'duplicate_character';        // 他バッチと同じ字

/** その字を使う語。読みは語全体の読み（かな） */
export interface KanjiWord {
  surface: string;
  reading: string;
  /** 中国語訳（簡体字。自社で書いたもの） */
  glossZh: string;
  /** 層C語彙バンク（ALL_VOCAB_CONTENT の active_beta）に同じ見出しが実在するか */
  inVocabBank: boolean;
}

/** 漢字1字分のエントリ */
export interface KanjiEntry {
  /** `kj-<バッチID>-<2桁連番>` 形式。出題キーとは別（キーは character を使う） */
  entryId: string;
  /** 漢字1字（必ず1文字） */
  character: string;
  /** 音読み（カタカナ）。無い字は空配列 */
  onyomi: string[];
  /** 訓読み（ひらがな）。送り仮名は「・」で区切る（例: 'たか・い'）。無い字は空配列 */
  kunyomi: string[];
  /** 中国語の意味（簡体字） */
  meaningZh: string;
  /** 画数 */
  strokeCount: number;
  radical: KanjiRadical;
  level: JlptLevelTag;
  /** その字を使う語 2〜4個。語彙バンクに実在する語を優先する */
  words: KanjiWord[];
  /**
   * 中国語話者向けの注意（簡体字）。簡体字との字形差／中国語と意味がずれる点／日本語独自の使い方。
   * **中国人学習者にとって一番価値がある欄**なので必ず具体的に書く。
   */
  chineseNote: string;
  /** 覚え方のヒント（簡体字）。字形の成り立ちや部首から */
  mnemonicZh: string;
  state: KanjiEntryState;
  /** excluded_from_core のときの理由 */
  exclusionReason?: KanjiExclusionReason;
  /** 機械検査・人手レビューが付けた指摘 */
  reviewNotes?: string[];
  /** どのバッチで作ったか */
  batchId: string;
}

/** KanjiWord の別名（バッチ側の命名ゆれ吸収用。実体は同じ） */
export type KanjiWordSample = KanjiWord;

/**
 * 機械検査。空配列なら active_beta にしてよい。
 * 通らなかった字は「保留」にせず、理由を reviewNotes に入れて excluded_from_core にする
 * （vocabContent.ts の FINAL CLOSEOUT と同じ運用）。
 */
export const kanjiEntryIssues = (e: KanjiEntry): string[] => {
  const issues: string[] = [];
  const texts: [string, unknown][] = [
    ['entryId', e.entryId], ['character', e.character], ['meaningZh', e.meaningZh],
    ['chineseNote', e.chineseNote], ['mnemonicZh', e.mnemonicZh], ['batchId', e.batchId],
    ['radical.form', e.radical?.form], ['radical.readingJa', e.radical?.readingJa],
    ['radical.meaningZh', e.radical?.meaningZh],
  ];
  for (const [name, v] of texts) {
    if (typeof v !== 'string' || v.trim().length === 0) issues.push(`${name} が空`);
  }
  if ([...(e.character ?? '')].length !== 1) issues.push('character が漢字1字でない');
  if (!Number.isInteger(e.strokeCount) || e.strokeCount < 1 || e.strokeCount > 30) {
    issues.push(`strokeCount が不正: ${e.strokeCount}`);
  }
  if (e.onyomi.length === 0 && e.kunyomi.length === 0) issues.push('音読み・訓読みが両方とも空');
  if (e.onyomi.some((r) => !/^[゠-ヿ]+$/.test(r))) issues.push('音読みがカタカナでない');
  if (e.kunyomi.some((r) => !/^[぀-ゟ・]+$/.test(r))) issues.push('訓読みがひらがな（送り仮名は「・」）でない');
  if (e.words.length < 2 || e.words.length > 4) issues.push(`例語が2〜4個でない: ${e.words.length}`);
  for (const w of e.words) {
    if (!w.surface.includes(e.character)) issues.push(`例語にその字が無い: ${w.surface}`);
    if (w.reading.trim().length === 0) issues.push(`例語の読みが空: ${w.surface}`);
    if (w.glossZh.trim().length === 0) issues.push(`例語の訳が空: ${w.surface}`);
  }
  return issues;
};

/** active_beta にできる必須項目が揃っているか（vocabContent の toSenseRecord と同じ役割） */
export const isCompleteKanjiEntry = (e: KanjiEntry): boolean => kanjiEntryIssues(e).length === 0;

/** 出題に使ってよいエントリだけを返す（vocabContent の activeContent と同じ役割） */
export const activeKanji = (entries: KanjiEntry[]): KanjiEntry[] =>
  entries.filter((e) => e.state === 'active_beta');

/**
 * 機械検査を通った字を active_beta へ昇格させ、通らなかった字は理由つきで CORE から外す。
 * 「保留のまま残す」状態を作らないための共通処理（各バッチはこれを通して export する）。
 */
export const promoteKanjiBatch = (draft: KanjiEntry[]): KanjiEntry[] => draft.map((e) => {
  const issues = kanjiEntryIssues(e);
  return issues.length === 0
    ? { ...e, state: 'active_beta' as const }
    : {
      ...e,
      state: 'excluded_from_core' as const,
      exclusionReason: 'question_unbuildable' as const,
      reviewNotes: [...(e.reviewNotes ?? []), ...issues],
    };
});

/**
 * 他バッチが先に収録している字を CORE から外す。
 *
 * 出題キー `kanji-<aspect>:<char>:<i>` は**字**がキーなので、同じ字が2バッチとも
 * active_beta のままだと mastery台帳・错题本・未出判定のキーが衝突し、
 * 一方の学習履歴がもう一方を上書きする。
 * エントリ自体は消さない（消すと後続の entryId 連番がずれて台帳のIDが変わるため）。
 */
export const excludeDuplicateChars = (entries: KanjiEntry[], chars: string[]): KanjiEntry[] => {
  const dup = new Set(chars);
  return entries.map((e) => (dup.has(e.character)
    ? {
      ...e,
      state: 'excluded_from_core' as const,
      exclusionReason: 'duplicate_character' as const,
      reviewNotes: [...(e.reviewNotes ?? []), '他バッチが先に収録している字なので CORE から除外'],
    }
    : e));
};

// ───────────────────────────────────────────────────────────────────────────
// 出題時のガード（「答えが透ける問題を作らない」ための共有ルール）
//
// 【重要】漢字バンクはまだどの生成器からも参照されていない。
// 最初に出題を作る人は、必ずこの節を読んでから書くこと。
// ───────────────────────────────────────────────────────────────────────────

/**
 * **回答前に出してはいけない欄。**
 *
 * chineseNote / mnemonicZh は「中国語話者向けの注意」なので、読みを平文で書いている。
 * 2026-08-18 に全220字を実測した結果:
 *   - 例語の読みが chineseNote に平文で入っている …… 170件（例: 「時計」读「とけい」）
 *   - 音読み・訓読みが chineseNote に平文で入っている …… 176件（例: 「九時」读「くじ」）
 * つまり読みを問う問題でこの2欄を**設問と一緒に**出すと、字を知らなくても注記を読むだけで解ける。
 * 欄を薄くするのではなく（中国人学習者に一番効く欄なので薄くしてはいけない）、
 * **回答後の解説にだけ出す**こと。読解 runner が whyWrong を `answered` で囲っているのと同じ扱い。
 */
export const KANJI_FIELDS_AFTER_ANSWER_ONLY = ['chineseNote', 'mnemonicZh'] as const;

/** 読みを問う観点（＝ KANJI_FIELDS_AFTER_ANSWER_ONLY を回答前に出せない観点） */
export const KANJI_READING_ASPECTS: KanjiAspect[] = ['onyomi', 'kunyomi', 'wordreading'];

/**
 * 選択肢に出す読みの表示形。訓読みの「・」は送り仮名の区切り記号であって読みではない。
 *
 * 実測（220字）: 訓読み305件のうち「・」ありが213・なしが92。素朴に混ぜると
 * 「1つだけ『・』が入っている選択肢」が生まれ、**中身を読まずに形で当てられる**
 * （advAnswerVisible.test.ts が cloze の漢字有無で検出したのと同じ型のテル）。
 * okurigana 観点だけは「・」の位置そのものが問題なので、この関数を通さない。
 */
export const displayReading = (reading: string): string => reading.replace(/・/g, '');

/**
 * 同じ読みを持つ字の索引。誤答をここから引くと**正解が2つある問題**になる。
 *
 * 実測（220字）: 音読みが2字以上で共有されているものが65通りある
 * （シ＝四子紙仕試思始止使／コウ＝校口高行後工好広考／シン＝新森申心親深進 …）。
 * 例語の読みも5組が重複する（がっき＝学期・楽器／かえす＝帰す・返す／
 * いがい＝以外・意外／いし＝石・意思／かぜ＝風・風邪）。
 */
export const readingIndex = (entries: KanjiEntry[], aspect: KanjiAspect): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  const add = (r: string, owner: string) => map.set(r, [...(map.get(r) ?? []), owner]);
  for (const e of activeKanji(entries)) {
    if (aspect === 'onyomi') for (const r of e.onyomi) add(displayReading(r), e.character);
    if (aspect === 'kunyomi') for (const r of e.kunyomi) add(displayReading(r), e.character);
    if (aspect === 'wordreading') for (const w of e.words) add(w.reading, w.surface);
  }
  return map;
};

/** 読み問題の選択肢1組（正解1＋誤答3）。表示テキストだけを見る */
export interface KanjiReadingChoices {
  aspect: KanjiAspect;
  /** 何の読みを聞いているか（字 or 例語）。エラーメッセージ用 */
  subject: string;
  correct: string;
  wrongs: string[];
}

/**
 * 読み問題の選択肢が「答えが透ける」形になっていないかの機械検査。
 * 空配列なら出してよい。**生成器は必ずこれを通すこと**
 * （advVariants.ts の validateQuestion と同じ役割）。
 */
export const kanjiReadingChoiceIssues = (c: KanjiReadingChoices): string[] => {
  const issues: string[] = [];
  const all = [c.correct, ...c.wrongs];
  if (c.wrongs.length !== 3) issues.push(`誤答が3つでない: ${c.wrongs.length}`);
  if (new Set(all).size !== all.length) issues.push(`選択肢が重複している: ${all.join('・')}`);
  // ① 誤答が実は正解（同じ読みを別の字から引いてきた）
  if (c.wrongs.some((w) => w === c.correct)) issues.push(`誤答に正解と同じ読みがある: ${c.correct}`);
  // ② script のテル: 音読み＝カタカナ・訓読み＝ひらがな なので、混ぜると見た目で分かる
  const kata = all.filter((t) => /^[゠-ヿー]+$/.test(t)).length;
  if (kata !== 0 && kata !== all.length) {
    issues.push(`カタカナとひらがなが混ざっている（字を読まずに選べる）: ${all.join('・')}`);
  }
  // ③ 送り仮名「・」のテル（okurigana 観点は「・」が中身なので除く）
  if (c.aspect !== 'okurigana') {
    const dotted = all.filter((t) => t.includes('・')).length;
    if (dotted !== 0) issues.push(`選択肢に「・」が残っている（displayReading を通すこと）: ${all.join('・')}`);
  }
  // ④ 長さのテル（読解・文法と同じ 3.2倍基準）
  const lens = all.map((t) => [...t].length);
  if (Math.min(...lens) > 0 && Math.max(...lens) / Math.min(...lens) > 3.2) {
    issues.push(`かな数が不揃い（長さで当てられる）: ${all.map((t, i) => `${t}(${lens[i]})`).join('・')}`);
  }
  return issues.map((m) => `[${c.aspect}:${c.subject}] ${m}`);
};
