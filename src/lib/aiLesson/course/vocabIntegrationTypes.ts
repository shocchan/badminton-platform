// Phase 3P-2: Excel統合候補のデータモデル。
// 候補は必ずprovenance（workbook hash・シート・行）を持ち、行順に依存するIDは作らない。
// ここは「候補」の型であり、教材本体（VocabularyItem等）への自動昇格は存在しない。

/** 候補の種別。unknownは未意味分類（deferred/rightsシートの行）。 */
export type IntegrationCandidateKind =
  | 'word' | 'onomatopoeia' | 'expression' | 'collocation'
  | 'compound_verb' | 'grammar' | 'sense' | 'unknown';

/** 全登録行が必ず一つ持つ終端状態。「未分類0」=全行がこのいずれかを持つこと。 */
export type IntakeStatus =
  | 'classified'                      // 第一弾: primary分類まで完了
  | 'awaiting_rights_rewrite'         // rightsシート: 非採用・非削除・独自教材へ置換予定
  | 'awaiting_human_semantic_review'  // 機械分類が決められない（人間判断）
  | 'deferred_to_phase'               // 後続Phaseで意味分類
  | 'invalid_source_row'
  | 'duplicate_source_row'
  | 'excluded_by_explicit_rule';

/** 既存140語との突合結果。sense統合・relation化の最終判断は人間。 */
export type IntegrationClassification =
  | 'reuse_existing'        // 既存語と同表記 → sense統合 or relation（人間判断）
  | 'new_sense'             // 同表記だが独立した語義（人間判断で確定）
  | 'new_item'              // 新規語彙候補（本採用は全field完成後）
  | 'expression'            // 表現候補（CourseExpression型で扱う）
  | 'collocation'           // 既存語のコロケーション候補
  | 'new_grammar_pattern'   // 文法パターン候補（grammar側へ）
  | 'conflict'              // 既存データと内容が矛盾（人間判断必須）
  | 'exclude'               // 統合対象外（明示規則によるもののみ。数減らし目的の自動excludeは禁止）
  | 'awaiting_review';      // 未意味分類（deferred/rights行の初期値）

export interface CandidateProvenance {
  workbookSha16: string;
  sheet: string;
  excelRow: number;
}

export interface ExcelIntegrationCandidate {
  /** 元位置ベースの決定的ID（workbook hash+シート+行）。行順の変更で変わらない。 */
  sourceCandidateId: string;
  /** 内容ベースのfingerprint。出典が違う同内容の検出に使う。 */
  contentFingerprint: string;
  provenance: CandidateProvenance & { sourceTextOriginal: string };
  surface: string;
  normalizedCore: string;
  reading: string;
  zh: string;
  example: string;
  note: string;
  candidateType: IntegrationCandidateKind;
  matchedExistingIds: string[];
  relationship: IntegrationClassification;
  intakeStatus: IntakeStatus;
  /** confidenceではなく根拠を文で持つ */
  reason: string;
  requiresHumanDecision: boolean;
  /** 候補は常にdraftから始まる。human_reviewed/approvedはコードから付与しない。 */
  reviewStatus: 'draft' | 'human_review_candidate';
}

/** 定型表現（あいさつ・依頼など）。語彙Itemとは別に管理する。 */
export interface CourseExpression {
  id: string;                 // 安定ID（表記由来ハッシュ。行順ID禁止）
  textJa: string;
  reading: string;
  meaningZh: string;
  situationZh: string;        // どんな場面で使うか（中文）
  exampleJa: string;
  exampleZh: string;
  relatedItemIds: string[];
  reviewStatus: 'draft' | 'human_review_candidate' | 'human_reviewed' | 'approved';
  sourceRef: CandidateProvenance | null;
}

/** コロケーション（語の自然な組み合わせ）。3P-3以降で本格運用。 */
export interface CourseCollocation {
  id: string;
  itemId: string;             // 主となる既存語彙ID
  patternJa: string;          // 例:「約束を守る」
  meaningZh: string;
  exampleJa: string;
  exampleZh: string;
  reviewStatus: 'draft' | 'human_review_candidate' | 'human_reviewed' | 'approved';
  sourceRef: CandidateProvenance | null;
}
