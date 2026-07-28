// 単元2「基本動詞と『ます形・ない形』」（Phase 2B・全draft）。
// 語彙は共有バンク参照（重複登録しない・§6）。例外（する・来る・ある→ない・帰る・買う→買わない）を明示。
import type { FoundationRule, FoundationQuestion, FoundationUnit } from './foundationTypes';
import { bankItem } from './foundationItemBank';
import type { FoundationUnitBundle } from './foundationRegistry';

const ITEM_IDS = ['fi-iku', 'fi-kuru', 'fi-suru', 'fi-taberu', 'fi-miru', 'fi-hanasu', 'fi-kiku', 'fi-kaku', 'fi-yomu', 'fi-kau', 'fi-kaeru', 'fi-wakaru'];

export const UNIT2_RULES: FoundationRule[] = [
  { id: 'fr-verb-groups', category: 'verbGroup', titleJa: '動詞の3グループ', titleZh: '动词的3个类别', explanationJa: 'まず3つに分けます。三類は「する」「来る」の2つだけ。二類は「食べる」「見る」のように「る」で終わり、その前が「え・い」の音の動詞が多いです。残りが一類です。注意：「帰る」は「る」で終わりますが一類です。', explanationZh: '先分成3类：三类只有「する」和「来る」两个；二类多是「食べる」「見る」这样以「る」结尾、且「る」前是e/i音的动词；其余是一类。注意：「帰る」虽以「る」结尾，却是一类动词。', review: 'draft' },
  { id: 'fr-masu-form', category: 'conjugation', titleJa: 'ます形の作り方', titleZh: '「ます形」的变法', explanationJa: '一類：うの音→いの音＋ます（行く→行きます、買う→買います）。二類：る→ます（食べる→食べます）。三類：する→します、来る→来ます（きます）。', explanationZh: '一类：u音变i音＋ます（行く→行きます、買う→買います）。二类：去る＋ます（食べる→食べます）。三类：する→します、来る→来ます（读きます）。', review: 'draft' },
  { id: 'fr-nai-form', category: 'conjugation', titleJa: 'ない形の作り方', titleZh: '「ない形」的变法', explanationJa: '一類：うの音→あの音＋ない（行く→行かない）。「買う」は「買わない」（×買あない）。二類：る→ない（食べない）。三類：する→しない、来る→来ない（こない）。例外：「ある」のない形は「ない」です。', explanationZh: '一类：u音变a音＋ない（行く→行かない）。「買う」变「買わない」（不是「買あない」）。二类：去る＋ない（食べない）。三类：する→しない、来る→来ない（读こない）。例外：「ある」的否定不是「あらない」，直接是「ない」。', review: 'draft' },
  { id: 'fr-masu-nai-choice', category: 'conjugation', titleJa: '文の中で肯定・否定を選ぶ', titleZh: '在句子中选择肯定・否定', explanationJa: 'ていねいな肯定は「〜ます」、否定は「〜ません」（食べます／食べません）。「ない形」はふつう体の否定（食べない）で、あとの文法（〜ないでください等）でも使います。', explanationZh: '礼貌体肯定用「〜ます」，否定用「〜ません」（食べます／食べません）。「ない形」是普通体否定（食べない），之后的语法（〜ないでください等）也会用到。', review: 'draft' },
];

export const UNIT2_QUESTIONS: FoundationQuestion[] = [
  // 読み×2
  { id: 'f2q-r1', targetItemId: 'fi-yomu', dimension: 'reading', type: 'reading_choice', promptJa: '「読む」の読みは？', promptZh: '「読む」怎么读？', choices: ['よむ', 'どくむ', 'とむ'], answerIndex: 0, explanationJa: '読む＝よむ。', explanationZh: '読む读作「よむ」。', errorTag: 'reading_yomu', review: 'draft' },
  { id: 'f2q-r2', targetItemId: 'fi-kaeru', dimension: 'reading', type: 'reading_choice', promptJa: '「帰る」の読みは？', promptZh: '「帰る」怎么读？', choices: ['かえる', 'がえる', 'かえり', 'きる'], answerIndex: 0, explanationJa: '帰る＝かえる。「かえり（帰り）」は名詞形です。', explanationZh: '帰る读作「かえる」。「かえり（帰り）」是名词形。', errorTag: 'reading_kaeru', review: 'draft' },
  // 意味×3
  { id: 'f2q-m1', targetItemId: 'fi-kau', dimension: 'meaning', type: 'single_choice', promptJa: '「買う」の意味は？', promptZh: '「買う」的意思是？', choices: ['买', '卖', '借'], answerIndex: 0, explanationJa: '買う＝买。', explanationZh: '買う＝买（卖是「売る」）。', errorTag: 'meaning_kau', review: 'draft' },
  { id: 'f2q-m2', targetItemId: 'fi-wakaru', dimension: 'meaning', type: 'single_choice', promptJa: '“明白・懂”は日本語で？', promptZh: '“明白・懂”用日语怎么说？', choices: ['分かる', '知る', '見る'], answerIndex: 0, explanationJa: '分かる＝明白。対象は「が」：日本語が分かります。', explanationZh: '「分かる」＝明白。注意对象用「が」：日本語が分かります。', errorTag: 'meaning_wakaru', review: 'draft' },
  { id: 'f2q-m3', targetItemId: 'fi-kiku', dimension: 'meaning', type: 'single_choice', promptJa: '「先生に聞きます」の「聞く」の意味は？', promptZh: '「先生に聞きます」中「聞く」的意思是？', choices: ['问', '听', '说'], answerIndex: 0, explanationJa: '聞くには「听」と「问」の2つの意味があります。「先生に聞く」は「问老师」。', explanationZh: '「聞く」有「听」和「问」两个意思。「先生に聞く」＝问老师。', errorTag: 'meaning_kiku_sense', review: 'draft' },
  // 形×5（グループ判定・ます形・ない形・例外）
  { id: 'f2q-f1', targetRuleId: 'fr-verb-groups', dimension: 'form', type: 'single_choice', promptJa: '「帰る」はどのグループ？', promptZh: '「帰る」属于哪一类动词？', choices: ['一類', '二類', '三類'], answerIndex: 0, hintJa: '「る」で終わる動詞は、グループの見分けに注意が必要です。', hintZh: '以「る」结尾的动词，判断类别时要特别小心。', explanationJa: '帰るは「る」で終わりますが一類（帰ります・帰らない）。', explanationZh: '「帰る」虽以る结尾但是一类动词（帰ります・帰らない）。', errorTag: 'group_kaeru_exception', review: 'draft' },
  { id: 'f2q-f2', targetRuleId: 'fr-masu-form', dimension: 'form', type: 'conjugation_choice', promptJa: '「行く」のます形は？', promptZh: '「行く」的ます形是？', choices: ['行きます', '行くます', '行かます', '行います'], answerIndex: 0, explanationJa: '一類：うの音→いの音＋ます。行く→行きます。辞書形に直接「ます」は付けません。', explanationZh: '一类动词u音变i音＋ます：行く→行きます。不能在辞书形后直接加「ます」。', errorTag: 'masu_iku', review: 'draft' },
  { id: 'f2q-f3', targetRuleId: 'fr-masu-form', dimension: 'form', type: 'conjugation_choice', promptJa: '「食べる」のます形は？', promptZh: '「食べる」的ます形是？', choices: ['食べます', '食べります', '食べします'], answerIndex: 0, explanationJa: '二類：る→ます。食べる→食べます。', explanationZh: '二类动词去る＋ます：食べる→食べます。', errorTag: 'masu_taberu', review: 'draft' },
  { id: 'f2q-f4', targetRuleId: 'fr-nai-form', dimension: 'form', type: 'conjugation_choice', promptJa: '「来る」のない形は？', promptZh: '「来る」的ない形是？', choices: ['来ない（こない）', '来らない', '来ない（くない）'], answerIndex: 0, explanationJa: '三類の例外：来る→来ない（こない）。読みも変わります。', explanationZh: '三类动词特殊变化：来る→来ない，读音变为「こない」。', errorTag: 'nai_kuru_exception', review: 'draft' },
  { id: 'f2q-f5', targetRuleId: 'fr-nai-form', dimension: 'form', type: 'conjugation_choice', promptJa: '「買う」のない形は？', promptZh: '「買う」的ない形是？', choices: ['買わない', '買あない', '買いない', '買らない'], answerIndex: 0, hintJa: '「う」で終わる動詞は「わ」になります。', hintZh: '以「う」结尾的动词变「わ」。', explanationJa: '買う→買わない（×買あない）。うで終わる一類は「わ＋ない」。', explanationZh: '買う→買わない（不是「買あない」）。以う结尾的一类动词变「わ＋ない」。', errorTag: 'nai_kau_wa', review: 'draft' },
  // 接続×1（ある→ない例外）
  { id: 'f2q-c1', targetRuleId: 'fr-nai-form', dimension: 'connection', type: 'conjugation_choice', promptJa: '「時間が＿＿」。「ない」を使った正しい形は？', promptZh: '「時間が＿＿」。用否定的正确说法是？', choices: ['ありません', 'あらないです', 'ないます'], answerIndex: 0, explanationJa: '「ある」の否定は例外：ていねい形は「ありません」、ふつう形は「ない」。「あらない」とは言いません。', explanationZh: '「ある」的否定是例外：礼貌体「ありません」，普通体「ない」。没有「あらない」这种说法。', errorTag: 'nai_aru_exception', review: 'draft' },
  // 文中使用×2
  { id: 'f2q-u1', targetRuleId: 'fr-masu-nai-choice', dimension: 'usage', type: 'fill_blank', promptJa: '毎晩、本を＿＿。（習慣を伝える・ていねいに）', promptZh: '毎晩、本を＿＿。（表达习惯・礼貌体）', choices: ['読みます', '読みません', '読む'], answerIndex: 0, explanationJa: '習慣の肯定は「〜ます」。ていねいな場面では辞書形「読む」より「読みます」。', explanationZh: '表达习惯的肯定用「〜ます」。礼貌场合用「読みます」而不是辞书形「読む」。', errorTag: 'usage_masu_habit', review: 'draft' },
  { id: 'f2q-u2', targetRuleId: 'fr-masu-nai-choice', dimension: 'usage', type: 'sentence_order', promptJa: 'ならべかえて、ていねいな文を作ってください。', promptZh: '请排列成一句礼貌体的句子。', orderTokens: ['映画', 'を', '見ます'], explanationJa: '映画＋を＋見ます。', explanationZh: '電影＋を＋見ます。', errorTag: 'usage_order_miru', review: 'draft' },
];

export const UNIT2: FoundationUnit = {
  id: 'fu-verbs-masu-nai',
  titleJa: '基本動詞と「ます形・ない形」',
  titleZh: '基本动词与「ます形・ない形」',
  canDoJa: ['よく使う基本動詞12語を読めて意味が分かる', '一類・二類・三類を大まかに見分けられる', 'ます形・ない形を作れる', '文の中で肯定・否定を選べる'],
  canDoZh: ['能读懂12个高频基本动词', '能大致区分一类・二类・三类动词', '会变「ます形」和「ない形」', '能在句子中选择肯定・否定'],
  level: 'N5',
  recommendedWeek: 2,
  estimatedMinutes: 8,
  prerequisiteUnitIds: ['fu-selfintro-1'],
  itemIds: ITEM_IDS,
  ruleIds: UNIT2_RULES.map((r) => r.id),
  questionIds: UNIT2_QUESTIONS.map((q) => q.id),
  review: 'draft',
};

export const BUNDLE: FoundationUnitBundle = { unit: UNIT2, items: ITEM_IDS.map(bankItem), rules: UNIT2_RULES, questions: UNIT2_QUESTIONS };
