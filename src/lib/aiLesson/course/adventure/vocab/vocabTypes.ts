// 語彙の3層モデル（PUBLIC JLPT VOCABULARY HARVESTING POLICY §1）。
//
// A: Candidate Harvest Layer … 公開データから広く集めた「候補」。learnerへ表示しない。
// B: Canonical Vocabulary Layer … kawabado独自の正準語彙bank。レベルは自前で再判定する。
// C: Original Learning Content Layer … 訳・例文・問題・解説はすべて独自作成（別ファイル）。
//
// 他者が作成した単語帳の「選択・配列・訳・例文・問題・解説」をそのまま再現しない。
// 具体的には:
//  - 元リストの順番を canonical へ引き継がない（canonicalは読み順で安定ソートする）
//  - sourceSuggestedLevel をそのまま canonical level にしない（§5の独自判定を通す）
//  - meaning / example / explanation を候補層へ取り込まない（surface・reading・levelのみ）

// ────────────────── A. Candidate Harvest Layer ──────────────────

/** 同一原典から派生した複数repositoryを1つに束ねるためのキー（§2） */
export type SourceFamily =
  | 'tanos-waller'      // 一般に流通するJLPT語彙リスト群（多数の派生repoが存在する）
  | 'jmdict'            // JMdict/EDICT（EDRDG・CC BY-SA）
  | 'kanjidic2'         // KANJIDIC2（EDRDG・CC BY-SA）
  | 'kawabado-internal';// 自社の既存教材（語彙・文法・読解・聴解）

export type SourceLicense =
  | 'permissive'        // MIT等・条件内でimport可
  | 'attribution_share' // CC BY / CC BY-SA 等
  | 'unknown_public'    // 公開されているがライセンス不明 → candidate discoveryのみ
  | 'reference_only';   // 転載禁止等 → 自動取り込みしない

export interface SourceDescriptor {
  sourceId: string;
  sourceFamily: SourceFamily;
  license: SourceLicense;
  /** 取得URL（監査用。learnerへは出さない） */
  origin: string;
  retrievedAt: string;
  /** 何を取り、何を取らなかったか（§1の遵守記録） */
  fieldsTaken: string[];
  fieldsDeliberatelyNotTaken: string[];
  note?: string;
}

export interface VocabCandidate {
  surface: string;
  reading: string;
  /** ソースが主張するレベル。canonicalへそのまま採用しない（§5） */
  sourceSuggestedLevel: 'N5' | 'N4' | 'N3' | 'N2' | 'N1' | null;
  sourceId: string;
  sourceFamily: SourceFamily;
  /** 元リスト内での位置。**canonicalの並びには使わない**（記録のみ・§3B） */
  sourcePosition: number | null;
  retrievedAt: string;
}

// ────────────────── B. Canonical Vocabulary Layer ──────────────────

/** 独自に割り当てる優先度（§5） */
export type VocabPriority = 'core' | 'likely' | 'extended' | 'hold';
export type JlptLevelTag = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export interface VocabSense {
  senseId: string;
  /** 品詞（JMdict由来の分類。訳は取り込まない） */
  partOfSpeech: string[];
  /** この語義を区別するための内部メモ（日本語・独自記述） */
  distinguisherJa: string;
  /** この語義に対して作成済みの学習コンテンツ（層C）があるか */
  hasOriginalContent: boolean;
}

export interface SourceEvidence {
  sourceId: string;
  sourceFamily: SourceFamily;
  suggestedLevel: JlptLevelTag | null;
}

export interface CanonicalVocabWord {
  wordId: string;
  canonicalSurface: string;
  /** 異表記（送り仮名違い・旧字体・かな書き等） */
  aliases: string[];
  reading: string;
  senses: VocabSense[];
  /** 独自に判定したレベル（sourceSuggestedLevelをそのまま採らない） */
  independentlyAssignedLevel: JlptLevelTag;
  levelConfidence: 'high' | 'medium' | 'low';
  priority: VocabPriority;
  /** N3learnerはN5+N4+N3、N2learnerはN5〜N2 が必要（§4） */
  cumulativeLevel: JlptLevelTag[];
  sourceEvidence: SourceEvidence[];
  /** 独立した根拠の数（同一familyは1として数える・§2） */
  sourceFamilyCount: number;
  /** なぜこの語をbankへ入れたか */
  inclusionReason: string;
  /** レベルが割れている場合の記録（§5） */
  levelConflict: { sources: JlptLevelTag[]; alsoRequiredFor: JlptLevelTag[] } | null;
  /** 頻度の目安（JMdictのpriorityマーカー由来） */
  frequencyRank: 'very_common' | 'common' | 'uncommon' | 'unknown';
  /** 含まれる漢字の最大学年（KANJIDIC2）。かな語はnull */
  maxKanjiGrade: number | null;
  /** 自社教材での出現（文法例文・読解本文・聴解原稿・既存語彙） */
  internalOccurrences: number;
  reviewState: 'candidate' | 'canonical_draft' | 'active_beta' | 'hold' | 'human_review_candidate';
}

// ────────────────── 出題形式（§7・§8） ──────────────────

/** JLPT試験ルートで **activeに許可される** 出題形式。すべて選択式 */
export type ExamQuestionFormat =
  | 'singleChoice3'
  | 'singleChoice4'
  | 'listeningChoice3'
  | 'listeningChoice4'
  | 'sentenceCompositionChoice'
  | 'orderedChoice';

export const ACTIVE_EXAM_FORMATS: ExamQuestionFormat[] = [
  'singleChoice3', 'singleChoice4', 'listeningChoice3', 'listeningChoice4',
  'sentenceCompositionChoice', 'orderedChoice',
];

/** JLPT試験ルートで **禁止** の形式（自由入力）。AI会話・言い直し・実践練習にのみ残す */
export const FORBIDDEN_EXAM_FORMATS = [
  'freeText', 'textInput', 'typedReading', 'typedKanji', 'typedSentence', 'keyboardAnswer', 'openEnded',
] as const;
export type ForbiddenExamFormat = typeof FORBIDDEN_EXAM_FORMATS[number];

/** 語彙問題の観点（§8） */
export type VocabQuestionAspect =
  | 'kanjiReading'      // 漢字読み
  | 'correctOrthography'// 正しい表記
  | 'contextualUsage'   // 文脈規定
  | 'paraphrase'        // 言い換え
  | 'usage'             // 用法
  | 'wordFormation'     // 語形成
  | 'inReading'         // 読解内理解
  | 'inListening';      // 聴解内理解

export const VOCAB_ASPECT_LABELS: Record<VocabQuestionAspect, { ja: string; zh: string }> = {
  kanjiReading: { ja: '漢字読み', zh: '汉字读法' },
  correctOrthography: { ja: '正しい表記', zh: '正确写法' },
  contextualUsage: { ja: '文脈規定', zh: '语境判断' },
  paraphrase: { ja: '言い換え', zh: '同义替换' },
  usage: { ja: '用法', zh: '用法' },
  wordFormation: { ja: '語形成', zh: '构词' },
  inReading: { ja: '読解内理解', zh: '阅读中理解' },
  inListening: { ja: '聴解内理解', zh: '听力中理解' },
};

/** priority別の目標観点数（§8）。全語へ機械的に同数作らない */
export const ASPECT_TARGET_BY_PRIORITY: Record<VocabPriority, { min: number; max: number }> = {
  core: { min: 4, max: 6 },
  likely: { min: 3, max: 5 },
  extended: { min: 2, max: 3 },
  hold: { min: 0, max: 0 },
};

// ────────────────── 完了判定（§12） ──────────────────

export interface VocabCompletionFlags {
  /** 公開候補の収集と統合が完了 */
  vocabularyHarvestComplete: boolean;
  /** Sense・読み・レベル・根拠の正準化が完了 */
  canonicalBankComplete: boolean;
  /** CORE語の必要問題形式が揃っている */
  coreQuestionCoverageComplete: boolean;
  /** N2／N3累積範囲で active question coverage が完了 */
  examVocabularyCoverageComplete: boolean;
}
