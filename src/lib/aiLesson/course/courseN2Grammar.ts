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
  // ── 原本に無い＝人間/レビューで追加（未確定・任意） ──
  reading?: string;
  meaningZh?: string;
  functionCategory?: string;
  connection?: string;
  nuanceJa?: string;
  nuanceZh?: string;
  similarGrammarIds?: string[];
  differences?: string;
  commonMistakes?: string[];
  substitutionTemplate?: string;
  linkedMissionIds?: string[];
}

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
