// 管理ページの母集合API（2026-08-18 管理ページ刷新）。
//
// 母集合は auth.users。生徒の存在を ai_learners（＝初回ログインで初めて作られる）起点に
// してしまうと、アカウントを発行したのに一度もログインしていない生徒（実例: andy/wang）が
// 管理画面から見えなくなる。今後の単発販売・システム販売で自動発行されるアカウントも
// auth.users には必ず乗るので、この台帳が「全アカウントの正」になる。
import { supabase } from '../../../../services/supabaseClient';
import { DEFAULT_USAGE_LIMITS } from '../courseConfig';
import { adminListAccess, adminListLearners } from '../courseAdminApi';

const LOGIN_ID_DOMAIN = '@id.badminton-platform.pages.dev';

/** 表示用ID。ログインID方式のメールなら @より前、無ければ user_id 先頭8桁 */
const loginIdOf = (email: string, userId: string): string => {
  if (!email) return userId.slice(0, 8);
  return email.endsWith(LOGIN_ID_DOMAIN) ? email.split('@')[0] : email;
};

export interface AdminAccountRow {
  userId: string;
  email: string;
  loginId: string;
  /** アカウント発行日（auth.users.created_at） */
  userCreatedAtISO: string;
  /** 最終認証（auth.users.last_sign_in_at）。OTP/パスワード再認証時のみ更新される */
  lastSignInAtISO: string | null;
  /** ai_admins に載っている管理者アカウントか */
  isAdminAccount: boolean;
  /** ai_learners の行。未ログインなら null */
  learnerId: string | null;
  /** ai_usage_daily の全期間集計（当月ではない） */
  usage: { totalSessions: number; totalSeconds: number; totalCostUsd: number; lastDate: string | null };
  /** ai_learning_sessions の正確な全期間 count（「直近30件で頭打ち」の根治） */
  convSessionsTotal: number;
}

/**
 * RPC が使えない環境（マイグレーション未適用の staging 等）のフェイルソフト。
 * adminListLearners ∪ adminListAccess から合成してページを落とさない。
 * email は学習者ログインRPC（ai_admin_learner_logins）由来、learner の無い行は user_id 短縮表示。
 * usage / conv は 0（全期間集計は RPC でしか取れないため。見かけの値は出さない）。
 */
const fallbackAccounts = async (): Promise<AdminAccountRow[]> => {
  const [learners, accessMap, loginsRes] = await Promise.all([
    adminListLearners(), adminListAccess(), supabase.rpc('ai_admin_learner_logins'),
  ]);
  const logins = new Map<string, { email: string; lastSignInAt: string | null; userCreatedAt: string | null }>();
  for (const r of ((loginsRes.data ?? []) as {
    learner_id: string; email: string | null; last_sign_in_at: string | null; user_created_at: string | null;
  }[])) {
    logins.set(r.learner_id, { email: r.email ?? '', lastSignInAt: r.last_sign_in_at, userCreatedAt: r.user_created_at });
  }
  const zeroUsage = () => ({ totalSessions: 0, totalSeconds: 0, totalCostUsd: 0, lastDate: null });
  const out = new Map<string, AdminAccountRow>();
  for (const l of learners) {
    const login = logins.get(l.id);
    const email = login?.email ?? '';
    out.set(l.userId, {
      userId: l.userId, email, loginId: loginIdOf(email, l.userId),
      userCreatedAtISO: login?.userCreatedAt ?? l.createdAtISO,
      lastSignInAtISO: login?.lastSignInAt ?? null,
      isAdminAccount: false, learnerId: l.id,
      usage: zeroUsage(), convSessionsTotal: 0,
    });
  }
  for (const a of Object.values(accessMap)) {
    if (out.has(a.userId)) continue;
    out.set(a.userId, {
      userId: a.userId, email: '', loginId: loginIdOf('', a.userId),
      userCreatedAtISO: '', lastSignInAtISO: null,
      isAdminAccount: false, learnerId: null,
      usage: zeroUsage(), convSessionsTotal: 0,
    });
  }
  return [...out.values()];
};

/** 全アカウント一覧（ai_admin_list_accounts RPC・非管理者は0行）。失敗時はフェイルソフト合成 */
export const adminListAccounts = async (): Promise<AdminAccountRow[]> => {
  const { data, error } = await supabase.rpc('ai_admin_list_accounts');
  if (error || !Array.isArray(data)) return fallbackAccounts();
  return (data as Record<string, unknown>[]).map((r) => {
    const userId = r.user_id as string;
    const email = (r.email as string) ?? '';
    return {
      userId, email, loginId: loginIdOf(email, userId),
      userCreatedAtISO: (r.user_created_at as string) ?? '',
      lastSignInAtISO: (r.last_sign_in_at as string) ?? null,
      isAdminAccount: (r.is_admin_account as boolean) ?? false,
      learnerId: (r.learner_id as string) ?? null,
      usage: {
        totalSessions: Number(r.usage_total_sessions ?? 0),
        totalSeconds: Number(r.usage_total_seconds ?? 0),
        totalCostUsd: Number(r.usage_total_cost_usd ?? 0),
        lastDate: (r.usage_last_date as string) ?? null,
      },
      convSessionsTotal: Number(r.conv_sessions_total ?? 0),
    };
  });
};

// ── 月次上限の単一ソース（二重ソース解消・2026-08-18） ──

export interface UsageLimits {
  monthlyMaxSessions: number;
  monthlyMaxSeconds: number;
}

/**
 * 月次上限を一度だけ解決する（ai_config('usage_limits') → 無ければ既定値）。
 * 一覧・詳細・KPI はすべてこの戻り値を受け取り、画面ごとに ai_config を
 * 読み直さない（値がずれる二重ソースの廃止）。learner個別の上書きは
 * adminAccountModel.monthlyCapOf / adminGetUsageCost 側で重ねる。
 */
export const adminGetUsageLimits = async (): Promise<UsageLimits> => {
  const { data } = await supabase.from('ai_config').select('value').eq('key', 'usage_limits').maybeSingle();
  const v = (data?.value as Record<string, number> | undefined) ?? {};
  return {
    monthlyMaxSessions: v.monthly_max_sessions ?? DEFAULT_USAGE_LIMITS.monthly_max_sessions,
    monthlyMaxSeconds: v.monthly_max_seconds ?? DEFAULT_USAGE_LIMITS.monthly_max_seconds,
  };
};

/* ────────────────────────────────────────────────────────────
   購入台帳（セルフサービス決済・2026-08-20）
   ──────────────────────────────────────────────────────────── */

/** ai_plan_purchases の1行（ai_admin_list_purchases RPC の戻り） */
export interface AdminPurchaseRow {
  id: string;
  stripeSessionId: string;
  planId: string;
  planVersion: number;
  amountJpy: number;
  /** Stripeのlive決済か（テスト決済を売上に数えないための印） */
  livemode: boolean;
  buyerEmail: string | null;
  locale: string;
  /** pending=セッション作成 / paid=決済確認 / provisioned=発行済み / failed=要対応 / refunded=返金済み */
  status: string;
  userId: string | null;
  loginId: string | null;
  error: string | null;
  createdAtISO: string;
  provisionedAtISO: string | null;
  /** card / alipay / wechat_pay。webhookが記録する。未取得は null（2026-08-26） */
  paymentMethod: string | null;
  /** 購入直後の自動ログインを使った時刻。null＝使っていない（2026-08-26） */
  loginClaimedAtISO: string | null;
}

/**
 * 購入台帳の一覧（管理者のみ。非管理者は0行）。
 * 失敗時は空配列＝「まだ購入が無い」と区別できないが、
 * 画面側は取得エラーを別途表示するので黙って0件にはならない。
 */
export const adminListPurchases = async (): Promise<AdminPurchaseRow[]> => {
  const { data, error } = await supabase.rpc('ai_admin_list_purchases');
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    stripeSessionId: String(r.stripe_session_id ?? ''),
    planId: String(r.plan_id ?? ''),
    planVersion: Number(r.plan_version ?? 0),
    amountJpy: Number(r.amount_jpy ?? 0),
    livemode: r.livemode === true,
    buyerEmail: (r.buyer_email as string) ?? null,
    locale: String(r.locale ?? 'ja'),
    status: String(r.status ?? ''),
    userId: (r.user_id as string) ?? null,
    loginId: (r.login_id as string) ?? null,
    error: (r.error as string) ?? null,
    createdAtISO: String(r.created_at ?? ''),
    provisionedAtISO: (r.provisioned_at as string) ?? null,
    paymentMethod: (r.payment_method as string) ?? null,
    loginClaimedAtISO: (r.login_claimed_at as string) ?? null,
  }));
};
