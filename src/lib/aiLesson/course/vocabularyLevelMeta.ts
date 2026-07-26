// 語彙レベル・中国語同源語メタデータ（Phase 2C++ §34/§39・Itemと分離して管理）。
// JLPTは「目安」であり公式断定をしない（§34）。確信が低い項目はunreviewedのまま残す（§52）。
// Excelシート名だけを根拠にレベルを自動確定しない。
export type VocabularyLevelTag =
  | 'foundation' | 'jlpt_n5_estimate' | 'jlpt_n4_estimate' | 'jlpt_n3_estimate'
  | 'jlpt_n2_estimate' | 'jlpt_n1_estimate' | 'daily_life' | 'conversation_core' | 'business' | 'unclassified';
export type LevelConfidence = 'high' | 'medium' | 'low' | 'unreviewed';
import { N3_ITEMS } from './foundationVocabN3';
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

// N3準備パック（一括登録・levelEvidence共通・cognateは高確信のみ個別分類）
const N3E = 'N3準備・語彙拡張パック（N3目安・公式断定なし）としての収録。会話/読解の拡張語彙';
const n3 = (cognate: ChineseCognateType = 'unreviewed', conf: LevelConfidence = 'medium', noteZh?: string): VocabularyLevelMeta =>
  ({ levelTags: ['jlpt_n3_estimate', 'conversation_core'], levelConfidence: conf, levelEvidence: N3E, cognate, cognateNoteZh: noteZh });
export const N3_LEVEL_META: Record<string, VocabularyLevelMeta> = {
  'fi-riyuu': n3('transparent_same', 'high'), 'fi-iken': n3('transparent_same', 'high'),
  'fi-keiken': n3('transparent_same', 'high'), 'fi-mondai': n3('transparent_same', 'high'),
  'fi-jouhou': n3('mostly_same', 'medium'), 'fi-kankei': n3('transparent_same', 'high'),
  'fi-houhou': n3('transparent_same', 'high'), 'fi-jiyuu': n3('transparent_same', 'high'),
  'fi-hitsuyou': n3('mostly_same', 'medium'), 'fi-fukuzatsu': n3('transparent_same', 'high'),
  'fi-shuukan': n3('mostly_same', 'medium', '日语「習慣」多指个人习惯，中文「习惯」也可作动词'),
  'fi-yotei': n3('mostly_same', 'medium'), 'fi-joukyou': n3('mostly_same', 'medium'),
  'fi-kyoumi': n3('mostly_same', 'medium', '搭配不同：日语说「興味がある」'),
  'fi-tsugou': n3('false_friend', 'high', '日语「都合」指时间上方便与否，不是中文「都合适」'),
  'fi-muri': n3('partial_overlap', 'medium'), 'fi-taihen': n3('false_friend', 'medium', '日语「大変」主要指辛苦・严重，不是中文「大变」'),
};
// 残りのN3語は unreviewed cognate のまま N3タグを付与（断定しない・§34）
for (const it of N3_ITEMS) if (!N3_LEVEL_META[it.id]) N3_LEVEL_META[it.id] = n3();

export const UNCLASSIFIED_META: VocabularyLevelMeta = {
  levelTags: ['foundation', 'unclassified'], levelConfidence: 'unreviewed',
  levelEvidence: BASE + '（個別レベル・同源語分類は人間レビュー待ち）', cognate: 'unreviewed',
};
export const levelMetaOf = (itemId: string): VocabularyLevelMeta => VOCAB_LEVEL_META[itemId] ?? N3_LEVEL_META[itemId] ?? UNCLASSIFIED_META;
