// 単元6「数字・時間・値段と買い物」（Phase 2B・全draft）。
// 数字は語彙Itemとして大量登録せず規則・パターンとして保持（§3）。
// MVP範囲: 時刻の特殊読み（4時/7時/9時）・一人/二人。「分」の特殊読み（一分/三分/六分/八分/十分）は次段階（docs明記）。
import type { FoundationRule, FoundationQuestion, FoundationUnit, FoundationItem } from './foundationTypes';
import { bankItem } from './foundationItemBank';
import type { FoundationUnitBundle } from './foundationRegistry';

const ITEMS: FoundationItem[] = [bankItem('fi-ikura'), bankItem('fi-ikutsu'), bankItem('fi-nanji'), bankItem('fi-kore'), bankItem('fi-en'), bankItem('fi-kudasai'), bankItem('fi-kau'), bankItem('fi-aru')];

export const UNIT6_RULES: FoundationRule[] = [
  { id: 'fr-numbers-basic', category: 'numberTime', titleJa: '数字1〜10', titleZh: '数字1〜10', explanationJa: 'いち・に・さん・し／よん・ご・ろく・しち／なな・はち・きゅう／く・じゅう。4・7・9は読み方が2つあります。値段や時刻で使い分けを覚えていきます。', explanationZh: '数字读法：いち・に・さん・し/よん・ご・ろく・しち/なな・はち・きゅう/く・じゅう。4・7・9有两种读法，在价格・时刻中逐步掌握。', review: 'draft' },
  { id: 'fr-time-reading', category: 'numberTime', titleJa: '時刻の言い方（〜時）', titleZh: '时刻的说法（〜時）', explanationJa: '数字＋時（じ）。特殊な読み：4時＝よじ（×よんじ）、7時＝しちじ、9時＝くじ（×きゅうじ）。「何時ですか」で時刻を聞けます。※「分」の特殊読みは次の段階で学びます。', explanationZh: '数字＋時（じ）。特殊读法：4時＝よじ（不是よんじ）、7時＝しちじ、9時＝くじ（不是きゅうじ）。用「何時ですか」询问时间。※「分」的特殊读法在下一阶段学习。', review: 'draft' },
  { id: 'fr-counters', category: 'numberTime', titleJa: '「〜つ」と「〜人」', titleZh: '量词「〜つ」和「〜人」', explanationJa: '物を数える「つ」：一つ（ひとつ）・二つ（ふたつ）・三つ（みっつ）…。人は「人」：一人＝ひとり、二人＝ふたり（特殊読み）、三人からは「さんにん」のように数字＋にん。', explanationZh: '数东西用「つ」：一つ（ひとつ）・二つ（ふたつ）・三つ（みっつ）…。数人用「人」：一人＝ひとり、二人＝ふたり（特殊读法），三人起是数字＋にん（さんにん）。', review: 'draft' },
  { id: 'fr-price-yen', category: 'numberTime', titleJa: '値段と「いくら」', titleZh: '价格与「いくら」', explanationJa: '値段は数字＋円（えん）：500円＝ごひゃくえん。値段を聞くときは「これはいくらですか」。', explanationZh: '价格是数字＋円（えん）：500円＝ごひゃくえん。问价格用「これはいくらですか」。', review: 'draft' },
  { id: 'fr-shopping', category: 'expression', titleJa: '買い物の基本表現', titleZh: '购物基本表达', explanationJa: 'ほしい物を伝える：「これをください」「りんごを三つください」。ある?を聞く：「水はありますか」。', explanationZh: '表达想要的东西：「これをください」「りんごを三つください」。询问有没有：「水はありますか」。', review: 'draft' },
];

export const UNIT6_QUESTIONS: FoundationQuestion[] = [
  // 読み×3（特殊読み中心）
  { id: 'f6q-r1', targetRuleId: 'fr-time-reading', dimension: 'reading', type: 'reading_choice', promptJa: '「4時」の読みは？', promptZh: '「4時」怎么读？', choices: ['よじ', 'よんじ', 'しじ'], answerIndex: 0, explanationJa: '4時＝よじ（特殊読み）。', explanationZh: '4時读「よじ」（特殊读法，不是よんじ）。', errorTag: 'reading_yoji', review: 'draft' },
  { id: 'f6q-r2', targetRuleId: 'fr-counters', dimension: 'reading', type: 'reading_choice', promptJa: '「一人」の読みは？', promptZh: '「一人」怎么读？', choices: ['ひとり', 'いちにん', 'いちじん'], answerIndex: 0, explanationJa: '一人＝ひとり、二人＝ふたり（特殊読み）。', explanationZh: '一人＝ひとり、二人＝ふたり（特殊读法）。', errorTag: 'reading_hitori', review: 'draft' },
  { id: 'f6q-r3', targetRuleId: 'fr-time-reading', dimension: 'reading', type: 'kana_input', promptJa: '「9時」の読みをひらがなで入力してください。', promptZh: '请用平假名输入「9時」的读音。', accepted: ['くじ'], hintJa: '「きゅうじ」ではありません。', hintZh: '不是「きゅうじ」。', explanationJa: '9時＝くじ（×きゅうじ）。', explanationZh: '9時读「くじ」（不是きゅうじ）。', errorTag: 'reading_kuji', review: 'draft' },
  // 意味×2
  { id: 'f6q-m1', targetItemId: 'fi-ikura', dimension: 'meaning', type: 'single_choice', promptJa: '「いくらですか」の意味は？', promptZh: '「いくらですか」的意思是？', choices: ['多少钱？', '几个？', '几点？'], answerIndex: 0, explanationJa: 'いくら＝多少钱（いくつ＝几个、何時＝几点）。', explanationZh: 'いくら＝多少钱（几个是いくつ，几点是何時）。', errorTag: 'meaning_ikura', review: 'draft' },
  { id: 'f6q-m2', targetItemId: 'fi-aru', dimension: 'meaning', type: 'single_choice', promptJa: '「水はありますか」の意味は？', promptZh: '「水はありますか」的意思是？', choices: ['有水吗？', '水在哪里？', '请给我水'], answerIndex: 0, explanationJa: '〜はありますか＝有〜吗？（店で在庫を聞く言い方）。', explanationZh: '「〜はありますか」＝有〜吗？（在店里询问有没有）。', errorTag: 'meaning_arimasuka', review: 'draft' },
  // 形×2（matching時刻・人数）
  { id: 'f6q-f1', targetRuleId: 'fr-time-reading', dimension: 'form', type: 'matching', promptJa: '時刻と読みを組み合わせてください。', promptZh: '请把时刻和读法配对。', pairs: [{ left: '6時', right: 'ろくじ' }, { left: '7時', right: 'しちじ' }, { left: '9時', right: 'くじ' }], explanationJa: '6時＝ろくじ（規則的）、7時＝しちじ・9時＝くじ（特殊）。', explanationZh: '6時＝ろくじ（规则读法），7時＝しちじ・9時＝くじ（特殊读法）。', errorTag: 'form_time_matching', review: 'draft' },
  { id: 'f6q-f2', targetRuleId: 'fr-counters', dimension: 'form', type: 'single_choice', promptJa: '「二人」の読みは？', promptZh: '「二人」怎么读？', choices: ['ふたり', 'ににん', 'にじん'], answerIndex: 0, explanationJa: '二人＝ふたり（三人からは「さんにん」）。', explanationZh: '二人＝ふたり（从三人起是さんにん）。', errorTag: 'form_futari', review: 'draft' },
  // 接続×1
  { id: 'f6q-c1', targetItemId: 'fi-kudasai', dimension: 'connection', type: 'particle_choice', promptJa: '「これ＿ください」。正しい助詞は？', promptZh: '「これ＿ください」应该用？', choices: ['を', 'が', 'は'], answerIndex: 0, explanationJa: 'ほしい物＋を＋ください。', explanationZh: '想要的东西＋を＋ください。', errorTag: 'particle_wo_kudasai', review: 'draft' },
  // 文中使用×3
  { id: 'f6q-u1', targetRuleId: 'fr-shopping', dimension: 'usage', type: 'single_choice', promptJa: 'りんごを3つ買いたいとき、店で何と言う？', promptZh: '想买3个苹果时，在店里怎么说？', choices: ['りんごを三つください。', 'りんごが三つです。', 'りんごを三つあります。'], answerIndex: 0, explanationJa: '数＋ください：りんごを三つください。', explanationZh: '数量＋ください：りんごを三つください。', errorTag: 'usage_kudasai_count', review: 'draft' },
  { id: 'f6q-u2', targetItemId: 'fi-kore', dimension: 'usage', type: 'sentence_order', promptJa: 'ならべかえて、買い物の文を作ってください。', promptZh: '请排列成购物时的句子。', orderTokens: ['これ', 'を', 'ください'], explanationJa: 'これ＋を＋ください。', explanationZh: '这个＋を＋请给我。', errorTag: 'usage_order_kore', review: 'draft' },
  { id: 'f6q-u3', targetItemId: 'fi-ikura', dimension: 'usage', type: 'single_choice', promptJa: '値段を聞くとき、自然なのは？', promptZh: '询问价格时最自然的说法是？', choices: ['これはいくらですか。', 'これはいくつですか。', 'これは何時ですか。'], answerIndex: 0, explanationJa: '値段＝いくら。個数＝いくつ、時刻＝何時。', explanationZh: '价格用いくら；个数用いくつ；时刻用何時。', errorTag: 'usage_ikura_scene', review: 'draft' },
];

export const UNIT6: FoundationUnit = {
  id: 'fu-numbers-shopping',
  titleJa: '数字・時間・値段と買い物',
  titleZh: '数字・时间・价格与购物',
  canDoJa: ['基本的な数字・時刻を読める（4時・7時・9時の特殊読み含む）', '値段を聞ける・理解できる', '「これをください」「〜はありますか」で買い物の基本ができる', '一人・二人の特殊読みが分かる'],
  canDoZh: ['能读基本数字和时刻（含4時・7時・9時的特殊读法）', '能询问・理解价格', '会用「これをください」「〜はありますか」完成基本购物', '知道一人・二人的特殊读法'],
  level: 'N5',
  recommendedWeek: 4,
  estimatedMinutes: 8,
  prerequisiteUnitIds: ['fu-selfintro-1'],
  itemIds: ITEMS.map((i) => i.id),
  ruleIds: UNIT6_RULES.map((r) => r.id),
  questionIds: UNIT6_QUESTIONS.map((q) => q.id),
  review: 'draft',
};

export const BUNDLE: FoundationUnitBundle = { unit: UNIT6, items: ITEMS, rules: UNIT6_RULES, questions: UNIT6_QUESTIONS };
