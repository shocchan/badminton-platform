// 単元4「助詞『は・が・を』」（Phase 2B・全draft）。
// は/がの完全説明はしない（初級代表用法のみ・§3）。中文「是/把」と一対一対応させない。
// 語彙は単元1・共有バンクの既存Itemを再利用（§6）。
import type { FoundationRule, FoundationQuestion, FoundationUnit, FoundationItem } from './foundationTypes';
import { UNIT1_ITEMS } from './foundationUnit1';
import { bankItem } from './foundationItemBank';
import type { FoundationUnitBundle } from './foundationRegistry';

const u1Item = (id: string): FoundationItem => {
  const it = UNIT1_ITEMS.find((i) => i.id === id);
  if (!it) throw new Error(`unit1 item not found: ${id}`);
  return it;
};
const ITEMS: FoundationItem[] = [u1Item('fi-gakusei'), u1Item('fi-nihongo'), bankItem('fi-neko'), bankItem('fi-iru-exist'), bankItem('fi-aru'), bankItem('fi-wakaru')];

export const UNIT4_RULES: FoundationRule[] = [
  { id: 'fr-wa-topic', category: 'particle', titleJa: '主題の「は」', titleZh: '提示话题的「は」', explanationJa: '「は」は文の話題を示します。「私は学生です」＝私について言うと、学生です。自己紹介や説明の文でよく使います。', explanationZh: '「は」提示句子的话题：「私は学生です」＝就我而言，是学生。自我介绍・说明时常用。注意：「は」不等于中文的「是」，「是」的意思在「です」里。', review: 'draft' },
  { id: 'fr-ga-basic', category: 'particle', titleJa: '「が」の基本（存在・新しい情報）', titleZh: '「が」的基础（存在・新信息）', explanationJa: '新しく伝えること・存在には「が」を使います。「猫がいます」「時間があります」。また「分かる」の対象も「が」：「日本語が分かります」。ここでは、この代表用法だけ覚えれば十分です。', explanationZh: '新信息・存在用「が」：「猫がいます」「時間があります」。「分かる」的对象也用「が」：「日本語が分かります」。现阶段记住这些代表用法即可，不必追求「は/が」的全部区别。', review: 'draft' },
  { id: 'fr-wo-object', category: 'particle', titleJa: '動作対象の「を」', titleZh: '动作对象的「を」', explanationJa: '動作の対象は「を」。「日本語を勉強します」「水を買います」「本を読みます」。', explanationZh: '动作的对象用「を」：「日本語を勉強します」「水を買います」。注意：「を」不是中文的「把」，普通宾语就用「を」。', review: 'draft' },
  { id: 'fr-aru-iru', category: 'sentenceType', titleJa: '「あります」と「います」', titleZh: '「あります」与「います」', explanationJa: '物・事は「あります」（時間があります）、人・動物は「います」（猫がいます）。どちらも存在の「が」と一緒に使います。', explanationZh: '中文都说「有」，日语必须区分：物・事→あります，人・动物→います。都与表示存在的「が」搭配。', review: 'draft' },
];

export const UNIT4_QUESTIONS: FoundationQuestion[] = [
  // 読み×2
  { id: 'f4q-r1', targetItemId: 'fi-neko', dimension: 'reading', type: 'reading_choice', promptJa: '「猫」の読みは？', promptZh: '「猫」怎么读？', choices: ['ねこ', 'いぬ', 'びょう'], answerIndex: 0, explanationJa: '猫＝ねこ。', explanationZh: '猫读作「ねこ」。', errorTag: 'reading_neko', review: 'draft' },
  { id: 'f4q-r2', targetItemId: 'fi-wakaru', dimension: 'reading', type: 'kana_input', promptJa: '「分かる」の読みをひらがなで入力してください。', promptZh: '请用平假名输入「分かる」的读音。', accepted: ['わかる'], explanationJa: '分かる＝わかる。', explanationZh: '分かる读作「わかる」。', errorTag: 'reading_wakaru', review: 'draft' },
  // 意味×3
  { id: 'f4q-m1', targetItemId: 'fi-neko', dimension: 'meaning', type: 'single_choice', promptJa: '「猫がいます」の意味は？', promptZh: '「猫がいます」的意思是？', choices: ['有猫', '喜欢猫', '是猫'], answerIndex: 0, explanationJa: '存在の文：有猫。', explanationZh: '表示存在：有（一只）猫。', errorTag: 'meaning_neko_imasu', review: 'draft' },
  { id: 'f4q-m2', targetItemId: 'fi-aru', dimension: 'meaning', type: 'single_choice', promptJa: '「時間があります」の意味は？', promptZh: '「時間があります」的意思是？', choices: ['有时间', '时间到了', '在时间里'], answerIndex: 0, explanationJa: '時間があります＝有时间。', explanationZh: '「時間があります」＝有时间。', errorTag: 'meaning_jikan_aru', review: 'draft' },
  { id: 'f4q-m3', targetItemId: 'fi-iru-exist', dimension: 'meaning', type: 'single_choice', promptJa: '人や動物の「有」に使うのは？', promptZh: '表示人・动物的「有」应该用？', choices: ['います', 'あります', 'です'], answerIndex: 0, explanationJa: '人・動物→います、物・事→あります。', explanationZh: '人・动物→います，物・事→あります。', errorTag: 'meaning_iru_aru', review: 'draft' },
  // 助詞×4
  { id: 'f4q-p1', targetRuleId: 'fr-wa-topic', dimension: 'particle', type: 'particle_choice', promptJa: '「私＿学生です」。正しい助詞は？', promptZh: '「私＿学生です」应该用哪个助词？', choices: ['は', 'が', 'を'], answerIndex: 0, explanationJa: '自己紹介の話題は「は」。', explanationZh: '自我介绍的话题用「は」。', errorTag: 'particle_wa_topic', review: 'draft' },
  { id: 'f4q-p2', targetRuleId: 'fr-ga-basic', dimension: 'particle', type: 'particle_choice', promptJa: '「（部屋を見て）あ、猫＿います」。正しい助詞は？', promptZh: '「（看到房间里）啊，猫＿います」应该用？', choices: ['が', 'は', 'を'], answerIndex: 0, explanationJa: '新しく伝える存在は「が」。', explanationZh: '新发现・新信息的存在用「が」。', errorTag: 'particle_ga_exist', review: 'draft' },
  { id: 'f4q-p3', targetRuleId: 'fr-wo-object', dimension: 'particle', type: 'particle_choice', promptJa: '「日本語＿勉強します」。正しい助詞は？', promptZh: '「日本語＿勉強します」应该用？', choices: ['を', 'が', 'は'], answerIndex: 0, explanationJa: '動作の対象は「を」。', explanationZh: '动作对象用「を」。', errorTag: 'particle_wo_object2', review: 'draft' },
  { id: 'f4q-p4', targetRuleId: 'fr-ga-basic', dimension: 'particle', type: 'error_correction_choice', promptJa: '「日本語を分かります」。直すなら？', promptZh: '「日本語を分かります」需要怎么改？', choices: ['を→が', 'を→は', '直さなくてよい'], answerIndex: 0, hintJa: '「分かる」の対象に使う助詞は特別です。', hintZh: '「分かる」的对象要用特殊的助词。', explanationJa: '「分かる」の対象は「が」：日本語が分かります。', explanationZh: '「分かる」的对象用「が」：日本語が分かります。', errorTag: 'particle_wakaru_ga', review: 'draft' },
  // 文中使用×2
  { id: 'f4q-u1', targetRuleId: 'fr-wo-object', dimension: 'usage', type: 'sentence_order', promptJa: 'ならべかえて、自己紹介の文を作ってください。', promptZh: '请排列成自我介绍的句子。', orderTokens: ['私', 'は', '日本語', 'を', '勉強します'], explanationJa: '私は＋日本語を＋勉強します。', explanationZh: '私は＋日本語を＋勉強します。', errorTag: 'usage_order_wa_wo', review: 'draft' },
  { id: 'f4q-u2', targetRuleId: 'fr-ga-basic', dimension: 'usage', type: 'single_choice', promptJa: '「部屋に何がいますか？」への自然な答えは？', promptZh: '回答「部屋に何がいますか？」最自然的是？', choices: ['猫がいます。', '猫はいます。', '猫をいます。'], answerIndex: 0, explanationJa: '質問への新情報は「が」で伝えます。', explanationZh: '回答新信息用「が」。', errorTag: 'usage_ga_answer', review: 'draft' },
];

export const UNIT4: FoundationUnit = {
  id: 'fu-particles-wa-ga-wo',
  titleJa: '助詞「は・が・を」',
  titleZh: '助词「は・が・を」',
  canDoJa: ['話題の「は」で自己紹介の文を作れる', '存在・新情報の「が」を使える', '動作対象の「を」を使える', 'あります／いますを使い分けられる'],
  canDoZh: ['会用话题「は」造自我介绍的句子', '会用表示存在・新信息的「が」', '会用动作对象的「を」', '能区分あります／います'],
  level: 'N5',
  recommendedWeek: 2,
  estimatedMinutes: 8,
  prerequisiteUnitIds: ['fu-selfintro-1'],
  itemIds: ITEMS.map((i) => i.id),
  ruleIds: UNIT4_RULES.map((r) => r.id),
  questionIds: UNIT4_QUESTIONS.map((q) => q.id),
  review: 'draft',
};

export const BUNDLE: FoundationUnitBundle = { unit: UNIT4, items: ITEMS, rules: UNIT4_RULES, questions: UNIT4_QUESTIONS };
