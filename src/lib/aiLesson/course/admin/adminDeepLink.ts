// 点検ボードから「その人の管理画面」へ直接ひらくための解決（2026-08-23）。
//
// なぜ要るか（CEO報告）:
//   「管理ページをまだ使いこなせていない」。原因は**探しに行かせていること**。
//   朝のボードで相手を見つけたのに、管理ページでタブを選び直して一覧から探すのでは、
//   手を打つ前に力尽きる。ボードの1行から、その人の画面へひと跳びで着く。
//
// URL: /ja/ai-course/admin?tab=students&account=<学習ID or メール or userId>

// 'content'（教材レビュー）は 2026-08-25 に画面ごと削除した。ここに残すと
// ?tab=content が「知らないタブ」ではなく有効な指定として通り、中身の無いタブを選んだ状態で開く。
export type AdminTabId = 'today' | 'students' | 'access' | 'ops';
const TABS: AdminTabId[] = ['today', 'students', 'access', 'ops'];

export interface AdminDeepLink {
  /** 指定されたタブ。無ければ null */
  tab: AdminTabId | null;
  /** 指定されたアカウント（学習ID・メール・userId のいずれか）。無ければ null */
  account: string | null;
}

/** URLのクエリを読む。壊れていても投げない（管理画面を開けなくしない） */
export const parseAdminDeepLink = (search: string): AdminDeepLink => {
  try {
    const q = new URLSearchParams(search);
    const tab = q.get('tab');
    const account = (q.get('account') ?? '').trim();
    return {
      tab: TABS.includes(tab as AdminTabId) ? (tab as AdminTabId) : null,
      account: account.length > 0 ? account : null,
    };
  } catch {
    return { tab: null, account: null };
  }
};

/** 最初に開くタブ。人の指定があれば生徒タブ、無指定なら今日 */
export const initialAdminTab = (link: AdminDeepLink): AdminTabId =>
  link.tab ?? (link.account ? 'students' : 'today');

export interface AccountLike { userId: string; loginId?: string | null; email?: string | null }

/**
 * 指定された文字列からアカウントを1件選ぶ。
 * ボードは学習IDを出しているが、手で貼ったメールや userId でも当たるようにする。
 * 当たらなければ null（**別の人を開かない**。黙って違う画面を出すのがいちばん危ない）
 */
export const matchAccount = <T extends AccountLike>(accounts: T[], key: string | null): T | null => {
  if (!key) return null;
  const k = key.trim().toLowerCase();
  if (k.length === 0) return null;
  return accounts.find((a) => a.userId === key)
    ?? accounts.find((a) => (a.loginId ?? '').toLowerCase() === k)
    ?? accounts.find((a) => (a.email ?? '').toLowerCase() === k)
    ?? accounts.find((a) => (a.email ?? '').toLowerCase().split('@')[0] === k)
    ?? null;
};
