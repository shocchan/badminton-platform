/* eslint-disable react-refresh/only-export-components -- 種別/状態バッジ・JST日付ヘルパを詳細ビュー（AdminStudentDetail / AdminStudentV2Stats）と共用する正準としてここから export する（AdminAccessPanel.tsx と同じ流儀） */
// 管理ページ タブ2「生徒」統合一覧。
// 母集合は auth.users 起点の AdminAccountView（未ログインの生徒も見える・原則2）。
// モバイル=カード1列 / sm以上=テーブル。並びは「要対応該当者 → 最終学習が新しい順」。
// 表示する値はすべて §8 データソース対応表にある実在データのみ（原則13）。

import { useMemo } from 'react';
import { AlertTriangle, PauseCircle } from 'lucide-react';
import { monthlyCapOf } from '../../../lib/aiLesson/course/admin/adminAccountModel';
import type { AdminAccountType, AdminAccountView } from '../../../lib/aiLesson/course/admin/adminAccountModel';
import type { UsageLimits } from '../../../lib/aiLesson/course/admin/adminAccountsApi';

interface Props {
  views: AdminAccountView[];
  limits: UsageLimits;
  filter: AdminAccountType | 'all';
  onFilter: (f: AdminAccountType | 'all') => void;
  onSelect: (userId: string) => void;
}

// ── 共有ヘルパー（AdminStudentDetail / AdminStudentV2Stats からも import される） ──

const JST_KEY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });

/** 今日のJST日付キー（YYYY-MM-DD） */
export const jstTodayKey = (): string => JST_KEY_FMT.format(new Date());

/** ISO時刻 → JST日付表示（例: 2026/08/18）。null/不正は '—' */
export const jstDateLabel = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(t));
};

/** ISO時刻 → JST日時表示（例: 08/18 09:30）。null/不正は '—' */
export const jstDateTimeLabel = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(t));
};

/** 日付キー同士の日数差（toKey - fromKey）。不正なら null */
export const daysBetweenKeys = (fromKey: string, toKey: string): number | null => {
  const a = Date.parse(fromKey);
  const b = Date.parse(toKey);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
};

/** ISO時刻から今日（JST）までの経過日数。不正なら null */
export const daysSinceISO = (iso: string | null | undefined, todayKey: string): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return daysBetweenKeys(JST_KEY_FMT.format(new Date(t)), todayKey);
};

/** 最終学習の相対表示。3日以上空いていたら warn=true（amber表示の判断） */
export const lastStudyLabelOf = (
  lastStudyDateKey: string | null, todayKey: string,
): { label: string; warn: boolean } => {
  if (!lastStudyDateKey) return { label: '未学習', warn: false };
  const d = daysBetweenKeys(lastStudyDateKey, todayKey);
  if (d === null) return { label: '—', warn: false };
  if (d <= 0) return { label: '今日', warn: false };
  if (d === 1) return { label: '昨日', warn: false };
  return { label: `${d}日前`, warn: d >= 3 };
};

/** 一覧・詳細ヘッダで使う表示名。learner未作成ならログインIDで呼ぶ */
export const displayNameOf = (view: AdminAccountView): string => {
  const n = view.learner?.displayName?.trim();
  return n && n.length > 0 ? n : view.account.loginId;
};

/** 期限列の表示（状態バッジと同じソース ai_course_access 由来） */
export const expiryLabelOf = (view: AdminAccountView): string => {
  switch (view.badge) {
    case 'active': return view.daysToExpiry !== null ? `残${view.daysToExpiry}日` : '利用中';
    case 'not_started': return '開始前';
    case 'expired': return '期限切れ';
    default: return '未設定';
  }
};

const TYPE_LABELS: Record<AdminAccountType, string> = {
  student: '生徒', test: 'テスト', admin: '管理者', other: 'その他',
};

const TYPE_BADGE_CLS: Record<AdminAccountType, string> = {
  student: 'bg-blue-50 text-blue-700 border-blue-200',
  test: 'bg-gray-100 text-gray-600 border-gray-200',
  admin: 'bg-gray-800 text-white border-gray-800',
  other: 'bg-gray-50 text-gray-500 border-gray-200',
};

/** 種別バッジ（DB由来: ai_admins / access.source / ai_learners.is_test） */
export const TypeBadge = ({ type }: { type: AdminAccountType }) => (
  <span className={`inline-block shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border ${TYPE_BADGE_CLS[type]}`}>
    {TYPE_LABELS[type]}
  </span>
);

const STATE_BADGES: Record<AdminAccountView['badge'], { label: string; cls: string }> = {
  active: { label: '利用中', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  not_started: { label: '開始前', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  expired: { label: '期限切れ', cls: 'bg-red-50 text-red-700 border-red-200' },
  none: { label: '未設定', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

/**
 * 状態バッジ群。受講権の状態（accessStateOf由来）＋停止中＋未ログイン＋期間矛盾。
 * 「開始前なのに学習記録あり」（現況kana）が一覧だけで分かるようにする（原則4）。
 */
export const StateBadges = ({ view }: { view: AdminAccountView }) => {
  const s = STATE_BADGES[view.badge];
  const paused = view.learner !== null && !view.learner.isActive;
  const notLoggedIn = view.access !== null && view.learner === null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
      {paused && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200">
          <PauseCircle className="w-3 h-3" />停止中
        </span>
      )}
      {notLoggedIn && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
          未ログイン
        </span>
      )}
      {view.contradiction && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-300">
          <AlertTriangle className="w-3 h-3" />矛盾
        </span>
      )}
    </span>
  );
};

/**
 * 一覧の並び替え用「要対応」判定（生徒のみ）。
 * adminAttention.buildAttention と同じ条件系（未ログイン/矛盾/期限切れ/停滞/上限接近）。
 * ここは並び順と行の強調のためだけに使い、要対応の正準リストは今日タブが持つ。
 */
export const needsAttentionOf = (
  view: AdminAccountView, limits: UsageLimits, todayKey: string,
): boolean => {
  if (view.type !== 'student') return false;
  if (view.contradiction) return true;
  if (view.badge === 'expired') return true;
  // 未ログイン（発行から3日以上）
  if (view.access !== null && view.learner === null) {
    const d = daysSinceISO(view.account.userCreatedAtISO, todayKey);
    if (d !== null && d >= 3) return true;
  }
  // 停滞（adminAttention.isStalled と同条件）:
  // learner作成から7日以上経過が前提（新規生徒の立ち上がり期は騒がない）。
  // そのうえで学習ゼロ、または最終学習が3日以上前なら停滞
  if (view.badge === 'active' && view.learner !== null) {
    const age = daysSinceISO(view.learner.createdAtISO, todayKey);
    if (age !== null && age >= 7) {
      if (!view.lastStudyDateKey) return true;
      const d = daysBetweenKeys(view.lastStudyDateKey, todayKey);
      if (d !== null && d >= 3) return true;
    }
  }
  // 月次上限に接近（85%以上）
  if (view.monthUsage) {
    const cap = monthlyCapOf(view, limits);
    if (cap > 0 && view.monthUsage.sessions / cap >= 0.85) return true;
  }
  return false;
};

// ── 本体 ──

const FILTERS: (AdminAccountType | 'all')[] = ['student', 'test', 'admin', 'other', 'all'];
const FILTER_LABELS: Record<AdminAccountType | 'all', string> = {
  student: '生徒', test: 'テスト', admin: '管理者', other: 'その他', all: '全部',
};

/** 今月会話の使用率バー（85%以上でamber・上限メーターと同じ意味色） */
const UsageBar = ({ sessions, cap }: { sessions: number; cap: number }) => {
  const ratio = cap > 0 ? Math.min(sessions / cap, 1) : 0;
  const cls = ratio >= 0.85 ? 'bg-amber-500' : 'bg-blue-400';
  return (
    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar"
      aria-valuenow={sessions} aria-valuemax={cap}>
      <div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
};

export const AdminStudentsTab = ({ views, limits, filter, onFilter, onSelect }: Props) => {
  const todayKey = useMemo(() => jstTodayKey(), []);

  const counts = useMemo(() => {
    const c: Record<AdminAccountType | 'all', number> = { student: 0, test: 0, admin: 0, other: 0, all: views.length };
    for (const v of views) c[v.type] += 1;
    return c;
  }, [views]);

  const rows = useMemo(() => {
    const filtered = filter === 'all' ? views : views.filter((v) => v.type === filter);
    return [...filtered].sort((a, b) => {
      const aa = needsAttentionOf(a, limits, todayKey);
      const ba = needsAttentionOf(b, limits, todayKey);
      if (aa !== ba) return aa ? -1 : 1;
      const ak = a.lastStudyDateKey ?? '';
      const bk = b.lastStudyDateKey ?? '';
      if (ak !== bk) return ak > bk ? -1 : 1;   // 最終学習が新しい順（なしは最後）
      return displayNameOf(a).localeCompare(displayNameOf(b), 'ja');
    });
  }, [views, filter, limits, todayKey]);

  return (
    <div>
      {/* 種別フィルタチップ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => onFilter(f)}
            className={`shrink-0 min-h-9 px-3 py-1.5 rounded-full border text-sm ${filter === f
              ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold'
              : 'border-gray-200 bg-white text-gray-600'}`}>
            {FILTER_LABELS[f]}（{counts[f]}）
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">該当するアカウントがありません。</p>
      ) : (
        <>
          {/* モバイル: カード1列 */}
          <ul className="mt-3 space-y-2 block sm:hidden">
            {rows.map((v) => {
              const cap = monthlyCapOf(v, limits);
              const sessions = v.monthUsage?.sessions ?? 0;
              const last = lastStudyLabelOf(v.lastStudyDateKey, todayKey);
              return (
                <li key={v.account.userId}>
                  <button type="button" onClick={() => onSelect(v.account.userId)}
                    className={`w-full min-h-11 text-left rounded-xl border bg-white p-3 active:opacity-80 ${needsAttentionOf(v, limits, todayKey) ? 'border-amber-300' : 'border-gray-200'}`}>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">{displayNameOf(v)}</span>
                      {displayNameOf(v) !== v.account.loginId && (
                        <span className="text-[11px] text-gray-400">({v.account.loginId})</span>
                      )}
                      <TypeBadge type={v.type} />
                      <StateBadges view={v} />
                    </span>
                    <span className="mt-2 grid grid-cols-3 gap-2">
                      <span className="block">
                        <span className="block text-[10px] text-gray-500">最終学習</span>
                        <span className={`block text-sm font-bold tabular-nums ${last.warn ? 'text-amber-700' : 'text-gray-900'}`}>{last.label}</span>
                      </span>
                      <span className="block">
                        <span className="block text-[10px] text-gray-500">直近7日</span>
                        <span className="block text-sm font-bold tabular-nums text-gray-900">
                          {v.adv ? `${v.adv.studyDays7}日` : '—'}
                        </span>
                      </span>
                      <span className="block">
                        <span className="block text-[10px] text-gray-500">今月AI会話</span>
                        <span className={`block text-sm font-bold tabular-nums ${cap > 0 && sessions / cap >= 0.85 ? 'text-amber-700' : 'text-gray-900'}`}>
                          {sessions}/{cap}
                        </span>
                        <UsageBar sessions={sessions} cap={cap} />
                      </span>
                    </span>
                    <span className="mt-1.5 block text-[11px] text-gray-500 tabular-nums">
                      {expiryLabelOf(v)} ・ 累計${v.account.usage.totalCostUsd.toFixed(2)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* sm以上: テーブル（横スクロールはこの箱の中だけ） */}
          <div className="mt-3 hidden sm:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500">
                  <th className="px-3 py-2 font-medium">名前（ID）</th>
                  <th className="px-2 py-2 font-medium">種別</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">最終学習</th>
                  <th className="px-2 py-2 font-medium">最終認証</th>
                  <th className="px-2 py-2 font-medium text-right">7日</th>
                  <th className="px-2 py-2 font-medium text-right">30日</th>
                  <th className="px-2 py-2 font-medium text-right">今月会話</th>
                  <th className="px-2 py-2 font-medium text-right">累計$</th>
                  <th className="px-3 py-2 font-medium text-right">期限</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const cap = monthlyCapOf(v, limits);
                  const sessions = v.monthUsage?.sessions ?? 0;
                  const last = lastStudyLabelOf(v.lastStudyDateKey, todayKey);
                  return (
                    <tr key={v.account.userId} onClick={() => onSelect(v.account.userId)}
                      className="cursor-pointer border-t border-gray-100 hover:bg-blue-50/50">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-gray-900">{displayNameOf(v)}</span>
                        {displayNameOf(v) !== v.account.loginId && (
                          <span className="ml-1 text-[11px] text-gray-400">({v.account.loginId})</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5"><TypeBadge type={v.type} /></td>
                      <td className="px-2 py-2.5"><StateBadges view={v} /></td>
                      <td className={`px-2 py-2.5 tabular-nums ${last.warn ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>{last.label}</td>
                      <td className="px-2 py-2.5 text-xs text-gray-500 tabular-nums">{jstDateTimeLabel(v.account.lastSignInAtISO)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{v.adv ? v.adv.studyDays7 : '—'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{v.adv ? v.adv.studyDays30 : '—'}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${cap > 0 && sessions / cap >= 0.85 ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>
                        {sessions}/{cap}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">${v.account.usage.totalCostUsd.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{expiryLabelOf(v)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        最終認証＝OTP/パスワードで認証し直した日時。セッション保持中の学習では更新されません。
      </p>
    </div>
  );
};
