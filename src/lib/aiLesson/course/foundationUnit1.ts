// Phase 2A 第1単元「自己紹介で使う基本のことば」（CEOレビュー前修正版・全draft）。
// 中心表現=「〜に住んでいます／〜で働いています／〜を勉強しています」（自己紹介の重要なまとまり）。
// て形の全変形・ているの全用法は扱わない（§4）。「好き」は自己紹介②（趣味）単元へ移動。
import type { FoundationItem, FoundationRule, FoundationQuestion, FoundationUnit } from './foundationTypes';

const WB = 'きそ　〜詞.xlsx';
type Ref = FoundationItem['sources'][number];
const xls = (sheet: string, row: number | null, label?: string): Ref =>
  ({ sourceKind: 'teacher_workbook', sourceSheet: sheet, sourceRow: row, note: label ?? WB });
const std = (label: string): Ref =>
  ({ sourceKind: 'reviewed_textbook_scope', sourceSheet: null, sourceRow: null, note: label });

export const UNIT1_ITEMS: FoundationItem[] = [
  { id: 'fi-namae', lemma: '名前', displayForm: '名前', readingKana: 'なまえ', readingRomaji: 'namae', partOfSpeech: 'noun', meaningZh: '名字', exampleJa: '名前は王です。', exampleZh: '我姓王。', usageNoteZh: '日语常省略「私は」。', sources: [xls('基礎会話練習GW のコピー', 2)], review: 'draft' },
  { id: 'fi-shusshin', lemma: '出身', displayForm: '出身', readingKana: 'しゅっしん', readingRomaji: 'shusshin', partOfSpeech: 'noun', meaningZh: '出身・老家', exampleJa: '中国出身です。', exampleZh: '我来自中国。', usageNoteZh: '「〇〇出身です」＝我是〇〇人/来自〇〇。', sources: [xls('基礎会話練習GW のコピー', 3, '「どこから来ましたか」の答え方として'), std('標準初級（自己紹介）範囲から補完')], review: 'draft' },
  { id: 'fi-chugoku', lemma: '中国', displayForm: '中国', readingKana: 'ちゅうごく', readingRomaji: 'chuugoku', partOfSpeech: 'noun', meaningZh: '中国', exampleJa: '中国出身です。', exampleZh: '我来自中国。', sources: [std('標準初級範囲（国名）'), xls('最初に覚える最低限表現', null, '国名としての単独行は未特定・要人間確認')], review: 'draft' },
  { id: 'fi-nihon', lemma: '日本', displayForm: '日本', readingKana: 'にほん', readingRomaji: 'nihon', partOfSpeech: 'noun', meaningZh: '日本', exampleJa: '日本に住んでいます。', exampleZh: '我住在日本。', sources: [std('標準初級範囲（国名）')], review: 'draft' },
  { id: 'fi-gakusei', lemma: '学生', displayForm: '学生', readingKana: 'がくせい', readingRomaji: 'gakusei', partOfSpeech: 'noun', meaningZh: '学生', exampleJa: '学生です。', exampleZh: '我是学生。', sources: [xls('最初に覚える最低限表現', 326, '例文「私は学生です。」内')], review: 'draft' },
  { id: 'fi-kaishain', lemma: '会社員', displayForm: '会社員', readingKana: 'かいしゃいん', readingRomaji: 'kaishain', partOfSpeech: 'noun', meaningZh: '公司职员', exampleJa: '会社員です。', exampleZh: '我是公司职员。', sources: [std('標準初級範囲（職業）')], review: 'draft' },
  { id: 'fi-kaisha', lemma: '会社', displayForm: '会社', readingKana: 'かいしゃ', readingRomaji: 'kaisha', partOfSpeech: 'noun', meaningZh: '公司', exampleJa: '会社で働いています。', exampleZh: '我在公司工作。', usageNoteZh: '动作场所用「で」。', sources: [xls('最初に覚える最低限表現', 72)], review: 'draft' },
  { id: 'fi-nihongo', lemma: '日本語', displayForm: '日本語', readingKana: 'にほんご', readingRomaji: 'nihongo', partOfSpeech: 'noun', meaningZh: '日语', exampleJa: '日本語を勉強しています。', exampleZh: '我在学日语。', usageNoteZh: '学习对象用「を」。', sources: [xls('最初に覚える最低限表現', 3)], review: 'draft' },
  { id: 'fi-sumu', lemma: '住む', displayForm: '住む', readingKana: 'すむ', readingRomaji: 'sumu', partOfSpeech: 'verb', meaningZh: '住', exampleJa: '日本に住んでいます。', exampleZh: '我住在日本。', usageNoteZh: '现在住着＝「住んでいます」。「住みます」听起来像今后的打算。地点用「に」。', sources: [xls('動詞使用頻度順', null, '原型表記の行未特定・要人間確認')], review: 'draft' },
  { id: 'fi-hataraku', lemma: '働く', displayForm: '働く', readingKana: 'はたらく', readingRomaji: 'hataraku', partOfSpeech: 'verb', meaningZh: '工作（动词）', exampleJa: '会社で働いています。', exampleZh: '我在公司工作。', usageNoteZh: '现在的工作状态＝「働いています」。「働きます」可能被理解为今后的安排。', sources: [xls('動詞使用頻度順', null, '原型表記の行未特定・要人間確認')], review: 'draft' },
  { id: 'fi-benkyo', lemma: '勉強する', displayForm: '勉強する', readingKana: 'べんきょうする', readingRomaji: 'benkyou suru', partOfSpeech: 'verb', meaningZh: '学习', exampleJa: '日本語を勉強しています。', exampleZh: '我在学日语。', usageNoteZh: '与中文「勉强」意思不同。正在学＝「勉強しています」。', sources: [xls('最初に覚える最低限表現', null, '学習系表現ブロック内・行未特定・要人間確認')], review: 'draft' },
];

export const UNIT1_RULES: FoundationRule[] = [
  { id: 'fr-desu', category: 'copula', titleJa: '名詞＋です／ではありません', titleZh: '名词句「です／ではありません」', explanationJa: '「学生です」「会社員です」「中国出身です」。名詞のあとに「です」で、ていねいな文になります。否定は「学生ではありません」。日本語では「私は」をよく省略します。', explanationZh: '名词后加「です」构成礼貌句：「学生です」「中国出身です」。否定用「ではありません」。日语中「私は」经常省略。', review: 'draft' },
  { id: 'fr-teimasu', category: 'copula', titleJa: '自己紹介の「〜ています」', titleZh: '自我介绍中的「〜ています」', explanationJa: '今の生活を言うときは「〜ています」のまとまりを使います。「日本に住んでいます」「会社で働いています」「日本語を勉強しています」。「日本に住みます」は、これから住む予定のように聞こえることがあります。今回はこの3つのまとまりをそのまま覚えましょう。', explanationZh: '说现在的生活状态时用「〜ています」：「日本に住んでいます」（现在住在日本）「会社で働いています」「日本語を勉強しています」。「住みます」听起来像今后打算去住。本单元先把这3个固定说法整体记住即可。', review: 'draft' },
  { id: 'fr-particles', category: 'particle', titleJa: '「は」「に」「で」「を」の基本', titleZh: '助词「は・に・で・を」的基础', explanationJa: '「名前は〜」＝話題。住む場所は「に」（日本に住んでいます）。働く場所は「で」（会社で働いています）。勉強するものは「を」（日本語を勉強しています）。', explanationZh: '「は」提示话题；居住地点用「に」；动作场所用「で」；学习的对象用「を」。', review: 'draft' },
];

export const UNIT1_QUESTIONS: FoundationQuestion[] = [
  // 読み×3
  { id: 'fq-r1', targetItemId: 'fi-hataraku', dimension: 'reading', type: 'choice', promptJa: '「働く」の読みは？', promptZh: '「働く」怎么读？', choices: ['はたらく', 'うごく', 'どうく'], answerIndex: 0, explanationJa: '働く＝はたらく。', explanationZh: '働く读作「はたらく」。', errorTag: 'reading_hataraku', review: 'draft' },
  { id: 'fq-r2', targetItemId: 'fi-shusshin', dimension: 'reading', type: 'choice', promptJa: '「出身」の読みは？', promptZh: '「出身」怎么读？', choices: ['しゅっしん', 'でみ', 'しゅつみ'], answerIndex: 0, explanationJa: '出身＝しゅっしん。', explanationZh: '出身读作「しゅっしん」。', errorTag: 'reading_shusshin', review: 'draft' },
  { id: 'fq-r3', targetItemId: 'fi-sumu', dimension: 'reading', type: 'input', promptJa: '「住む」の読みをひらがなで入力してください。', promptZh: '请用平假名输入「住む」的读音。', accepted: ['すむ'], explanationJa: '住む＝すむ。', explanationZh: '住む读作「すむ」。', errorTag: 'reading_sumu', review: 'draft' },
  // 意味×3
  { id: 'fq-m1', targetItemId: 'fi-kaisha', dimension: 'meaning', type: 'choice', promptJa: '「会社」の意味は？', promptZh: '「会社」的意思是？', choices: ['公司', '学校', '医院'], answerIndex: 0, explanationJa: '会社＝公司。', explanationZh: '会社＝公司。', errorTag: 'meaning_kaisha', review: 'draft' },
  { id: 'fq-m2', targetItemId: 'fi-kaishain', dimension: 'meaning', type: 'choice', promptJa: '“公司职员”は日本語で？', promptZh: '“公司职员”用日语怎么说？', choices: ['会社員', '学生', '先生'], answerIndex: 0, explanationJa: '会社員＝公司职员。', explanationZh: '「会社員（かいしゃいん）」＝公司职员。', errorTag: 'meaning_kaishain', review: 'draft' },
  { id: 'fq-m3', targetItemId: 'fi-benkyo', dimension: 'meaning', type: 'choice', promptJa: '「日本語を勉強しています」の意味は？', promptZh: '「日本語を勉強しています」的意思是？', choices: ['我在学日语', '我教日语', '我想说日语'], answerIndex: 0, explanationJa: '勉強しています＝正在学习。', explanationZh: '「勉強しています」表示正在学习的状态。', errorTag: 'meaning_benkyo', review: 'draft' },
  // 形・接続×3
  { id: 'fq-f1', targetRuleId: 'fr-teimasu', dimension: 'form', type: 'choice', promptJa: '今、日本で生活しています。「日本に＿＿」正しいのは？', promptZh: '现在生活在日本。「日本に＿＿」应该选？', choices: ['住んでいます', '住みます', '住みました'], answerIndex: 0, explanationJa: '今の状態は「住んでいます」。「住みます」は予定のように聞こえることがあります。', explanationZh: '现在的居住状态用「住んでいます」；「住みます」听起来像今后的打算。', errorTag: 'teimasu_state_sumu', review: 'draft' },
  { id: 'fq-f2', targetRuleId: 'fr-particles', dimension: 'connection', type: 'choice', promptJa: '「会社＿＿働いています」。正しい助詞は？', promptZh: '「会社＿＿働いています」应该用哪个助词？', choices: ['で', 'に', 'を'], answerIndex: 0, explanationJa: '動作の場所は「で」。', explanationZh: '动作发生的场所用「で」。', errorTag: 'particle_location_action', review: 'draft' },
  { id: 'fq-f3', targetRuleId: 'fr-particles', dimension: 'connection', type: 'choice', promptJa: '「日本語＿＿勉強しています」。正しい助詞は？', promptZh: '「日本語＿＿勉強しています」应该用哪个助词？', choices: ['を', 'に', 'は'], answerIndex: 0, explanationJa: '勉強する対象は「を」。', explanationZh: '学习的对象用「を」。', errorTag: 'particle_wo_object', review: 'draft' },
  // 文中使用×2
  { id: 'fq-u1', targetRuleId: 'fr-teimasu', dimension: 'usage', type: 'order', promptJa: 'ならべかえて、今の状況を伝える文を作ってください。', promptZh: '请排列成一句说明现状的话。', orderTokens: ['日本語', 'を', '勉強して', 'います'], explanationJa: '日本語＋を＋勉強しています。', explanationZh: '日语＋を＋勉強しています。', errorTag: 'usage_order_benkyo', review: 'draft' },
  { id: 'fq-u2', targetRuleId: 'fr-desu', dimension: 'usage', type: 'choice', promptJa: '自己紹介として自然なのは？（王さん・中国から来た会社員）', promptZh: '哪句自我介绍最自然？（小王・来自中国的公司职员）', choices: ['中国出身です。会社員です。', '私は中国です。', '中国が出身します。'], answerIndex: 0, explanationJa: '出身＋です／職業＋です。「私は中国です」は不自然です。', explanationZh: '「〇〇出身です」「会社員です」。「私は中国です」是不自然的说法。', errorTag: 'usage_selfintro_shusshin', review: 'draft' },
];

export const UNIT1: FoundationUnit = {
  id: 'fu-selfintro-1',
  titleJa: '自己紹介で使う基本のことば',
  titleZh: '自我介绍常用词与句型',
  canDoJa: ['名前・出身・仕事や学習状況を短く言える', '「〜に住んでいます」「〜で働いています」「〜を勉強しています」で今の状況を言える'],
  canDoZh: ['能简短说出名字、来自哪里、工作或学习情况', '能用「〜に住んでいます／〜で働いています／〜を勉強しています」说明现状'],
  itemIds: UNIT1_ITEMS.map((i) => i.id),
  ruleIds: UNIT1_RULES.map((r) => r.id),
  questionIds: UNIT1_QUESTIONS.map((q) => q.id),
  review: 'draft',
};
