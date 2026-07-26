// 語彙レベル・中国語同源語メタデータ（Phase 2C++ §34/§39・Itemと分離して管理）。
// JLPTは「目安」であり公式断定をしない（§34）。確信が低い項目はunreviewedのまま残す（§52）。
// Excelシート名だけを根拠にレベルを自動確定しない。
export type VocabularyLevelTag =
  | 'foundation' | 'jlpt_n5_estimate' | 'jlpt_n4_estimate' | 'jlpt_n3_estimate'
  | 'jlpt_n2_estimate' | 'jlpt_n1_estimate' | 'daily_life' | 'conversation_core' | 'business' | 'unclassified';
export type LevelConfidence = 'high' | 'medium' | 'low' | 'unreviewed';
export type ChineseCognateType =
  | 'transparent_same' | 'mostly_same' | 'partial_overlap' | 'false_friend'
  | 'japanese_specific' | 'no_cognate' | 'unreviewed';

export interface VocabularyLevelMeta {
  levelTags: VocabularyLevelTag[];
  levelConfidence: LevelConfidence;
  levelEvidence: string;               // 分類の根拠（人間レビュー用・利用者へ非表示）
  cognate: ChineseCognateType;
  cognateNoteZh?: string;              // false friend等の短い注意（レビュー済みのみ表示・§41）
}

const BASE = '現在の78語は基礎・生活語彙MVP（自己紹介〜生活場面の初期パック）としての収録';
const f = (tags: VocabularyLevelTag[], cognate: ChineseCognateType, conf: LevelConfidence = 'medium', noteZh?: string): VocabularyLevelMeta =>
  ({ levelTags: tags, levelConfidence: conf, levelEvidence: BASE, cognate, cognateNoteZh: noteZh });

/** 明示的に分類した語のみ登録。未登録語は unclassified/unreviewed として扱う（断定しない） */
export const VOCAB_LEVEL_META: Record<string, VocabularyLevelMeta> = {
  // 漢字・意味が中国語とほぼ共通（読みと使い方が学習ポイント・§40）
  'fi-chugoku': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-nihon': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-gakusei': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-kazoku': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-gakkou': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-byouin': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-kaisha': f(['foundation', 'daily_life'], 'mostly_same', 'medium'),
  'fi-mizu': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-yuumei': f(['foundation'], 'transparent_same', 'medium'),
  'fi-kantan': f(['foundation'], 'transparent_same', 'medium'),
  'fi-benri': f(['foundation'], 'mostly_same', 'medium'),
  // 同じ漢字でも意味・用法が異なる（重要学習対象・§41）
  'fi-sensei': f(['foundation', 'conversation_core'], 'false_friend', 'high', '日语「先生」指老师・医生等，不是中文的「先生（Mr.）」'),
  'fi-benkyo': f(['foundation', 'conversation_core'], 'false_friend', 'high', '日语「勉強」是学习的意思，和中文「勉强」不同'),
  'fi-kusuri': f(['foundation', 'daily_life'], 'mostly_same', 'medium', '「吃药」在日语里用「飲む」'),
  // 会話コア動詞（読み・活用・助詞が学習ポイント）
  'fi-iku': f(['foundation', 'conversation_core'], 'partial_overlap', 'medium'),
  'fi-kuru': f(['foundation', 'conversation_core'], 'partial_overlap', 'medium'),
  'fi-sumu': f(['foundation', 'conversation_core'], 'japanese_specific', 'medium'),
  'fi-hataraku': f(['foundation', 'conversation_core'], 'japanese_specific', 'medium'),
  'fi-taberu': f(['foundation', 'conversation_core'], 'no_cognate', 'medium'),
  'fi-nomu': f(['foundation', 'conversation_core'], 'no_cognate', 'medium'),
  'fi-miru': f(['foundation', 'conversation_core'], 'partial_overlap', 'medium'),
  'fi-kiku': f(['foundation', 'conversation_core'], 'partial_overlap', 'medium'),
  'fi-hanasu': f(['foundation', 'conversation_core'], 'partial_overlap', 'medium'),
};

export const UNCLASSIFIED_META: VocabularyLevelMeta = {
  levelTags: ['foundation', 'unclassified'], levelConfidence: 'unreviewed',
  levelEvidence: BASE + '（個別レベル・同源語分類は人間レビュー待ち）', cognate: 'unreviewed',
};
export const levelMetaOf = (itemId: string): VocabularyLevelMeta => VOCAB_LEVEL_META[itemId] ?? UNCLASSIFIED_META;
