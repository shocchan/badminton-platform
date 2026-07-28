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
  'fi-kaisha': f(['foundation', 'daily_life'], 'japanese_specific', 'medium', '中文说「公司」。日语「会社」是固有词（注意别和「社会」弄混）'),
  'fi-mizu': f(['foundation', 'daily_life'], 'transparent_same', 'high'),
  'fi-yuumei': f(['foundation'], 'transparent_same', 'medium'),
  'fi-kantan': f(['foundation'], 'transparent_same', 'medium'),
  'fi-benri': f(['foundation'], 'transparent_same', 'medium'),
  // 同じ漢字でも意味・用法が異なる（重要学習対象・§41）
  'fi-sensei': f(['foundation', 'conversation_core'], 'false_friend', 'high', '日语「先生」指老师・医生等，不是中文的「先生（Mr.）」'),
  'fi-benkyo': f(['foundation', 'conversation_core'], 'false_friend', 'high', '日语「勉強」是学习的意思，和中文「勉强」不同'),
  'fi-kusuri': f(['foundation', 'daily_life'], 'transparent_same', 'medium', '「吃药」在日语里用「飲む」'),
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

// 二重AIレビュー一致のdraft分類（Phase 2E-1.5 §8・Claude+ChatGPT一致・人間確認待ち 2026-07-27）。
// 不一致の語（fi-kaishain/fi-nihongo/fi-nanji/fi-tomodachi/fi-yasui/fi-genki等）はunreviewedのまま残す。
const AIC = BASE + '。cognateは二重AIレビュー一致のdraft分類（2026-07-27・人間確認待ち）';
const a = (cognate: ChineseCognateType, noteZh?: string): VocabularyLevelMeta =>
  ({ levelTags: ['foundation'], levelConfidence: 'medium', levelEvidence: AIC, cognate, cognateNoteZh: noteZh });
Object.assign(VOCAB_LEVEL_META, {
  // 同形で意味が通じる（transparent）
  'fi-neko': a('transparent_same'), 'fi-ookii': a('transparent_same'), 'fi-chiisai': a('transparent_same'),
  'fi-atarashii': a('transparent_same'), 'fi-furui': a('transparent_same'), 'fi-atsui': a('transparent_same'),
  'fi-samui': a('transparent_same'), 'fi-isogashii': a('transparent_same'), 'fi-muzukashii': a('transparent_same'),
  'fi-chikai': a('transparent_same'), 'fi-tooi': a('transparent_same'), 'fi-ooi': a('transparent_same'),
  'fi-sukunai': a('transparent_same'), 'fi-shizuka': a('transparent_same'), 'fi-ie': a('transparent_same'),
  // 漢字が部分的な手掛かり（partial）
  'fi-namae': a('partial_overlap'), 'fi-kaku': a('partial_overlap'), 'fi-yomu': a('partial_overlap'),
  'fi-kau': a('partial_overlap'), 'fi-kaeru': a('partial_overlap'), 'fi-okiru': a('partial_overlap'),
  'fi-tsukau': a('partial_overlap'), 'fi-tsukuru': a('partial_overlap'), 'fi-au': a('partial_overlap'),
  'fi-neru': a('partial_overlap'), 'fi-hairu': a('partial_overlap'), 'fi-deru': a('partial_overlap'),
  'fi-noru': a('partial_overlap'), 'fi-oriru': a('partial_overlap'), 'fi-okane': a('partial_overlap'),
  'fi-eki': a('partial_overlap'), 'fi-suki': a('partial_overlap'), 'fi-takai': a('partial_overlap'),
  'fi-tanoshii': a('partial_overlap'),
  'fi-densha': a('partial_overlap', '日语「電車」泛指以电力运行的城市・通勤列车，不只是路面电车'),
  // 形が対応しない（japanese_specific / no_cognate）
  'fi-wakaru': a('japanese_specific'), 'fi-shigoto': a('japanese_specific'), 'fi-en': a('japanese_specific'),
  'fi-suru': a('no_cognate'), 'fi-aru': a('no_cognate'), 'fi-iru-exist': a('no_cognate'),
  'fi-ikura': a('no_cognate'), 'fi-ikutsu': a('no_cognate'), 'fi-kore': a('no_cognate'),
  'fi-kudasai': a('no_cognate'), 'fi-oishii': a('no_cognate'), 'fi-basu': a('no_cognate'),
  // 同形異義（false friend・注意書き付き）
  'fi-shusshin': a('false_friend', '中文「出身」多指家庭背景，日语「出身」指出生地・来自哪里'),
  'fi-jouzu': a('false_friend', '中文「上手」是开始做・容易上手的意思，日语「上手」指擅长'),
} satisfies Record<string, VocabularyLevelMeta>);

// ── CEO判断による同源語分類の確定（2026-07-28・field単位ceo_decided→applied_draft） ──
// 分類のみの確定であり、item全体のhuman_reviewed/approvedを意味しない。
const CEO = BASE + '。cognateはCEO判断（2026-07-28・field単位確定）';
const ceo = (cognate: ChineseCognateType, noteZh?: string): VocabularyLevelMeta =>
  ({ levelTags: ['foundation'], levelConfidence: 'high', levelEvidence: CEO, cognate, cognateNoteZh: noteZh });
Object.assign(VOCAB_LEVEL_META, {
  'fi-genki': ceo('partial_overlap'),
  'fi-kaishain': ceo('japanese_specific'),
  'fi-nanji': ceo('partial_overlap'),
  'fi-nihongo': ceo('japanese_specific'),
  'fi-tomodachi': ceo('japanese_specific'),
  'fi-yasui': ceo('false_friend', '日语「安い」表示价格低；中文“安”主要与安全、平安有关，价格低通常说“便宜”'),
} satisfies Record<string, VocabularyLevelMeta>);

// N3準備パック（一括登録・levelEvidence共通・cognateは高確信のみ個別分類）
const N3E = 'N3準備・語彙拡張パック（N3目安・公式断定なし）としての収録。会話/読解の拡張語彙';
const n3 = (cognate: ChineseCognateType = 'unreviewed', conf: LevelConfidence = 'medium', noteZh?: string): VocabularyLevelMeta =>
  ({ levelTags: ['jlpt_n3_estimate', 'conversation_core'], levelConfidence: conf, levelEvidence: N3E, cognate, cognateNoteZh: noteZh });
export const N3_LEVEL_META: Record<string, VocabularyLevelMeta> = {
  'fi-riyuu': n3('transparent_same', 'high'), 'fi-iken': n3('transparent_same', 'high'),
  'fi-keiken': n3('transparent_same', 'high'), 'fi-mondai': n3('transparent_same', 'high'),
  // 以下5語は二重AIレビュー一致で訂正（2026-07-27・draft・人間確認待ち）
  'fi-jouhou': n3('false_friend', 'medium', '中文「情报」多指谍报・机密信息，日语「情報」是一般的信息'),
  'fi-kankei': n3('transparent_same', 'high'),
  'fi-houhou': n3('transparent_same', 'high'), 'fi-jiyuu': n3('transparent_same', 'high'),
  'fi-hitsuyou': n3('transparent_same', 'medium'), 'fi-fukuzatsu': n3('transparent_same', 'high'),
  'fi-shuukan': n3('transparent_same', 'medium', '日语「習慣」多指个人习惯，中文「习惯」也可作动词'),
  'fi-yotei': n3('partial_overlap', 'medium', '中文「预定」多指预订（房间・票），日语「予定」指计划・安排'),
  'fi-joukyou': n3('transparent_same', 'medium'),
  'fi-kyoumi': n3('mostly_same', 'medium', '搭配不同：日语说「興味がある」'),
  'fi-tsugou': n3('false_friend', 'high', '日语「都合」指时间上方便与否，不是中文「都合适」'),
  'fi-muri': n3('partial_overlap', 'medium'), 'fi-taihen': n3('false_friend', 'medium', '日语「大変」主要指辛苦・严重，不是中文「大变」'),
  // 二重AIレビュー一致のdraft分類（2026-07-27・人間確認待ち）。
  // 不一致の語（fi-soudan/fi-kibun/fi-zenzen/fi-yakusoku）はunreviewedのまま・fi-kyoumiは現分類維持で人間レビューへ
  'fi-hajimeru': n3('transparent_same'), 'fi-owaru': n3('transparent_same'), 'fi-kangaeru': n3('transparent_same'),
  'fi-kanjiru': n3('transparent_same'), 'fi-tsutaeru': n3('transparent_same'), 'fi-setsumei': n3('transparent_same'),
  'fi-kakunin': n3('transparent_same'), 'fi-junbi': n3('transparent_same'), 'fi-erabu': n3('transparent_same'),
  'fi-wasureru': n3('transparent_same'), 'fi-kuraberu': n3('transparent_same'), 'fi-nareru': n3('transparent_same'),
  'fi-kanashii': n3('transparent_same'), 'fi-sabishii': n3('transparent_same'), 'fi-kibishii': n3('transparent_same'),
  'fi-kanarazu': n3('transparent_same'), 'fi-saikin': n3('transparent_same'),
  'fi-fueru': n3('partial_overlap'), 'fi-heru': n3('partial_overlap'), 'fi-tsuzukeru': n3('partial_overlap'),
  'fi-tsuzuku': n3('partial_overlap'), 'fi-kimeru': n3('partial_overlap'), 'fi-kimaru': n3('partial_overlap'),
  'fi-omou': n3('partial_overlap'), 'fi-renraku': n3('partial_overlap'), 'fi-shiraberu': n3('partial_overlap'),
  'fi-komaru': n3('partial_overlap'), 'fi-ureshii': n3('partial_overlap'), 'fi-hazukashii': n3('partial_overlap'),
  // CEO判断による確定（2026-07-28・field単位）
  'fi-kibun': n3('japanese_specific', 'high'),
  'fi-soudan': n3('partial_overlap', 'high'),
  'fi-yakusoku': n3('false_friend', 'high', '日语「約束」表示约定、承诺；现代中文“约束”主要表示限制、管束'),
  'fi-zenzen': n3('partial_overlap', 'high'),
  'fi-kawaru': n3('partial_overlap'), 'fi-kaeru-change': n3('partial_overlap'),
  'fi-yoyaku': n3('partial_overlap', 'medium', '预约时间・服务用「予約」；中文订餐厅・酒店・票时常说「预订」'),
  'fi-riyou': n3('mostly_same', 'medium', '中文「利用」常带利己的语感，日语「利用する」是中性的'),
  'fi-oboeru': n3('japanese_specific'), 'fi-ganbaru': n3('japanese_specific'), 'fi-kimochi': n3('japanese_specific'),
  'fi-tabun': n3('no_cognate'), 'fi-nakanaka': n3('no_cognate'), 'fi-yatto': n3('no_cognate'),
  'fi-tsumari': n3('no_cognate'), 'fi-sorede': n3('no_cognate'),
};
// 残りのN3語は unreviewed cognate のまま N3タグを付与（断定しない・§34）
for (const it of N3_ITEMS) if (!N3_LEVEL_META[it.id]) N3_LEVEL_META[it.id] = n3();

export const UNCLASSIFIED_META: VocabularyLevelMeta = {
  levelTags: ['foundation', 'unclassified'], levelConfidence: 'unreviewed',
  levelEvidence: BASE + '（個別レベル・同源語分類は人間レビュー待ち）', cognate: 'unreviewed',
};
export const levelMetaOf = (itemId: string): VocabularyLevelMeta => VOCAB_LEVEL_META[itemId] ?? N3_LEVEL_META[itemId] ?? UNCLASSIFIED_META;
