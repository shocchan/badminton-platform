// 層C: 語彙の独自コンテンツ（EXAM COVERAGE CLOSURE §5・§6）。
//
// 鉄則:
// - 訳・注記・例文はすべて**自社で書き起こす**。他ソースの訳文・例文を写さない。
// - 出題は選択式のみ（自由入力はJLPTルートに置かない）。
// - 意味レビューを通っていないものは active_beta にしない。
// - 語義が複数ある語は「どの語義の話か」を明示する（senseIdつき）。
import type { JlptLevelTag } from './vocabTypes';

/** 独自コンテンツのレビュー段階（§6のバッチ手順） */
export type VocabContentState =
  | 'draft'                  // 書いただけ
  | 'validated'              // 機械検査を通過
  | 'semantically_reviewed'  // 意味の独立レビューを通過
  | 'active_beta'            // 出題に使ってよい
  | 'needs_human_review';    // 機械が疑いを持った（出題に使わない）

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
  state: VocabContentState;
  /** 機械検査・意味レビューが付けた指摘 */
  reviewNotes: string[];
  /** どのバッチで作ったか（§6の進捗管理） */
  batchNo: number;
}

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
    stagingSmokePassed,
  };
};

/** 出題に使ってよいコンテンツだけを返す（§6: レビュー未了は出さない） */
export const activeContent = (items: VocabOriginalContent[]): VocabOriginalContent[] =>
  items.filter((i) => i.state === 'active_beta');
