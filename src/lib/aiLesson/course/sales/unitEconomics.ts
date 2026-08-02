// プラン別の採算（§16）。**純関数**。
//
// 低単価商品は「売れた」と「儲かった」が簡単にずれる。
// 600円の商品で1件でもメール往復が起きれば、その1件で粗利が消える。
// だからこの層は「売上」ではなく **粗利益と、粗利を食っている要因** を出す。
//
// 数値の性質を混ぜないこと:
//   - 実績     … 購入記録から集計した確定値（売上・決済手数料）
//   - 見込み   … 単価×利用量で推定した値（API原価）
//   - 配賦     … 全体費用を件数で割った値（インフラ）
// レポートでは3つを分けて出す。混ぜると「なぜ赤字か」が追えなくなる。

import { salesPlanById, type SalesPlanConfig, type SalesPlanId } from './planConfig';
import { PAYMENT_FEE_RATE } from './paymentGateway';

/**
 * 原価の単価。**ハードコードした利益率は持たない**（§16）。
 * ここを変えれば全部の判定が動く。
 */
export interface CostRates {
  /** 為替（1USD = 何円）。想定値であることを明示するためにここに置く */
  jpyPerUsd: number;
  /** 音声会話の実行単価（USD / 分）。realtime の入出力トークン想定から算出 */
  voiceUsdPerMinute: number;
  /** AIレポート1回の単価（USD） */
  reportUsdEach: number;
  /** 決済手数料率 */
  paymentFeeRate: number;
  /** 人が対応したときの時間単価（円 / 時）。手動対応の重さを金額で見る */
  supportJpyPerHour: number;
}

/**
 * 既定の単価。
 * voiceUsdPerMinute は courseConfig の REALTIME_COST の想定と揃えてある
 * （入力1,800 / 出力1,200 トークン毎分、$32 / $64 per 1M）。
 */
export const DEFAULT_COST_RATES: CostRates = {
  jpyPerUsd: 150,
  voiceUsdPerMinute: (1800 * 32 + 1200 * 64) / 1_000_000,   // = 0.1344
  reportUsdEach: 0.02,
  paymentFeeRate: PAYMENT_FEE_RATE,
  supportJpyPerHour: 3000,
};

/** 警告のしきい値。**固定の利益率をコードに埋めない**ため、ここも設定として持つ */
export interface EconomicsThresholds {
  /** API原価が売上のこの割合を超えたら警告 */
  apiCostRatioWarn: number;
  /** 粗利率がこれを下回ったら警告 */
  grossMarginWarn: number;
  /** 購入1件あたりの手動対応件数がこれを超えたら警告 */
  supportPerPurchaseWarn: number;
  /** 決済失敗率がこれを超えたら警告 */
  paymentFailureRateWarn: number;
  /** 再購入率がこれを下回ったら警告 */
  repurchaseRateWarn: number;
  /**
   * 率で警告を出すのに必要な最小件数。
   * 1件しか売れていない時点の「再購入率0%」は情報ではないので、
   * 母数が足りないうちは率の警告を出さない（判定できないだけ、を警告にしない）。
   */
  minSampleForRateWarnings: number;
}

export const DEFAULT_THRESHOLDS: EconomicsThresholds = {
  apiCostRatioWarn: 0.5,
  grossMarginWarn: 0.4,
  supportPerPurchaseWarn: 0.05,    // 20件に1件を超えて人が動いたら見直す
  paymentFailureRateWarn: 0.15,
  repurchaseRateWarn: 0.15,
  minSampleForRateWarnings: 20,
};

/** 集計の入力（購入記録・利用実績から作る） */
export interface PlanUsageAggregate {
  planId: SalesPlanId;
  /** 成立した購入件数 */
  purchases: number;
  /** そのうち再購入だった件数 */
  repurchases: number;
  /** 決済を開始したが成立しなかった件数 */
  failedPayments: number;
  /** 返金件数 */
  refunds: number;
  /** 売上（円・返金前） */
  revenueJpy: number;
  /** 返金額（円） */
  refundedJpy: number;
  /** 実際に使われた音声会話の合計（分） */
  voiceMinutesUsed: number;
  /** 生成したAIレポートの合計（回） */
  aiReportsGenerated: number;
  /** 人が対応した件数 */
  manualSupportCases: number;
  /** 人が対応した合計時間（分） */
  manualSupportMinutes: number;
}

export const emptyAggregate = (planId: SalesPlanId): PlanUsageAggregate => ({
  planId, purchases: 0, repurchases: 0, failedPayments: 0, refunds: 0,
  revenueJpy: 0, refundedJpy: 0, voiceMinutesUsed: 0, aiReportsGenerated: 0,
  manualSupportCases: 0, manualSupportMinutes: 0,
});

export type EconomicsWarning =
  | 'api_cost_too_high'
  | 'gross_margin_too_low'
  | 'too_much_manual_support'
  | 'payment_failure_rate_high'
  | 'repurchase_rate_low';

export interface PlanEconomics {
  planId: SalesPlanId;
  planName: string;

  // 実績
  purchases: number;
  netRevenueJpy: number;
  paymentFeeJpy: number;

  // 見込み
  voiceCostJpy: number;
  reportCostJpy: number;
  apiCostJpy: number;

  // 配賦
  infraCostJpy: number;

  // 人
  manualSupportCases: number;
  manualSupportMinutes: number;
  manualSupportCostJpy: number;

  totalCostJpy: number;
  grossProfitJpy: number;
  grossMargin: number;
  /** 1件あたりの粗利（低単価商品はここを見る） */
  grossProfitPerPurchaseJpy: number;

  apiCostRatio: number;
  repurchaseRate: number;
  paymentFailureRate: number;
  supportPerPurchase: number;

  warnings: EconomicsWarning[];
}

const safeRate = (n: number, d: number): number => (d <= 0 ? 0 : n / d);

export const computePlanEconomics = (
  agg: PlanUsageAggregate,
  rates: CostRates = DEFAULT_COST_RATES,
  thresholds: EconomicsThresholds = DEFAULT_THRESHOLDS,
  plan: SalesPlanConfig | null = salesPlanById(agg.planId),
): PlanEconomics => {
  const netRevenue = agg.revenueJpy - agg.refundedJpy;
  const paymentFee = Math.round(agg.revenueJpy * rates.paymentFeeRate);

  const voiceCost = Math.round(agg.voiceMinutesUsed * rates.voiceUsdPerMinute * rates.jpyPerUsd);
  const reportCost = Math.round(agg.aiReportsGenerated * rates.reportUsdEach * rates.jpyPerUsd);
  const apiCost = voiceCost + reportCost;

  const infraCost = Math.round(agg.purchases * (plan?.cost.infraCostJpyPerPurchase ?? 0));
  const supportCost = Math.round((agg.manualSupportMinutes / 60) * rates.supportJpyPerHour);

  const totalCost = paymentFee + apiCost + infraCost + supportCost;
  const grossProfit = netRevenue - totalCost;

  const apiCostRatio = safeRate(apiCost, netRevenue);
  const grossMargin = safeRate(grossProfit, netRevenue);
  const repurchaseRate = safeRate(agg.repurchases, agg.purchases);
  const paymentFailureRate = safeRate(agg.failedPayments, agg.failedPayments + agg.purchases);
  const supportPerPurchase = safeRate(agg.manualSupportCases, agg.purchases);

  const warnings: EconomicsWarning[] = [];
  // 売上0のときは「粗利率0%」を警告として出さない（判定できないだけ）
  if (agg.purchases > 0) {
    // 金額の警告は1件からでも意味がある（1件が赤字なら100件でも赤字）
    if (apiCostRatio > thresholds.apiCostRatioWarn) warnings.push('api_cost_too_high');
    if (grossMargin < thresholds.grossMarginWarn) warnings.push('gross_margin_too_low');
    // 人の対応も1件で意味がある（低単価商品では1件が粗利を飛ばす）
    if (supportPerPurchase > thresholds.supportPerPurchaseWarn) warnings.push('too_much_manual_support');
  }
  // 率の警告は母数がそろってから
  const attempts = agg.failedPayments + agg.purchases;
  if (agg.purchases >= thresholds.minSampleForRateWarnings && repurchaseRate < thresholds.repurchaseRateWarn) {
    warnings.push('repurchase_rate_low');
  }
  if (attempts >= thresholds.minSampleForRateWarnings && paymentFailureRate > thresholds.paymentFailureRateWarn) {
    warnings.push('payment_failure_rate_high');
  }

  return {
    planId: agg.planId,
    planName: plan?.nameJa ?? agg.planId,
    purchases: agg.purchases,
    netRevenueJpy: netRevenue,
    paymentFeeJpy: paymentFee,
    voiceCostJpy: voiceCost,
    reportCostJpy: reportCost,
    apiCostJpy: apiCost,
    infraCostJpy: infraCost,
    manualSupportCases: agg.manualSupportCases,
    manualSupportMinutes: agg.manualSupportMinutes,
    manualSupportCostJpy: supportCost,
    totalCostJpy: totalCost,
    grossProfitJpy: grossProfit,
    grossMargin,
    grossProfitPerPurchaseJpy: agg.purchases > 0 ? Math.round(grossProfit / agg.purchases) : 0,
    apiCostRatio,
    repurchaseRate,
    paymentFailureRate,
    supportPerPurchase,
    warnings,
  };
};

/**
 * 満額まで使われた場合の1件あたり採算（販売前の見積り）。
 * 実績が無いうちに「600円で利益が残るか」を判断するための、**最悪ケース**の計算。
 * 実際の利用は上限より少ないので、これで黒字なら実運用でも黒字になる。
 */
export const worstCaseUnitEconomics = (
  planId: SalesPlanId,
  rates: CostRates = DEFAULT_COST_RATES,
): PlanEconomics => {
  const plan = salesPlanById(planId)!;
  return computePlanEconomics({
    ...emptyAggregate(planId),
    purchases: 1,
    revenueJpy: plan.priceAmount,
    voiceMinutesUsed: plan.cost.voiceMinutesCap,
    aiReportsGenerated: plan.cost.aiReportCap,
  }, rates);
};

/** 転換率（§16）。分母が0のときは「まだ判定できない」を null で返す */
export interface ConversionRates {
  hourToMonth: number | null;
  monthToCoachingConsultation: number | null;
}

export const conversionRates = (input: {
  hourPassPurchases: number;
  hourToMonthConversions: number;
  monthPurchases: number;
  coachingConsultations: number;
}): ConversionRates => ({
  hourToMonth: input.hourPassPurchases > 0
    ? input.hourToMonthConversions / input.hourPassPurchases : null,
  monthToCoachingConsultation: input.monthPurchases > 0
    ? input.coachingConsultations / input.monthPurchases : null,
});

/** 警告の説明（管理者が読んで、次に何をするか分かる形にする） */
export const warningMessage = (w: EconomicsWarning): string => ({
  api_cost_too_high:
    'API原価が売上に対して高すぎます。音声会話の上限（voiceMinutesCap）を見直してください。',
  gross_margin_too_low:
    '粗利率が想定を下回っています。価格・原価上限・手動対応のどれが効いているかを内訳で確認してください。',
  too_much_manual_support:
    '人の対応が多すぎます。売れているのではなく採算が悪化しています。問い合わせ内容をヘルプへ移してください。',
  payment_failure_rate_high:
    '決済の失敗が多すぎます。入力の分かりにくさか、決済手段の不足を疑ってください。',
  repurchase_rate_low:
    '再購入が少ないです。1回の学習で成果が見えているか（終了時のレポート）を確認してください。',
}[w]);
