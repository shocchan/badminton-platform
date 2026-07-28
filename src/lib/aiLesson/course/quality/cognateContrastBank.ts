// 高リスク同形語の contrast／転移誤用バンク（§12・§16）。
//
// 中国語と同じ漢字なのに使い方が違う語は、「意味を選ぶ」問題では測れない。
// ここでは実際の誤用（母語転移）を題材にした問題文を、語ごとに個別作成している。
//
// 執筆主体の正確な状態（誤認防止・§3）:
//   authorship = 'individually_authored_by_ai'（テンプレートへ語を差し替えた量産ではなく、
//   語ごとに転移リスクを見て個別に作文したが、書いたのはAIであり人間ではない）
//   humanReviewed = false / approved = false
// 「人手執筆」「人間確認済み」と表現してはいけない。
import type { LearningDimension } from './cognateProfile';

export interface ContrastQuestion {
  itemId: string;
  dimension: Extract<LearningDimension, 'transfer_error' | 'scope_contrast' | 'register'>;
  promptJa: string;
  promptZh: string;
  /** 選択肢はすべて文法的に成立する日本語。意味・場面の適否で選ばせる */
  choices: string[];
  answerIndex: number;
  explanationJa: string;
  explanationZh: string;
  /** 執筆主体。AIが語ごとに個別作成（テンプレ量産ではない）が、人間の執筆・確認ではない */
  authorship: 'individually_authored_by_ai';
  humanReviewed: false;
  approved: false;
  reviewStatus: 'human_review_candidate';
}

const q = (
  itemId: string, dimension: ContrastQuestion['dimension'],
  promptJa: string, promptZh: string, choices: string[], answerIndex: number,
  explanationJa: string, explanationZh: string,
): ContrastQuestion => ({ itemId, dimension, promptJa, promptZh, choices, answerIndex, explanationJa, explanationZh,
  authorship: 'individually_authored_by_ai', humanReviewed: false, approved: false, reviewStatus: 'human_review_candidate' });

export const COGNATE_CONTRAST_BANK: ContrastQuestion[] = [
  // ── 先生（中: Mr./夫） ──
  q('fi-sensei', 'transfer_error',
    '初めて会った男性の田中さんに声をかけます。自然なのはどれ？',
    '第一次见到男士田中先生，怎么称呼才自然？',
    ['田中さん、はじめまして。', '田中先生、はじめまして。', '田中先生さん、はじめまして。'], 0,
    '日本語の「先生」は教師・医師など専門職への呼称です。一般の男性には「さん」を使います。',
    '日语的「先生」用于教师、医生等专业人士。对一般男性要用「さん」。中文的「先生」＝Mr. 不能直接搬过来。'),
  q('fi-sensei', 'scope_contrast',
    '「先生」と呼べるのはどの人？',
    '哪种人可以称为「先生」？',
    ['日本語を教えている人', '会社の同僚の男性', '店で買い物をしている男性'], 0,
    '教師・医師・弁護士など、専門知識で人を導く職業に使います。',
    '用于教师、医生、律师等以专业知识指导他人的职业。'),

  // ── 勉強する（中: 无奈・勉强） ──
  q('fi-benkyo', 'transfer_error',
    '「毎日3時間、日本語を勉強します」はどういう意味？',
    '「毎日3時間、日本語を勉強します」是什么意思？',
    ['毎日3時間、日本語を学びます', '毎日3時間、いやいや日本語をやります', '毎日3時間、なんとか日本語ができます'], 0,
    '日本語の「勉強する」は学習すること。中国語の「勉强（いやいや）」の意味はありません。',
    '日语的「勉強する」＝学习。没有中文「勉强」（不情愿、勉勉强强）的意思。'),

  // ── 約束（中: 拘束・制限） ──
  q('fi-yakusoku', 'transfer_error',
    '友達と「約束しました」。何をしましたか？',
    '和朋友「約束しました」，是做了什么？',
    ['会う時間を決めました', '友達の行動を制限しました', '友達に注意しました'], 0,
    '日本語の「約束」は取り決め・promise。中国語の「约束（拘束する）」とは違います。',
    '日语的「約束」＝约定、promise。和中文的「约束」（限制、拘束）意思不同。'),

  // ── 無理（中: 理不尽） ──
  q('fi-muri', 'transfer_error',
    '仕事を頼まれて「すみません、今日は無理です」と言いました。伝わる意味は？',
    '被拜托工作时说「今日は無理です」，对方理解成什么？',
    ['今日はできません', '今日の依頼は理不尽です', '今日は無理をしてでもやります'], 0,
    '日本語の「無理」は「不可能・できない」。中国語の「无理（理不尽）」の意味はありません。',
    '日语的「無理」＝做不到、不可能。没有中文「无理」（不讲理）的意思。'),

  // ── 上手（中: 着手する） ──
  q('fi-jouzu', 'scope_contrast',
    '相手の日本語をほめたいとき、自然なのはどれ？',
    '想称赞对方的日语，哪句自然？',
    ['日本語が上手ですね。', '日本語を上手しますね。', '日本語は上手になります。'], 0,
    '「上手」はな形容詞で「〜が上手です」の形。技能をほめる言葉です。',
    '「上手」是な形容词，用「〜が上手です」。是称赞技能的说法，不是中文的「着手」。'),

  // ── 全然（中: 全然＝完全に・肯定可） ──
  q('fi-zenzen', 'transfer_error',
    '「この本は全然＿＿」。自然な続きはどれ？',
    '「この本は全然＿＿」后面接什么自然？',
    ['難しくないです', '難しいです', '難しかったです'], 0,
    '日本語の「全然」は基本的に否定と一緒に使います（全然〜ない）。',
    '日语的「全然」基本和否定一起用（全然〜ない）。中文的「全然」可以接肯定，日语不行。'),

  // ── 大変（中: 大きく変わる） ──
  q('fi-taihen', 'scope_contrast',
    '「引っ越しは大変でした」の意味は？',
    '「引っ越しは大変でした」是什么意思？',
    ['引っ越しは苦労が多かった', '引っ越しで大きく変わった', '引っ越しは大成功だった'], 0,
    '「大変」は「苦労が多い・とても」。字面の「大きく変わる」ではありません。',
    '「大変」＝辛苦、非常。不是字面上的「大变（大的变化）」。'),

  // ── 安い（中: 安＝安全） ──
  q('fi-yasui', 'transfer_error',
    '「この店は安いです」の意味は？',
    '「この店は安いです」是什么意思？',
    ['値段が低いです', '安全な店です', '静かな店です'], 0,
    '「安い」は値段が低いこと。中国語の「安（安全）」とは違います。',
    '「安い」＝价格便宜。和中文的「安」（安全）不同。'),

  // ── 家族（中: 一族まで含む） ──
  q('fi-kazoku', 'scope_contrast',
    '日本語の「家族」が普通に指すのはどれ？',
    '日语的「家族」通常指哪个范围？',
    ['一緒に住んでいる親・子など近い人', '同じ姓の親戚すべて', '会社の同僚たち'], 0,
    '日本語の「家族」は同居する近親が中心です。広い親族は「親戚」と言います。',
    '日语的「家族」以同住的近亲为主。范围更广的亲属叫「親戚」。'),

  // ── 予定（中: 预定＝予約する） ──
  q('fi-yotei', 'transfer_error',
    'ホテルの部屋を取ることを日本語で言うと？',
    '「订酒店房间」用日语怎么说？',
    ['ホテルを予約します', 'ホテルを予定します', 'ホテルを約束します'], 0,
    '部屋を取るのは「予約」。「予定」はこれからのスケジュールのことです。',
    '订房间用「予約」。「予定」是指今后的日程安排，不是中文的「预定」。'),

  // ── 高い（中: 高＝高さのみ） ──
  q('fi-takai', 'scope_contrast',
    '「このかばんは高いです」。まず伝わる意味は？',
    '「このかばんは高いです」首先传达的意思是？',
    ['値段が高いです', '位置が高いところにあります', '品質が高いです'], 0,
    '「高い」は「値段」と「高さ」の両方に使えます。ものの値段の話では値段の意味が中心です。',
    '「高い」既可指价格也可指高度。说物品时首先是价格贵的意思（中文的「贵」）。'),

  // ── 困る（中: 困＝眠い・閉じ込める） ──
  q('fi-komaru', 'transfer_error',
    '「困っています」と言われました。相手の状態は？',
    '对方说「困っています」，是什么状态？',
    ['どうしていいか分からない', '眠くなっている', '閉じ込められている'], 0,
    '日本語の「困る」は「どうしていいか分からない」。中国語の「困（眠い）」ではありません。',
    '日语的「困る」＝为难、不知所措。不是中文的「困」（困倦）。'),
];

const BY_ITEM = new Map<string, ContrastQuestion[]>();
for (const c of COGNATE_CONTRAST_BANK) {
  BY_ITEM.set(c.itemId, [...(BY_ITEM.get(c.itemId) ?? []), c]);
}

export const contrastQuestionsFor = (itemId: string): ContrastQuestion[] => BY_ITEM.get(itemId) ?? [];
export const contrastCoveredItemIds = (): string[] => [...BY_ITEM.keys()];
