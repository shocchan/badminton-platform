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
  /** 機械検査・人手レビューが付けた指摘 */
  reviewNotes: string[];
  /** どのバッチで作ったか */
  batchId: string;
}

/** active_beta にできる必須項目が揃っているか（vocabContent の toSenseRecord と同じ役割） */
export const isCompleteKanjiEntry = (e: KanjiEntry): boolean => {
  const texts = [e.entryId, e.character, e.meaningZh, e.chineseNote, e.mnemonicZh, e.batchId,
    e.radical?.form, e.radical?.readingJa, e.radical?.meaningZh];
  if (texts.some((v) => typeof v !== 'string' || v.trim().length === 0)) return false;
  if ([...e.character].length !== 1) return false;
  if (!Number.isInteger(e.strokeCount) || e.strokeCount < 1 || e.strokeCount > 30) return false;
  if (e.onyomi.length === 0 && e.kunyomi.length === 0) return false;
  if (e.words.length < 2 || e.words.length > 4) return false;
  return e.words.every((w) =>
    w.surface.includes(e.character) && w.reading.trim().length > 0 && w.glossZh.trim().length > 0);
};
