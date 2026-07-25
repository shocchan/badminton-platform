// N2文法トラック（原本180項目）の型＆純ロジック（Phase N2-B1: 取り込み・監査・レビュー）。
// 方針: 原本（expression＋例文＋一部メモ）を保持。読み方/中国語訳/接続/問題等は原本に無く、
// 人間レビューで追加する（reviewFlags で明示）。learner には reviewStatus==='approved' のみ表示。

export type N2ReviewStatus = 'imported' | 'draft' | 'reviewed' | 'approved' | 'rejected';

export interface N2GrammarItem {
  grammarId: string;
  no: number;
  /** 原本の行番号（改変禁止・追跡用） */
  sourceRow: number;
  /** 原本の単元（18単元×10）。原本構造を保持 */
  sourceUnit: string;
  /** 提案する12ユニット配置（15/ユニット・仮・要人間調整） */
  unit12: number;
  expression: string;
  displayExpression: string;
  /** 原本メモ（意味）。原本にある10件のみ。無ければ空＝要作成 */
  meaningJa: string;
  /** 原本の例文（全180にあり） */
  examples: string[];
  /** 頻出度（原本B列。'×' など） */
  frequency: string;
  reviewStatus: N2ReviewStatus;
  /** 不足・要確認の印（needs_reading / needs_meaningZh / needs_connection / needs_quiz 等） */
  reviewFlags: string[];
  // ── 教材draft（人間レビュー前・任意）。原本に無い項目はここに作成 ──
  variants?: string[];
  reading?: string;
  level?: 'N2' | 'N3' | 'N2-N1';
  meaningZh?: string;
  shortMeaningZh?: string;
  functionCategory?: string[];
  connection?: string;
  nuanceJa?: string;
  nuanceZh?: string;
  situations?: string[];
  /** 原本例文とは別に追加した会話例（区別のため別フィールド） */
  conversationExamples?: string[];
  readingExamples?: string[];
  listeningExamples?: string[];
  similarGrammarIds?: string[];
  differencesJa?: string;
  differencesZh?: string;
  commonMistakes?: string[];
  chineseSpeakerNotes?: string;
  substitutionTemplate?: string;
  linkedMissionIds?: string[];
  quizzes?: N2QuizItem[];
  contentVersion?: number;
  /** 多義語の用法分離（例: 〜た上で/〜上で/〜上での）。1 grammarId 内で複数用法を構造化 */
  senses?: N2Sense[];
}

export interface N2Sense {
  senseId: string;
  meaningJa: string;
  meaningZh: string;
  connection: string;
  examples: string[];
  situations: string[];
}

export type N2QuizType = 'grammarChoice' | 'contextFill' | 'similarCompare' | 'reorder' | 'errorCorrection';

export interface N2QuizItem {
  questionId: string;
  grammarId: string;
  questionType: N2QuizType;
  prompt: string;
  choices: string[];
  correctAnswer: number; // index into choices
  explanationJa: string;
  explanationZh: string;
  wrongAnswerReasons: string[];
  difficulty: 1 | 2 | 3;
  reviewStatus: N2ReviewStatus;
  reviewFlags: string[];
}

/** 教材draft（overlay）を原本itemへ合成。content があれば reviewStatus='draft' に上げる */
export const mergeN2Content = (
  base: N2GrammarItem[],
  content: Record<string, Partial<N2GrammarItem>>,
): N2GrammarItem[] => base.map((g) => {
  const c = content[g.grammarId];
  if (!c) return g;
  return { ...g, ...c, reviewStatus: c.reviewStatus ?? 'draft' };
});

/** 全問題を平坦化 */
export const allQuizzes = (items: N2GrammarItem[]): N2QuizItem[] =>
  items.flatMap((g) => g.quizzes ?? []);

// ── 軽量インデックス（一覧・検索・統計。本文/例文/問題は含めない） ──
import type { N2GrammarIndexItem } from './n2GrammarIndex';

export const learnerVisibleIndex = (idx: N2GrammarIndexItem[]): N2GrammarIndexItem[] =>
  idx.filter((g) => g.reviewStatus === 'approved');
export const reviewCandidatesIndex = (idx: N2GrammarIndexItem[]): N2GrammarIndexItem[] =>
  idx.filter((g) => g.reviewStatus === 'reviewed' || g.reviewStatus === 'draft');
export const searchIndex = (idx: N2GrammarIndexItem[], q: string): N2GrammarIndexItem[] => {
  const s = q.trim();
  if (!s) return idx;
  return idx.filter((g) => g.displayExpression.includes(s) || g.meaningShort.includes(s) || g.grammarId.includes(s));
};
export const byUnit12Index = (idx: N2GrammarIndexItem[], unit: number): N2GrammarIndexItem[] =>
  idx.filter((g) => g.unit12 === unit);
export const n2IndexStats = (idx: N2GrammarIndexItem[]) => ({
  total: idx.length,
  imported: idx.filter((g) => g.reviewStatus === 'imported').length,
  draft: idx.filter((g) => g.reviewStatus === 'draft').length,
  reviewed: idx.filter((g) => g.reviewStatus === 'reviewed').length,
  approved: idx.filter((g) => g.reviewStatus === 'approved').length,
  withContent: idx.filter((g) => g.hasContent).length,
});

/**
 * 文法詳細の本文（例文・中国語・問題等）を dynamic import で読み込む。
 * 一覧はインデックスのみを使い、詳細を開いた時だけ本文チャンクを取得する。
 */
export const loadFullGrammar = async (grammarId: string): Promise<N2GrammarItem | null> => {
  const [data, content] = await Promise.all([
    import('./n2GrammarData'),
    import('./n2GrammarContent'),
  ]);
  const merged = mergeN2Content(data.N2_GRAMMAR_ITEMS, content.N2_GRAMMAR_CONTENT);
  return merged.find((g) => g.grammarId === grammarId) ?? null;
};

/** learner に見せてよいのは approved のみ（AI生成・未レビューは出さない） */
export const learnerVisible = (items: N2GrammarItem[]): N2GrammarItem[] =>
  items.filter((g) => g.reviewStatus === 'approved');

/** レビュー中プレビュー（承認前の候補）。管理/レビュー画面でのみ使用 */
export const reviewCandidates = (items: N2GrammarItem[]): N2GrammarItem[] =>
  items.filter((g) => g.reviewStatus === 'reviewed' || g.reviewStatus === 'draft');

/** 検索（表現・読み・意味・例文の部分一致） */
export const searchGrammar = (items: N2GrammarItem[], q: string): N2GrammarItem[] => {
  const s = q.trim();
  if (!s) return items;
  return items.filter((g) =>
    g.displayExpression.includes(s) || g.expression.includes(s)
    || (g.meaningJa || '').includes(s) || (g.meaningZh || '').includes(s)
    || g.examples.some((e) => e.includes(s)));
};

export const byUnit12 = (items: N2GrammarItem[], unit: number): N2GrammarItem[] =>
  items.filter((g) => g.unit12 === unit);

export interface N2GrammarStats {
  total: number;
  imported: number;
  draft: number;
  reviewed: number;
  approved: number;
  rejected: number;
  withExample: number;
  withMeaningJa: number;
  needsMeaningZh: number;
  needsReading: number;
}

export const n2GrammarStats = (items: N2GrammarItem[]): N2GrammarStats => ({
  total: items.length,
  imported: items.filter((g) => g.reviewStatus === 'imported').length,
  draft: items.filter((g) => g.reviewStatus === 'draft').length,
  reviewed: items.filter((g) => g.reviewStatus === 'reviewed').length,
  approved: items.filter((g) => g.reviewStatus === 'approved').length,
  rejected: items.filter((g) => g.reviewStatus === 'rejected').length,
  withExample: items.filter((g) => g.examples.length > 0).length,
  withMeaningJa: items.filter((g) => g.meaningJa.trim().length > 0).length,
  needsMeaningZh: items.filter((g) => g.reviewFlags.includes('needs_meaningZh')).length,
  needsReading: items.filter((g) => g.reviewFlags.includes('needs_reading')).length,
});
