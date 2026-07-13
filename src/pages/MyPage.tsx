// 会員マイページ: /:lang/mypage
// 保有クーポンの確認・提示（スタッフに画面を見せる運用）とログイン/登録。
// 未ログイン時は登録/ログインフォームを表示し、成功時にこの端末の
// ゲスト当選クーポンを自動でアカウントへ引き継ぐ。

import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import type { Session } from '@supabase/supabase-js';
import {
  Ticket,
  Trophy,
  Gamepad2,
  ClipboardList,
  ChevronRight,
  CalendarDays,
  MapPin,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import {
  couponCode,
  fetchMyCoupons,
  type Coupon,
  type CouponStatus,
} from '../services/coupons';
import ClaimAccountForm from '../components/ClaimAccountForm';
import { useLanguage } from '../contexts/LanguageContext';
import { getRallyBest } from '../lib/rallyBest';
import { EmptyState, ErrorState } from '../components/ui/StateViews';

const COUPON_LABEL = {
  ramen: { emoji: '🍜', name: 'ラーメン無料券', card: 'from-amber-400 via-orange-400 to-red-400' },
  badminton: { emoji: '🏸', name: 'バド活動 無料券', card: 'from-emerald-400 via-teal-400 to-cyan-400' },
} as const;

const STATUS_LABEL: Record<CouponStatus, { text: string; className: string }> = {
  unclaimed: { text: '未受け取り', className: 'bg-slate-200 text-slate-600' },
  claimed: { text: '利用可能', className: 'bg-emerald-100 text-emerald-700' },
  reserved: { text: '使用予約中', className: 'bg-amber-100 text-amber-700' },
  used: { text: '使用済み', className: 'bg-slate-200 text-slate-500' },
};

/** チケット風クーポンカード（両端ノッチ+ミシン目） */
const CouponTicket = ({ coupon }: { coupon: Coupon }) => {
  const info = COUPON_LABEL[coupon.type];
  const status = STATUS_LABEL[coupon.status];
  const usable = coupon.status === 'claimed';
  const used = coupon.status === 'used';
  return (
    <div className={`relative overflow-hidden rounded-2xl shadow-md ${used ? 'opacity-55 saturate-50' : ''}`}>
      <div className={`bg-gradient-to-br ${info.card} px-5 py-4`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-black text-white drop-shadow">
            {info.emoji} {info.name}
          </p>
          <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>
            {status.text}
          </span>
        </div>
      </div>
      {/* ミシン目+ノッチ */}
      <div className="relative bg-white">
        <div className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-gray-50 shadow-[inset_-1px_0_2px_rgba(0,0,0,0.06)]" />
        <div className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-gray-50 shadow-[inset_1px_0_2px_rgba(0,0,0,0.06)]" />
        <div className="ticket-perforation absolute inset-x-4 top-0 h-[1.5px] -translate-y-1/2" />
      </div>
      <div className="bg-white px-5 pb-4 pt-4">
        <p className="text-xs text-slate-500">提示用コード</p>
        <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">
          {couponCode(coupon)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {usable
            ? 'かわバドの活動時にしょっちゃんへこの画面をご提示ください。確認後、無料券（紙）をお渡しします。'
            : used
              ? `使用日: ${coupon.used_at ? new Date(coupon.used_at).toLocaleDateString('ja-JP') : '-'}`
              : ''}
        </p>
      </div>
    </div>
  );
};

interface MyEntry {
  key: string;
  kind: 'tournament' | 'activity';
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string;
  location?: string;
  status: string; // confirmed | waitlist
  link: string;
}

export default function MyPage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponsError, setCouponsError] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [couponTab, setCouponTab] = useState<'active' | 'used'>('active');
  const [entries, setEntries] = useState<MyEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  // 登録/ログイン直後はクーポン引き継ぎ完了後に再取得する必要がある
  const [refreshKey, setRefreshKey] = useState(0);

  // この端末のゲーム自己ベスト・戦術ボード保存数（localStorage）
  const rallyBest = useMemo(() => getRallyBest(), []);
  const tacticsSaved = useMemo(() => {
    try {
      const raw = localStorage.getItem('tacticsBoard_slots');
      if (!raw) return 0;
      const slots = JSON.parse(raw) as { data: unknown }[];
      return slots.filter((s) => s && s.data != null).length;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    supabase.rpc('is_admin').then(({ data }) => {
      if (alive) setIsAdmin(data === true);
    });
    return () => {
      alive = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setCouponsError(false);
    fetchMyCoupons()
      .then((c) => {
        if (alive) setCoupons(c);
      })
      .catch(() => {
        if (alive) {
          setCoupons([]);
          setCouponsError(true);
        }
      })
      .finally(() => {
        if (alive) setCouponsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session, refreshKey]);

  // 大会・通常活動のエントリー状況（今日以降のみ）
  useEffect(() => {
    const email = session?.user.email;
    if (!email) return;
    let alive = true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    (async () => {
      const result: MyEntry[] = [];
      try {
        const { data: tEntries } = await supabase
          .from('entries')
          .select('id, tournament_id, status')
          .eq('email', email)
          .neq('status', 'cancelled');
        const ids = [...new Set((tEntries ?? []).map((e) => e.tournament_id))];
        if (ids.length > 0) {
          const { data: ts } = await supabase
            .from('tournaments')
            .select('id, title, event_date, start_time, location')
            .in('id', ids)
            .gte('event_date', todayStr);
          for (const e of tEntries ?? []) {
            const t = (ts ?? []).find((x) => x.id === e.tournament_id);
            if (!t) continue;
            result.push({
              key: `t-${e.id}`,
              kind: 'tournament',
              title: t.title,
              date: (t.event_date as string).slice(0, 10),
              startTime: t.start_time?.slice(0, 5),
              location: t.location,
              status: e.status,
              link: `/${locale}/tournaments/${t.id}`,
            });
          }
        }
      } catch {
        /* 取れなくても他は表示 */
      }
      try {
        const { data: aEntries } = await supabase
          .from('activity_entries')
          .select('id, activity_id, status')
          .eq('email', email);
        const ids = [...new Set((aEntries ?? []).map((e) => e.activity_id))];
        if (ids.length > 0) {
          const { data: as } = await supabase
            .from('activities')
            .select('id, title, date, start_time, location')
            .in('id', ids)
            .gte('date', todayStr);
          for (const e of aEntries ?? []) {
            const a = (as ?? []).find((x) => x.id === e.activity_id);
            if (!a) continue;
            result.push({
              key: `a-${e.id}`,
              kind: 'activity',
              title: a.title,
              date: (a.date as string).slice(0, 10),
              startTime: a.start_time?.slice(0, 5),
              location: a.location,
              status: e.status,
              link: `/${locale}/activity/${a.id}`,
            });
          }
        }
      } catch {
        /* 同上 */
      }
      if (alive) {
        result.sort((x, y) => x.date.localeCompare(y.date));
        setEntries(result);
        setEntriesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session, locale]);

  // 表示名: ニックネーム優先。無ければメールの@より前（生アドレスは出さない）
  const displayName =
    (session?.user.user_metadata?.nickname as string | undefined) ??
    session?.user.email?.split('@')[0] ??
    '';

  const activeCoupons = coupons.filter((c) => c.status !== 'used');
  const usedCoupons = coupons.filter((c) => c.status === 'used');
  const shownCoupons = couponTab === 'active' ? activeCoupons : usedCoupons;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Helmet>
        <title>マイページ | かわバド</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="flex items-center gap-4">
        <a
          href={`/${locale}/game`}
          className="text-sm text-emerald-700 underline-offset-2 hover:underline"
        >
          ← バド対決ゲームへ
        </a>
        {isAdmin && (
          <a
            href={`/${locale}/admin`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> 管理ページへ
          </a>
        )}
      </div>

      <h1 className="mt-6 text-2xl font-bold text-slate-900">マイページ</h1>

      {sessionLoading && (
        <div className="mt-10 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-label="読み込み中" />
        </div>
      )}

      {/* 未ログイン: 登録/ログイン */}
      {!sessionLoading && !session && (
        <div className="mt-6 rounded-2xl bg-slate-900 p-6 shadow-lg">
          <p className="text-sm font-bold text-white">登録 / ログイン</p>
          <p className="mt-1 text-xs text-slate-400">
            ゲームで当てた無料券の確認・受け取りができます
          </p>
          <div className="mt-4">
            <ClaimAccountForm onDone={() => setRefreshKey((k) => k + 1)} />
          </div>
        </div>
      )}

      {/* ログイン済み */}
      {!sessionLoading && session && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            ようこそ、<span className="font-bold">{displayName}</span> さん
          </p>

          {/* ゲーム・戦術ボードのクイックカード */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <a
              href={`/${locale}/game`}
              className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2 text-emerald-700">
                <Gamepad2 className="h-4 w-4" />
                <span className="text-xs font-bold">ラリー自己ベスト</span>
              </div>
              <p className="mt-1.5 text-2xl font-black text-slate-900">
                {rallyBest > 0 ? rallyBest : '—'}
                {rallyBest > 0 && <span className="ml-1 text-xs font-bold text-slate-400">ラリー</span>}
              </p>
              <p className="mt-1 flex items-center text-[11px] font-semibold text-emerald-700">
                {rallyBest > 0 ? '記録更新に挑戦' : 'ゲームであそぶ'}
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </p>
            </a>
            <a
              href={`/${locale}/tactics-board`}
              className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2 text-blue-600">
                <ClipboardList className="h-4 w-4" />
                <span className="text-xs font-bold">保存した作戦</span>
              </div>
              <p className="mt-1.5 text-2xl font-black text-slate-900">
                {tacticsSaved}
                <span className="ml-1 text-xs font-bold text-slate-400">/ 5</span>
              </p>
              <p className="mt-1 flex items-center text-[11px] font-semibold text-blue-600">
                戦術ボードを開く
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </p>
            </a>
          </div>

          {/* エントリー状況 */}
          <h2 className="mt-8 flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <CalendarDays className="h-4 w-4 text-blue-500" /> エントリー状況
          </h2>
          {!entriesLoading && entries.length === 0 && (
            <p className="mt-3 rounded-xl bg-white px-4 py-3.5 text-xs text-slate-500 shadow-sm">
              今後の予定へのエントリーはありません。
              <a href={`/${locale}/`} className="ml-1 font-bold text-blue-600 underline-offset-2 hover:underline">
                大会を探す →
              </a>
            </p>
          )}
          {entries.length > 0 && (
            <div className="mt-3 space-y-2">
              {entries.map((e) => (
                <a
                  key={e.key}
                  href={e.link}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      e.kind === 'tournament' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-500'
                    }`}
                  >
                    {e.kind === 'tournament' ? <Trophy className="h-4.5 w-4.5" /> : <CalendarDays className="h-4.5 w-4.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{e.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>
                        {new Date(`${e.date}T00:00:00`).toLocaleDateString('ja-JP', {
                          month: 'numeric',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                        {e.startTime && ` ${e.startTime}〜`}
                      </span>
                      {e.location && (
                        <span className="inline-flex min-w-0 items-center gap-0.5">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{e.location}</span>
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      e.status === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {e.status === 'confirmed' ? '参加確定' : 'キャンセル待ち'}
                  </span>
                </a>
              ))}
            </div>
          )}

          {/* 保有クーポン */}
          <h2 className="mt-8 flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Ticket className="h-4 w-4 text-amber-500" /> 保有クーポン
          </h2>

          {/* 有効/使用済みタブ */}
          <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setCouponTab('active')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                couponTab === 'active'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              有効 {activeCoupons.length > 0 && `(${activeCoupons.length})`}
            </button>
            <button
              type="button"
              onClick={() => setCouponTab('used')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                couponTab === 'used'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              使用済み {usedCoupons.length > 0 && `(${usedCoupons.length})`}
            </button>
          </div>

          {couponsLoading && (
            <div className="mt-4 space-y-4">
              <div className="skeleton h-36 w-full rounded-2xl" />
            </div>
          )}

          {!couponsLoading && couponsError && (
            <div className="mt-4">
              <ErrorState
                message="クーポンの読み込みに失敗しました"
                onRetry={() => {
                  setCouponsLoading(true);
                  setRefreshKey((k) => k + 1);
                }}
              />
            </div>
          )}

          {!couponsLoading && !couponsError && shownCoupons.length === 0 && (
            <div className="mt-4">
              {couponTab === 'active' ? (
                <EmptyState
                  emoji="🎯"
                  title="いま使えるクーポンはありません"
                  description="バド対決ゲームで15ラリーごとに抽選チャンス！ラーメン無料券・バド活動無料券を狙おう"
                  action={
                    <a
                      href={`/${locale}/game`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-7 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 active:scale-[0.98]"
                    >
                      <Gamepad2 className="h-4 w-4" />
                      バドゲームで無料券を狙う
                      <ChevronRight className="h-4 w-4" />
                    </a>
                  }
                />
              ) : (
                <p className="rounded-xl bg-white px-4 py-3.5 text-xs text-slate-500 shadow-sm">
                  使用済みのクーポンはまだありません。
                </p>
              )}
            </div>
          )}

          {!couponsLoading && shownCoupons.length > 0 && (
            <div className="mt-4 space-y-4">
              {shownCoupons.map((coupon) => (
                <CouponTicket key={coupon.id} coupon={coupon} />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-10 inline-flex items-center gap-1.5 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600"
          >
            <LogOut className="h-3.5 w-3.5" /> ログアウト
          </button>
        </>
      )}
    </main>
  );
}
