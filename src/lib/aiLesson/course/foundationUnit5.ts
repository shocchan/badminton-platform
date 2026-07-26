// 単元5「助詞『に・で・へ』」（Phase 2B・全draft）。
// 全用法を詰め込まず初級会話で再利用性が高い用法へ絞る（§3）。語彙は単元1・2の既存Itemを再利用。
import type { FoundationRule, FoundationQuestion, FoundationUnit, FoundationItem } from './foundationTypes';
import { UNIT1_ITEMS } from './foundationUnit1';
import { bankItem } from './foundationItemBank';
import type { FoundationUnitBundle } from './foundationRegistry';

const u1Item = (id: string): FoundationItem => {
  const it = UNIT1_ITEMS.find((i) => i.id === id);
  if (!it) throw new Error(`unit1 item not found: ${id}`);
  return it;
};
const ITEMS: FoundationItem[] = [bankItem('fi-iku'), bankItem('fi-kaeru'), bankItem('fi-densha'), bankItem('fi-okiru'), u1Item('fi-sumu'), u1Item('fi-hataraku')];

export const UNIT5_RULES: FoundationRule[] = [
  { id: 'fr-ni-e-destination', category: 'particle', titleJa: '移動先の「に／へ」', titleZh: '移动目的地的「に／へ」', explanationJa: '行き先には「に」か「へ」：「日本に行きます」「日本へ行きます」。意味はほぼ同じで、「へ」は方向のニュアンスが少し強いです。まず「に」を使えれば十分です。', explanationZh: '目的地用「に」或「へ」：「日本に行きます」「日本へ行きます」。意思基本相同，「へ」稍强调方向。先会用「に」就够了。', review: 'draft' },
  { id: 'fr-ni-place-time', category: 'particle', titleJa: '住む場所と時刻の「に」', titleZh: '居住地点与时刻的「に」', explanationJa: '住んでいる場所は「に」：「日本に住んでいます」。時刻も「に」：「7時に起きます」。', explanationZh: '居住的地点用「に」：「日本に住んでいます」。时刻也用「に」：「7時に起きます」。', review: 'draft' },
  { id: 'fr-de-place-means', category: 'particle', titleJa: '動作場所と手段の「で」', titleZh: '动作场所与手段的「で」', explanationJa: '動作をする場所は「で」：「会社で働いています」。手段・乗り物も「で」：「電車で行きます」。「に」（住む場所・行き先）との違いに注意。', explanationZh: '动作发生的场所用「で」：「会社で働いています」。手段・交通工具也用「で」：「電車で行きます」。注意与「に」（居住地・目的地）的区别。', review: 'draft' },
];

export const UNIT5_QUESTIONS: FoundationQuestion[] = [
  // 読み×2
  { id: 'f5q-r1', targetItemId: 'fi-densha', dimension: 'reading', type: 'reading_choice', promptJa: '「電車」の読みは？', promptZh: '「電車」怎么读？', choices: ['でんしゃ', 'でんくるま', 'てんしゃ'], answerIndex: 0, explanationJa: '電車＝でんしゃ。', explanationZh: '電車读作「でんしゃ」。', errorTag: 'reading_densha', review: 'draft' },
  { id: 'f5q-r2', targetItemId: 'fi-okiru', dimension: 'reading', type: 'kana_input', promptJa: '「起きる」の読みをひらがなで入力してください。', promptZh: '请用平假名输入「起きる」的读音。', accepted: ['おきる'], explanationJa: '起きる＝おきる。', explanationZh: '起きる读作「おきる」。', errorTag: 'reading_okiru', review: 'draft' },
  // 意味×2
  { id: 'f5q-m1', targetItemId: 'fi-densha', dimension: 'meaning', type: 'single_choice', promptJa: '「電車で行きます」の意味は？', promptZh: '「電車で行きます」的意思是？', choices: ['坐电车去', '在电车里住', '买电车票'], answerIndex: 0, explanationJa: '手段の「で」：坐电车去。', explanationZh: '表示手段的「で」：坐电车去。', errorTag: 'meaning_densha_de', review: 'draft' },
  { id: 'f5q-m2', targetItemId: 'fi-okiru', dimension: 'meaning', type: 'single_choice', promptJa: '「7時に起きます」の意味は？', promptZh: '「7時に起きます」的意思是？', choices: ['7点起床', '7点睡觉', '起来7次'], answerIndex: 0, explanationJa: '時刻の「に」＋起きる：7点起床。', explanationZh: '时刻「に」＋起きる：7点起床。', errorTag: 'meaning_okimasu', review: 'draft' },
  // 助詞×5
  { id: 'f5q-p1', targetRuleId: 'fr-ni-e-destination', dimension: 'particle', type: 'particle_choice', promptJa: '「日本＿行きます」。正しい助詞は？', promptZh: '「日本＿行きます」应该用？', choices: ['に', 'で', 'を'], answerIndex: 0, explanationJa: '行き先は「に」（「へ」も使えます）。', explanationZh: '目的地用「に」（也可以用「へ」）。', errorTag: 'particle_ni_destination', review: 'draft' },
  { id: 'f5q-p2', targetRuleId: 'fr-de-place-means', dimension: 'particle', type: 'particle_choice', promptJa: '「会社＿働いています」。正しい助詞は？', promptZh: '「会社＿働いています」应该用？', choices: ['で', 'に', 'へ'], answerIndex: 0, explanationJa: '動作の場所は「で」。', explanationZh: '动作场所用「で」。', errorTag: 'particle_de_workplace', review: 'draft' },
  { id: 'f5q-p3', targetRuleId: 'fr-ni-place-time', dimension: 'particle', type: 'particle_choice', promptJa: '「7時＿起きます」。正しい助詞は？', promptZh: '「7時＿起きます」应该用？', choices: ['に', 'で', 'は'], answerIndex: 0, explanationJa: '時刻は「に」。', explanationZh: '时刻用「に」。', errorTag: 'particle_ni_time', review: 'draft' },
  { id: 'f5q-p4', targetRuleId: 'fr-de-place-means', dimension: 'particle', type: 'particle_choice', promptJa: '「電車＿会社に行きます」。正しい助詞は？', promptZh: '「電車＿会社に行きます」应该用？', choices: ['で', 'に', 'を'], answerIndex: 0, explanationJa: '手段・乗り物は「で」。', explanationZh: '交通手段用「で」。', errorTag: 'particle_de_means', review: 'draft' },
  { id: 'f5q-p5', targetRuleId: 'fr-ni-place-time', dimension: 'particle', type: 'error_correction_choice', promptJa: '「日本で住んでいます」。直すなら？', promptZh: '「日本で住んでいます」需要怎么改？', choices: ['で→に', 'で→へ', '直さなくてよい'], answerIndex: 0, hintJa: '住む場所に使う助詞は「働く場所」と違います。', hintZh: '居住地点的助词和工作地点不同。', explanationJa: '住む場所は「に」：日本に住んでいます（働く場所は「で」）。', explanationZh: '居住地点用「に」：日本に住んでいます（工作地点才用「で」）。', errorTag: 'particle_sumu_ni', review: 'draft' },
  // 文中使用×2
  { id: 'f5q-u1', targetRuleId: 'fr-de-place-means', dimension: 'usage', type: 'sentence_order', promptJa: 'ならべかえて、通勤の文を作ってください。', promptZh: '请排列成表示通勤的句子。', orderTokens: ['電車', 'で', '会社', 'に', '行きます'], explanationJa: '電車で＋会社に＋行きます。', explanationZh: '電車で（坐电车）＋会社に（去公司）＋行きます。', errorTag: 'usage_order_de_ni', review: 'draft' },
  { id: 'f5q-u2', targetRuleId: 'fr-ni-e-destination', dimension: 'usage', type: 'single_choice', promptJa: '週末に故郷へ戻ることを言うと？', promptZh: '说「周末回老家」应该选？', choices: ['週末、家に帰ります。', '週末、家で帰ります。', '週末、家を帰ります。'], answerIndex: 0, explanationJa: '帰る先は「に」（へも可）。', explanationZh: '回去的目的地用「に」（也可用へ）。', errorTag: 'usage_kaeru_ni', review: 'draft' },
];

export const UNIT5: FoundationUnit = {
  id: 'fu-particles-ni-de-e',
  titleJa: '助詞「に・で・へ」',
  titleZh: '助词「に・で・へ」',
  canDoJa: ['行き先を「に／へ」で言える', '住む場所・時刻の「に」を使える', '動作場所・手段の「で」を使える', '「に」と「で」を使い分けられる'],
  canDoZh: ['会用「に／へ」表达目的地', '会用居住地点・时刻的「に」', '会用动作场所・手段的「で」', '能区分「に」和「で」'],
  level: 'N5',
  recommendedWeek: 3,
  estimatedMinutes: 8,
  prerequisiteUnitIds: ['fu-selfintro-1'],
  itemIds: ITEMS.map((i) => i.id),
  ruleIds: UNIT5_RULES.map((r) => r.id),
  questionIds: UNIT5_QUESTIONS.map((q) => q.id),
  review: 'draft',
};

export const BUNDLE: FoundationUnitBundle = { unit: UNIT5, items: ITEMS, rules: UNIT5_RULES, questions: UNIT5_QUESTIONS };
