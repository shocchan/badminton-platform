// 層C: 語彙の独自コンテンツ（EXAM COVERAGE CLOSURE §5・§6）。
//
// 鉄則:
// - 訳・注記・例文はすべて**自社で書き起こす**。他ソースの訳文・例文を写さない。
// - 出題は選択式のみ（自由入力はJLPTルートに置かない）。
// - 意味レビューを通っていないものは active_beta にしない。
// - 語義が複数ある語は「どの語義の話か」を明示する（senseIdつき）。
import type { JlptLevelTag } from './vocabTypes';

/**
 * 独自コンテンツのレビュー段階（§6のバッチ手順）。
 *
 * FINAL CLOSEOUT: **最終状態は `active_beta` か `excluded_from_core` の2つだけ**。
 * 「保留のまま放置」を残さないため、教材化できない見出しは理由を書いて CORE から外す。
 * `needs_human_review` は移行期の中間状態として型には残すが、bank に残っていないことを
 * テストで固定する（`vocabContent.test.ts`）。
 */
export type VocabContentState =
  | 'draft'                  // 書いただけ
  | 'validated'              // 機械検査を通過
  | 'semantically_reviewed'  // 意味の独立レビューを通過
  | 'active_beta'            // 出題に使ってよい
  | 'needs_human_review'     // （移行期のみ）機械が疑いを持った
  | 'excluded_from_core';    // CORE から外した。理由は exclusionReason に書く

/** CORE から外した理由（excluded_from_core のときだけ意味を持つ） */
export type VocabExclusionReason =
  | 'inflected_form'         // 動詞・形容詞の活用形が見出しとして採取されただけ
  | 'function_word'          // 助詞・助動詞・接続詞など。文法bankの担当
  | 'reading_unverifiable'   // 表記と読みの対応が辞書索引で確認できない
  | 'suru_stem_artifact'     // サ変語幹に「する」が付いたまま採取された見出し
  | 'compound_fragment'      // 複合語の一部だけで単独の語として扱えない
  | 'sense_indeterminate'    // 語義を1つに定められず、出題すると複数正解になる
  | 'duplicate_headword'     // 別の見出しと同一の語（重複エントリ）
  | 'question_unbuildable';  // 品質を満たす選択問題を2問作れない

/** 語1つ分の独自コンテンツ。FoundationItem と同じ考え方を canonical bank 側へ広げたもの */
export interface VocabOriginalContent {
  /** canonical bank の wordId（再生成でずれるため surface|reading も持つ） */
  wordId: string;
  surface: string;
  reading: string;
  level: JlptLevelTag;
  /** JMdict由来の品詞タグ（意味レビューの照合に使う。訳文は取っていない） */
  pos: string[];
  /** **自社で書いた**中国語の語義。複数語義がある語は主要語義に限定して書く */
  glossZh: string;
  /** 語義の限定（「この訳はどの使い方か」）。多義語で必須 */
  senseNoteZh?: string;
  /** 使い方の注意（助詞・自他・同音異義・敬語など）。無理に書かない */
  usageNoteZh?: string;
  /** **自社で書いた**例文。中国語訳も自社で書く */
  exampleJa: string;
  exampleZh: string;
  /** よく一緒に使う形（コロケーション）。出題の「用法」観点に使う */
  collocationsJa: string[];
  /** 紛らわしい語（出題の誤答候補の元。意味が近すぎるものは入れない） */
  confusableSurfaces: string[];
  /**
   * **自社で書いた**日本語の解説。使い方・活用・注意点を学習者向けに1〜2文で。
   * active_beta の必須項目（FINAL CLOSEOUT 要件B）。
   */
  explanationJa?: string;
  /** 同じ内容の中国語解説（簡体字）。active_beta の必須項目 */
  explanationZh?: string;
  state: VocabContentState;
  /** excluded_from_core のときの理由（型で分類し、詳細は reviewNotes に書く） */
  exclusionReason?: VocabExclusionReason;
  /** 機械検査・意味レビューが付けた指摘 */
  reviewNotes: string[];
  /** どのバッチで作ったか（§6の進捗管理） */
  batchNo: number;
}

/**
 * 出題・学習に使う正準 Sense レコード（FINAL CLOSEOUT 要件B）。
 * 既存フィールドの別名を1か所に集約し、「必須10項目が揃っているか」を機械で見られるようにする。
 */
export interface VocabSenseRecord {
  sourceSenseId: string;
  surface: string;
  reading: string;
  partOfSpeech: string[];
  meaningZh: string;
  exampleJa: string;
  exampleZh: string;
  explanationJa: string;
  explanationZh: string;
  targetLevel: JlptLevelTag;
  reviewState: VocabContentState;
}

/** 必須10項目が揃っていれば Sense レコードを返す。欠けていれば null（＝activeにできない） */
export const toSenseRecord = (c: VocabOriginalContent): VocabSenseRecord | null => {
  const required = [
    c.wordId, c.surface, c.reading, c.glossZh,
    c.exampleJa, c.exampleZh, c.explanationJa, c.explanationZh, c.level, c.state,
  ];
  if (required.some((v) => typeof v !== 'string' || v.trim().length === 0)) return null;
  if (c.pos.length === 0) return null;
  return {
    sourceSenseId: c.wordId,
    surface: c.surface,
    reading: c.reading,
    partOfSpeech: c.pos,
    meaningZh: c.glossZh,
    exampleJa: c.exampleJa,
    exampleZh: c.exampleZh,
    explanationJa: c.explanationJa as string,
    explanationZh: c.explanationZh as string,
    targetLevel: c.level,
    reviewState: c.state,
  };
};

/** 語彙問題の観点（§6: CORE は 4〜6観点） */
export type VocabAspect =
  | 'meaning'      // 意味を選ぶ
  | 'reading'      // 読みを選ぶ（文字・語彙の科目）
  | 'orthography'  // 表記（漢字）を選ぶ
  | 'usage'        // 用法・コロケーションを選ぶ
  | 'context'      // 文脈に合う語を選ぶ
  | 'confusable';  // 紛らわしい語との区別

export const VOCAB_ASPECTS: VocabAspect[] = [
  'meaning', 'reading', 'orthography', 'usage', 'context', 'confusable',
];

export const VOCAB_ASPECT_LABELS: Record<VocabAspect, { ja: string; zh: string }> = {
  meaning: { ja: '意味', zh: '词义' },
  reading: { ja: '読み方', zh: '读音' },
  orthography: { ja: '漢字表記', zh: '汉字写法' },
  usage: { ja: '使い方', zh: '用法' },
  context: { ja: '文脈', zh: '语境' },
  confusable: { ja: '紛らわしい語', zh: '易混词' },
};

/** バッチの進行状態（§6: 生成 → validation → 意味レビュー → active_beta → staging smoke） */
export interface VocabBatchStatus {
  batchNo: number;
  words: number;
  validated: number;
  semanticallyReviewed: number;
  activeBeta: number;
  needsHumanReview: number;
  /** CORE から外した語（理由つき）。active_beta と合わせて words と一致するのが完了状態 */
  excludedFromCore: number;
  /** どちらにも決まっていない語。**完了時は 0** */
  pending: number;
  /** stagingで実際に出題して動作を確認したか */
  stagingSmokePassed: boolean;
}

export const summarizeBatch = (
  batchNo: number, items: VocabOriginalContent[], stagingSmokePassed: boolean,
): VocabBatchStatus => {
  const inBatch = items.filter((i) => i.batchNo === batchNo);
  const count = (s: VocabContentState) => inBatch.filter((i) => i.state === s).length;
  return {
    batchNo,
    words: inBatch.length,
    // validated 以降はすべて機械検査を通っている
    validated: inBatch.filter((i) => i.state !== 'draft' && i.state !== 'needs_human_review').length,
    semanticallyReviewed: count('semantically_reviewed') + count('active_beta'),
    activeBeta: count('active_beta'),
    needsHumanReview: count('needs_human_review'),
    excludedFromCore: count('excluded_from_core'),
    // active でも excluded でもない＝まだ決まっていない語
    pending: inBatch.length - count('active_beta') - count('excluded_from_core'),
    stagingSmokePassed,
  };
};

/** 出題に使ってよいコンテンツだけを返す（§6: レビュー未了は出さない） */
export const activeContent = (items: VocabOriginalContent[]): VocabOriginalContent[] =>
  items.filter((i) => i.state === 'active_beta');
