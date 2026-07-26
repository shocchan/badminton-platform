// 単元3「基本動詞の『て形』」（Phase 2B・全draft）。
// 語彙は単元2と同じ共有バンクItemを参照（別登録しない・§6）。解説は短く分割（§3）。
import type { FoundationRule, FoundationQuestion, FoundationUnit } from './foundationTypes';
import { bankItem } from './foundationItemBank';
import type { FoundationUnitBundle } from './foundationRegistry';

const ITEM_IDS = ['fi-iku', 'fi-kuru', 'fi-suru', 'fi-taberu', 'fi-miru', 'fi-hanasu', 'fi-kiku', 'fi-kaku', 'fi-yomu', 'fi-kau', 'fi-kaeru'];

export const UNIT3_RULES: FoundationRule[] = [
  { id: 'fr-te-overview', category: 'conjugation', titleJa: 'て形は何に使う？', titleZh: '「て形」用来做什么？', explanationJa: 'て形はお願い（書いてください）、動作をつなぐ（買って、帰ります）、そして既に学んだ「〜ています」（住んでいます）で使います。まず形を作れるようになりましょう。', explanationZh: '「て形」用于请求（書いてください）、连接动作（買って、帰ります），以及已学过的「〜ています」（住んでいます）。先学会怎么变形吧。', review: 'draft' },
  { id: 'fr-te-g1a', category: 'conjugation', titleJa: '一類①：って・んで', titleZh: '一类①：って・んで', explanationJa: '「う・つ・る」で終わる→「って」（買う→買って、帰る→帰って）。「む・ぶ・ぬ」で終わる→「んで」（読む→読んで、住む→住んで）。', explanationZh: '以「う・つ・る」结尾→「って」（買う→買って、帰る→帰って）。以「む・ぶ・ぬ」结尾→「んで」（読む→読んで、住む→住んで）。', review: 'draft' },
  { id: 'fr-te-g1b', category: 'conjugation', titleJa: '一類②：いて・いで・して', titleZh: '一类②：いて・いで・して', explanationJa: '「く」で終わる→「いて」（書く→書いて、聞く→聞いて）。「ぐ」で終わる→「いで」（泳ぐ→泳いで）。「す」で終わる→「して」（話す→話して）。', explanationZh: '以「く」结尾→「いて」（書く→書いて、聞く→聞いて）。以「ぐ」结尾→「いで」（泳ぐ→泳いで）。以「す」结尾→「して」（話す→話して）。', review: 'draft' },
  { id: 'fr-te-g2g3', category: 'conjugation', titleJa: '二類・三類のて形', titleZh: '二类・三类的て形', explanationJa: '二類：る→て（食べる→食べて、見る→見て）。三類：する→して、来る→来て（きて）。', explanationZh: '二类：去る＋て（食べる→食べて、見る→見て）。三类：する→して、来る→来て（读きて）。', review: 'draft' },
  { id: 'fr-te-iku-exception', category: 'conjugation', titleJa: '例外：行く→行って', titleZh: '例外：行く→行って', explanationJa: '「行く」は「く」で終わりますが「行いて」ではなく「行って」。よく使う例外なのでそのまま覚えましょう。', explanationZh: '「行く」虽以く结尾，但不是「行いて」而是「行って」。这是高频例外，直接记住即可。', review: 'draft' },
  { id: 'fr-te-kudasai', category: 'expression', titleJa: '〜てください（お願い）', titleZh: '「〜てください」（请求）', explanationJa: 'て形＋ください＝ていねいなお願い。「ここに名前を書いてください」「もう一度話してください」。', explanationZh: '「て形＋ください」＝礼貌的请求：「ここに名前を書いてください」「もう一度話してください」。', review: 'draft' },
];

export const UNIT3_QUESTIONS: FoundationQuestion[] = [
  // 読み×2
  { id: 'f3q-r1', targetItemId: 'fi-iku', dimension: 'reading', type: 'reading_choice', promptJa: '「行って」の読みは？', promptZh: '「行って」怎么读？', choices: ['いって', 'こうって', 'ぎょうって'], answerIndex: 0, explanationJa: '行って＝いって。', explanationZh: '行って读作「いって」。', errorTag: 'reading_itte', review: 'draft' },
  { id: 'f3q-r2', targetItemId: 'fi-hanasu', dimension: 'reading', type: 'kana_input', promptJa: '「話して」の読みをひらがなで入力してください。', promptZh: '请用平假名输入「話して」的读音。', accepted: ['はなして'], explanationJa: '話して＝はなして。', explanationZh: '話して读作「はなして」。', errorTag: 'reading_hanashite', review: 'draft' },
  // 意味×2
  { id: 'f3q-m1', targetItemId: 'fi-miru', dimension: 'meaning', type: 'single_choice', promptJa: '「見てください」の意味は？', promptZh: '「見てください」的意思是？', choices: ['请看', '请听', '请写'], answerIndex: 0, explanationJa: '見てください＝请看。', explanationZh: '「見てください」＝请看。', errorTag: 'meaning_mitekudasai', review: 'draft' },
  { id: 'f3q-m2', targetItemId: 'fi-kiku', dimension: 'meaning', type: 'single_choice', promptJa: '「ちょっと聞いてください」の意味に近いのは？', promptZh: '「ちょっと聞いてください」的意思接近？', choices: ['请听我说一下', '请写一下', '请吃一点'], answerIndex: 0, explanationJa: 'この場面の聞く＝听。', explanationZh: '这里的「聞く」是「听」的意思。', errorTag: 'meaning_kiite', review: 'draft' },
  // 形×5（って/んで/いて/して/例外・matching含む）
  { id: 'f3q-f1', targetRuleId: 'fr-te-g1a', dimension: 'form', type: 'conjugation_input', promptJa: '「買う」のて形は？', promptZh: '「買う」的て形是？', accepted: ['買って', 'かって'], explanationJa: 'う・つ・る→って。買う→買って。', explanationZh: 'う・つ・る结尾→って：買う→買って。', errorTag: 'te_katte', review: 'draft' },
  { id: 'f3q-f2', targetRuleId: 'fr-te-g1a', dimension: 'form', type: 'single_choice', promptJa: '「読む」のて形は？', promptZh: '「読む」的て形是？', choices: ['読んで', '読って', '読みて'], answerIndex: 0, explanationJa: 'む・ぶ・ぬ→んで。読む→読んで。', explanationZh: 'む・ぶ・ぬ结尾→んで：読む→読んで。', errorTag: 'te_yonde', review: 'draft' },
  { id: 'f3q-f3', targetRuleId: 'fr-te-g1b', dimension: 'form', type: 'matching', promptJa: '動詞とて形を組み合わせてください。', promptZh: '请把动词和它的て形配对。', pairs: [{ left: '書く', right: '書いて' }, { left: '話す', right: '話して' }, { left: '食べる', right: '食べて' }], explanationJa: 'く→いて（書いて）、す→して（話して）、二類はる→て（食べて）。', explanationZh: 'く→いて（書いて）、す→して（話して）、二类去る＋て（食べて）。', errorTag: 'te_matching_basic', review: 'draft' },
  { id: 'f3q-f4', targetRuleId: 'fr-te-g2g3', dimension: 'form', type: 'conjugation_input', promptJa: '「来る」のて形をひらがなで入力してください。', promptZh: '请用平假名输入「来る」的て形。', accepted: ['きて', '来て'], hintJa: '三類は読み方も変わります。', hintZh: '三类动词读音也会变化。', explanationJa: '来る→来て（きて）。', explanationZh: '来る→来て，读「きて」。', errorTag: 'te_kite', review: 'draft' },
  { id: 'f3q-f5', targetRuleId: 'fr-te-iku-exception', dimension: 'form', type: 'single_choice', promptJa: '「行く」のて形は？', promptZh: '「行く」的て形是？', choices: ['行って', '行いて', '行きて'], answerIndex: 0, explanationJa: '例外：行く→行って（×行いて）。', explanationZh: '例外：行く→行って（不是「行いて」）。', errorTag: 'te_iku_exception', review: 'draft' },
  // 接続×1（てください接続）
  { id: 'f3q-c1', targetRuleId: 'fr-te-kudasai', dimension: 'connection', type: 'single_choice', promptJa: '「ここに名前を＿＿ください」。正しいのは？', promptZh: '「ここに名前を＿＿ください」应该选？', choices: ['書いて', '書きて', '書き'], answerIndex: 0, explanationJa: 'ください」の前はて形。書く→書いて。', explanationZh: '「ください」前面用て形：書く→書いて。', errorTag: 'te_kudasai_connect', review: 'draft' },
  // 文中使用×2
  { id: 'f3q-u1', targetRuleId: 'fr-te-kudasai', dimension: 'usage', type: 'sentence_order', promptJa: 'ならべかえて、お願いの文を作ってください。', promptZh: '请排列成请求的句子。', orderTokens: ['もう一度', '話して', 'ください'], explanationJa: 'もう一度＋話して＋ください。', explanationZh: '再说一遍＝もう一度話してください。', errorTag: 'usage_order_te_kudasai', review: 'draft' },
  { id: 'f3q-u2', targetRuleId: 'fr-te-overview', dimension: 'usage', type: 'single_choice', promptJa: '朝ごはんを食べた後で会社へ行くことを、一つの文で言うと？', promptZh: '「吃完早饭后去公司」用一句话说是？', choices: ['朝ごはんを食べて、会社へ行きます。', '朝ごはんを食べます、会社へ行きます。', '朝ごはんを食べるして、会社へ行きます。'], answerIndex: 0, explanationJa: 'て形で動作をつなぎます：食べて、行きます。', explanationZh: '用て形连接动作：食べて、行きます。', errorTag: 'usage_te_sequence', review: 'draft' },
];

export const UNIT3: FoundationUnit = {
  id: 'fu-te-form',
  titleJa: '基本動詞の「て形」',
  titleZh: '基本动词的「て形」',
  canDoJa: ['よく使う動詞のて形を読める・作れる', '「〜てください」でお願いできる', 'て形で動作をつなげられる', '「〜ています」との接続が分かる'],
  canDoZh: ['能读・能变常用动词的て形', '会用「〜てください」提出请求', '能用て形连接动作', '理解与「〜ています」的联系'],
  level: 'N5',
  recommendedWeek: 3,
  estimatedMinutes: 8,
  prerequisiteUnitIds: ['fu-verbs-masu-nai'],
  itemIds: ITEM_IDS,
  ruleIds: UNIT3_RULES.map((r) => r.id),
  questionIds: UNIT3_QUESTIONS.map((q) => q.id),
  review: 'draft',
};

export const BUNDLE: FoundationUnitBundle = { unit: UNIT3, items: ITEM_IDS.map(bankItem), rules: UNIT3_RULES, questions: UNIT3_QUESTIONS };
