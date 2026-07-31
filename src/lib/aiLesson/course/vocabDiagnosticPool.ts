// 診断問題プール（Phase 2E-1 §5・全タップ式・全draft）。
// 構成比はハードコードせず、このプール＋生成問題から決定的に構成する。
// transparent語は読み・用法を優先し、false friendは意味・使用場面の違いを優先する。
// FoundationQuestion.dimension（表示用）と vocabDimension（進捗記録用・§4）は別に持つ。
import type { FoundationQuestion } from './foundationTypes';
import type { VocabQuestionDimension } from './vocabProgress';

export interface VocabPoolQuestion {
  itemId: string;
  vocabDimension: VocabQuestionDimension;
  q: FoundationQuestion;
}

const q = (
  id: string, itemId: string, vocabDimension: VocabQuestionDimension,
  type: FoundationQuestion['type'], dimension: FoundationQuestion['dimension'],
  promptJa: string, promptZh: string, choices: string[],
  explanationJa: string, explanationZh: string,
): VocabPoolQuestion => ({
  itemId, vocabDimension,
  q: {
    id, targetItemId: itemId, dimension, type, promptJa, promptZh,
    choices, answerIndex: 0, explanationJa, explanationZh,
    errorTag: `vdiag_${vocabDimension}_${itemId}`, review: 'draft',
  },
});

/** 基礎パック用プール（transparent語中心: 読み・用法・助詞・な接続を確認） */
export const BASIC_POOL: VocabPoolQuestion[] = [
  q('vdq-b-r-chugoku', 'fi-chugoku', 'reading', 'reading_choice', 'reading', '「中国」の読みは？', '「中国」怎么读？', ['ちゅうごく', 'ちゅうこく', 'ちゅごく'], '中国＝ちゅうごく。', '中国读作「ちゅうごく」。'),
  q('vdq-b-r-gakkou', 'fi-gakkou', 'reading', 'reading_choice', 'reading', '「学校」の読みは？', '「学校」怎么读？', ['がっこう', 'がくこう', 'がっこ'], '学校＝がっこう（促音＋長音）。', '学校读作「がっこう」，注意促音和长音。'),
  q('vdq-b-r-byouin', 'fi-byouin', 'reading', 'reading_choice', 'reading', '「病院」の読みは？', '「病院」怎么读？', ['びょういん', 'びよういん', 'びょいん'], '病院＝びょういん。「びよういん」は美容院です。', '病院读作「びょういん」。「びよういん」是美容院。'),
  q('vdq-b-r-yuumei', 'fi-yuumei', 'reading', 'reading_choice', 'reading', '「有名」の読みは？', '「有名」怎么读？', ['ゆうめい', 'ゆめい', 'ようめい'], '有名＝ゆうめい。', '有名读作「ゆうめい」。'),
  q('vdq-b-m-kazoku', 'fi-kazoku', 'meaning', 'single_choice', 'meaning', '「家族」の意味は？', '「家族」的意思是？', ['家人', '亲戚', '邻居'], '家族＝家人。', '家族＝家人。'),
  q('vdq-b-m-kantan', 'fi-kantan', 'meaning', 'single_choice', 'meaning', '「簡単」の意味は？', '「簡単」的意思是？', ['简单', '复杂', '重要'], '簡単＝简单。', '簡単＝简单。'),
  q('vdq-b-c-mizu', 'fi-mizu', 'collocation', 'single_choice', 'usage', '「水を（　）ます」正しいのは？', '「水を（　）ます」应该选？', ['飲み', '食べ', '見'], '水は「飲みます」。', '喝水用「飲みます」。'),
  q('vdq-b-u-gakusei', 'fi-gakusei', 'usage', 'sentence_choice', 'usage', '自然な文はどれですか。', '哪句自然？', ['学生です。', '学生します。', '学生にです。'], '名詞は「〜です」。「学生します」とは言いません。', '名词句用「〜です」：学生です。'),
  q('vdq-b-u-chugoku', 'fi-chugoku', 'usage', 'sentence_choice', 'usage', '自然な自己紹介はどれですか。', '哪句自我介绍自然？', ['中国出身です。', '中国が出身です。', '出身は中国します。'], '「〇〇出身です」が自然です。', '自然的说法是「中国出身です」。'),
  q('vdq-b-p-nihon', 'fi-nihon', 'particle', 'particle_choice', 'particle', '「日本（　）住んでいます」正しい助詞は？', '「日本（　）住んでいます」应该用哪个助词？', ['に', 'で', 'を'], '住む場所は「に」。', '居住地点用「に」。'),
  q('vdq-b-p-gakkou', 'fi-gakkou', 'particle', 'particle_choice', 'particle', '「学校（　）行きます」正しい助詞は？', '「学校（　）行きます」应该用哪个助词？', ['に', 'で', 'が'], '行き先は「に／へ」。', '目的地用「に／へ」。'),
  q('vdq-b-f-yuumei', 'fi-yuumei', 'conjugation', 'conjugation_choice', 'form', '「（　）店です」正しいのは？', '「（　）店です」应该选？', ['有名な', '有名い', '有名の'], '有名はな形容詞:「有名な店」。', '有名是な形容词：有名な店。'),
  q('vdq-b-f-kantan', 'fi-kantan', 'conjugation', 'conjugation_choice', 'form', '「この問題は（　）です」正しいのは？', '「この問題は（　）です」应该选？', ['簡単', '簡単な', '簡単に'], '文末は「簡単です」。「な」は名詞修飾のときだけ。', '句尾直接说「簡単です」；「な」只用于修饰名词。'),
  // CEO判断でcognate確定した語の意味・用法問題（2026-07-28・分類名そのものは問わない）
  q('vdq-b-m-yasui', 'fi-yasui', 'meaning', 'single_choice', 'meaning', '「安いスーパー」の意味は？', '「安いスーパー」的意思是？', ['价格便宜的超市', '安全的超市', '安静的超市'], '安い＝值段が低い。中国語の「安」（安全・平安）とは意味が違います。', '日语「安い」表示价格低，和中文「安」（安全・平安）意思不同。'),
  q('vdq-b-m-nanji', 'fi-nanji', 'meaning', 'single_choice', 'meaning', '「今、何時ですか」に近い中国語は？', '「今、何時ですか」最接近的中文是？', ['现在几点？', '现在什么时候？', '今天是什么日子？'], '時刻を聞く「何時ですか」＝几点。中国語の「何时」は「いつ」に近い書面語です。', '日语「何時」问具体时刻＝几点；中文“何时”多是书面语的“什么时候”。'),
];

/** N3パック用プール（transparent語=読み・用法／自他・類義・接続・false friend） */
export const N3_POOL: VocabPoolQuestion[] = [
  q('vdq-n-r-riyuu', 'fi-riyuu', 'reading', 'reading_choice', 'reading', '「理由」の読みは？', '「理由」怎么读？', ['りゆう', 'りゆ', 'りいゆう'], '理由＝りゆう。', '理由读作「りゆう」。'),
  q('vdq-n-r-joukyou', 'fi-joukyou', 'reading', 'reading_choice', 'reading', '「状況」の読みは？', '「状況」怎么读？', ['じょうきょう', 'じょきょう', 'じょうきょ'], '状況＝じょうきょう。', '状況读作「じょうきょう」。'),
  q('vdq-n-m-keiken', 'fi-keiken', 'meaning', 'single_choice', 'meaning', '「経験」の意味は？', '「経験」的意思是？', ['经验；经历', '实验', '危险'], '経験＝经验。', '経験＝经验；经历。'),
  q('vdq-n-m-kankei', 'fi-kankei', 'meaning', 'single_choice', 'meaning', '「関係」の意味は？', '「関係」的意思是？', ['关系', '机关', '关心'], '関係＝关系。', '関係＝关系。'),
  q('vdq-n-m-jiyuu', 'fi-jiyuu', 'meaning', 'single_choice', 'meaning', '「自由」の意味は？', '「自由」的意思是？', ['自由', '理由', '自己'], '自由＝自由。「理由（りゆう）」と混同しないこと。', '自由＝自由。注意不要和「理由」混淆。'),
  q('vdq-n-c-iken', 'fi-iken', 'collocation', 'single_choice', 'usage', '「会議で意見を（　）」正しいのは？', '「会議で意見を（　）」应该选？', ['言います', 'あります', '見ます'], '「意見を言う」がコロケーション。', '固定搭配是「意見を言う」。'),
  q('vdq-n-c-mondai', 'fi-mondai', 'collocation', 'single_choice', 'usage', '「特に問題は（　）」正しいのは？', '「特に問題は（　）」应该选？', ['ありません', 'いません', 'しません'], '「問題はありません」。物・事は「ある」。', '「問題はありません」是常用回答。'),
  q('vdq-n-c-jouhou', 'fi-jouhou', 'collocation', 'single_choice', 'usage', '「ネットで情報を（　）」正しいのは？', '「ネットで情報を（　）」应该选？', ['集めます', '飲みます', '住みます'], '「情報を集める」がコロケーション。', '固定搭配是「情報を集める」。'),
  q('vdq-n-u-houhou', 'fi-houhou', 'usage', 'sentence_choice', 'usage', '自然な文はどれですか。', '哪句自然？', ['いい方法を考えます。', '方法がします。', '方法に高いです。'], '「方法を考える」が自然です。', '自然的说法是「方法を考える」。'),
  q('vdq-n-u-shuukan', 'fi-shuukan', 'usage', 'single_choice', 'usage', '「毎朝散歩するのが（　）です」合うのは？', '「毎朝散歩するのが（　）です」应该选？', ['習慣', '経験', '都合'], '毎日繰り返すこと＝習慣。', '每天重复的事＝習慣。'),
  q('vdq-n-p-kyoumi', 'fi-kyoumi', 'particle', 'particle_choice', 'particle', '「日本の文化（　）興味があります」正しい助詞は？', '「日本の文化（　）興味があります」应该用哪个助词？', ['に', 'を', 'が'], '「〜に興味がある」。中国語の「对〜感兴趣」に対応。', '「〜に興味がある」＝对〜感兴趣。'),
  q('vdq-n-p-nareru', 'fi-nareru', 'particle', 'particle_choice', 'particle', '「日本の生活（　）慣れました」正しい助詞は？', '「日本の生活（　）慣れました」应该用哪个助词？', ['に', 'を', 'で'], '「〜に慣れる」。', '「〜に慣れる」，对象用「に」。'),
  q('vdq-n-p-soudan', 'fi-soudan', 'particle', 'particle_choice', 'particle', '「上司（　）相談します」正しい助詞は？', '「上司（　）相談します」应该用哪个助词？', ['に', 'を', 'が'], '相談の相手は「に（／と）」。', '商量的对象用「に」或「と」。'),
  q('vdq-n-t-kimaru', 'fi-kimaru', 'usage', 'conjugation_choice', 'usage', '「新しい仕事が（　）ました」正しいのは？', '「新しい仕事が（　）ました」应该选？', ['決まり', '決め', '決められ'], '「〜が決まる」（自動詞）。「決める」は「〜を決める」。', '自动词「決まる」：仕事が決まる。他动词是「〜を決める」。'),
  q('vdq-n-t-kawaru', 'fi-kawaru', 'usage', 'conjugation_choice', 'usage', '「予定が（　）ました」正しいのは？', '「予定が（　）ました」应该选？', ['変わり', '変え', '変えて'], '「〜が変わる」（自動詞）。「変える」は「〜を変える」。', '自动词「変わる」：予定が変わる。他动词是「〜を変える」。'),
  q('vdq-n-s-kangaeru', 'fi-kangaeru', 'usage', 'single_choice', 'usage', '「よく（　）から決めます」合うのは？', '「よく（　）から決めます」应该选？', ['考えて', '思って', '感じて'], '頭を使ってじっくり＝考える。「思う」は感じ・意見。', '动脑思考用「考える」；「思う」是觉得・认为。'),
  q('vdq-n-f-tsuzukeru', 'fi-tsuzukeru', 'conjugation', 'conjugation_choice', 'form', '「毎日勉強を（　）います」正しいのは？', '「毎日勉強を（　）います」应该选？', ['続けて', '続いて', '続かって'], '「〜を続けています」（他動詞のて形）。', '他动词て形：続けて（います）。'),
  q('vdq-n-f-ganbaru', 'fi-ganbaru', 'conjugation', 'conjugation_choice', 'form', '「明日も（　）ます」正しいのは？', '「明日も（　）ます」应该选？', ['頑張り', '頑張る', '頑張って'], 'ます形は「頑張ります」。', 'ます形是「頑張ります」。'),
  q('vdq-n-ff-tsugou', 'fi-tsugou', 'usage', 'sentence_choice', 'usage', '「都合」の自然な使い方はどれですか。', '「都合」的自然用法是哪个？', ['明日は都合が悪いです。', 'この服は都合です。', '値段が都合しています。'], '「都合がいい／悪い」＝時間の予定が合う／合わない。中国語の「都合适」とは別の語。', '「都合がいい／悪い」指时间方便与否，和中文「都合适」不是一个词。'),
  q('vdq-n-ff-taihen', 'fi-taihen', 'meaning', 'single_choice', 'meaning', '「仕事が大変です」の「大変」の意味は？', '「仕事が大変です」的「大変」是什么意思？', ['辛苦；不容易', '发生了大的变化', '非常大'], '大変＝辛苦・骨が折れる。中国語の「大变」ではない。', '大変＝辛苦，不是中文的「大变」。'),
  // CEO判断でcognate確定した語の意味・用法問題（2026-07-28・分類名そのものは問わない）
  q('vdq-n3-m-yakusoku', 'fi-yakusoku', 'meaning', 'single_choice', 'meaning', '日本語の「約束」に近い中国語は？', '最接近日语「約束」的中文是？', ['约定', '约束', '拘束'], '日本語の約束＝约定（承诺）。中国語の「约束」は主に制限・管束の意味です。', '日语「約束」＝约定、承诺；现代中文“约束”主要表示限制、管束。'),
  q('vdq-n3-u-zenzen', 'fi-zenzen', 'usage', 'sentence_choice', 'usage', '「全然」の使い方が自然なのはどれですか。', '「全然」哪个用法自然？', ['説明が速くて全然分かりませんでした。', '説明が速くて全然分かりました。', '説明は全然です。'], '「全然」は基本的に否定と呼応します（全然〜ない）。口語では「全然大丈夫」もあります。', '「全然」基本和否定搭配（全然〜ない）；口语中也有「全然大丈夫」的肯定用法。'),
];

/**
 * 会話コア語の確認問題（Phase 2E-1.10 §10）。
 * これらの語は全trackでrequired＝通常の診断セットに一度も入らなかった（2E-1.9の接続監査で判明）。
 * 読み・意味は基礎的なので、会話で実際に間違えやすい「助詞・活用・使い分け」を確認する。
 * 診断セットには決定的ローテーションで少数ずつ入れる（問題数を増やさない・§10）。
 */
export const CONVERSATION_CORE_POOL: VocabPoolQuestion[] = [
  q('vdq-c-p-sumu', 'fi-sumu', 'particle', 'particle_choice', 'particle', '「東京（　）住んでいます」正しい助詞は？', '「東京（　）住んでいます」应该用哪个助词？', ['に', 'で', 'を'], '住む場所は「に」。「で」は動作をする場所。', '居住地点用「に」；「で」表示做动作的场所。'),
  q('vdq-c-p-hataraku', 'fi-hataraku', 'particle', 'particle_choice', 'particle', '「会社（　）働いています」正しい助詞は？', '「会社（　）働いています」应该用哪个助词？', ['で', 'に', 'を'], '働く場所は「で」（動作をする場所）。住む場所の「に」と区別。', '工作地点用「で」，和居住地点的「に」区分。'),
  q('vdq-c-p-iku', 'fi-iku', 'particle', 'particle_choice', 'particle', '「駅（　）行きます」正しい助詞は？', '「駅（　）行きます」应该用哪个助词？', ['に', 'で', 'が'], '行き先は「に／へ」。', '目的地用「に／へ」。'),
  q('vdq-c-p-kiku', 'fi-kiku', 'particle', 'particle_choice', 'particle', '「先生（　）聞きます」＝先生に質問する。正しい助詞は？', '「先生（　）聞きます」＝向老师提问。应该用哪个助词？', ['に', 'を', 'で'], '質問する相手は「に」。「音楽を聞く」の「を」と区別。', '提问对象用「に」；「音楽を聞く」用「を」。'),
  q('vdq-c-f-kuru', 'fi-kuru', 'conjugation', 'conjugation_choice', 'form', '「日本に（　）ました」正しいのは？', '「日本に（　）ました」应该选？', ['来', 'き', 'くり'], '来る→来ました（きました）。不規則動詞です。', '来る是不规则动词：来ました（きました）。'),
  q('vdq-c-f-taberu', 'fi-taberu', 'conjugation', 'conjugation_choice', 'form', '「朝ごはんを（　）ています」正しいのは？', '「朝ごはんを（　）ています」应该选？', ['食べ', '食べる', '食べり'], '食べる→食べています（二類動詞）。', '食べる是二类动词：食べています。'),
  q('vdq-c-f-benkyo', 'fi-benkyo', 'conjugation', 'conjugation_choice', 'form', '「日本語を（　）います」正しいのは？', '「日本語を（　）います」应该选？', ['勉強して', '勉強で', '勉強し'], '「勉強する」→勉強しています（三類動詞）。', '「勉強する」是三类动词：勉強しています。'),
  q('vdq-c-u-nomu', 'fi-nomu', 'collocation', 'single_choice', 'usage', '「薬を（　）ます」自然なのは？', '「薬を（　）ます」哪个自然？', ['飲み', '食べ', '使い'], '日本語では薬は「飲む」。中国語の「吃药」と違います。', '日语里吃药说「薬を飲む」，和中文的「吃药」不同。'),
  q('vdq-c-u-miru', 'fi-miru', 'collocation', 'single_choice', 'usage', '「映画を（　）ます」自然なのは？', '「映画を（　）ます」哪个自然？', ['見', '聞き', '読み'], '映画は「見る」。', '看电影用「見る」。'),
  q('vdq-c-u-hanasu', 'fi-hanasu', 'usage', 'sentence_choice', 'usage', '自然な文はどれですか。', '哪句自然？', ['日本語を話します。', '日本語が話します。', '日本語で話しません。'], '話す対象の言語は「を」。', '所说的语言用「を」：日本語を話します。'),
  q('vdq-c-ff-sensei', 'fi-sensei', 'usage', 'sentence_choice', 'usage', '「先生」の使い方が正しいのはどれですか。', '「先生」的正确用法是哪个？', ['田中先生に聞きます。', '田中先生は男の人です（＝Mr.の意味で）。', '店の先生に聞きます。'], '日本語の「先生」は教師・医師などへの敬称。一般の男性は「〜さん」。', '日语「先生」用于老师・医生等，不是中文的「先生（Mr.）」；一般男性用「〜さん」。'),
];

/** 会話コア語のitemId（実データ由来・手入力の固定リストを作らない・§10） */
export const conversationCoreItemIds = (): string[] =>
  [...new Set(CONVERSATION_CORE_POOL.map((p) => p.itemId))];

export const poolQuestionsFor = (packId: string): VocabPoolQuestion[] =>
  packId === 'pack-n3-prep-1' ? N3_POOL : BASIC_POOL;

/**
 * 自他・対比ペア（§5: 誤答軸から関連Itemをremedial候補=復習候補へ追加する材料）。
 * 関連Itemの診断結果は変更しない（未出題の語へ結果をでっち上げない）。
 */
export const RELATED_ITEM_PAIRS: [string, string][] = [
  ['fi-kimaru', 'fi-kimeru'],
  ['fi-kawaru', 'fi-kaeru-change'],
  ['fi-fueru', 'fi-heru'],
  ['fi-tsuzuku', 'fi-tsuzukeru'],
  ['fi-hajimeru', 'fi-owaru'],
  ['fi-kimochi', 'fi-kibun'],
  ['fi-omou', 'fi-kangaeru'],
];
export const relatedItemsOf = (itemId: string): string[] =>
  RELATED_ITEM_PAIRS.filter((p) => p.includes(itemId)).map((p) => (p[0] === itemId ? p[1] : p[0]));
