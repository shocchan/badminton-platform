// 読解問題bankの型（COMPLETION §6）。
//
// 原則:
// - **完全オリジナル**。既存JLPT過去問の複製は行わない
// - 本文を読まないと解けない（一般常識だけで解けない）
// - 正解の根拠が本文中にある（rationaleSpan で明示・機械検査に使う）
// - distractorは本文の別部分に関係する（＝もっともらしいが本文の別箇所の話）

/** JLPTの読解区分。N2/N3で使う正準区分 */
export type ReadingType =
  | 'shortPassage'    // 短文理解
  | 'midPassage'      // 中文理解
  | 'longPassage'     // 長文理解（N3）
  | 'integrated'      // 統合理解（N2）
  | 'thematic'        // 主題理解（N2）
  | 'infoSearch'      // 情報検索
  | 'keyPoint';       // 要点理解（N3）

export const READING_TYPE_LABELS: Record<ReadingType, { ja: string; zh: string }> = {
  shortPassage: { ja: '短文理解', zh: '短文理解' },
  midPassage: { ja: '中文理解', zh: '中篇理解' },
  longPassage: { ja: '長文理解', zh: '长文理解' },
  integrated: { ja: '統合理解', zh: '综合理解' },
  thematic: { ja: '主題理解', zh: '主旨理解' },
  infoSearch: { ja: '情報検索', zh: '信息检索' },
  keyPoint: { ja: '要点理解', zh: '要点理解' },
};

export interface ReadingChoice {
  choiceId: string;
  textJa: string;
  isCorrect: boolean;
  /** 誤答の理由（本文のどこと食い違うか） */
  whyWrongJa?: string;
  whyWrongZh?: string;
}

export interface ReadingSet {
  setId: string;
  sourceLevel: 'N2' | 'N3';
  readingType: ReadingType;
  /** 本文（オリジナル） */
  passageJa: string;
  /** 場面説明（zh画面での導入。日本語本文は翻訳しない＝読解の意味がなくなるため） */
  contextZh: string;
  questionJa: string;
  questionZh: string;
  choices: ReadingChoice[];
  /** 正解の根拠となる本文中の部分文字列（本文に必ず含まれること＝機械検査） */
  rationaleSpan: string;
  explanationJa: string;
  explanationZh: string;
  difficulty: 1 | 2 | 3;
  estimatedSeconds: number;
  reviewState: 'generated_draft' | 'validated_beta' | 'authored';
  variantId: string;
}

/** 出題キー（未出判定・mastery台帳で共有） */
export const readingKeyOf = (s: ReadingSet): string => `read:${s.setId}`;
