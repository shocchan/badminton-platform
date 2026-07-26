// 日本語のしくみラボ 最小教材モデル（Phase 2A・将来拡張可能な最小責務）
export type FoundationReviewStatus = 'source' | 'draft' | 'beta' | 'approved';
export type FoundationDimension = 'reading' | 'meaning' | 'form' | 'connection' | 'particle' | 'usage';

/** 問題タイプ（Phase 2B §9）。描画・採点は mechanicOf で4系統に集約する */
export type FoundationQuestionType =
  | 'single_choice' | 'reading_choice' | 'particle_choice' | 'conjugation_choice' | 'sentence_choice'
  | 'error_correction_choice' | 'fill_blank'
  | 'text_input' | 'kana_input' | 'conjugation_input'   // 入力系: エンジンは保持するが利用者向け単元では禁止（§11）
  | 'sentence_order'
  | 'matching';
export type FoundationMechanic = 'choice' | 'input' | 'order' | 'matching';
export const mechanicOf = (t: FoundationQuestionType): FoundationMechanic => {
  switch (t) {
    case 'text_input': case 'kana_input': case 'conjugation_input': return 'input';
    case 'sentence_order': return 'order';
    case 'matching': return 'matching';
    default: return 'choice';
  }
};

/**
 * キーボード入力が必要な問題タイプか（§9/§11）。
 * 利用者向けFoundationUnitではtrueの問題を含めてはならない（教材検証テストで強制）。
 */
export const requiresKeyboard = (t: FoundationQuestionType): boolean => mechanicOf(t) === 'input';

/** Item×次元ごとの候補状態（§12・1回の自力正解ではretainedにしない） */
export type FoundationMasteryState = 'not_seen' | 'familiar' | 'guided' | 'independent' | 'retained';

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
  verbGroup?: 'g1' | 'g2' | 'g3';  // 動詞のみ（一類/二類/三類・帰る等の例外は一類として登録し注記）
  /** 場面カテゴリ（名詞・表現中心・ことば図鑑の場面別分類・§10） */
  sceneCategory?: 'people' | 'life' | 'food' | 'transport' | 'work_school' | 'shopping' | 'health' | 'time_money' | 'selfintro';
  coreLevel?: 'A' | 'B';           // 語彙優先度（Core A=最優先）
  antonymId?: string;              // 反対語Item（形容詞対比・§9）
  imageAssetId?: string;           // VisualAssetManifestのID（画像は差し替え可能・§15）
  meaningZh: string;
  exampleJa: string;
  exampleZh: string;
  usageNoteZh?: string;         // 中国語母語者向け注意
  /** 多義語のsense分離（§6）。単義語は省略可。将来Rule/UsagePatternへ接続 */
  senses?: { id: string; meaningZh: string; noteJa?: string }[];
  sources: FoundationSourceRef[];
  review: FoundationReviewStatus;
}

export interface FoundationRule {
  id: string;
  category: 'copula' | 'particle' | 'sentenceType' | 'verbGroup' | 'conjugation' | 'numberTime' | 'expression';
  titleJa: string; titleZh: string;
  explanationJa: string; explanationZh: string;
  review: FoundationReviewStatus;
}

export interface FoundationQuestion {
  id: string;
  targetItemId?: string;
  targetRuleId?: string;
  dimension: FoundationDimension;
  type: FoundationQuestionType;
  promptJa: string; promptZh: string;
  choices?: string[];           // choice系用（元indexが安定choice ID）
  answerIndex?: number;
  accepted?: string[];          // input系用（正規化後に比較する許容解答・問題ごとに明示）
  orderTokens?: string[];       // sentence_order用（正解順で保持・出題時は決定的シャッフル）
  pairs?: { left: string; right: string }[]; // matching用（正解は同index対応）
  hintJa?: string; hintZh?: string;          // 任意ヒント（使用するとday3候補）
  explanationJa: string; explanationZh: string;
  errorTag: string;
  review: FoundationReviewStatus;
}

export interface FoundationUnit {
  id: string;
  titleJa: string; titleZh: string;
  canDoJa: string[]; canDoZh: string[];
  level: 'N5' | 'N5-N4';
  recommendedWeek: number;          // 24週表示側の推奨週（表示のみ・強制しない）
  estimatedMinutes: number;
  prerequisiteUnitIds: string[];    // ソフト前提（ハードロックしない・§13）
  itemIds: string[]; ruleIds: string[]; questionIds: string[];
  review: FoundationReviewStatus;   // 単元全体の状態（Phase 2Bはdraft固定）
}
