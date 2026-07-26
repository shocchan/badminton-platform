// 日本語のしくみラボ 最小教材モデル（Phase 2A・将来拡張可能な最小責務）
export type FoundationReviewStatus = 'source' | 'draft' | 'beta' | 'approved';
export type FoundationDimension = 'reading' | 'meaning' | 'form' | 'connection' | 'usage';

/** 出典セルと教材項目の関係（CEOレビュー前修正§4） */
export type FoundationSourceMatchType =
  | 'exact_lexeme'        // 見出し語がセルに語彙項目として直接存在
  | 'inflected_form'      // 活用形・変化形として存在
  | 'example_contains'    // 例文・質問文の一部として存在
  | 'related_expression'  // 意味・Can-do上は関連するが同じ語ではない
  | 'external_scope';     // Excelには直接存在せず標準初級範囲から補完

export interface FoundationSourceRef {
  sourceKind: 'teacher_workbook' | 'reviewed_textbook_scope' | 'official_framework';
  sourceSheet: string | null;   // Excel由来ならシート名
  sourceRow: number | null;     // 特定できない場合はnull（行番号・セル範囲を教材IDにしない）
  cellRange?: string | null;    // 例 'C200'。Excel由来で特定済みの場合のみ
  sourceMatchType: FoundationSourceMatchType;
  sourceLabel: string;          // 出典の人間可読ラベル（null黙残し禁止・§7）
}

export interface FoundationItem {
  id: string;                   // 'fi-' + 安定スラッグ（Excel行に非依存）
  lemma: string;
  displayForm: string;
  readingKana: string;
  readingRomaji: string;        // 補助表示のみ（読める判定には使わない）
  partOfSpeech: 'noun' | 'verb' | 'naAdj' | 'iAdj' | 'expression';
  meaningZh: string;
  exampleJa: string;
  exampleZh: string;
  usageNoteZh?: string;         // 中国語母語者向け注意（多義語は将来sense分離）
  sources: FoundationSourceRef[];
  review: FoundationReviewStatus;
}

export interface FoundationRule {
  id: string;
  category: 'copula' | 'particle' | 'sentenceType';
  titleJa: string; titleZh: string;
  explanationJa: string; explanationZh: string;
  review: FoundationReviewStatus;
}

export interface FoundationQuestion {
  id: string;
  targetItemId?: string;
  targetRuleId?: string;
  dimension: FoundationDimension;
  type: 'choice' | 'input' | 'order';
  promptJa: string; promptZh: string;
  choices?: string[];           // choice用
  answerIndex?: number;
  accepted?: string[];          // input用（かな正規化後に比較する許容解答）
  orderTokens?: string[];       // order用（正解順で保持・出題時は決定的シャッフル）
  explanationJa: string; explanationZh: string;
  errorTag: string;
  review: FoundationReviewStatus;
}

export interface FoundationUnit {
  id: string;
  titleJa: string; titleZh: string;
  canDoJa: string[]; canDoZh: string[];
  itemIds: string[]; ruleIds: string[]; questionIds: string[];
  review: FoundationReviewStatus;   // 単元全体の状態（今回はdraft固定）
}
