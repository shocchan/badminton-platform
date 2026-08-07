// 商品カタログ（正準）。**価格・期間・内容をここ以外に書かない。**
//
// なぜこの形か:
// - 商品内容・価格・利用期間は今後変わる前提。componentへ直接書くと変更のたびに探し回る
// - LP・法務ページ・申込フォームは**すべてここを読む**。1か所直せばサイト全体へ反映される
// - 価格は数値ではなく **ラベル**（`priceLabelJa`）。未確定を「準備中」と正直に書けるようにするため。
//   数値にすると未確定を 0 と書くしかなくなり、嘘になる（PRODUCT_CANON 原則13の考え方）
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
 * - `apply`    … 申込フォームへ
 * - `consult`  … 個別相談へ（今の6か月コースはこれ）
 * - `checkout` … 決済へ。**今は使わない**（production Stripeを有効化していない）
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
   * 「月額換算 約◯円」のような補助表示。無ければ出さない。
   * 価格から自動計算しない（priceLabel は文字列で、割り切れない商品もあるため）
   */
  monthlyEquivalentJa?: string; monthlyEquivalentZh?: string;
  descriptionJa: string; descriptionZh: string;
  /** 利用できる期間 */
  durationLabelJa: string; durationLabelZh: string;
  /** AI学習の累計利用分。null＝累計上限を設けない（未確定のうちは status を draft にすること） */
  aiMinutes: number | null;
  /** 人によるレッスンの回数。0＝なし */
  lessonCount: number;
  featuresJa: string[]; featuresZh: string[];
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
 * 価格はいずれも確定ではない。確定するまでは status を `draft` にしておき、
 * LPには出さない（`?plans=preview` でCEOだけ確認できる）。
 */
export const PLAN_CATALOG: PlanConfig[] = [
  {
    id: 'ai-trial-pass',
    version: 1,
    nameJa: 'AI体験パス',
    nameZh: 'AI体验通行证',
    // 価格候補。確定していないので status は draft
    priceLabelJa: '600円（税込）',
    priceLabelZh: '600日元（含税）',
    descriptionJa: 'AI先生との会話と教材を、まず60分ぶん試せるパスです。人によるレッスンは含みません。',
    descriptionZh: '可以先体验60分钟AI老师会话与教材的通行证。不包含真人课程。',
    durationLabelJa: '累計60分まで',
    durationLabelZh: '累计60分钟以内',
    aiMinutes: 60,
    lessonCount: 0,
    featuresJa: [
      'AI先生との音声会話（累計60分）',
      '教材と問題を実際に試せる',
      '自動更新はありません',
    ],
    featuresZh: [
      '与AI老师的语音会话（累计60分钟）',
      '可实际试用教材与练习题',
      '不会自动续费',
    ],
    status: 'draft',
    ctaMode: 'apply',
    sortOrder: 10,
  },
  {
    id: 'ai-month',
    version: 1,
    nameJa: '1か月AIお試し',
    nameZh: '1个月AI体验',
    // 未確定。確定するまで金額を書かない（0円と誤解させない）
    priceLabelJa: '準備中',
    priceLabelZh: '准备中',
    descriptionJa: '1か月のあいだ、AI学習をひととおり使えるプランです。人によるレッスンは含みません。',
    descriptionZh: '可在1个月内完整使用AI学习功能的方案。不包含真人课程。',
    durationLabelJa: '1か月',
    durationLabelZh: '1个月',
    aiMinutes: null,
    lessonCount: 0,
    featuresJa: [
      'AI先生との音声会話',
      'N2・N3の文法／語彙／読解／聴解',
      '復習システムと学習記録',
      '自動更新はありません',
    ],
    featuresZh: [
      '与AI老师的语音会话',
      'N2・N3的语法／词汇／阅读／听力',
      '复习系统与学习记录',
      '不会自动续费',
    ],
    status: 'draft',
    ctaMode: 'apply',
    sortOrder: 20,
  },
  {
    id: 'coach-6m',
    // v2: 価格表記を 100,000円→10万円 へ（CEO指示 2026-08-07。桁の羅列は高く感じさせるため）
    version: 2,
    nameJa: '6か月 AI日本語伴走コース',
    nameZh: '6个月 AI日语陪跑课程',
    // 期間は durationLabel が出すので、ここには入れない（「／6か月」が二重になる）
    priceLabelJa: '10万円（税込）',
    priceLabelZh: '10万日元（含税）',
    monthlyEquivalentJa: '月額換算 約16,700円／月',
    monthlyEquivalentZh: '折合每月约16,700日元',
    // セクションの lead（LP.pricing.lead）と同じ文にしない。同じ文が2回出て読みにくくなる
    descriptionJa: 'AIとの毎日の練習に、人による学習設計と方向修正を組み合わせます。',
    descriptionZh: '在每天的AI练习之外，加上真人的学习规划与方向调整。',
    durationLabelJa: '6か月',
    durationLabelZh: '6个月',
    aiMinutes: null,
    lessonCount: 24,
    featuresJa: [
      '安田翔（コーチ）との60分個別レッスン 全24回',
      'AI先生との音声会話（毎日、好きな時間に）',
      'N2文法180・語彙・聴解・読解',
      '復習システム・学習記録・個別ロードマップ',
      'WeChatでの相談・6か月間のシステム利用',
    ],
    featuresZh: [
      '与安田翔（教练）的60分钟一对一 共24次',
      '与AI老师的语音会话（每天・随时练习）',
      'N2语法180・词汇・听力・阅读',
      '复习系统・学习记录・专属路线',
      '微信咨询・6个月系统使用权',
    ],
    status: 'published',
    // 法的確認が終わるまで手動契約フロー。決済へ直行させない
    ctaMode: 'consult',
    sortOrder: 30,
  },
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

/** 申込を受け付けてよいか。draft と paused は受けない */
export const acceptsApplication = (p: PlanConfig): boolean =>
  p.status === 'published' && p.ctaMode !== 'checkout';

/** `?plans=preview` のときだけ draft も出す（法務ページと同じ流儀） */
export const isPlanPreview = (search: string): boolean =>
  new URLSearchParams(search).get('plans') === 'preview';

/** 表示用の言語別アクセサ。componentでの `lang === 'zh' ? ... : ...` を無くす */
export interface PlanView {
  id: PlanId;
  version: number;
  name: string;
  priceLabel: string;
  /** 無ければ null（表示しない） */
  monthlyEquivalent: string | null;
  description: string;
  durationLabel: string;
  features: string[];
  aiMinutes: number | null;
  lessonCount: number;
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
  monthlyEquivalent: (lang === 'zh' ? p.monthlyEquivalentZh : p.monthlyEquivalentJa) ?? null,
  description: lang === 'zh' ? p.descriptionZh : p.descriptionJa,
  durationLabel: lang === 'zh' ? p.durationLabelZh : p.durationLabelJa,
  features: lang === 'zh' ? p.featuresZh : p.featuresJa,
  aiMinutes: p.aiMinutes,
  lessonCount: p.lessonCount,
  status: p.status,
  ctaMode: p.ctaMode,
  termsNotice: PROVISIONAL_TERMS_NOTICE[lang],
});
