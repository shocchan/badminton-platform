// Phase 2A 縦切り単元「自己紹介で使う基本のことば」（draft・しょっちゃんレビュー用）。
// 語彙はExcel（最初に覚える最低限表現/基礎会話練習GW/動詞使用頻度順）と標準初級範囲の照合で選定。
// 例文・解説・問題・中国語訳は独自制作（市販教材の本文コピーなし）。approvedへは人間レビュー後のみ。
import type { FoundationItem, FoundationRule, FoundationQuestion, FoundationUnit } from './foundationTypes';

const WB = 'きそ　〜詞.xlsx';
const src = (sheet: string | null): FoundationItem['sources'] =>
  sheet ? [{ sourceKind: 'teacher_workbook', sourceSheet: sheet, sourceRow: null, note: WB }]
        : [{ sourceKind: 'reviewed_textbook_scope', sourceSheet: null, sourceRow: null, note: '標準初級範囲から補完' }];

export const UNIT1_ITEMS: FoundationItem[] = [
  { id: 'fi-watashi', lemma: '私', displayForm: '私', readingKana: 'わたし', readingRomaji: 'watashi', partOfSpeech: 'noun', meaningZh: '我', exampleJa: '私は王です。', exampleZh: '我姓王。', sources: src('基礎会話練習GW のコピー'), review: 'draft' },
  { id: 'fi-namae', lemma: '名前', displayForm: '名前', readingKana: 'なまえ', readingRomaji: 'namae', partOfSpeech: 'noun', meaningZh: '名字', exampleJa: 'お名前は何ですか。', exampleZh: '您叫什么名字？', sources: src('基礎会話練習GW のコピー'), review: 'draft' },
  { id: 'fi-chugoku', lemma: '中国', displayForm: '中国', readingKana: 'ちゅうごく', readingRomaji: 'chuugoku', partOfSpeech: 'noun', meaningZh: '中国', exampleJa: '中国から来ました。', exampleZh: '我来自中国。', usageNoteZh: '「中国人です」＝我是中国人。', sources: src('最初に覚える最低限表現'), review: 'draft' },
  { id: 'fi-kaisha', lemma: '会社', displayForm: '会社', readingKana: 'かいしゃ', readingRomaji: 'kaisha', partOfSpeech: 'noun', meaningZh: '公司', exampleJa: '会社で働いています。', exampleZh: '我在公司工作。', usageNoteZh: '场所+「で」+动作。', sources: src('最初に覚える最低限表現'), review: 'draft' },
  { id: 'fi-shigoto', lemma: '仕事', displayForm: '仕事', readingKana: 'しごと', readingRomaji: 'shigoto', partOfSpeech: 'noun', meaningZh: '工作（名词）', exampleJa: '仕事は営業です。', exampleZh: '我的工作是销售。', sources: src('最初に覚える最低限表現'), review: 'draft' },
  { id: 'fi-gakusei', lemma: '学生', displayForm: '学生', readingKana: 'がくせい', readingRomaji: 'gakusei', partOfSpeech: 'noun', meaningZh: '学生', exampleJa: '私は学生ではありません。', exampleZh: '我不是学生。', sources: src('基礎会話練習GW のコピー'), review: 'draft' },
  { id: 'fi-sumu', lemma: '住む', displayForm: '住む', readingKana: 'すむ', readingRomaji: 'sumu', partOfSpeech: 'verb', meaningZh: '住', exampleJa: '川口に住んでいます。', exampleZh: '我住在川口。', usageNoteZh: '「〜に住んでいます」（地点用「に」）。', sources: src('動詞使用頻度順'), review: 'draft' },
  { id: 'fi-hataraku', lemma: '働く', displayForm: '働く', readingKana: 'はたらく', readingRomaji: 'hataraku', partOfSpeech: 'verb', meaningZh: '工作（动词）', exampleJa: '会社で働いています。', exampleZh: '我在公司工作。', sources: src('動詞使用頻度順'), review: 'draft' },
  { id: 'fi-benkyo', lemma: '勉強する', displayForm: '勉強する', readingKana: 'べんきょうする', readingRomaji: 'benkyou suru', partOfSpeech: 'verb', meaningZh: '学习', exampleJa: '日本語を勉強しています。', exampleZh: '我在学日语。', usageNoteZh: '与中文「勉强」意思不同。', sources: src('最初に覚える最低限表現'), review: 'draft' },
  { id: 'fi-suki', lemma: '好き', displayForm: '好き', readingKana: 'すき', readingRomaji: 'suki', partOfSpeech: 'naAdj', meaningZh: '喜欢', exampleJa: 'バドミントンが好きです。', exampleZh: '我喜欢羽毛球。', usageNoteZh: '「〜が好きです」（对象用「が」）。', sources: src('頻出表現'), review: 'draft' },
];

export const UNIT1_RULES: FoundationRule[] = [
  { id: 'fr-desu', category: 'copula', titleJa: '名詞＋です／ではありません', titleZh: '名词句「です／ではありません」', explanationJa: '「私は学生です」「私は学生ではありません」。名詞のあとに「です」をつけると、ていねいな文になります。', explanationZh: '名词后加「です」构成礼貌句：「私は学生です」（我是学生）。否定用「ではありません」。', review: 'draft' },
  { id: 'fr-masu', category: 'copula', titleJa: '動詞＋ます', titleZh: '动词「ます」形', explanationJa: '「住みます」「働きます」。動詞を「ます」の形にすると、ていねいな言い方になります。', explanationZh: '动词变成「ます」形表示礼貌：住む→住みます、働く→働きます。', review: 'draft' },
  { id: 'fr-particles', category: 'particle', titleJa: '「は」「で」「に」の基本', titleZh: '助词「は・で・に」的基础', explanationJa: '「私は」＝話題。「会社で働きます」＝動作の場所は「で」。「川口に住んでいます」＝住む場所は「に」。', explanationZh: '「は」提示话题；动作发生的场所用「で」（会社で働きます）；居住的地点用「に」（川口に住んでいます）。', review: 'draft' },
];

export const UNIT1_QUESTIONS: FoundationQuestion[] = [
  // 読み×3
  { id: 'fq-r1', targetItemId: 'fi-hataraku', dimension: 'reading', type: 'choice', promptJa: '「働く」の読みは？', promptZh: '「働く」怎么读？', choices: ['はたらく', 'うごく', 'どうく'], answerIndex: 0, explanationJa: '働く＝はたらく。', explanationZh: '働く读作「はたらく」。', errorTag: 'reading_hataraku', review: 'draft' },
  { id: 'fq-r2', targetItemId: 'fi-shigoto', dimension: 'reading', type: 'choice', promptJa: '「しごと」はどれ？', promptZh: '「しごと」是哪个词？', choices: ['仕事', '学生', '名前'], answerIndex: 0, explanationJa: 'しごと＝仕事。', explanationZh: 'しごと＝仕事（工作）。', errorTag: 'reading_shigoto', review: 'draft' },
  { id: 'fq-r3', targetItemId: 'fi-sumu', dimension: 'reading', type: 'input', promptJa: '「住む」の読みをひらがなで入力してください。', promptZh: '请用平假名输入「住む」的读音。', accepted: ['すむ'], explanationJa: '住む＝すむ。', explanationZh: '住む读作「すむ」。', errorTag: 'reading_sumu', review: 'draft' },
  // 意味×3
  { id: 'fq-m1', targetItemId: 'fi-kaisha', dimension: 'meaning', type: 'choice', promptJa: '「会社」の意味は？', promptZh: '「会社」的意思是？', choices: ['公司', '学校', '医院'], answerIndex: 0, explanationJa: '会社＝公司。', explanationZh: '会社＝公司。', errorTag: 'meaning_kaisha', review: 'draft' },
  { id: 'fq-m2', targetItemId: 'fi-gakusei', dimension: 'meaning', type: 'choice', promptJa: '「学生」はどれ？（中国語から）', promptZh: '“学生”用日语怎么说？', choices: ['学生', '先生', '会社員'], answerIndex: 0, explanationJa: '学生＝がくせい。', explanationZh: '「学生（がくせい）」＝学生。', errorTag: 'meaning_gakusei', review: 'draft' },
  { id: 'fq-m3', targetItemId: 'fi-suki', dimension: 'meaning', type: 'choice', promptJa: '「バドミントンが好きです」の意味は？', promptZh: '「バドミントンが好きです」的意思是？', choices: ['我喜欢羽毛球', '我会打羽毛球', '我想看羽毛球'], answerIndex: 0, explanationJa: '好き＝喜欢。', explanationZh: '「好きです」表示喜欢。', errorTag: 'meaning_suki', review: 'draft' },
  // 形・接続×3
  { id: 'fq-f1', targetRuleId: 'fr-desu', dimension: 'form', type: 'choice', promptJa: '「私は学生＿＿」。正しいのは？', promptZh: '「私は学生＿＿」应该填？', choices: ['です', 'ます', 'で'], answerIndex: 0, explanationJa: '名詞のあとは「です」。', explanationZh: '名词后用「です」。', errorTag: 'copula_desu_masu', review: 'draft' },
  { id: 'fq-f2', targetRuleId: 'fr-particles', dimension: 'connection', type: 'choice', promptJa: '「会社＿＿働いています」。正しい助詞は？', promptZh: '「会社＿＿働いています」应该用哪个助词？', choices: ['で', 'に', 'は'], answerIndex: 0, explanationJa: '動作の場所は「で」。', explanationZh: '动作发生的场所用「で」。', errorTag: 'particle_location_action', review: 'draft' },
  { id: 'fq-f3', targetRuleId: 'fr-masu', dimension: 'form', type: 'choice', promptJa: '「住む」のていねいな形は？', promptZh: '「住む」的礼貌形是？', choices: ['住みます', '住むます', '住みです'], answerIndex: 0, explanationJa: '住む→住みます。', explanationZh: '住む→住みます。', errorTag: 'form_masu_sumu', review: 'draft' },
  // 文中使用×2
  { id: 'fq-u1', targetRuleId: 'fr-desu', dimension: 'usage', type: 'order', promptJa: 'ならべかえて自己紹介の文を作ってください。', promptZh: '请排列成一句自我介绍。', orderTokens: ['私', 'は', 'エンジニア', 'です'], explanationJa: '私＋は＋職業＋です。', explanationZh: '我＋は＋职业＋です。', errorTag: 'usage_order_selfintro', review: 'draft' },
  { id: 'fq-u2', targetRuleId: 'fr-particles', dimension: 'usage', type: 'choice', promptJa: '「川口＿＿住んでいます」。正しいのは？', promptZh: '「川口＿＿住んでいます」应该填？', choices: ['に', 'で', 'を'], answerIndex: 0, explanationJa: '住む場所は「に」。', explanationZh: '居住地点用「に」。', errorTag: 'particle_ni_sumu', review: 'draft' },
];

export const UNIT1: FoundationUnit = {
  id: 'fu-selfintro-1',
  titleJa: '自己紹介で使う基本のことば',
  titleZh: '自我介绍常用词与句型',
  canDoJa: ['自分の名前・出身・仕事や学習状況を短く言える', '「です・ます」で短い自己紹介文を作れる'],
  canDoZh: ['能简短说出自己的名字、来自哪里、工作或学习情况', '能用「です・ます」造简短的自我介绍句'],
  itemIds: UNIT1_ITEMS.map((i) => i.id),
  ruleIds: UNIT1_RULES.map((r) => r.id),
  questionIds: UNIT1_QUESTIONS.map((q) => q.id),
  review: 'draft',
};
