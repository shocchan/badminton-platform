// 語彙コンテンツメタ（Phase 2E-1 §7-§8・全draft）。
// 「単純な訳語（meaningZhShort）」と「日本語として学ぶポイント（learningFocus）」を分離する。
// Sense別cognate上書きは、Item代表分類だけでは誤解が出る多義語に限定する（§7）。
import type { FoundationItem } from './foundationTypes';
import type { ChineseCognateType, LevelConfidence } from './vocabularyLevelMeta';

export type VocabExampleType = 'conversation' | 'daily_life' | 'reading' | 'business' | 'grammar_connection';

export interface VocabContentNote {
  /** 中心意味（短い訳語）。未指定時は meaningZh の第1義を決定的に切り出す */
  meaningZhShort?: string;
  learningFocusJa?: string;
  learningFocusZh?: string;
  exampleType?: VocabExampleType;
}

/** 明示登録した語のみ。未登録語はデフォルト導出（断定を追加しない） */
export const VOCAB_CONTENT_NOTES: Record<string, VocabContentNote> = {
  // ── transparent（意味は推測できる→読みと用法が学習ポイント・§8） ──
  'fi-chugoku': { learningFocusZh: '重点确认日语读音「ちゅうごく」，以及「中国出身です」「中国から来ました」等用法。', exampleType: 'conversation' },
  'fi-nihon': { learningFocusZh: '重点确认读音「にほん」。「日本に住んでいます」等助词搭配。', exampleType: 'conversation' },
  'fi-gakusei': { learningFocusZh: '重点确认读音「がくせい」。', exampleType: 'conversation' },
  'fi-kazoku': { learningFocusZh: '重点确认读音「かぞく」。「家族は中国にいます」的「は/に」。', exampleType: 'conversation' },
  'fi-gakkou': { learningFocusZh: '重点确认读音「がっこう」（注意促音）。', exampleType: 'daily_life' },
  'fi-byouin': { learningFocusZh: '注意长音：「びょういん」（医院）和「びよういん」（美容院）不同。', exampleType: 'daily_life' },
  'fi-mizu': { learningFocusZh: '重点确认读音「みず」（训读，和中文发音无关）。', exampleType: 'daily_life' },
  'fi-yuumei': { learningFocusZh: '重点确认读音「ゆうめい」。修饰名词加「な」：有名な店。', exampleType: 'daily_life' },
  'fi-kantan': { learningFocusZh: '重点确认读音「かんたん」。', exampleType: 'daily_life' },
  'fi-riyuu': { learningFocusZh: '意思和中文一致。重点确认读音「りゆう」（不是りゆ）。', exampleType: 'conversation' },
  'fi-iken': { learningFocusZh: '重点确认读音「いけん」和搭配「意見を言う／聞く」。', exampleType: 'business' },
  'fi-keiken': { learningFocusZh: '重点确认读音「けいけん」和句型「〜た経験があります」。', exampleType: 'conversation' },
  'fi-mondai': { learningFocusZh: '重点确认读音「もんだい」。「問題ありません」是常用回答。', exampleType: 'business' },
  'fi-kankei': { learningFocusZh: '重点确认读音「かんけい」和搭配「〜に関係がある」。', exampleType: 'reading' },
  'fi-houhou': { learningFocusZh: '重点确认读音「ほうほう」（两个长音）。', exampleType: 'reading' },
  'fi-jiyuu': { learningFocusZh: '重点确认读音「じゆう」（注意不是じゅう）。', exampleType: 'daily_life' },
  'fi-fukuzatsu': { learningFocusZh: '重点确认读音「ふくざつ」。修饰名词加「な」。', exampleType: 'daily_life' },
  // ── false friend（意味・使用場面の違いが最優先・§5） ──
  'fi-sensei': { learningFocusZh: '日语「先生」指老师・医生等，不是中文的「先生（Mr.）」。称呼一般男性用「〜さん」。', exampleType: 'conversation' },
  'fi-benkyo': { learningFocusZh: '日语「勉強」是学习的意思，和中文「勉强」完全不同。', exampleType: 'conversation' },
  'fi-tsugou': { meaningZhShort: '情况是否方便；时间安排是否合适', learningFocusZh: '日语的「都合」和中文里的「都合适」不是同一个词。拒绝邀约常说「明日は都合が悪いです」。', exampleType: 'conversation' },
  'fi-taihen': { meaningZhShort: '辛苦；不容易', learningFocusZh: '日语「大変」表示辛苦・严重，不是中文「大变」。听别人诉苦时回应「大変ですね」。', exampleType: 'conversation' },
  // ── 用法・助詞・コロケーションが学習ポイントの語 ──
  'fi-sumu': { meaningZhShort: '居住；住在某个地方', learningFocusZh: '注意表示居住地点时使用助词「に」：東京に住んでいます（常用ています形）。', exampleType: 'conversation' },
  'fi-hataraku': { learningFocusZh: '工作地点用「で」：会社で働いています。', exampleType: 'conversation' },
  'fi-au': { learningFocusZh: '见面对象用「に」：友達に会います（不用「を」）。', exampleType: 'daily_life' },
  'fi-noru': { learningFocusZh: '交通工具用「に」：電車に乗ります（不用「を」）。', exampleType: 'daily_life' },
  'fi-wakaru': { learningFocusZh: '对象用「が」：日本語が分かります（不用「を」）。', exampleType: 'conversation' },
  'fi-suki': { learningFocusZh: '「好き」是な形容词不是动词。对象用「が」：音楽が好きです。', exampleType: 'conversation' },
  'fi-nareru': { learningFocusZh: '对象用「に」：日本の生活に慣れました。', exampleType: 'conversation' },
  'fi-kyoumi': { learningFocusZh: '搭配和中文不同：「〜に興味があります」（对〜感兴趣）。', exampleType: 'conversation' },
  'fi-soudan': { learningFocusZh: '商量对象用「に」或「と」：上司に相談します。', exampleType: 'business' },
  'fi-renraku': { learningFocusZh: '联系对象用「に」：会社に連絡します。', exampleType: 'business' },
  'fi-hitsuyou': { learningFocusZh: '句型「〜が必要です」＝需要〜（主语用が）。', exampleType: 'daily_life' },
  'fi-zenzen': { learningFocusZh: '基本和否定搭配：全然分かりません。口语中「全然大丈夫」也常听到。', exampleType: 'conversation' },
  'fi-kiku': { learningFocusZh: '「聞く」既是听也是问。注意中文「闻」是闻气味，意思不同。', exampleType: 'conversation' },
  'fi-takai': { meaningZhShort: '贵；高', learningFocusZh: '表示价格时中文说「贵」，日语用「高い」（⇔安い）。表示高度时（⇔低い）。', exampleType: 'daily_life' },
  'fi-kibun': { meaningZhShort: '状态；心情好坏', learningFocusZh: '「気分が悪い」多指身体不舒服，和「気持ち」（内心感受）区分。', exampleType: 'conversation' },
  'fi-shuukan': { learningFocusZh: '日语「習慣」是名词。「習慣にする」＝养成习惯。', exampleType: 'daily_life' },
};

const FIRST_SENSE_SPLIT = /[；;]/;
/** 中心意味の決定的導出（明示指定＞meaningZhの第1義）。手計算・別実装を作らない */
export const meaningZhShortOf = (item: FoundationItem): string =>
  VOCAB_CONTENT_NOTES[item.id]?.meaningZhShort ?? item.meaningZh.split(FIRST_SENSE_SPLIT)[0].trim();

export const contentNoteOf = (itemId: string): VocabContentNote | undefined => VOCAB_CONTENT_NOTES[itemId];

/** exampleType（明示指定が無い語は生活場面の既定・断定情報ではなく分類補助） */
export const exampleTypeOf = (itemId: string): VocabExampleType => VOCAB_CONTENT_NOTES[itemId]?.exampleType ?? 'daily_life';

// ── Sense別cognate上書き（§7・多義語限定） ──
export interface SenseCognateOverride {
  senseId: string;
  cognateType: ChineseCognateType;
  learningFocusJa?: string;
  learningFocusZh: string;
  confidence: LevelConfidence;
  reviewStatus: 'draft' | 'unreviewed';
}

/** Item代表分類（vocabularyLevelMeta）を維持しつつ、Senseごとに上書きする語のみ登録 */
export const SENSE_COGNATE_OVERRIDES: Record<string, SenseCognateOverride[]> = {
  'fi-takai': [
    { senseId: 'takai-price', cognateType: 'partial_overlap', learningFocusZh: '表示价格贵。中文不说「价格高い」，日语固定用「高い」（⇔安い）。', confidence: 'high', reviewStatus: 'draft' },
    { senseId: 'takai-height', cognateType: 'mostly_same', learningFocusZh: '表示高度，和中文「高」基本一致（⇔低い）。', confidence: 'high', reviewStatus: 'draft' },
  ],
  'fi-kiku': [
    { senseId: 'kiku-listen', cognateType: 'partial_overlap', learningFocusZh: '表示听：音楽を聞きます。注意中文「闻」是闻气味。', confidence: 'high', reviewStatus: 'draft' },
    { senseId: 'kiku-ask', cognateType: 'japanese_specific', learningFocusZh: '表示问也用「聞く」：先生に聞きます（＝问老师）。', confidence: 'high', reviewStatus: 'draft' },
  ],
  'fi-taihen': [
    { senseId: 'taihen-hard', cognateType: 'false_friend', learningFocusZh: '表示辛苦：仕事が大変です。不是中文「大变」。', confidence: 'high', reviewStatus: 'draft' },
    { senseId: 'taihen-serious', cognateType: 'false_friend', learningFocusZh: '「大変だ！」表示不得了、出事了。', confidence: 'medium', reviewStatus: 'unreviewed' },
  ],
  'fi-tsugou': [
    { senseId: 'tsugou-convenience', cognateType: 'false_friend', learningFocusZh: '「都合がいい／悪い」指时间上方便与否。和中文「都合适」无关。', confidence: 'high', reviewStatus: 'draft' },
    { senseId: 'tsugou-arrangement', cognateType: 'false_friend', learningFocusZh: '「都合により」＝因故（书面语），先了解即可。', confidence: 'medium', reviewStatus: 'unreviewed' },
  ],
};

export const senseOverridesOf = (itemId: string): SenseCognateOverride[] => SENSE_COGNATE_OVERRIDES[itemId] ?? [];

/** Sense集計（§7・Item集計と分離。同一Senseを重複カウントしない） */
export interface SenseCognateSummary {
  itemsWithOverrides: number;
  senseOverrideCount: number;
  unreviewedSenseCount: number;
}
export const aggregateSenseCognates = (): SenseCognateSummary => {
  const entries = Object.values(SENSE_COGNATE_OVERRIDES);
  const senseIds = new Set<string>();
  let unreviewed = 0;
  for (const list of entries) for (const o of list) {
    if (senseIds.has(o.senseId)) continue;  // 重複登録は集計しない（テストで検出）
    senseIds.add(o.senseId);
    if (o.reviewStatus === 'unreviewed') unreviewed += 1;
  }
  return { itemsWithOverrides: entries.length, senseOverrideCount: senseIds.size, unreviewedSenseCount: unreviewed };
};
