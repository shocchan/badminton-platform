// プランごとの利用権限（エンティトルメント）の正準。
//
// **表示（LP・比較表）とサーバー側判定の両方が、ここから導出した同じ値を使う。**
// 画面にだけ「含まれない」と書いてサーバーが素通し、という食い違いを作らないため、
// 権限の真実は planCatalog の商品定義（lessonCount / aiMinutes / accessDays）から
// 機械的に導出する。手で二重管理しない。
//
// サーバー側の実体:
// - 利用期間: public.ai_course_access（valid_from / valid_until。ログイン直後の
//   アプリゲートが判定。migration 20260819100000 で ai_start_session にも期間チェックを追加予定）
// - AI利用量: ai_start_session RPC（日次・月次上限）＋ ai_usage_daily
// - プラン紐づけ: ai_course_access.plan_id（migration 20260819100000・**remote未適用**。
//   適用まで plan_id は読めないため、クライアントは null を「従来どおり＝制限なし」と扱う）
import { planById, UPGRADE_PATHS, type PlanId } from './planCatalog';

export interface PlanEntitlements {
  planId: PlanId;
  /** AI会話の利用可否 */
  aiConversation: boolean;
  /** AI会話の累計利用上限（分）。null＝累計上限なし（日次・月次上限は別途かかる） */
  aiMinutesTotal: number | null;
  /** リアルタイム体験の分数（開始から実時間でカウント・経過で終了）。null＝リアルタイム制ではない */
  realtimeWindowMinutes: number | null;
  /** 購入日からの利用日数（AI会話・教材の利用期限）。null＝契約で個別設定（6か月コース） */
  accessDays: number | null;
  /** 教材へのアクセス */
  materials: boolean;
  /** 教材（冒険マップ）の地域上限。null＝全地域（体験パスは3） */
  materialsRegionLimit: number | null;
  /** 復習機能 */
  review: boolean;
  /** 学習記録 */
  learningRecords: boolean;
  /** 個別ロードマップ（人が設計する専用計画） */
  personalRoadmap: boolean;
  /** 人間レッスンの回数（0＝なし） */
  humanLessonCount: number;
  /** 人間による個別フィードバック */
  humanFeedback: boolean;
  /** WeChatでの個別相談 */
  wechatConsult: boolean;
  /** 自動更新（全プラン買い切りのため常に false） */
  autoRenew: boolean;
}

/**
 * プランの権限を導出する。
 *
 * 人間系の権限（ロードマップ・個別フィードバック・WeChat相談）は
 * 「人間レッスンがあるプランだけ」に付く。60分パス・1か月プランへ
 * 個別に true を書ける構造にしない＝書き間違いで安いプランに人間権限が付く事故を防ぐ。
 */
export const entitlementsFor = (planId: PlanId): PlanEntitlements => {
  const p = planById(planId);
  if (!p) throw new Error(`unknown plan: ${planId}`);
  const hasHuman = p.lessonCount > 0;
  return {
    planId: p.id,
    aiConversation: true,
    aiMinutesTotal: p.aiMinutes,
    realtimeWindowMinutes: p.realtimeWindowMinutes,
    accessDays: p.accessDays,
    materials: true,
    materialsRegionLimit: p.contentRegionLimit,
    review: true,
    learningRecords: true,
    personalRoadmap: hasHuman,
    humanLessonCount: p.lessonCount,
    humanFeedback: hasHuman,
    wechatConsult: hasHuman,
    autoRenew: p.autoRenew,
  };
};

/* ────────────────────────────────────────────────────────────
   利用期間の計算（購入日 → 利用終了日）
   ──────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AccessWindow {
  validFromISO: string;
  /** null＝日数固定ではない（6か月コースは開始日・終了日を人が個別設定する） */
  validUntilISO: string | null;
}

/**
 * 購入日からの利用期間を計算する。
 * - accessDays があるプラン（60分・1か月）: 購入日から accessDays 日後の同時刻まで
 * - accessDays が null のプラン（6か月）: 終了日は個別設定（nullを返し、管理画面で設定する）
 */
export const accessWindowFor = (planId: PlanId, purchasedAtISO: string): AccessWindow => {
  const p = planById(planId);
  if (!p) throw new Error(`unknown plan: ${planId}`);
  const from = Date.parse(purchasedAtISO);
  if (Number.isNaN(from)) throw new Error(`invalid purchasedAt: ${purchasedAtISO}`);
  return {
    validFromISO: new Date(from).toISOString(),
    validUntilISO: p.accessDays === null ? null : new Date(from + p.accessDays * DAY_MS).toISOString(),
  };
};

/** プランの状態（購入記録の表示・判定用） */
export type PlanState = 'not_started' | 'active' | 'expired';

export const planStateOf = (window: AccessWindow, nowISO: string): PlanState => {
  const now = Date.parse(nowISO);
  if (now < Date.parse(window.validFromISO)) return 'not_started';
  if (window.validUntilISO !== null && now > Date.parse(window.validUntilISO)) return 'expired';
  return 'active';
};

/* ────────────────────────────────────────────────────────────
   アップグレード（1か月 → 6か月）の判定。**自動割引はまだ実装しない**
   ──────────────────────────────────────────────────────────── */

/**
 * 1か月プランから6か月コースへのアップグレード枠が使えるか。
 * status が 'planned' のあいだは常に不可（構造だけ用意し、決済・会計・
 * 返金条件の確認が終わってから 'active' にする）。
 */
export const upgradeCreditFor = (
  fromPlanId: PlanId, purchasedAtISO: string, nowISO: string,
): { eligible: boolean; creditJpy: number; toPlanId: PlanId } | null => {
  const path = UPGRADE_PATHS.find((u) => u.from === fromPlanId);
  if (!path) return null;
  const withinWindow =
    Date.parse(nowISO) <= Date.parse(purchasedAtISO) + path.windowDays * DAY_MS;
  return {
    eligible: path.status === 'active' && withinWindow,
    creditJpy: path.creditJpy,
    toPlanId: path.to,
  };
};
