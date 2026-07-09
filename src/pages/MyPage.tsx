// 会員マイページ: /:lang/mypage
// 保有クーポンの確認・提示（スタッフに画面を見せる運用）とログイン/登録。
// 未ログイン時は登録/ログインフォームを表示し、成功時にこの端末の
// ゲスト当選クーポンを自動でアカウントへ引き継ぐ。

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import {
  couponCode,
  fetchMyCoupons,
  type Coupon,
  type CouponStatus,
} from '../services/coupons';
import ClaimAccountForm from '../components/ClaimAccountForm';
import { useLanguage } from '../contexts/LanguageContext';

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

export default function MyPage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  // 登録/ログイン直後はクーポン引き継ぎ完了後に再取得する必要がある
  const [refreshKey, setRefreshKey] = useState(0);

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
    fetchMyCoupons()
      .then((c) => {
        if (alive) setCoupons(c);
      })
      .catch(() => {
        if (alive) setCoupons([]);
      })
      .finally(() => {
        if (alive) setCouponsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session, refreshKey]);

  const nickname =
    (session?.user.user_metadata?.nickname as string | undefined) ??
    session?.user.email ??
    '';

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
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
            className="text-sm text-blue-700 underline-offset-2 hover:underline"
          >
            → 管理ページへ
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

      {/* ログイン済み: クーポン一覧 */}
      {!sessionLoading && session && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            ようこそ、<span className="font-bold">{nickname}</span> さん
          </p>

          <h2 className="mt-8 text-sm font-bold text-slate-900">🎫 保有クーポン</h2>

          {couponsLoading && <p className="mt-4 text-sm text-slate-500">読み込み中…</p>}

          {!couponsLoading && coupons.length === 0 && (
            <div className="mt-4 rounded-xl bg-white p-6 text-center shadow-sm">
              <p className="text-3xl">🏸</p>
              <p className="mt-2 text-sm text-slate-600">
                まだクーポンはありません。
                <br />
                ゲームでラリーを続けて抽選チャンスをゲットしよう！
              </p>
              <a
                href={`/${locale}/game`}
                className="mt-4 inline-block rounded-full bg-emerald-500 px-8 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400"
              >
                ゲームであそぶ
              </a>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {coupons.map((coupon) => {
              const info = COUPON_LABEL[coupon.type];
              const status = STATUS_LABEL[coupon.status];
              const usable = coupon.status === 'claimed';
              return (
                <div
                  key={coupon.id}
                  className={`overflow-hidden rounded-2xl shadow-md ${usable ? '' : 'opacity-60'}`}
                >
                  <div className={`bg-gradient-to-br ${info.card} px-5 py-4`}>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-black text-white drop-shadow">
                        {info.emoji} {info.name}
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}
                      >
                        {status.text}
                      </span>
                    </div>
                  </div>
                  <div className="bg-white px-5 py-4">
                    <p className="text-xs text-slate-500">提示用コード</p>
                    <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">
                      {couponCode(coupon)}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {usable
                        ? 'かわバドの活動時にしょっちゃんへこの画面をご提示ください。確認後、無料券（紙）をお渡しします。'
                        : coupon.status === 'used'
                          ? `使用日: ${coupon.used_at ? new Date(coupon.used_at).toLocaleDateString('ja-JP') : '-'}`
                          : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-10 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600"
          >
            ログアウト
          </button>
        </>
      )}
    </div>
  );
}
