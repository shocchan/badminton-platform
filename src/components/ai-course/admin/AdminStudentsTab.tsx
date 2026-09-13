/* eslint-disable react-refresh/only-export-components -- 種別/状態バッジ・JST日付ヘルパを詳細ビュー（AdminStudentDetail / AdminStudentV2Stats）と共用する正準としてここから export する（AdminAccessPanel.tsx と同じ流儀） */
// 管理ページ タブ2「生徒」統合一覧。
// 母集合は auth.users 起点の AdminAccountView（未ログインの生徒も見える・原則2）。
// モバイル=カード1列 / sm以上=テーブル。並びは「要対応該当者 → 最終学習が新しい順」。
// 表示する値はすべて §8 データソース対応表にある実在データのみ（原則13）。

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PauseCircle, Link2, Copy, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../../services/supabaseClient';
import { issueLearningCode } from '../../../lib/aiLesson/course/admin/learningCodesApi';
import { formatLearningCode } from '../../../lib/aiLesson/course/learningCode';
import { fetchPlainLearningCodes, fetchReferralTree, learnUrlOf, type PlainLearningCode, type ReferralTreeRow } from '../../../lib/aiLesson/course/admin/adminReferralApi';
import { monthlyCapOf, profileSummaryOf } from '../../../lib/aiLesson/course/admin/adminAccountModel';
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
//
// 2026-09-13 CEO「管理ページ余計なものが多くて使いこなせてない」→ 一覧を**羅列**に絞る。
//   名前 / プラン・期限 / 旅人 / 目的 / 目標 / 最終学習 / 最終ログイン / WeChat / 個人リンク
// 7日・30日・今月会話・累計$・種別バッジは一覧から外した（生徒詳細には残る）。
// 個人リンクはその場で発行してコピーできる（前のリンクは無効になる。平文はこの1回だけ）。

const FILTERS: (AdminAccountType | 'all')[] = ['student', 'test', 'all'];
const FILTER_LABELS: Record<AdminAccountType | 'all', string> = {
  student: '生徒', test: 'テスト', admin: '管理者', other: 'その他', all: '全部',
};

const STUDY_ORIGIN = 'https://study.kawabado.com';

/**
 * 個人リンク（2026-09-13 CEO指示: 配ったリンクをそのまま表示。押せば自分も入れる／コピーして生徒に再送できる）。
 * 平文が台帳にある人（2026-09-13 以降の発行）はそのまま出す。無い人は「発行」（前のリンクは無効になる）
 */
const InlineLearnLink = ({ userId, lang, known }: { userId: string; lang: 'ja' | 'zh'; known: PlainLearningCode | null }) => {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(known ? learnUrlOf(known.code, lang) : null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const issue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (url === null && !window.confirm('この人の個人リンクを発行します。前に配ったリンクは無効になります。よろしいですか？')) return;
    setBusy(true); setErr(null);
    const r = await issueLearningCode(userId, '', true);
    setBusy(false);
    if (!r.ok) { setErr('発行できませんでした'); return; }
    setUrl(`${STUDY_ORIGIN}/${lang}/learn/${formatLearningCode(r.code)}`);
  };
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 手でコピー */ }
  };
  if (url) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5 max-w-[300px]" onClick={(e) => e.stopPropagation()}>
        <span className="inline-flex items-center gap-1 w-full">
          <a href={url} target="_blank" rel="noopener" title="このリンクで生徒として入る（別タブ）"
            className="min-w-0 flex-1 truncate rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] text-blue-700 underline underline-offset-2">
            {url.replace('https://study.kawabado.com', '')}
          </a>
          <button type="button" onClick={copy} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-blue-600 px-2 text-[11px] font-bold text-white">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied ? '済' : 'コピー'}
          </button>
        </span>
        {known && <span className="text-[10px] text-gray-400 tabular-nums">使用 {known.useCount}回{known.lastUsedAtISO ? `・最終 ${jstDateTimeLabel(known.lastUsedAtISO)}` : ''}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button type="button" onClick={issue} disabled={busy}
        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 text-[11px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}発行
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
};

const planLabelOf = (v: AdminAccountView): string => {
  const p = profileSummaryOf(v);
  const exp = expiryLabelOf(v);
  return p.plan === '—' ? exp : `${p.plan}・${exp}`;
};

export const AdminStudentsTab = ({ views, limits, filter, onFilter, onSelect }: Props) => {
  const todayKey = useMemo(() => jstTodayKey(), []);
  /** WeChat ID（招待から登録した人）。email → wechat_id */
  const [wechat, setWechat] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    void supabase.rpc('ai_admin_signup_contacts').then(({ data }) => {
      if (!alive || !Array.isArray(data)) return;
      const m = new Map<string, string>();
      for (const r of data as { email?: string; wechat_id?: string | null }[]) {
        if (r.email && r.wechat_id) m.set(r.email.toLowerCase(), r.wechat_id);
      }
      setWechat(m);
    });
    return () => { alive = false; };
  }, []);
  const wechatOf = (v: AdminAccountView): string => wechat.get((v.account.email ?? '').toLowerCase()) ?? '—';
  /** 配った個人リンク（平文が台帳にある人）と、紹介の紐づけ */
  const [plain, setPlain] = useState<Map<string, PlainLearningCode>>(new Map());
  const [tree, setTree] = useState<ReferralTreeRow[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchPlainLearningCodes().then((m) => { if (alive) setPlain(m); });
    void fetchReferralTree().then((r) => { if (alive) setTree(r); });
    return () => { alive = false; };
  }, []);
  const referredCount = (v: AdminAccountView): number => tree.filter((r) => r.referrerUserId === v.account.userId).length;
  const referredRewarded = (v: AdminAccountView): number => tree.filter((r) => r.referrerUserId === v.account.userId && r.rewardedAtISO).length;
  const referredBy = (v: AdminAccountView): ReferralTreeRow | undefined => tree.find((r) => r.inviteeUserId === v.account.userId);

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
      {/* 種別フィルタチップ（管理者・その他は「全部」に含める） */}
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
              const p = profileSummaryOf(v);
              const last = lastStudyLabelOf(v.lastStudyDateKey, todayKey);
              const lang = v.learner?.preferredLanguage ?? 'zh';
              return (
                <li key={v.account.userId}>
                  <div className={`w-full rounded-xl border bg-white p-3 ${needsAttentionOf(v, limits, todayKey) ? 'border-amber-300' : 'border-gray-200'}`}>
                    <button type="button" onClick={() => onSelect(v.account.userId)} className="w-full text-left">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{displayNameOf(v)}</span>
                        {displayNameOf(v) !== v.account.loginId && (
                          <span className="text-[11px] text-gray-400">({v.account.loginId})</span>
                        )}
                        <StateBadges view={v} />
                      </span>
                      <span className="mt-1 block text-[12px] text-gray-700 tabular-nums">
                        {planLabelOf(v)}・旅人 {p.traveler}・{p.goal}・{p.target}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-gray-500 tabular-nums">
                        最終学習 <b className={last.warn ? 'text-amber-700' : 'text-gray-800'}>{last.label}</b>
                        ・最終ログイン {jstDateTimeLabel(v.account.lastSignInAtISO)}
                        ・WeChat {wechatOf(v)}
                      </span>
                    </button>
                    {(referredCount(v) > 0 || referredBy(v)) && (
                      <span className="mt-0.5 block text-[11px] text-amber-800">
                        {referredCount(v) > 0 ? `紹介 ${referredCount(v)}人（延長 ${referredRewarded(v)}）` : ''}
                        {referredBy(v) ? `${referredCount(v) > 0 ? '・' : ''}${referredBy(v)!.referrerName} の招待から` : ''}
                      </span>
                    )}
                    <div className="mt-2"><InlineLearnLink userId={v.account.userId} lang={lang} known={plain.get(v.account.userId) ?? null} /></div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* sm以上: テーブル（横スクロールはこの箱の中だけ） */}
          <div className="mt-3 hidden sm:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500">
                  <th className="px-3 py-2 font-medium">名前（ID）</th>
                  <th className="px-2 py-2 font-medium">プラン・期限</th>
                  <th className="px-2 py-2 font-medium">旅人</th>
                  <th className="px-2 py-2 font-medium">目的</th>
                  <th className="px-2 py-2 font-medium">目標</th>
                  <th className="px-2 py-2 font-medium">最終学習</th>
                  <th className="px-2 py-2 font-medium">最終ログイン</th>
                  <th className="px-2 py-2 font-medium">WeChat</th>
                  <th className="px-2 py-2 font-medium">紹介</th>
                  <th className="px-3 py-2 font-medium">個人リンク</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const p = profileSummaryOf(v);
                  const last = lastStudyLabelOf(v.lastStudyDateKey, todayKey);
                  const lang = v.learner?.preferredLanguage ?? 'zh';
                  return (
                    <tr key={v.account.userId} onClick={() => onSelect(v.account.userId)}
                      className="cursor-pointer border-t border-gray-100 hover:bg-blue-50/50">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-gray-900">{displayNameOf(v)}</span>
                        {displayNameOf(v) !== v.account.loginId && (
                          <span className="ml-1 text-[11px] text-gray-400">({v.account.loginId})</span>
                        )}
                        <span className="ml-1"><StateBadges view={v} /></span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-gray-700 whitespace-nowrap tabular-nums">{planLabelOf(v)}</td>
                      <td className="px-2 py-2.5 text-xs text-gray-700">{p.traveler}</td>
                      <td className="px-2 py-2.5 text-xs text-gray-700 whitespace-nowrap">{p.goal}</td>
                      <td className="px-2 py-2.5 text-xs text-gray-700 tabular-nums">{p.target}</td>
                      <td className={`px-2 py-2.5 tabular-nums whitespace-nowrap ${last.warn ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>{last.label}</td>
                      <td className="px-2 py-2.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">{jstDateTimeLabel(v.account.lastSignInAtISO)}</td>
                      <td className="px-2 py-2.5 text-xs text-gray-700">{wechatOf(v)}</td>
                      <td className="px-2 py-2.5 text-[11px] text-gray-700 whitespace-nowrap">
                        {referredCount(v) > 0 ? <span className="font-bold text-amber-800">{referredCount(v)}人（延長{referredRewarded(v)}）</span> : '—'}
                        {referredBy(v) && <span className="block text-gray-400">← {referredBy(v)!.referrerName}</span>}
                      </td>
                      <td className="px-3 py-2.5"><InlineLearnLink userId={v.account.userId} lang={lang} known={plain.get(v.account.userId) ?? null} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        最終ログイン＝個人リンクまたはID・パスワードで入った最後の日時。個人リンクは配ったものをそのまま表示します（押すとその生徒として入れます）。2026-09-13 より前に配ったリンクは表示できないので、一度「発行」してください（前のリンクは無効になります）。
        行をタップすると詳細（学習内容・受講権の変更・WeChat・問題報告）が開きます。
      </p>
    </div>
  );
};
