/**
 * Business Japanese ＝ Practical Axis の一層（2026-09-10 Phase 5）。
 *
 * 【方針】
 * JLPT N1 の上位教材としては作らない。JLPT の教材をコピーもしない。
 * **知識項目（文法・語彙・読解・聴解）は共通のまま**、その上に「仕事の文脈」を別の層として載せる:
 *   context（敬語・社内・報連相・電話・会議・メール／チャット・交渉・営業・面接・職場文化）
 *     → 既存の grammarId（敬語は N4 の尊敬語・謙譲語・〜ております … そのまま使う）
 *     → 既存の語彙（Practical Axis の work／money 分野 × 場面タグ ＋ 文脈の手がかり語）
 *     → 既存の読解・聴解（Phase 4 の接続で辿る）
 *     → 産出（文法の practice ＝ AI会話ミッション）と、文脈ごとの会話場面
 *
 * 同じ文法を Business 用に複製しない。ここにあるのは **ID と文脈** だけで、教材本文は無い。
 * N2 文法の分類（n2Categories: formal／work）は既存のものを再利用する。
 */
import { N2_ITEM_CATEGORIES } from '../n2Categories';
import { SITUATION_KEYWORDS, type PracticalDomain, type SituationTag } from './practicalAxis';
import { parseKnowledgeId, isHigherLevel, LEVEL_ORDER, type KnowledgeLevel } from './knowledgeId';
import type { CrossLinkIndex } from './crossLinks';

export type BusinessContextId =
  | 'keigo' | 'internal' | 'horenso' | 'phone' | 'meeting'
  | 'email' | 'negotiation' | 'sales' | 'interview' | 'culture';

export interface BusinessScene {
  sceneId: string;
  titleJa: string; titleZh: string;
  /** AI会話の最初の一言（practice.starterJa と同じ役割） */
  starterJa: string; starterZh: string;
  /** この場面で使う既存の文法 */
  grammarIds: string[];
}

export interface BusinessContext {
  id: BusinessContextId;
  labelJa: string; labelZh: string;
  descJa: string; descZh: string;
  /** 既存の文法ID（複製しない） */
  grammarIds: string[];
  /** N2 の既存分類から自動で足す（primary/secondary がこれに当たるもの） */
  n2Categories: readonly ('formal' | 'work')[];
  /** 語彙を引く分野・場面（Practical Axis） */
  domains: PracticalDomain[];
  situations: SituationTag[];
  /** 文脈の手がかり語。見出し語か説明文に出る語彙をこの文脈へ入れる */
  keywords: string[];
  scenes: BusinessScene[];
}

const KEIGO = ['n4g-sonkeigo-oninaru', 'n4g-kenjougo-osuru', 'n4g-sonkeigo-tokubetsu', 'n4g-kenjougo-tokubetsu', 'n4g-teorimasu', 'n4g-saseteitadakimasu'];

const BASE_CONTEXTS: BusinessContext[] = [
  {
    id: 'keigo', labelJa: '敬語', labelZh: '敬语',
    descJa: '尊敬語・謙譲語・丁寧語を、相手と場面で使い分ける', descZh: '根据对象和场合区分使用尊敬语、谦让语、礼貌语',
    grammarIds: [...KEIGO, 'n4g-teitadakemasenka', 'n5g-mashouka-moushide'],
    n2Categories: ['formal'], domains: ['work'], situations: ['requesting', 'apologizing', 'confirming'],
    keywords: ['敬語', '尊敬', '謙譲', '丁寧', '失礼', '恐縮', '目上'],
    scenes: [
      { sceneId: 'biz-keigo-visitor', titleJa: '来客を案内する', titleZh: '接待来访客人', starterJa: 'お待たせいたしました。会議室へご案内します。', starterZh: '让您久等了。我带您去会议室。', grammarIds: ['n4g-kenjougo-osuru', 'n4g-sonkeigo-tokubetsu'] },
      { sceneId: 'biz-keigo-ask-boss', titleJa: '上司に確認を頼む', titleZh: '请上司确认', starterJa: 'お忙しいところ恐れ入ります。一点、ご確認いただけませんか。', starterZh: '百忙之中打扰了。有一点想请您确认。', grammarIds: ['n4g-teitadakemasenka', 'n4g-sonkeigo-oninaru'] },
    ],
  },
  {
    id: 'internal', labelJa: '社内のやりとり', labelZh: '公司内部沟通',
    descJa: '同僚・上司・部下との日常のやりとり。頼む・断る・確かめる', descZh: '与同事、上司、下属的日常沟通：拜托、拒绝、确认',
    grammarIds: ['n4g-teitadakemasenka', 'n4g-tekureru', 'n4g-teorimasu', 'n2g-089', 'n1g-049'],
    n2Categories: ['work'], domains: ['work'], situations: ['requesting', 'refusing', 'confirming', 'scheduling'],
    keywords: ['同僚', '部下', '上司', '社内', '部署', '担当', '引き継'],
    scenes: [
      { sceneId: 'biz-internal-handoff', titleJa: '仕事を引き継ぐ', titleZh: '交接工作', starterJa: '来月から担当が代わるので、引き継ぎをお願いしたいのですが。', starterZh: '下个月起负责人会更换，想请你做一下交接。', grammarIds: ['n4g-teitadakemasenka', 'n2g-089'] },
      { sceneId: 'biz-internal-decline', titleJa: '頼まれた仕事を断る', titleZh: '婉拒被拜托的工作', starterJa: '申し訳ないのですが、今週は手一杯で……。', starterZh: '很抱歉，这周实在忙不过来……', grammarIds: ['n2g-028', 'n1g-049'] },
    ],
  },
  {
    id: 'horenso', labelJa: '報告・連絡・相談', labelZh: '报告・联络・商量',
    descJa: '結論から報告する。遅れや問題を早めに連絡する。判断に迷ったら相談する', descZh: '先说结论；延误和问题要尽早联络；拿不定主意时商量',
    grammarIds: ['n4g-teorimasu', 'n2g-054', 'n1g-104', 'n2g-014', 'n1g-091', 'n4g-soudesu-denbun'],
    n2Categories: ['work'], domains: ['work'], situations: ['reporting', 'explaining', 'confirming'],
    keywords: ['報告', '連絡', '相談', '進捗', '納期', '遅れ', '見積'],
    scenes: [
      { sceneId: 'biz-horenso-delay', titleJa: '納期の遅れを報告する', titleZh: '报告交期延误', starterJa: '例の案件ですが、部品の調達が遅れておりまして。', starterZh: '关于那个项目，零件采购出现了延误。', grammarIds: ['n4g-teorimasu', 'n1g-091'] },
      { sceneId: 'biz-horenso-consult', titleJa: '判断に迷って相談する', titleZh: '拿不定主意时商量', starterJa: '少しご相談したいことがあるのですが、今よろしいでしょうか。', starterZh: '有件事想和您商量一下，现在方便吗？', grammarIds: ['n4g-teitadakemasenka', 'n2g-054'] },
    ],
  },
  {
    id: 'phone', labelJa: '電話', labelZh: '电话',
    descJa: '受ける・取り次ぐ・伝言を受ける・かけ直す', descZh: '接电话、转接、记留言、回电',
    grammarIds: ['n4g-teorimasu', 'n4g-kenjougo-tokubetsu', 'n4g-sonkeigo-tokubetsu', 'n5g-mashouka-moushide', 'n4g-saseteitadakimasu'],
    n2Categories: ['formal'], domains: ['work'], situations: ['asking', 'confirming', 'scheduling'],
    keywords: ['電話', '伝言', '取り次', '折り返', '不在', '外出', '席を外'],
    scenes: [
      { sceneId: 'biz-phone-absent', titleJa: '担当者が不在の電話を受ける', titleZh: '负责人不在时接电话', starterJa: 'お電話ありがとうございます。あいにく田中は席を外しております。', starterZh: '感谢来电。很不巧，田中现在不在座位上。', grammarIds: ['n4g-teorimasu', 'n5g-mashouka-moushide'] },
      { sceneId: 'biz-phone-callback', titleJa: '折り返しの電話をかける', titleZh: '回电话', starterJa: '先ほどお電話をいただいた件で、折り返しご連絡いたしました。', starterZh: '关于您刚才来电的事，我给您回电话。', grammarIds: ['n4g-kenjougo-tokubetsu', 'n4g-saseteitadakimasu'] },
    ],
  },
  {
    id: 'meeting', labelJa: '会議', labelZh: '会议',
    descJa: '意見を述べる・根拠を示す・反対する・まとめる', descZh: '发表意见、说明依据、提出反对、总结',
    grammarIds: ['n4g-toomoimasu', 'n1g-110', 'n1g-136', 'n1g-137', 'n1g-107', 'n1g-049', 'n2g-014'],
    n2Categories: ['formal', 'work'], domains: ['work'], situations: ['explaining', 'negotiating', 'confirming'],
    keywords: ['会議', '議題', '議事録', '意見', '提案', '結論', '賛成', '反対'],
    scenes: [
      { sceneId: 'biz-meeting-propose', titleJa: '会議で提案する', titleZh: '在会议上提案', starterJa: '前回の結果を踏まえて、一つ提案があります。', starterZh: '基于上次的结果，我有一个提案。', grammarIds: ['n1g-110', 'n4g-toomoimasu'] },
      { sceneId: 'biz-meeting-object', titleJa: '会議で反対意見を言う', titleZh: '在会议上表达反对意见', starterJa: 'ご提案はもっともだと思うのですが、一点だけ懸念があります。', starterZh: '您的提案很有道理，但有一点顾虑。', grammarIds: ['n1g-049', 'n2g-014'] },
    ],
  },
  {
    id: 'email', labelJa: 'メール・チャット', labelZh: '邮件・聊天',
    descJa: '件名・宛名・用件・締めの型。依頼と催促を失礼なく書く', descZh: '主题、称呼、正文、结尾的固定格式；礼貌地写请求和催促',
    grammarIds: ['n4g-teitadakemasenka', 'n4g-saseteitadakimasu', 'n2g-054', 'n1g-069', 'n1g-029'],
    n2Categories: ['formal'], domains: ['work'], situations: ['requesting', 'confirming', 'apologizing', 'reporting'],
    keywords: ['メール', '件名', '添付', '返信', '送付', '催促', 'お世話'],
    scenes: [
      { sceneId: 'biz-email-request', titleJa: 'メールで資料を頼む（口頭で練習）', titleZh: '用邮件索要资料（口头练习）', starterJa: 'お世話になっております。先日の資料を送付いただけませんでしょうか。', starterZh: '承蒙关照。能否请您发送前几天的资料？', grammarIds: ['n4g-teitadakemasenka', 'n4g-saseteitadakimasu'] },
      { sceneId: 'biz-email-remind', titleJa: '返事がないので催促する', titleZh: '没有回复时催促', starterJa: '先日お送りした件ですが、ご確認いただけましたでしょうか。', starterZh: '关于前几天发送的事项，请问您确认了吗？', grammarIds: ['n2g-054', 'n1g-069'] },
    ],
  },
  {
    id: 'negotiation', labelJa: '交渉', labelZh: '谈判',
    descJa: '条件を提示する・譲歩する・断る・落としどころを探す', descZh: '提出条件、让步、拒绝、寻找折中点',
    grammarIds: ['n2g-028', 'n1g-095', 'n1g-091', 'n1g-049', 'n1g-106', 'n1g-063'],
    n2Categories: ['work'], domains: ['work', 'money'], situations: ['negotiating', 'refusing', 'explaining'],
    keywords: ['交渉', '条件', '妥協', '譲歩', '折衝', '見積', '値引', '契約'],
    scenes: [
      { sceneId: 'biz-nego-price', titleJa: '価格の交渉をする', titleZh: '进行价格谈判', starterJa: 'この金額では、正直なところお受けしかねます。', starterZh: '这个金额，坦白说我们难以接受。', grammarIds: ['n1g-095', 'n1g-106'] },
      { sceneId: 'biz-nego-deadline', titleJa: '納期の条件を詰める', titleZh: '敲定交期条件', starterJa: '納期を一週間早めていただければ、数量は増やせます。', starterZh: '如果交期能提前一周，数量可以增加。', grammarIds: ['n1g-049', 'n1g-063'] },
    ],
  },
  {
    id: 'sales', labelJa: '営業', labelZh: '销售',
    descJa: '訪問・提案・断られたあとの一言・お礼', descZh: '拜访、提案、被拒绝后的一句话、致谢',
    grammarIds: ['n4g-kenjougo-tokubetsu', 'n4g-kenjougo-osuru', 'n1g-004', 'n1g-066', 'n1g-081'],
    n2Categories: ['work'], domains: ['work', 'shopping', 'money'], situations: ['explaining', 'requesting', 'negotiating'],
    keywords: ['営業', '提案', '顧客', '取引', '受注', '納品', '商品', '売上'],
    scenes: [
      { sceneId: 'biz-sales-visit', titleJa: '取引先を訪問して提案する', titleZh: '拜访客户并提案', starterJa: '本日は新しいサービスのご紹介に伺いました。', starterZh: '今天是来介绍新服务的。', grammarIds: ['n4g-kenjougo-tokubetsu', 'n1g-004'] },
      { sceneId: 'biz-sales-declined', titleJa: '断られたあとに次につなげる', titleZh: '被拒绝后为下次铺路', starterJa: '承知しました。またご都合のよいときにお声がけください。', starterZh: '明白了。方便的时候请再联系我。', grammarIds: ['n4g-kenjougo-osuru', 'n1g-066'] },
    ],
  },
  {
    id: 'interview', labelJa: '面接', labelZh: '面试',
    descJa: '自己紹介・志望動機・強みと弱み・逆質問', descZh: '自我介绍、求职动机、优缺点、反向提问',
    grammarIds: ['n4g-kenjougo-tokubetsu', 'n4g-saseteitadakimasu', 'n1g-081', 'n1g-148', 'n1g-011', 'n4g-tameni'],
    n2Categories: ['formal'], domains: ['work', 'school'], situations: ['explaining', 'asking'],
    keywords: ['面接', '志望', '応募', '履歴書', '経歴', '強み', '採用', '入社'],
    scenes: [
      { sceneId: 'biz-interview-motive', titleJa: '志望動機を話す', titleZh: '说明求职动机', starterJa: '御社を志望した理由を、三つに分けてお話しします。', starterZh: '我分三点说明选择贵公司的理由。', grammarIds: ['n4g-kenjougo-tokubetsu', 'n1g-081'] },
      { sceneId: 'biz-interview-weakness', titleJa: '弱みをどう克服しているか話す', titleZh: '谈如何克服自己的弱点', starterJa: '私の弱みは慎重すぎる点ですが、私なりに工夫しています。', starterZh: '我的弱点是过于谨慎，但我在用自己的方式改进。', grammarIds: ['n1g-148', 'n4g-tameni'] },
    ],
  },
  {
    id: 'culture', labelJa: '職場の文化', labelZh: '职场文化',
    descJa: '曖昧な断り・察する・空気を読む・飲み会・時間の感覚', descZh: '委婉的拒绝、察言观色、聚餐、时间观念',
    grammarIds: ['n1g-053', 'n1g-060', 'n1g-125', 'n1g-021', 'n4g-hazudesu', 'n1g-114'],
    n2Categories: ['work'], domains: ['work', 'social'], situations: ['refusing', 'apologizing', 'explaining'],
    keywords: ['習慣', '慣例', '文化', '雰囲気', '気配', '遠慮', '本音', '建前'],
    scenes: [
      { sceneId: 'biz-culture-vague-no', titleJa: '「悪くはないんだけど」の意味を確かめる', titleZh: '确认「不算差，不过……」的含义', starterJa: 'その提案、悪くはないんだけどね……。', starterZh: '那个提案，不算差，不过……', grammarIds: ['n1g-060', 'n1g-053'] },
      { sceneId: 'biz-culture-nomikai', titleJa: '飲み会の誘いを丁寧に断る', titleZh: '礼貌地拒绝聚餐邀请', starterJa: '今日はちょっと、家の用事がありまして……。', starterZh: '今天有点家里的事……', grammarIds: ['n1g-021', 'n4g-hazudesu'] },
    ],
  },
];

/**
 * N3 以下の学習者向けの層。文脈は同じで、使う文法を N3/N4 の既存項目にする。
 * （N1 の文法しか指名していないと、N3 の人には「文脈はあるが文法が無い」束になる）
 */
const N3_LAYER: Record<BusinessContextId, { grammarIds: string[]; scene: BusinessScene }> = {
  keigo: { grammarIds: ['n4g-temorau'], scene: { sceneId: 'biz-keigo-n3-ask', titleJa: '先生や上司に丁寧に頼む', titleZh: '礼貌地请老师或上司帮忙', starterJa: 'すみません、少しお時間をいただけませんか。', starterZh: '不好意思，能占用您一点时间吗？', grammarIds: ['n4g-teitadakemasenka', 'n4g-temorau'] } },
  internal: { grammarIds: ['n3g-tehoshii', 'n3g-teoku', 'n3g-kotoninaru', 'n3g-youniiu', 'n4g-temorau'], scene: { sceneId: 'biz-internal-n3-prepare', titleJa: '会議の準備を頼む・頼まれる', titleZh: '拜托或被拜托准备会议', starterJa: '明日の会議室、予約しておいてもらえますか。', starterZh: '明天的会议室，能先预约好吗？', grammarIds: ['n3g-teoku', 'n4g-temorau'] } },
  horenso: { grammarIds: ['n3g-niyoruto', 'n3g-kotoninaru', 'n3g-osoregaaru', 'n3g-uede', 'n3g-teshimau'], scene: { sceneId: 'biz-horenso-n3-mistake', titleJa: 'ミスをすぐ報告する', titleZh: '立刻报告失误', starterJa: '申し訳ありません、送る相手を間違えてしまいました。', starterZh: '非常抱歉，我把收件人弄错了。', grammarIds: ['n3g-teshimau', 'n3g-kotoninaru'] } },
  phone: { grammarIds: ['n4g-kotogadekimasu', 'n3g-youniiu', 'n4g-tara'], scene: { sceneId: 'biz-phone-n3-message', titleJa: '伝言を伝える', titleZh: '转达留言', starterJa: '田中さんから、折り返し電話するように言われました。', starterZh: '田中让我转告，请您回电。', grammarIds: ['n3g-youniiu', 'n4g-tara'] } },
  meeting: { grammarIds: ['n3g-nitaishite', 'n3g-niyotte', 'n3g-nikurabete', 'n3g-kotoninaru', 'n3g-uede', 'n3g-toiunoha'], scene: { sceneId: 'biz-meeting-n3-compare', titleJa: '二つの案を比べて意見を言う', titleZh: '比较两个方案并发表意见', starterJa: '前の案に比べて、今回の案のほうが費用が抑えられると思います。', starterZh: '和之前的方案相比，我认为这次的方案更能控制费用。', grammarIds: ['n3g-nikurabete', 'n4g-toomoimasu'] } },
  email: { grammarIds: ['n3g-koto-meirei', 'n4g-baaiwa', 'n3g-teoku', 'n3g-nakerebanaranai'], scene: { sceneId: 'biz-email-n3-confirm', titleJa: 'メールの内容を電話で確かめる', titleZh: '打电话确认邮件内容', starterJa: '先ほどのメールですが、添付を確認しておいていただけますか。', starterZh: '关于刚才的邮件，能请您先确认一下附件吗？', grammarIds: ['n3g-teoku', 'n4g-teitadakemasenka'] } },
  negotiation: { grammarIds: ['n4g-ba', 'n4g-nara', 'n3g-kawarini', 'n3g-shikanai', 'n3g-niyotteha'], scene: { sceneId: 'biz-nego-n3-condition', titleJa: '条件を出して頼む', titleZh: '提出条件后拜托', starterJa: '納期を延ばしてもらえるなら、数量は増やせます。', starterZh: '如果交期能延后，数量可以增加。', grammarIds: ['n4g-nara', 'n4g-temorau'] } },
  sales: { grammarIds: ['n3g-nitotte', 'n3g-nookagede', 'n3g-nikagiri', 'n4g-nara-gaii'], scene: { sceneId: 'biz-sales-n3-recommend', titleJa: '商品をすすめる', titleZh: '推荐商品', starterJa: '今週に限り、こちらの商品は二割引です。', starterZh: '仅限本周，这款商品打八折。', grammarIds: ['n3g-nikagiri', 'n4g-nara-gaii'] } },
  interview: { grammarIds: ['n3g-younisuru', 'n3g-kotonisuru', 'n3g-tsuzukeru-fukugou', 'n4g-youninarimasu', 'n3g-uede'], scene: { sceneId: 'biz-interview-n3-intro', titleJa: '自己紹介で努力を話す', titleZh: '自我介绍时谈自己的努力', starterJa: '大学では、毎日日本語で日記を書くようにしていました。', starterZh: '大学期间，我坚持每天用日语写日记。', grammarIds: ['n3g-younisuru', 'n4g-youninarimasu'] } },
  culture: { grammarIds: ['n3g-gachi', 'n3g-rashii', 'n3g-mitai', 'n3g-noni', 'n3g-kotoninaru'], scene: { sceneId: 'biz-culture-n3-honne', titleJa: '本音を確かめる', titleZh: '确认真实想法', starterJa: '大丈夫って言ってたけど、本当は大変みたいだね。', starterZh: '虽然嘴上说没问题，其实好像很辛苦吧。', grammarIds: ['n3g-mitai', 'n3g-noni'] } },
};

export const BUSINESS_CONTEXTS: BusinessContext[] = BASE_CONTEXTS.map((c) => ({
  ...c,
  grammarIds: [...new Set([...c.grammarIds, ...N3_LAYER[c.id].grammarIds])],
  scenes: [...c.scenes, N3_LAYER[c.id].scene],
}));

export const businessContextById = (id: BusinessContextId): BusinessContext | undefined =>
  BUSINESS_CONTEXTS.find((c) => c.id === id);

/** N2 の既存分類（formal／work）から、その文脈に足す grammarId */
export const n2GrammarForContext = (ctx: BusinessContext): string[] =>
  Object.entries(N2_ITEM_CATEGORIES)
    .filter(([, c]) => ctx.n2Categories.includes(c.primary as 'formal' | 'work')
      || c.secondary.some((s) => ctx.n2Categories.includes(s as 'formal' | 'work')))
    .map(([id]) => id);

/* ────────────────────────────────────────────────────────────
   文脈 × 級 → 教材の束（すべて既存ID）
   ──────────────────────────────────────────────────────────── */

export interface BusinessPack {
  context: BusinessContextId;
  level: KnowledgeLevel;
  grammar: { grammarId: string; pattern: string; level: string; explicit: boolean }[];
  vocab: { wordId: string; surface: string; via: string }[];
  reading: string[];
  listening: string[];
  /** AI会話ミッションにできる文法（practice を持つ）＋ 文脈の会話場面 */
  production: { grammarId: string; themeJa: string; targetUse: string }[];
  scenes: BusinessScene[];
}

const levelOf = (s: string | undefined): KnowledgeLevel | null =>
  (s && (LEVEL_ORDER as readonly string[]).includes(s)) ? (s as KnowledgeLevel) : null;
const within = (level: string | undefined, learner: KnowledgeLevel): boolean => {
  const l = levelOf(level);
  return !l || !isHigherLevel(l, learner);
};

export const businessPack = (idx: CrossLinkIndex, contextId: BusinessContextId, learner: KnowledgeLevel, limit = 12): BusinessPack => {
  const ctx = businessContextById(contextId);
  if (!ctx) throw new Error(`unknown business context: ${contextId}`);

  // 文法: 明示（文脈が指名）＋ N2 の既存分類。学習者の級以下だけ。明示を先に、あとは級の高い順
  const explicit = ctx.grammarIds.filter((g) => idx.grammar.has(g) && within(idx.grammar.get(g)!.level, learner));
  const fromN2 = learner === 'N2' || learner === 'N1' ? n2GrammarForContext(ctx).filter((g) => idx.grammar.has(g) && !explicit.includes(g)) : [];
  const grammarIds = [...explicit, ...fromN2].slice(0, limit);
  const grammar = grammarIds.map((g) => {
    const it = idx.grammar.get(g)!;
    return { grammarId: g, pattern: it.pattern, level: it.level, explicit: explicit.includes(g) };
  });

  // 語彙: (a) 分野×場面（Practical Axis）、(b) 文脈の手がかり語が見出し語・説明文に出る語。級以下だけ
  const vocabHits = new Map<string, string>();
  const situationWords = new Set(ctx.situations.flatMap((s) => SITUATION_KEYWORDS[s]));
  for (const d of ctx.domains) {
    for (const w of idx.vocabByDomain.get(d) ?? []) {
      const sit = idx.situationsByVocab.get(w) ?? [];
      if (sit.some((s) => ctx.situations.includes(s))) vocabHits.set(w, `${d}×${sit.find((s) => ctx.situations.includes(s))}`);
    }
  }
  for (const [wordId, v] of idx.vocab) {
    if (vocabHits.has(wordId)) continue;
    const text = `${v.surface} ${v.explanationJa ?? ''}`;
    const kw = ctx.keywords.find((k) => text.includes(k)) ?? [...situationWords].find((k) => v.surface.includes(k));
    if (kw) vocabHits.set(wordId, `keyword:${kw}`);
  }
  const vocab = [...vocabHits.entries()]
    .filter(([w]) => within(idx.vocab.get(w)?.level, learner))
    // 級の高い語を先に（N1 の人に N5 の語ばかり出さない）
    .sort((a, b) => LEVEL_ORDER.indexOf(levelOf(idx.vocab.get(b[0])?.level) ?? 'N5') - LEVEL_ORDER.indexOf(levelOf(idx.vocab.get(a[0])?.level) ?? 'N5'))
    .slice(0, limit)
    .map(([wordId, via]) => ({ wordId, surface: idx.vocab.get(wordId)!.surface, via }));

  // 読解・聴解: 文脈の文法・語彙が出る教材 ＋ work 分野の教材。級以下だけ
  const score = new Map<string, number>();
  const bump = (id: string, n: number) => score.set(id, (score.get(id) ?? 0) + n);
  for (const g of grammarIds) for (const e of idx.out.get(g) ?? []) if (e.layer === 'grammar-material') bump(e.to, 2);
  for (const v of vocabHits.keys()) for (const e of idx.out.get(v) ?? []) if (e.layer === 'vocab-material') bump(e.to, 1);
  for (const d of ctx.domains) for (const e of idx.in.get(`domain:${d}`) ?? []) if (e.layer === 'material-domain') bump(e.from, 3);
  const ranked = [...score.entries()].filter(([id]) => within(idx.materials.get(id)?.level, learner))
    .sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const reading = ranked.filter((id) => idx.materials.get(id)?.kind === 'reading').slice(0, limit);
  const listening = ranked.filter((id) => idx.materials.get(id)?.kind === 'listening').slice(0, limit);

  const production = grammarIds
    .map((g) => idx.grammar.get(g)!)
    .filter((g) => g.practice?.targetUse)
    .map((g) => ({ grammarId: g.grammarId, themeJa: g.practice!.themeJa, targetUse: g.practice!.targetUse }));

  const scenes = ctx.scenes.filter((s) => s.grammarIds.every((g) => idx.grammar.has(g) && within(idx.grammar.get(g)!.level, learner)));

  return { context: contextId, level: learner, grammar, vocab, reading, listening, production, scenes };
};

/* ────────────────────────────────────────────────────────────
   QA
   ──────────────────────────────────────────────────────────── */

export interface BusinessCoverageRow {
  context: BusinessContextId;
  level: KnowledgeLevel;
  grammar: number; vocab: number; reading: number; listening: number; production: number; scenes: number;
}

export const businessCoverage = (idx: CrossLinkIndex, levels: readonly KnowledgeLevel[] = ['N3', 'N2', 'N1']): BusinessCoverageRow[] =>
  BUSINESS_CONTEXTS.flatMap((c) => levels.map((lv) => {
    const p = businessPack(idx, c.id, lv);
    return { context: c.id, level: lv, grammar: p.grammar.length, vocab: p.vocab.length, reading: p.reading.length, listening: p.listening.length, production: p.production.length, scenes: p.scenes.length };
  }));

/** 文脈が指名した grammarId のうち、実在しないもの（複製ではなく参照なので、ここが空であること） */
export const danglingBusinessGrammar = (idx: CrossLinkIndex): { context: BusinessContextId; grammarId: string }[] =>
  BUSINESS_CONTEXTS.flatMap((c) => [
    ...c.grammarIds.map((g) => ({ context: c.id, grammarId: g })),
    ...c.scenes.flatMap((s) => s.grammarIds.map((g) => ({ context: c.id, grammarId: g }))),
  ]).filter((x) => !idx.grammar.has(x.grammarId) || parseKnowledgeId(x.grammarId)?.kind !== 'grammar');
