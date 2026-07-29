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
  'fi-kyoumi': { learningFocusZh: '搭配和中文不同：「〜に興味があります」（对〜感兴趣）。现代中文也有“兴味”，但较书面，日常更常说“兴趣”。', exampleType: 'conversation' },
  'fi-soudan': { learningFocusZh: '商量对象用「に」或「と」：上司に相談します。现代中文日常多说“商量”或“咨询”。中文“相谈”即使出现，也不完全等同于日语“相談する”。', exampleType: 'business' },
  'fi-renraku': { learningFocusZh: '联系对象用「に」：会社に連絡します。', exampleType: 'business' },
  'fi-hitsuyou': { learningFocusZh: '句型「〜が必要です」＝需要〜（主语用が）。', exampleType: 'daily_life' },
  'fi-zenzen': { learningFocusZh: '中文“全然”表示完全、全部，较偏书面。日语「全然」常和否定表达搭配（全然分かりません），口语中也会出现「全然大丈夫」等肯定用法。', exampleType: 'conversation' },
  'fi-kiku': { learningFocusZh: '「聞く」既是听也是问。注意中文「闻」是闻气味，意思不同。', exampleType: 'conversation' },
  'fi-takai': { meaningZhShort: '贵；高', learningFocusZh: '表示价格时中文说「贵」，日语用「高い」（⇔安い）。表示高度时（⇔低い）。', exampleType: 'daily_life' },
  'fi-kibun': { meaningZhShort: '状态；心情好坏', learningFocusZh: '「気分が悪い」多指身体不舒服，和「気持ち」（内心感受）区分。', exampleType: 'conversation' },
  'fi-shuukan': { learningFocusZh: '日语「習慣」是名词。「習慣にする」＝养成习惯。', exampleType: 'daily_life' },
  // ── 二重AIレビュー一致で追加した注記（Phase 2E-1.5 §8・draft・人間確認待ち） ──
  'fi-densha': { learningFocusZh: '日语「電車」泛指以电力运行的城市・通勤列车，不只是路面电车。', exampleType: 'daily_life' },
  'fi-ikutsu': { learningFocusZh: '「いくつ」既可问数量，也可问年龄，具体意思由上下文决定。', exampleType: 'conversation' },
  'fi-kudasai': { learningFocusZh: '名词后用「〜をください」＝请给我〜；动词后用「〜てください」＝请做〜。', exampleType: 'conversation' },
  'fi-tanoshii': { learningFocusZh: '「楽しい」既可表示心情愉快，也可表示活动有趣・令人享受。', exampleType: 'daily_life' },
  'fi-jouzu': { learningFocusZh: '「上手」评价技能，常用「〜が上手です」；夸自己一般不用。和中文「上手（开始做）」不同。', exampleType: 'conversation' },
  'fi-yoyaku': { learningFocusZh: '预约时间・服务用「予約する」；中文订餐厅・酒店・票时常说「预订」。', exampleType: 'daily_life' },
  'fi-tsuzukeru': { learningFocusZh: '「続ける」强调主动让动作继续，不一定含「坚持」的意志色彩。', exampleType: 'daily_life' },
  'fi-kimochi': { learningFocusZh: '「感謝の気持ち」更接近中文的"感谢之情・心意"。', exampleType: 'conversation' },
  'fi-yotei': { learningFocusZh: '「予定」既表示计划，也表示已安排好的日程。中文「预定」多指预订。', exampleType: 'daily_life' },
  'fi-sorede': { learningFocusZh: '「それで」连接前因后果；口语中也可用来催促对方继续说。', exampleType: 'conversation' },

  // ── CEO判断による同源語の学習ポイント（2026-07-28・field単位ceo_decided） ──
  'fi-genki': { learningFocusZh: '中文“元气”主要表示活力、精神或生命力；日语「元気」还常用于询问和表达身体状况、精神状态。', exampleType: 'conversation' },
  'fi-kaishain': { learningFocusZh: '中文通常说“公司职员”或“上班族”，不使用“会社员”这一词形。', exampleType: 'conversation' },
  'fi-nanji': { learningFocusZh: '日语「何時」主要询问具体的时刻，相当于“几点”；中文“何时”通常相当于“什么时候”，范围更广。', exampleType: 'conversation' },
  'fi-nihongo': { learningFocusZh: '中文通常说“日语”，不使用“日本语”作为一般词形。', exampleType: 'conversation' },
  'fi-tomodachi': { learningFocusZh: '中文通常说“朋友”，不使用“友达”这一词形。', exampleType: 'conversation' },
  'fi-yakusoku': { learningFocusZh: '日语「約束」表示约定、承诺；现代中文“约束”主要表示限制、管束。', exampleType: 'conversation' },
  'fi-yasui': { learningFocusZh: '日语「安い」表示价格低；中文“安”主要与安全、平安有关，价格低通常说“便宜”。', exampleType: 'daily_life' },
  // ── 意味範囲のズレ（partial_overlap）: 中文一词对应日语多词、自他区分等（夜間ブラッシュアップ2026-07-30・draft） ──
  'fi-miru': { learningFocusZh: '中文的「看」范围很宽：看电视・电影用「見る」，看书・看报用「読む」，看医生是「診てもらう」。', exampleType: 'daily_life' },
  'fi-yomu': { learningFocusZh: '中文常说「看书」，日语必须用「読む」：本を読む（不能说 本を見る）。', exampleType: 'daily_life' },
  'fi-hanasu': { learningFocusZh: '「話す」是交谈・说（语言）：日本語で話す。转述别人说了什么时多用「言う」。', exampleType: 'conversation' },
  'fi-kaku': { learningFocusZh: '写字・写文章用「書く」。注意中文「写作业」日语说「宿題をする」，不说「宿題を書く」。', exampleType: 'daily_life' },
  'fi-tsukau': { learningFocusZh: '中文「用筷子吃」的“用”在日语里是助词「で」：はしで食べます。动词「使う」：はしを使います。', exampleType: 'daily_life' },
  'fi-tsukuru': { learningFocusZh: '中文的「做」范围很宽：做饭・做东西用「作る」，做作业・做工作用「する」。', exampleType: 'daily_life' },
  'fi-neru': { learningFocusZh: '「寝る」=睡觉，也含“躺下”。中文「睡不着」用另一个词：「眠れない」。', exampleType: 'daily_life' },
  'fi-eki': { learningFocusZh: '「駅」只指电车・地铁站。公交车站叫「バス停」，不叫駅。中文「车站」两者都可以。', exampleType: 'daily_life' },
  'fi-okane': { learningFocusZh: '日常固定说「お金」（お是礼貌前缀）。单说「金（かね）」口语里显得粗。', exampleType: 'daily_life' },
  'fi-fueru': { learningFocusZh: '自动词：人が増える（不带宾语）。“把〜增加”用他动词「増やす」。中文「增加」不分自他。', exampleType: 'grammar_connection' },
  'fi-heru': { learningFocusZh: '自动词：客が減る。他动词是「減らす」。惯用：「お腹が減った」=肚子饿了。', exampleType: 'grammar_connection' },
  'fi-tsuzuku': { learningFocusZh: '自动词：雨が続く。“坚持做〜”用他动词「続ける」：勉強を続ける。', exampleType: 'grammar_connection' },
  'fi-kimeru': { learningFocusZh: '他动词：行く日を決める（人来决定）。“定下来了”用自动词「決まる」。', exampleType: 'grammar_connection' },
  'fi-kimaru': { learningFocusZh: '自动词：仕事が決まりました=工作定下来了（报告好消息的常用形）。人做决定用「決める」。', exampleType: 'conversation' },
  'fi-shiraberu': { learningFocusZh: '查词典・上网查资料都用「調べる」。中文「调查」语感偏重，日常的“查一下”就是「調べる」。', exampleType: 'daily_life' },
  'fi-ureshii': { learningFocusZh: '「嬉しい」说自己当下的心情。形容别人要说「嬉しそう」（看起来很高兴），不直接说 彼は嬉しい。', exampleType: 'conversation' },
  'fi-hazukashii': { learningFocusZh: '既是“害羞”也是“难为情・丢脸”，比中文「羞耻」日常得多，多用于说自己。', exampleType: 'conversation' },
  // ── 日本語特有（japanese_specific）: 中文に直接対応が無い使い方（同上・draft） ──
  'fi-en': { learningFocusZh: '读「えん」，不读中文的 yuán。金额直接加円：1000円（せんえん）。', exampleType: 'daily_life' },
  'fi-shigoto': { learningFocusZh: '「仕事」是名词：仕事が忙しい。要当动词用时说「働く」或「仕事をする」。中文「工作」名动皆可。', exampleType: 'business' },
  'fi-oboeru': { learningFocusZh: '「覚える」=把新东西记住・学会：単語を覚える。“我还记得”用「覚えています」。', exampleType: 'daily_life' },
  'fi-ganbaru': { learningFocusZh: '日本文化高频词：鼓励别人「頑張ってください」，回应「頑張ります」。中文里没有完全对应的寒暄用法。', exampleType: 'conversation' },
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
}
