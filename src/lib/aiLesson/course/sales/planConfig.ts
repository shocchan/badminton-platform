// 商品の**正準定義**（Rain-exposed Market §17）。
//
// 原則: 価格・期間・内容・アップセル条件を **このファイル以外に書かない**。
//   料金ページ / 申込 / 決済 / 利用権付与 / アップセル表示 は全部ここを読む。
//   1か所を直せば全部そろって変わる（別々の価格が同時に画面へ出る事故を構造的に防ぐ）。
//   `planConfig.test.ts` が「他ファイルに価格数値が書かれていないこと」を機械検査する。
//
// なぜ「ラベル」ではなく数値なのか（`course/plans/planCatalog.ts` との違い）:
//   あちらは相談ベースの申込LP用で、未確定を「準備中」と正直に書くためのラベル方式。
//   こちらは **自動販売** 用で、決済金額・利用権・採算計算に同じ数値を使う必要がある。
//   数値が確定していない商品は `status: 'draft'` にして学習者へ出さない。
//
// 変更したら `version` を上げること（上げ忘れはテストが検出する）。
// version は購入記録に残るので「この人が買ったときの条件」を後から特定できる。

export type SalesPlanId = 'ai-hour-pass' | 'ai-month' | 'coach-6m';

/**
 * 公開状態。
 * - `draft`     … 検討中。学習者には出さない（`?plans=preview` でCEOだけ見られる）
 * - `published` … 公開中
 * - `paused`    … 存在は見せるが購入・申込は受けない（改定中・満席など）
 */
export type SalesPlanStatus = 'draft' | 'published' | 'paused';

/**
 * ボタンの振る舞い。
 * - `checkout` … 決済へ進む（人間対応なしで完結する商品）
 * - `consult`  … 個別相談フォームへ（6か月伴走のみ）
 */
export type SalesCtaMode = 'checkout' | 'consult';

/** アップセル表示のきっかけ。**購入直後には出さない**（§12）ため、すべて「価値体験後」の条件 */
export type UpsellTrigger =
  | 'first_adventure_completed'   // 最初の冒険を終えた
  | 'active_minutes_reached'      // 累計アクティブ時間が threshold を超えた
  | 'remaining_minutes_below'     // 残り時間が threshold を下回った
  | 'entitlement_exhausted'       // 使い切った
  | 'active_days_reached'         // 利用日数が threshold 日を超えた
  | 'repeated_weakness'           // 同じ苦手が繰り返し出ている
  | 'exam_goal_declared'          // N2/N3合格を目標に選んでいる
  | 'multi_skill_weakness'        // 複数技能に弱点がある
  | 'human_help_requested';       // 本人が人への相談を希望した

export interface UpsellTriggerRule {
  kind: UpsellTrigger;
  /** 条件のしきい値（分・日・回数など。kindによって単位が変わる。不要なkindでは省略） */
  threshold?: number;
}

/**
 * アップセルの提示規則（§12 §13）。
 * 「値引きで釣る」のではなく「続きがそのまま使える」ことを言うための枠組み。
 * 頻度制限は **表示側の都合ではなく仕様** として持つ（うるさい売り込みを構造的に禁止する）。
 */
export interface UpsellRule {
  id: string;
  /** どのプランへ誘導するか */
  targetPlanId: SalesPlanId;
  /** どれか1つでも満たせば提示候補になる */
  triggers: UpsellTriggerRule[];
  /** 同一セッション内の最大表示回数（§12「同じsessionで1回以下」） */
  maxPerSession: number;
  /** 閉じられた後、再表示しない日数 */
  cooldownDays: number;
  /** 生涯の最大表示回数（0=無制限にしない。必ず有限） */
  maxLifetime: number;
}

/**
 * 従量原価の想定（§16）。
 * ここが「600円でも利益が残る」の根拠。**教材（文法・語彙・読解・聴解の問題バンク）は
 * 生成済みの静的データなので追加API費が発生しない**。金がかかるのは音声会話とAIレポートだけ。
 * だから利用権は「累計60分」だけでなく **音声分数とレポート回数にも上限を持つ**。
 */
export interface PlanCostAssumption {
  /** 音声会話の上限（分）。原価の主因なので必ず有限 */
  voiceMinutesCap: number;
  /** AIレポート生成の上限（回）。1回あたりの原価は小さいが有限にする */
  aiReportCap: number;
  /** インフラ原価の配賦（円 / 1購入あたり）。Supabase・Pages等の按分 */
  infraCostJpyPerPurchase: number;
}

export interface SalesPlanConfig {
  planId: SalesPlanId;
  status: SalesPlanStatus;

  nameJa: string;
  nameZh: string;
  /** 1行の位置づけ（松竹梅とは書かない。§2） */
  taglineJa: string;
  taglineZh: string;

  /** 税込表示の金額（円）。`taxIncluded` が false のときは税抜 */
  priceAmount: number;
  currency: 'JPY';
  taxIncluded: boolean;

  /** 契約期間（日）。60分パスのように期間契約でないものは 0 */
  durationDays: number;
  /** 含まれる累計アクティブ学習時間（分）。時間制でないものは null */
  includedActiveMinutes: number | null;
  /** 購入から何日以内に使い切る必要があるか（日） */
  validityDays: number;
  /** 自動更新。**初期は全プラン false**（§1商品構成） */
  autoRenew: boolean;
  /** 人間の先生によるレッスン回数。0 なら人間対応なし */
  humanLessonCount: number;

  ctaMode: SalesCtaMode;
  /** CTAの文言（決済が無効なときの代替文言も持つ。§5） */
  ctaLabelJa: string;
  ctaLabelZh: string;
  ctaLabelDisabledJa: string;
  ctaLabelDisabledZh: string;

  featuresJa: string[];
  featuresZh: string[];
  /** 誤解を生みやすい点を先に書く（§6 コールド流入の信頼設計）。「〜はありません」を隠さない */
  limitationsJa: string[];
  limitationsZh: string[];

  /** アップグレード先（無ければ null） */
  upgradeTargetPlanId: SalesPlanId | null;
  /** 再購入できるか（§11） */
  repeatPurchaseEnabled: boolean;

  /** 60分の支払額を上位プランへ充当する施策。**既定OFF。勝手に有効化しない**（§12） */
  upgradeCreditEnabled: boolean;
  upgradeCreditAmount: number;
  upgradeCreditValidDays: number;

  /** 無操作で計測を止めるまでの秒数（§9） */
  idlePauseSeconds: number;
  /** クライアントがサーバーへ生存通知を送る間隔（秒） */
  heartbeatSeconds: number;
  /** 残りがこの分数を切ったら画面で知らせる */
  usageWarningThresholdMinutes: number;

  upsellRules: UpsellRule[];
  cost: PlanCostAssumption;

  /** 表示順（小さいほど左/上） */
  sortOrder: number;
  version: number;
  /** この内容が有効になった日（YYYY-MM-DD）。購入記録の突き合わせに使う */
  effectiveFrom: string;
}

// ─────────────────────────────────────────────────────────
// 正準カタログ
// ─────────────────────────────────────────────────────────
//
// ⚠️ 価格は **CEO決定待ちの候補値**（依頼書 §1 の「候補」）。
//    変更はこの配列だけを直す。変更したら version を上げる。

export const SALES_PLAN_CATALOG: readonly SalesPlanConfig[] = [
  {
    planId: 'ai-hour-pass',
    status: 'published',
    nameJa: '60分AIパス',
    nameZh: '60分钟AI通行证',
    taglineJa: 'まず気軽に試す',
    taglineZh: '先轻松试一试',

    priceAmount: 600,
    currency: 'JPY',
    taxIncluded: true,

    durationDays: 0,
    includedActiveMinutes: 60,
    validityDays: 30,
    autoRenew: false,
    humanLessonCount: 0,

    ctaMode: 'checkout',
    ctaLabelJa: '600円で始める',
    ctaLabelZh: '600日元开始',
    ctaLabelDisabledJa: '体験パスに申し込む',
    ctaLabelDisabledZh: '申请体验通行证',

    featuresJa: [
      '累計60分のAI学習（何回かに分けて使えます）',
      '1万問以上の問題から、今のあなたに必要な問題をAIが選びます',
      '学んだ内容と進み方は保存され、次回は続きから始められます',
      '購入から30日以内なら、いつでも続きを使えます',
    ],
    featuresZh: [
      '累计60分钟AI学习（可以分几次使用）',
      '从1万道以上的题目中，由AI挑选此刻你需要的题目',
      '学习内容和进度会保存，下次从上次的位置继续',
      '购买后30天内，随时可以继续使用',
    ],
    limitationsJa: [
      '人間の先生のレッスンは含まれません',
      '自動更新はありません（使い切ったら、そこで終わりです）',
      'AI音声会話は10分まで使えます',
      '教材を一覧で見たり、まとめてダウンロードすることはできません',
    ],
    limitationsZh: [
      '不含真人老师的课程',
      '没有自动续费（用完即结束）',
      'AI语音对话最多可使用10分钟',
      '不能浏览全部题库，也不能批量下载教材',
    ],

    upgradeTargetPlanId: 'ai-month',
    repeatPurchaseEnabled: true,

    upgradeCreditEnabled: false,
    upgradeCreditAmount: 600,
    upgradeCreditValidDays: 14,

    idlePauseSeconds: 90,
    heartbeatSeconds: 20,
    usageWarningThresholdMinutes: 10,

    upsellRules: [
      {
        id: 'hour-to-month',
        targetPlanId: 'ai-month',
        triggers: [
          { kind: 'first_adventure_completed' },
          { kind: 'active_minutes_reached', threshold: 20 },
          { kind: 'remaining_minutes_below', threshold: 10 },
          { kind: 'entitlement_exhausted' },
        ],
        maxPerSession: 1,
        cooldownDays: 3,
        maxLifetime: 4,
      },
    ],

    cost: { voiceMinutesCap: 10, aiReportCap: 3, infraCostJpyPerPurchase: 15 },

    sortOrder: 1,
    version: 1,
    effectiveFrom: '2026-08-02',
  },

  {
    planId: 'ai-month',
    status: 'published',
    nameJa: '1か月AIプラン',
    nameZh: '1个月AI计划',
    taglineJa: '自分のペースで続ける',
    taglineZh: '按自己的节奏坚持',

    priceAmount: 2980,
    currency: 'JPY',
    taxIncluded: true,

    durationDays: 30,
    includedActiveMinutes: null,
    validityDays: 30,
    autoRenew: false,
    humanLessonCount: 0,

    ctaMode: 'checkout',
    ctaLabelJa: '1か月始める',
    ctaLabelZh: '开始1个月',
    ctaLabelDisabledJa: '1か月プランに申し込む',
    ctaLabelDisabledZh: '申请1个月计划',

    featuresJa: [
      '毎日の冒険（今日やることをAIが決めます）',
      'AI会話・復習・読解・聴解',
      '週ごとの成長レポート',
      '60分AIパスの進捗を、そのまま引き継げます',
    ],
    featuresZh: [
      '每日冒险（由AI决定今天要做的事）',
      'AI对话、复习、阅读、听力',
      '每周成长报告',
      '可直接继承60分钟AI通行证的学习进度',
    ],
    limitationsJa: [
      '人間の先生のレッスンは含まれません',
      '自動更新はありません（1か月で終わり、続けたいときはご自身で再購入します）',
      'AI音声会話は1か月あたり40分まで使えます',
    ],
    limitationsZh: [
      '不含真人老师的课程',
      '没有自动续费（1个月结束，想继续请自行再次购买）',
      'AI语音对话每月最多可使用40分钟',
    ],

    upgradeTargetPlanId: 'coach-6m',
    repeatPurchaseEnabled: true,

    upgradeCreditEnabled: false,
    upgradeCreditAmount: 0,
    upgradeCreditValidDays: 0,

    idlePauseSeconds: 90,
    heartbeatSeconds: 20,
    usageWarningThresholdMinutes: 5,

    upsellRules: [
      {
        id: 'month-to-coaching',
        targetPlanId: 'coach-6m',
        triggers: [
          { kind: 'active_days_reached', threshold: 7 },
          { kind: 'repeated_weakness', threshold: 3 },
          { kind: 'exam_goal_declared' },
          { kind: 'multi_skill_weakness', threshold: 2 },
          { kind: 'human_help_requested' },
        ],
        maxPerSession: 1,
        cooldownDays: 7,
        maxLifetime: 3,
      },
    ],

    cost: { voiceMinutesCap: 40, aiReportCap: 30, infraCostJpyPerPurchase: 50 },

    sortOrder: 2,
    version: 1,
    effectiveFrom: '2026-08-02',
  },

  {
    planId: 'coach-6m',
    status: 'published',
    nameJa: '6か月伴走コース',
    nameZh: '6个月陪伴课程',
    taglineJa: '先生と目標まで進む',
    taglineZh: '和老师一起走到目标',

    priceAmount: 100000,
    currency: 'JPY',
    taxIncluded: true,

    durationDays: 180,
    includedActiveMinutes: null,
    validityDays: 180,
    autoRenew: false,
    humanLessonCount: 24,

    ctaMode: 'consult',
    ctaLabelJa: '伴走コースについて相談する',
    ctaLabelZh: '咨询陪伴课程',
    ctaLabelDisabledJa: '伴走コースについて相談する',
    ctaLabelDisabledZh: '咨询陪伴课程',

    featuresJa: [
      'AI学習システムのすべてが使えます',
      '先生との個別レッスン24回',
      '学習計画と、つまずいた原因の分析',
      'JLPTの試験戦略と、大事な場面の会話練習',
    ],
    featuresZh: [
      '可使用AI学习系统的全部功能',
      '与老师的一对一课程24次',
      '学习计划，以及卡住原因的分析',
      'JLPT应试策略与重要场景的会话练习',
    ],
    limitationsJa: [
      'このコースだけ、事前の相談が必要です（その場での購入はできません）',
      '受け入れ人数に限りがあるため、ご相談の順にご案内します',
    ],
    limitationsZh: [
      '只有这个课程需要事先咨询（无法当场购买）',
      '名额有限，按咨询顺序安排',
    ],

    upgradeTargetPlanId: null,
    repeatPurchaseEnabled: false,

    upgradeCreditEnabled: false,
    upgradeCreditAmount: 0,
    upgradeCreditValidDays: 0,

    idlePauseSeconds: 90,
    heartbeatSeconds: 20,
    usageWarningThresholdMinutes: 0,

    upsellRules: [],

    cost: { voiceMinutesCap: 240, aiReportCap: 180, infraCostJpyPerPurchase: 300 },

    sortOrder: 3,
    version: 1,
    effectiveFrom: '2026-08-02',
  },
] as const;

// ─────────────────────────────────────────────────────────
// 参照ヘルパー（画面・決済・採算はすべてここ経由で読む）
// ─────────────────────────────────────────────────────────

const bySort = (a: SalesPlanConfig, b: SalesPlanConfig) => a.sortOrder - b.sortOrder;

export const allSalesPlans = (): SalesPlanConfig[] => [...SALES_PLAN_CATALOG].sort(bySort);

/** 学習者に見せるプラン（draftは出さない） */
export const visibleSalesPlans = (): SalesPlanConfig[] =>
  allSalesPlans().filter((p) => p.status !== 'draft');

/** 購入・申込を受け付けているプラン */
export const purchasableSalesPlans = (): SalesPlanConfig[] =>
  allSalesPlans().filter((p) => p.status === 'published');

export const salesPlanById = (id: string): SalesPlanConfig | null =>
  SALES_PLAN_CATALOG.find((p) => p.planId === id) ?? null;

/** そのプランが今、購入・申込を受けられるか */
export const acceptsPurchase = (p: SalesPlanConfig): boolean => p.status === 'published';

/** CEOだけがdraftを見るためのプレビュー判定（`?plans=preview`） */
export const isPlansPreview = (search: string): boolean =>
  new URLSearchParams(search).get('plans') === 'preview';

/** プレビュー時はdraftも含める */
export const plansForDisplay = (search: string): SalesPlanConfig[] =>
  isPlansPreview(search) ? allSalesPlans() : visibleSalesPlans();

/** 時間制のプランか（60分パスのように残り時間の概念があるか） */
export const isTimedPlan = (p: SalesPlanConfig): boolean => p.includedActiveMinutes !== null;

/** 人間対応を含むか。ここが松竹梅の本質的な差（§2） */
export const hasHumanSupport = (p: SalesPlanConfig): boolean => p.humanLessonCount > 0;

/** 金額表示。ja/zh とも「円」を明示する（zhで通貨が曖昧にならないように） */
export const formatPlanPrice = (p: SalesPlanConfig, lang: 'ja' | 'zh'): string => {
  const n = p.priceAmount.toLocaleString('en-US');
  return lang === 'zh' ? `${n}日元` : `${n}円`;
};

/** 税表記。taxIncluded=false のまま税込と書かない */
export const formatTaxNote = (p: SalesPlanConfig, lang: 'ja' | 'zh'): string =>
  p.taxIncluded
    ? (lang === 'zh' ? '含税' : '税込')
    : (lang === 'zh' ? '不含税' : '税抜');

/** 画面に出すCTA文言。決済が使えないときは代替文言に落とす（§5） */
export const ctaLabelFor = (p: SalesPlanConfig, lang: 'ja' | 'zh', checkoutEnabled: boolean): string => {
  if (p.ctaMode === 'consult' || checkoutEnabled) {
    return lang === 'zh' ? p.ctaLabelZh : p.ctaLabelJa;
  }
  return lang === 'zh' ? p.ctaLabelDisabledZh : p.ctaLabelDisabledJa;
};

/** 表示用にja/zhを解決したビュー。componentが lang 分岐だらけにならないようにする */
export interface SalesPlanView {
  planId: SalesPlanId;
  status: SalesPlanStatus;
  name: string;
  tagline: string;
  price: string;
  taxNote: string;
  features: string[];
  limitations: string[];
  ctaLabel: string;
  ctaMode: SalesCtaMode;
  acceptsPurchase: boolean;
  humanLessonCount: number;
  autoRenew: boolean;
  includedActiveMinutes: number | null;
  validityDays: number;
  durationDays: number;
}

export const salesPlanView = (
  p: SalesPlanConfig,
  lang: 'ja' | 'zh',
  checkoutEnabled: boolean,
): SalesPlanView => ({
  planId: p.planId,
  status: p.status,
  name: lang === 'zh' ? p.nameZh : p.nameJa,
  tagline: lang === 'zh' ? p.taglineZh : p.taglineJa,
  price: formatPlanPrice(p, lang),
  taxNote: formatTaxNote(p, lang),
  features: lang === 'zh' ? p.featuresZh : p.featuresJa,
  limitations: lang === 'zh' ? p.limitationsZh : p.limitationsJa,
  ctaLabel: ctaLabelFor(p, lang, checkoutEnabled),
  ctaMode: p.ctaMode,
  acceptsPurchase: acceptsPurchase(p),
  humanLessonCount: p.humanLessonCount,
  autoRenew: p.autoRenew,
  includedActiveMinutes: p.includedActiveMinutes,
  validityDays: p.validityDays,
  durationDays: p.durationDays,
});

/**
 * 根拠のない煽り文句の禁止リスト（§2）。
 * 画面文言・プラン定義の両方をこの語で機械検査する。
 * 「実績が無いのに一番人気と書く」類の事故を、レビューではなくテストで止める。
 */
export const BANNED_SALES_CLAIMS: readonly string[] = [
  '一番人気', '人気No', 'No.1', 'ナンバーワン', '満足度',
  '本日限定', '今だけ', '残りわずか', '先着', '限定',
  '%が選', '割が選', '必ず合格', '絶対に', '誰でも簡単',
  '最も人気', '最受欢迎', '第一', '仅限今天', '仅剩', '名额即将',
  '满意度', '保证合格', '一定能', '人人都能',
] as const;
