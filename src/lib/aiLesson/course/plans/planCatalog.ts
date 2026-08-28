// 商品カタログ（正準）。**価格・期間・内容をここ以外に書かない。**
//
// なぜこの形か:
// - 商品内容・価格・利用期間は今後変わる前提。componentへ直接書くと変更のたびに探し回る
// - LP・法務ページ・申込フォームは**すべてここを読む**。1か所直せばサイト全体へ反映される
// - 価格は数値ではなく **ラベル**（`priceLabelJa`）。未確定を「準備中」と正直に書けるようにするため。
//   数値にすると未確定を 0 と書くしかなくなり、嘘になる（PRODUCT_CANON 原則13の考え方）
//   （分析・将来の決済用に `priceJpy` の数値も併記するが、表示の正準はラベル）
// - 契約・決済の状態管理はここに持たない（今回のスコープ外）。
//   申込を受けたあとは人が確認して個別に案内する運用
//
// 変更したら `version` を上げること。上げ忘れは `planCatalog.test.ts` が検出する。
// `version` は申込記録に残るので、あとから「この人が見た内容」を特定できる。

export type PlanId = 'ai-trial-pass' | 'ai-month' | 'coach-6m';

/**
 * 公開状態。
 * - `draft`   … 検討中。学習者には出さない（`?plans=preview` でCEOだけ見られる）
 * - `published` … 公開中
 * - `paused`  … 一時停止。存在は見せるが申込は受けない（満席・改定中など）
 */
export type PlanStatus = 'draft' | 'published' | 'paused';

/**
 * ボタンの振る舞い。
 * - `apply`    … 申込フォームへ（人が確認して個別に案内する）
 * - `consult`  … 個別相談へ（今の6か月コースはこれ）
 * - `checkout` … オンライン決済（Stripe Checkout）→ アカウント自動発行 → メール通知。
 *                **人間レッスンを含む商品には設定禁止**（テストとサーバー側の両方で拒否）。
 *                環境の VITE_AI_COURSE_CHECKOUT が off のあいだは apply へフォールバックする
 */
export type PlanCtaMode = 'apply' | 'consult' | 'checkout';

export interface PlanConfig {
  id: PlanId;
  /** 内容を変えたら必ず上げる。申込記録に残す */
  version: number;
  nameJa: string; nameZh: string;
  /** 表示する価格の文字列。未確定なら「準備中」でよい */
  priceLabelJa: string; priceLabelZh: string;
  /**
   * 価格の数値（税込・JPY）。**表示には使わない**（表示の正準は priceLabel）。
   * 分析イベントの value と、将来の決済連携のためだけに持つ。未確定なら null
   */
  priceJpy: number | null;
  /**
   * 「月額換算 約◯円」のような補助表示。無ければ出さない。
   * 価格から自動計算しない（priceLabel は文字列で、割り切れない商品もあるため）
   */
  monthlyEquivalentJa?: string; monthlyEquivalentZh?: string;
  descriptionJa: string; descriptionZh: string;
  /** 利用できる期間 */
  durationLabelJa: string; durationLabelZh: string;
  /**
   * 購入日からの利用日数。買い切りプランの利用期限計算の正準。
   * null＝日数固定ではない（6か月コースは開始日を人が決め、ai_course_access で個別設定する）
   */
  accessDays: number | null;
  /**
   * 冒険マップで攻略できる地域数の上限（試験レイヤー）。null＝全地域。
   * AI体験パス＝最初の3地域まで（CEO決定 2026-08-19「60分＋ステージ3まで進め放題」）
   */
  contentRegionLimit: number | null;
  /**
   * リアルタイム体験の分数（CEO決定 2026-08-20「開始ボタンからどんな状況でも実時間60分で自動終了」）。
   * 開始ボタンを押した瞬間から実時間でカウントし、経過で利用終了（サーバーはvalid_until書き換えで強制）。
   * null＝リアルタイム制ではない（1か月・6か月は暦日で管理）
   */
  realtimeWindowMinutes: number | null;
  /**
   * 体験の有効日数（CEO決定 2026-08-26 Phase S2「学習サイクルを一周できる体験にする」）。
   * 開始ボタンを押した瞬間から暦日でカウントする。
   * 実時間60分では、翌日以降にしか届かない間隔反復＝この商品の中心を体験できなかった。
   * null＝日数制ではない（1か月・6か月は購入時点からの暦日で管理）。
   * realtimeWindowMinutes と両立させない（どちらか一方だけを設定する）。
   */
  trialDays?: number | null;
  /** AI学習の累計利用分。null＝累計上限を設けない（未確定のうちは status を draft にすること） */
  aiMinutes: number | null;
  /** 人によるレッスンの回数。0＝なし */
  lessonCount: number;
  /** 自動更新。**全プラン買い切りなので必ず false**（テストで固定） */
  autoRenew: boolean;
  featuresJa: string[]; featuresZh: string[];
  /**
   * 含まれないもの。安いプランに人間レッスンが含まれると誤解させないため、
   * 料金表・比較表で明示する（60分・1か月プランでは必須）
   */
  notIncludedJa: string[]; notIncludedZh: string[];
  /** 「◯◯したい人」の1行。料金表とプラン診断で使う */
  audienceJa: string; audienceZh: string;
  /** プラン個別のCTA文言（例:「600円で体験する」）。価格入りの文言はここ以外に書かない */
  ctaLabelJa: string; ctaLabelZh: string;
  /** 料金表で最も目立たせるプラン（6か月伴走コース） */
  recommended?: boolean;
  status: PlanStatus;
  ctaMode: PlanCtaMode;
  sortOrder: number;
}

/**
 * キャンセル・解約・返金の暫定表示（CEO決定 2026-08-02）。
 *
 * **全商品へ同じ返金方針を固定しない。** 商品ごとに期間も提供物も違うため。
 * 特定商取引法の「特定継続的役務提供」に当たるかの確認が終わるまでは、
 * 個別の条件（「返金不可」「8日経過後は返金なし」など）を**断定しない**。
 * → docs/ai-course/legal-open-questions.md
 */
export const PROVISIONAL_TERMS_NOTICE = {
  ja: 'キャンセル・解約・返金の条件は、選択したプランおよび申込時にご案内する契約条件により異なります。詳細は申込前に必ずご確認ください。',
  zh: '取消、解约与退款的条件，会因所选方案以及报名时提供的合同条件而不同。请务必在报名前确认详情。',
} as const;

/**
 * 商品の一覧。**ここが唯一の正**。
 *
 * 2026-08-19 改定（CEO依頼の商品3段階化）:
 * - AI体験パス 600円 と 1か月AI自学プラン 2,980円 を published へ
 * - 6か月伴走コースは**内容・価格を据え置き**、料金表で最も目立たせる（recommended）
 */
export const PLAN_CATALOG: PlanConfig[] = [
  {
    id: 'ai-trial-pass',
    // v2: 教材範囲を「最初の3地域まで攻略し放題」に確定（CEO決定 2026-08-19）
    // v3: リアルタイム60分制へ（CEO決定 2026-08-20。開始ボタンから実時間60分・累計制を廃止）
    // v4: AI音声会話の回数を明記（CEO決定 2026-08-23）。音声だけが原価を持つので、
    //     使い放題と書けるもの（教材・冒険）と回数のあるもの（音声会話）を分けて書く
    // v5: 実時間60分 → **開始から7日間**（CEO決定 2026-08-26 Phase S2）。
    //     60分では翌日以降にしか届かない間隔反復＝この商品の中心を体験できなかった。
    //     実測: 唯一の体験購入者は4個が復習予定に入り、1個も受け取れていない。
    //     音声会話の合計3回は据え置き＝AI原価は増えない（原価は時間ではなく回数で決まる）。
    version: 5,
    nameJa: 'AI体験パス',
    nameZh: 'AI体验通行证',
    priceLabelJa: '600円（税込）',
    priceLabelZh: '600日元（含税）',
    priceJpy: 600,
    descriptionJa: '開始から7日間、教材と冒険は使い放題。AI先生との音声会話レッスンが3回でき、翌日の復習まで一周ためせます。買い切りで、自動更新はありません。',
    descriptionZh: '开始后的7天内，教材与冒险随意使用。可以上3次AI老师的语音会话课，还能体验到第二天的复习。一次性付费，不会自动续费。',
    durationLabelJa: '開始から7日間（購入後30日以内に開始）',
    durationLabelZh: '开始后7天（购买后30天内开始）',
    accessDays: 30,
    contentRegionLimit: 3,
    realtimeWindowMinutes: null,
    trialDays: 7,
    aiMinutes: null,
    lessonCount: 0,
    autoRenew: false,
    featuresJa: [
      '開始から7日間、教材・冒険・文法バトルが使い放題',
      'AI先生との音声会話レッスン 3回（1回最大4分・1日2回まで）',
      '会話後のAIフィードバックと、言い直しの練習',
      '翌日の復習まで体験できる — この教室の中心の仕組み',
      '冒険マップの最初の3地域まで攻略し放題',
      '好きなタイミングで開始できる（購入後30日以内）・自動更新なし',
    ],
    featuresZh: [
      '开始后的7天内，教材・冒险・语法战斗随意使用',
      'AI老师的语音会话课 3次（每次最长4分钟・每天最多2次）',
      '会话后的AI反馈，以及重说一次的练习',
      '能体验到第二天的复习 — 这个教室最核心的机制',
      '冒险地图最初的3个区域随意攻略',
      '可自选时间开始（购买后30天内）・不会自动续费',
    ],
    notIncludedJa: [
      '安田翔による個別レッスン',
      '人間による個別添削・個別フィードバック',
      '個別ロードマップ',
      'WeChatでの個別学習相談',
    ],
    notIncludedZh: [
      '安田翔的一对一课程',
      '真人的个别批改与个别反馈',
      '专属学习路线',
      '微信个别学习咨询',
    ],
    audienceJa: 'まずAI会話を試してみたい人',
    audienceZh: '想先试试AI会话的人',
    ctaLabelJa: '600円で体験する',
    ctaLabelZh: '花600日元体验',
    status: 'published',
    // オンライン決済→自動発行（CEO指示 2026-08-19）。決済が無効な環境では apply へフォールバック
    ctaMode: 'checkout',
    sortOrder: 10,
  },
  {
    id: 'ai-month',
    // v2: 教材範囲を「全地域」と明記（体験パスとの違いを機械と文言の両方で固定）
    // v4: 位置づけを「人のレッスンは要らない人の選択肢」と明記（CEO決定 2026-08-26 Phase S5）
    // v3: 「音声会話が使い放題」をやめ、回数を明記（CEO決定 2026-08-23）。
    //     旧文言のままだと上限まで使われた月は原価7,400円で赤字になる（planAiBudget.ts）。
    //     見出しは「毎日つかえる」、無制限側（冒険・バトル・模試）を先に出し、
    //     AI先生との会話レッスンも受けられることを補足として続ける（CEO指示）
    version: 4,
    nameJa: '1か月 AI自学プラン',
    nameZh: '1个月 AI自学方案',
    priceLabelJa: '2,980円（税込）',
    priceLabelZh: '2,980日元（含税）',
    priceJpy: 2980,
    descriptionJa: '30日間、毎日つかえる自学プラン。教材・冒険・文法バトル・ミニ模試は使い放題で、AI先生との音声会話レッスンも月10回受けられます。買い切りで、自動更新はありません。',
    descriptionZh: '30天里每天都能用的自学方案。教材・冒险・语法战斗・小模考随意使用，还可以上10次AI老师的语音会话课。一次性付费，不会自动续费。',
    durationLabelJa: '購入から30日間',
    durationLabelZh: '购买后30天内',
    accessDays: 30,
    contentRegionLimit: null,
    realtimeWindowMinutes: null,
    aiMinutes: null,
    lessonCount: 0,
    autoRenew: false,
    featuresJa: [
      '冒険・文法バトル・ミニ模試・復習は30日間ずっと使い放題',
      '全地域の自学教材（文法・語彙・聴解・読解）',
      'AIとのテキスト会話 1日8回',
      'AI先生との音声会話レッスン 月10回（1日2回まで・1回最大4分）',
      '会話後のAIフィードバック／言えなかった表現の保存と復習',
      '学習記録と進捗の表示・購入から30日間・自動更新なし',
    ],
    featuresZh: [
      '冒险・语法战斗・小模考・复习，30天内随意使用',
      '全部区域的自学教材（语法・词汇・听力・阅读）',
      '与AI的文字会话 每天8次',
      'AI老师的语音会话课 每月10次（每天最多2次・每次最长4分钟）',
      '会话后的AI反馈／保存没说出的表达＋复习',
      '学习记录与进度显示・购买后30天内・不会自动续费',
    ],
    notIncludedJa: [
      '安田翔による個別レッスン',
      '人間による個別添削・個別フィードバック',
      '個別ロードマップ',
      'WeChatでの個別学習相談',
    ],
    notIncludedZh: [
      '安田翔的一对一课程',
      '真人的个别批改与个别反馈',
      '专属学习路线',
      '微信个别学习咨询',
    ],
    // v4（2026-08-26 Phase S5）: 位置づけを言葉で固定する。
    // これは「安いメイン商品」ではなく、**人の伴走を必要としない人の選択肢**。
    // 中国語圏には安価なAI会話アプリが大量にあるので、機能で競うと勝てない。
    // 誰向けかをはっきりさせて、選ぶ人が自分で選べるようにする
    audienceJa: '人のレッスンは要らない。自分のペースで続けたい人',
    audienceZh: '不需要真人课程，想按自己的节奏坚持下去的人',
    ctaLabelJa: '1か月だけ試してみる',
    ctaLabelZh: '先试一个月',
    status: 'published',
    // オンライン決済→自動発行（CEO指示 2026-08-19）。決済が無効な環境では apply へフォールバック
    ctaMode: 'checkout',
    sortOrder: 20,
  },
  {
    id: 'coach-6m',
    // v2: 価格表記を 100,000円→10万円 へ（CEO指示 2026-08-07。桁の羅列は高く感じさせるため）
    // v6: 「AI＋レッスン24回」から**伴走サービス**の言い方へ（CEO決定 2026-08-26 Phase S4）
    // v3: N2文法の項目数を実数178へ（canonical 178＋統合alias 2＝原本180・監査lp-178）
    // v4: 3プラン化にともない対象者1行・含まれないもの欄・CTA文言を追加（価格・期間・提供内容は不変）
    // v5: AI音声会話の回数を明記（CEO決定 2026-08-23）。ほぼ毎日1回できる枠で、
    //     上限まで使われても原価は約19,000円（19%）に収まる（planAiBudget.ts）
    version: 6,
    nameJa: '6か月 AI日本語伴走コース',
    nameZh: '6个月 AI日语陪跑课程',
    // 期間は durationLabel が出すので、ここには入れない（「／6か月」が二重になる）
    priceLabelJa: '10万円（税込）',
    priceLabelZh: '10万日元（含税）',
    priceJpy: 100000,
    monthlyEquivalentJa: '月額換算 約16,700円／月',
    monthlyEquivalentZh: '折合每月约16,700日元',
    // セクションの lead（LP.pricing.lead）と同じ文にしない。同じ文が2回出て読みにくくなる
    // v6（2026-08-26 Phase S4）: 「AI＋レッスン24回」という部品の足し算をやめる。
    // 買う人が得るのは回数ではなく、**日本での生活で日本語が実際に使えるようになるまでの伴走**。
    // 書けるのは確認できる事実だけ（回数・内容・言語）で、上達の保証はしない
    descriptionJa: '日本で暮らしながら日本語を使えるようになるまで、半年間いっしょに進みます。毎日の練習はAIが支え、何を練習するかと直す方向は日本語コーチが決めます。分からないところは中国語で聞けます。',
    descriptionZh: '在日本生活的同时，用半年时间一起走到「日语真的用得出来」为止。每天的练习由AI支撑，练什么、往哪个方向改，由日语教练来定。不懂的地方可以用中文问。',
    durationLabelJa: '6か月',
    durationLabelZh: '6个月',
    // 開始日は入金確認後に人が決める（ai_course_access で個別設定）ため日数固定にしない
    accessDays: null,
    contentRegionLimit: null,
    realtimeWindowMinutes: null,
    aiMinutes: null,
    lessonCount: 24,
    autoRenew: false,
    featuresJa: [
      '安田翔（コーチ）との60分個別レッスン 全24回',
      'AI先生との音声会話レッスン 月30回（ほぼ毎日1回・1日3回まで）',
      'N2文法178・語彙・聴解・読解',
      '復習システム・学習記録・個別ロードマップ',
      'WeChatでの相談・6か月間のシステム利用',
    ],
    featuresZh: [
      '与安田翔（教练）的60分钟一对一 共24次',
      'AI老师的语音会话课 每月30次（几乎每天1次・每天最多3次）',
      'N2语法178・词汇・听力・阅读',
      '复习系统・学习记录・专属路线',
      '微信咨询・6个月系统使用权',
    ],
    notIncludedJa: [],
    notIncludedZh: [],
    audienceJa: '日本で生活していて、本気で話せるようになりたい人',
    audienceZh: '住在日本，真心想把日语说出口的人',
    ctaLabelJa: '無料相談して申し込む',
    ctaLabelZh: '免费咨询后报名',
    recommended: true,
    status: 'published',
    // 法的確認が終わるまで手動契約フロー。決済へ直行させない
    ctaMode: 'consult',
    sortOrder: 30,
  },
];

/**
 * 「おすすめ」バッジの文言（recommended のプランに出す）。
 * 表示の正準をカタログ側に置き、LPコピーへ散らさない
 */
export const RECOMMENDED_BADGE = {
  ja: 'おすすめ',
  zh: '推荐',
} as const;

/**
 * アップグレード施策の**データ構造だけ**（2026-08-19）。
 *
 * 「1か月プランの利用者が一定期間内に6か月コースへ申し込んだら、2,980円分を
 * 受講料から差し引く」を将来できるようにする箱。**自動割引は実装しない**：
 * 決済仕様・会計処理・キャンセル返金条件の確認が終わっていないため（status: 'planned'）。
 * 有効化するときは status を 'active' にし、申込フロー側で creditJpy を参照する。
 */
export interface UpgradePath {
  from: PlanId;
  to: PlanId;
  /** 差し引ける金額（税込）。from プランの支払額 */
  creditJpy: number;
  /** 申込からの有効日数（案）。確定していないため有効化時に見直す */
  windowDays: number;
  status: 'planned' | 'active';
}

export const UPGRADE_PATHS: UpgradePath[] = [
  { from: 'ai-month', to: 'coach-6m', creditJpy: 2980, windowDays: 60, status: 'planned' },
];

/* ────────────────────────────────────────────────────────────
   参照ヘルパー。**componentは必ずここ経由で読む**
   ──────────────────────────────────────────────────────────── */

const bySort = (a: PlanConfig, b: PlanConfig) => a.sortOrder - b.sortOrder;

/** 学習者に見せる商品（published のみ）。表示順つき */
export const publishedPlans = (): PlanConfig[] =>
  PLAN_CATALOG.filter((p) => p.status === 'published').sort(bySort);

/** 存在は見せるが申込を受けないものも含む（published＋paused） */
export const visiblePlans = (): PlanConfig[] =>
  PLAN_CATALOG.filter((p) => p.status !== 'draft').sort(bySort);

/** CEOのプレビュー用。draft も含めた全部 */
export const allPlans = (): PlanConfig[] => [...PLAN_CATALOG].sort(bySort);

export const planById = (id: string): PlanConfig | null =>
  PLAN_CATALOG.find((p) => p.id === id) ?? null;

/**
 * 申込（フォーム）を受け付けてよいか。draft と paused は受けない。
 * checkout の商品も対象＝**決済が無効な環境（キー未設定・準備中）では
 * 申込フォームが受け皿になる**（買いたい人を行き止まりにしない）
 */
export const acceptsApplication = (p: PlanConfig): boolean =>
  p.status === 'published';

/** `?plans=preview` のときだけ draft も出す（法務ページと同じ流儀） */
export const isPlanPreview = (search: string): boolean =>
  new URLSearchParams(search).get('plans') === 'preview';

/**
 * 人民元の**参考**換算レート（2026-08-21 追加）。
 *
 * なぜ要るか: 買うのは中国語話者なのに、価格が円でしか出ていなかった。
 * 「高いのか安いのか」を母国の通貨で判断できないと、料金表まで来ても止まる。
 *
 * ⚠️ **請求は常に日本円**。ここは判断材料としての目安でしかないので、
 *    画面には必ず「约」と**基準日**を一緒に出すこと（レートは動く）。
 * 出典: ECB参照レート（frankfurter.app）。見直したら rate と asOf の両方を直す。
 */
export const CNY_REFERENCE = {
  /** 1円あたりの人民元 */
  cnyPerJpy: 0.04235,
  asOf: '2026-08-20',
} as const;

/**
 * 「约◯元」の表示文字列。中国語表示のときだけ使う。
 * 端数は切り上げない・切り捨てない（四捨五入）。1000以上は桁区切りを入れる
 */
export const approxCnyLabel = (priceJpy: number | null): string | null => {
  if (priceJpy === null || priceJpy <= 0) return null;
  const cny = Math.round(priceJpy * CNY_REFERENCE.cnyPerJpy);
  return `约${cny.toLocaleString('en-US')}元`;
};

/** 表示用の言語別アクセサ。componentでの `lang === 'zh' ? ... : ...` を無くす */
export interface PlanView {
  id: PlanId;
  version: number;
  name: string;
  priceLabel: string;
  priceJpy: number | null;
  /** 中国語表示のときだけ「约◯元」。日本語では null（円で買う人に換算は不要） */
  priceApproxCny: string | null;
  /** 無ければ null（表示しない） */
  monthlyEquivalent: string | null;
  description: string;
  durationLabel: string;
  features: string[];
  notIncluded: string[];
  audience: string;
  ctaLabel: string;
  recommended: boolean;
  accessDays: number | null;
  aiMinutes: number | null;
  lessonCount: number;
  autoRenew: boolean;
  status: PlanStatus;
  ctaMode: PlanCtaMode;
  /** キャンセル・返金の表示（いまは全プラン共通の暫定文言） */
  termsNotice: string;
}

export const planView = (p: PlanConfig, lang: 'ja' | 'zh'): PlanView => ({
  id: p.id,
  version: p.version,
  name: lang === 'zh' ? p.nameZh : p.nameJa,
  priceLabel: lang === 'zh' ? p.priceLabelZh : p.priceLabelJa,
  priceJpy: p.priceJpy,
  priceApproxCny: lang === 'zh' ? approxCnyLabel(p.priceJpy) : null,
  monthlyEquivalent: (lang === 'zh' ? p.monthlyEquivalentZh : p.monthlyEquivalentJa) ?? null,
  description: lang === 'zh' ? p.descriptionZh : p.descriptionJa,
  durationLabel: lang === 'zh' ? p.durationLabelZh : p.durationLabelJa,
  features: lang === 'zh' ? p.featuresZh : p.featuresJa,
  notIncluded: lang === 'zh' ? p.notIncludedZh : p.notIncludedJa,
  audience: lang === 'zh' ? p.audienceZh : p.audienceJa,
  ctaLabel: lang === 'zh' ? p.ctaLabelZh : p.ctaLabelJa,
  recommended: !!p.recommended,
  accessDays: p.accessDays,
  aiMinutes: p.aiMinutes,
  lessonCount: p.lessonCount,
  autoRenew: p.autoRenew,
  status: p.status,
  ctaMode: p.ctaMode,
  termsNotice: PROVISIONAL_TERMS_NOTICE[lang],
});

/**
 * 体験の入口として案内する商品（2026-08-20 導線改善）。
 * **公開中でオンライン決済できるプランのうち、いちばん安いもの**を返す。
 * LPの主CTA・スマホ固定バーがこれを使う＝価格の文字をLPコピーへ二重に書かない。
 * 該当が無ければ null（呼び出し側は相談導線へ倒す）。
 */
export const trialEntryPlan = (lang: 'ja' | 'zh'): PlanView | null => {
  const candidates = publishedPlans()
    .filter((p) => p.ctaMode === 'checkout' && p.priceJpy !== null && p.priceJpy > 0)
    .sort((a, b) => (a.priceJpy ?? 0) - (b.priceJpy ?? 0));
  return candidates.length > 0 ? planView(candidates[0], lang) : null;
};
