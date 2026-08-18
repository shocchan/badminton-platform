// 管理ページのアカウント結合モデル（純関数・DB非依存）。
//
// 1アカウント = auth.users 1行を核に、learner（初回ログインで生まれる学習データ）・
// access（受講権）・usage（今月の利用）を外部結合して1つのビューにする。
// 種別（生徒/テスト/管理者/その他）は**DB由来の列だけ**から導出する。
// 表示名の目視（実例: 実生徒 kana の表示名が『テスト』）に依存した仕分けはしない。
import type { AdminAccessRow, AdminLearnerRow, LearnerUsageSummary } from '../courseAdminApi';
import type { AdminAccountRow, UsageLimits } from './adminAccountsApi';
import { accessStateOf } from '../courseAccess';
import { advLearnerUsageOf, type AdvLearnerUsage } from '../adventure/advAdminUsage';

export type AdminAccountType = 'student' | 'test' | 'admin' | 'other';

/** 受講権の状態バッジ。accessStateOf（生徒ゲートと同じ判定）を管理者視点で再利用 */
export type AdminAccessBadge = 'active' | 'not_started' | 'expired' | 'none';

export interface AdminAccountView {
  account: AdminAccountRow;
  learner: AdminLearnerRow | null;
  access: AdminAccessRow | null;
  type: AdminAccountType;
  badge: AdminAccessBadge;
  /** V2利用状況（learnerがあれば settings から算出）。未ログインなら null */
  adv: AdvLearnerUsage | null;
  /** 今月の利用（ai_usage_daily 当月）。learner が無い・利用が無いなら null */
  monthUsage: LearnerUsageSummary | null;
  /**
   * 最終学習日（YYYY-MM-DD・JST）。settings由来の学習日キーと
   * ai_usage_daily 全期間 max(usage_date) の合成max（3系統乖離の解消）
   */
  lastStudyDateKey: string | null;
  /** 期限までの残日数（切り上げ）。access が無ければ null。期限切れなら負 */
  daysToExpiry: number | null;
  /** 期間と実態の矛盾: 「開始前」なのにログイン・学習記録がある（実例: kana） */
  contradiction: boolean;
}

/**
 * 種別の導出。優先順: 管理者 > テスト > 生徒 > その他。
 * - admin:   ai_admins に載っている（RPCの is_admin_account）
 * - test:    受講権の source='test' または ai_learners.is_test
 * - student: 受講権 or learner のどちらかがある（未ログインの発行済み生徒を含む）
 * - other:   どれも無い（雑多な登録アカウント）
 */
export const accountTypeOf = (
  account: AdminAccountRow, learner: AdminLearnerRow | null, access: AdminAccessRow | null,
): AdminAccountType => {
  if (account.isAdminAccount) return 'admin';
  if (access?.source === 'test' || learner?.isTest) return 'test';
  if (access !== null || learner !== null) return 'student';
  return 'other';
};

const DAY_MS = 86400000;

const maxDateKey = (a: string | null, b: string | null): string | null => {
  if (a && b) return a > b ? a : b;
  return a ?? b;
};

export const buildAccountViews = (
  accounts: AdminAccountRow[],
  learners: AdminLearnerRow[],
  accessMap: Record<string, AdminAccessRow>,
  usageMap: Record<string, LearnerUsageSummary>,
  nowISO: string,
): AdminAccountView[] => {
  const learnerByUser = new Map(learners.map((l) => [l.userId, l]));
  return accounts.map((account) => {
    const learner = learnerByUser.get(account.userId) ?? null;
    const access = accessMap[account.userId] ?? null;
    const type = accountTypeOf(account, learner, access);
    // isAdmin=false 固定: 管理者アカウントでも「受講権の事実」をそのまま出す
    const state = accessStateOf(
      access ? { validFromISO: access.validFromISO, validUntilISO: access.validUntilISO, note: access.note } : null,
      nowISO, false,
    );
    const badge: AdminAccessBadge = state.kind === 'admin' ? 'none' : state.kind;
    const adv = learner ? advLearnerUsageOf(learner.settings, nowISO) : null;
    const monthUsage = learner ? (usageMap[learner.id] ?? null) : null;
    const lastStudyDateKey = maxDateKey(adv?.lastStudyDateKey ?? null, account.usage.lastDate);
    const daysToExpiry = access
      ? Math.ceil((Date.parse(access.validUntilISO) - Date.parse(nowISO)) / DAY_MS)
      : null;
    const contradiction = badge === 'not_started' && (learner !== null || account.lastSignInAtISO !== null);
    return { account, learner, access, type, badge, adv, monthUsage, lastStudyDateKey, daysToExpiry, contradiction };
  });
};

/** この生徒の月次セッション上限（learner個別の上書き > 全体設定） */
export const monthlyCapOf = (view: AdminAccountView, limits: UsageLimits): number =>
  view.learner?.adminOverrides.monthlyMaxSessions ?? limits.monthlyMaxSessions;
