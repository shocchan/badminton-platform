// 利用権（entitlement）の台帳（§4-3 §11）。**純関数**。
//
// 考え方:
//   購入は「利用権の付与(grant)を1行足す」だけ。既存の行は書き換えない（append-only）。
//   だから再購入しても、アカウント・診断結果・進捗・復習予定は一切触られない（§11）。
//   何が起きたかは行を並べれば全部わかる（返金・二重購入の調査もこの台帳で足りる）。
//
// 消費（使った秒数）は learner 単位で1つだけ持ち、期限の早い grant から順に割り当てる。
//   → 「先に買ったぶんから先に失効する」という、利用者に説明しやすい挙動になる。
//   → grant ごとに残秒を持つと、二重購入時にどちらから引いたかで残り時間の表示がぶれる。

import type { SalesPlanId } from './planConfig';

export type EntitlementStatus = 'active' | 'expired' | 'refunded';

/** 1回の購入で発生する利用権。**発行後は status 以外を書き換えない** */
export interface EntitlementGrant {
  id: string;
  learnerId: string;
  planId: SalesPlanId;
  /** 購入時点の PlanConfig.version。あとから「この人が買った条件」を特定できる */
  planVersion: number;
  /** 決済側の識別子。二重付与の防止キーでもある */
  purchaseId: string;
  grantedAtMs: number;
  /** 失効時刻。ここを過ぎた分は使えない */
  expiresAtMs: number;

  /** 時間制で付与される秒数（60分パス=3600）。期間制プランは null */
  activeSeconds: number | null;
  /** 音声会話の上限（秒）。原価の主因なので必ず有限（§16） */
  voiceSeconds: number;
  /** AIレポート生成の上限（回） */
  aiReports: number;
  /** 期間制プランの利用可能期限（時間制は expiresAtMs と同じ意味で使わない） */
  periodEndsAtMs: number | null;

  status: EntitlementStatus;
}

/** learner 単位の消費実績。消費は1本にまとめる（上のコメント参照） */
export interface EntitlementConsumption {
  activeSeconds: number;
  voiceSeconds: number;
  aiReports: number;
}

export const emptyConsumption = (): EntitlementConsumption =>
  ({ activeSeconds: 0, voiceSeconds: 0, aiReports: 0 });

/** 今この learner が何をできるか、の解決結果 */
export interface EntitlementSnapshot {
  /** 学習アプリに入れるか */
  hasAccess: boolean;
  /** 時間制の残り秒数（期間制のみの人は 0 かつ hasAccess=true になり得る） */
  remainingActiveSeconds: number;
  /** 時間制で付与された合計（有効なぶんだけ） */
  grantedActiveSeconds: number;
  /** 期間制アクセスの終了時刻（無ければ null） */
  periodEndsAtMs: number | null;
  /** 音声会話の残り秒数 */
  remainingVoiceSeconds: number;
  /** AIレポートの残り回数 */
  remainingAiReports: number;
  /** 今の主プラン（期間制 > 時間制 の順で優先）。無ければ null */
  activePlanId: SalesPlanId | null;
  /** 有効な grant の数（再購入の回数を数えるのに使う） */
  activeGrantCount: number;
  /** 期限切れで捨てられた秒数（「使いきれなかった」を正直に見せるため） */
  forfeitedActiveSeconds: number;
}

const isLive = (g: EntitlementGrant, nowMs: number): boolean =>
  g.status === 'active' && g.expiresAtMs > nowMs;

/**
 * 期限の早い grant から消費を割り当てる。
 * 期限切れの grant にも先に割り当てる（過去に使った時間は過去の枠から出ている）。
 */
const allocate = (
  grants: EntitlementGrant[],
  consumedSeconds: number,
  nowMs: number,
): { remaining: number; granted: number; forfeited: number } => {
  const timed = grants
    .filter((g) => g.status !== 'refunded' && g.activeSeconds !== null)
    .sort((a, b) => a.expiresAtMs - b.expiresAtMs || a.grantedAtMs - b.grantedAtMs);

  let left = Math.max(consumedSeconds, 0);
  let remaining = 0;
  let granted = 0;
  let forfeited = 0;

  for (const g of timed) {
    const size = g.activeSeconds ?? 0;
    const used = Math.min(left, size);
    left -= used;
    const unused = size - used;
    if (isLive(g, nowMs)) {
      granted += size;
      remaining += unused;
    } else {
      // 失効済み。使わずに残った分は戻らない
      forfeited += unused;
    }
  }
  return { remaining, granted, forfeited };
};

const sumLive = (grants: EntitlementGrant[], nowMs: number, pick: (g: EntitlementGrant) => number): number =>
  grants.filter((g) => isLive(g, nowMs)).reduce((acc, g) => acc + pick(g), 0);

/** 台帳と消費実績から「今できること」を解決する。ここが利用権判定の唯一の入口 */
export const resolveEntitlement = (
  grants: EntitlementGrant[],
  consumption: EntitlementConsumption,
  nowMs: number,
): EntitlementSnapshot => {
  const live = grants.filter((g) => isLive(g, nowMs));
  const timeAlloc = allocate(grants, consumption.activeSeconds, nowMs);

  const periodEnds = live
    .map((g) => g.periodEndsAtMs)
    .filter((v): v is number => v !== null && v > nowMs)
    .sort((a, b) => b - a)[0] ?? null;

  const voiceCap = sumLive(grants, nowMs, (g) => g.voiceSeconds);
  const reportCap = sumLive(grants, nowMs, (g) => g.aiReports);

  // 期間制を優先（1か月プランを持っている人に、残り時間の話を主に見せない）
  const periodPlan = live.find((g) => g.periodEndsAtMs !== null && g.periodEndsAtMs > nowMs);
  const timedPlan = live.find((g) => g.activeSeconds !== null);
  const activePlanId = periodPlan?.planId ?? (timeAlloc.remaining > 0 ? timedPlan?.planId ?? null : null);

  const hasAccess = (periodEnds !== null) || timeAlloc.remaining > 0;

  return {
    hasAccess,
    remainingActiveSeconds: timeAlloc.remaining,
    grantedActiveSeconds: timeAlloc.granted,
    periodEndsAtMs: periodEnds,
    remainingVoiceSeconds: Math.max(voiceCap - consumption.voiceSeconds, 0),
    remainingAiReports: Math.max(reportCap - consumption.aiReports, 0),
    activePlanId,
    activeGrantCount: live.length,
    forfeitedActiveSeconds: timeAlloc.forfeited,
  };
};

// ─────────────────────────────────────────────────────────
// 付与
// ─────────────────────────────────────────────────────────

export interface GrantInput {
  learnerId: string;
  planId: SalesPlanId;
  planVersion: number;
  purchaseId: string;
  nowMs: number;
  /** PlanConfig から取る値（呼び出し側が planConfig を解決して渡す） */
  activeMinutes: number | null;
  validityDays: number;
  durationDays: number;
  voiceMinutesCap: number;
  aiReportCap: number;
}

const DAY_MS = 86_400_000;

/**
 * 1購入 → 1 grant。
 *
 * **べき等**: 同じ purchaseId の grant が既にあれば新しく作らない。
 * 決済Webhookの再送・画面の二重送信で利用権が2倍にならないための最重要ガード。
 */
export const buildGrant = (
  input: GrantInput,
  existing: EntitlementGrant[],
): { grant: EntitlementGrant | null; duplicated: boolean } => {
  const dup = existing.find((g) => g.purchaseId === input.purchaseId);
  if (dup) return { grant: null, duplicated: true };

  const grant: EntitlementGrant = {
    id: `ent_${input.purchaseId}`,
    learnerId: input.learnerId,
    planId: input.planId,
    planVersion: input.planVersion,
    purchaseId: input.purchaseId,
    grantedAtMs: input.nowMs,
    expiresAtMs: input.nowMs + Math.max(input.validityDays, 1) * DAY_MS,
    activeSeconds: input.activeMinutes === null ? null : input.activeMinutes * 60,
    voiceSeconds: input.voiceMinutesCap * 60,
    aiReports: input.aiReportCap,
    periodEndsAtMs: input.durationDays > 0 ? input.nowMs + input.durationDays * DAY_MS : null,
    status: 'active',
  };
  return { grant, duplicated: false };
};

/**
 * 再購入したか（§11 の表示分岐に使う）。
 * 同じプランの grant が2つ以上あれば再購入。
 */
export const isRepurchase = (grants: EntitlementGrant[], planId: SalesPlanId): boolean =>
  grants.filter((g) => g.planId === planId && g.status !== 'refunded').length >= 2;

/**
 * 再購入・アップグレードで **引き継がれるもの**（§11 §12）。
 * このリストは仕様であって実装の飾りではない。
 * `entitlement.test.ts` が「grant追加が学習側データに触れないこと」を型と合わせて固定する。
 */
export const CARRIED_OVER_ON_REPURCHASE = [
  'learner_account',      // 新しいアカウントを作らせない
  'diagnosis_result',     // 診断をやり直させない
  'item_progress',        // 学んだ項目の定着状態
  'review_schedule',      // 復習予定
  'adventure_map',        // 冒険マップの攻略状況
  'unit_progress',        // 単元の進み
  'settings',             // 言語・字幕・先生の選択
] as const;

export type CarriedOverKey = typeof CARRIED_OVER_ON_REPURCHASE[number];

/** 再購入時に**リセットされる**もの。ここに書いていないものは触らない */
export const RESET_ON_REPURCHASE: readonly string[] = [
  // 何もリセットしない。残り時間は「加算」であってリセットではない
];

// ─────────────────────────────────────────────────────────
// 表示用
// ─────────────────────────────────────────────────────────

/** 残り日数（期間制プラン用）。切り上げず、切り捨てで正直に出す */
export const remainingDays = (snapshot: EntitlementSnapshot, nowMs: number): number | null =>
  snapshot.periodEndsAtMs === null ? null : Math.max(Math.floor((snapshot.periodEndsAtMs - nowMs) / DAY_MS), 0);

/** 利用権の状態を1行で（購入したのに使えない、を自己解決するため。§15） */
export const entitlementSummary = (
  snapshot: EntitlementSnapshot,
  nowMs: number,
  lang: 'ja' | 'zh',
): string => {
  if (!snapshot.hasAccess) {
    return lang === 'zh'
      ? '目前没有可用的使用权。购买后即可开始。'
      : '今使える利用権はありません。購入するとすぐ始められます。';
  }
  const days = remainingDays(snapshot, nowMs);
  if (days !== null) {
    return lang === 'zh' ? `还可以使用${days}天` : `あと${days}日使えます`;
  }
  const min = Math.floor(snapshot.remainingActiveSeconds / 60);
  return lang === 'zh' ? `还可以使用${min}分钟` : `あと${min}分使えます`;
};
