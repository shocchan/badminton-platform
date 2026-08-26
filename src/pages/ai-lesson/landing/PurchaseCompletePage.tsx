// 決済完了ページ（Stripe Checkout の success_url の戻り先）。
//
// 【2026-08-26 P0 改修】
// 以前はログインIDだけを出し、初期パスワードはメールで送っていた。
// 実データで、受講権を持つ12人のうち**7人が一度もセッションを開始していない**。
// 買った直後にメールアプリへ離脱させる作りが、いちばん学習意欲の高い瞬間を捨てていた。
//
// いまは:
//   決済 → 状態確認（webhookが正 = source of truth）→ 一回きりのトークンで自動ログイン
//   → 「学習を始める」だけを出す
// 自動ログインに失敗しても行き止まりにしない。通常ログイン（メールの初期パスワード）と
// 再送の導線を画面内に置き、それでも駄目なときだけ問い合わせ先を出す。
//
// 非同期決済（Alipay / WeChat Pay）への配慮:
// success_url に戻ったことは成功の証拠にしない。台帳の status（webhookが書く）だけを見る。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { track } from './lpHelpers';
import { LP } from './lpContent';
import {
  fetchPurchaseStatus, claimPurchaseSession, type PurchaseStatus,
} from '../../../lib/aiLesson/course/plans/planCheckout';
import { planById, planView } from '../../../lib/aiLesson/course/plans/planCatalog';

const POLL_MS = 2500;
const MAX_POLLS = 40; // 約100秒。カードは数秒、Alipay/WeChat Payは少し遅れることがある

type AuthPhase = 'idle' | 'claiming' | 'signed_in' | 'manual';

export function PurchaseCompletePage() {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') ?? '';
  const [state, setState] = useState<PurchaseStatus | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [authPhase, setAuthPhase] = useState<AuthPhase>('idle');
  const [claimedLoginId, setClaimedLoginId] = useState<string | null>(null);
  const purchaseTracked = useRef(false);
  const claimAttempted = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    let polls = 0;
    const tick = async () => {
      const s = await fetchPurchaseStatus(sessionId);
      if (!alive) return;
      setState(s);
      if (s.status === 'provisioned' || s.status === 'failed') return; // 終端
      polls += 1;
      if (polls >= MAX_POLLS) { setTimedOut(true); return; }
      window.setTimeout(() => { void tick(); }, POLL_MS);
    };
    void tick();
    return () => { alive = false; };
  }, [sessionId]);

  /**
   * 発行が終わった瞬間に、一回きりのトークンでログインしてしまう。
   * 失敗しても通常ログインへ倒すだけなので、ここで例外を投げない。
   */
  const claim = useCallback(async () => {
    if (claimAttempted.current || !sessionId) return;
    claimAttempted.current = true;
    setAuthPhase('claiming');
    const r = await claimPurchaseSession(sessionId);
    if (r.ok) {
      setClaimedLoginId(r.loginId);
      setAuthPhase('signed_in');
      track('ai_course_auth_completed', { method: 'purchase_claim' });
      return;
    }
    // not_ready は台帳の反映待ち。1度だけ短く待って再挑戦する
    if (r.reason === 'not_ready') {
      claimAttempted.current = false;
      window.setTimeout(() => { void claim(); }, 2000);
      return;
    }
    setAuthPhase('manual');
    track('ai_course_auth_failed', { method: 'purchase_claim', reason: r.reason });
  }, [sessionId]);

  useEffect(() => {
    if (state?.status === 'provisioned') void claim();
  }, [state?.status, claim]);

  // purchase 計測（発行完了を初めて観測した1回だけ。金額はカタログから）
  useEffect(() => {
    if (purchaseTracked.current || state?.status !== 'provisioned') return;
    purchaseTracked.current = true;
    const plan = state.planId ? planById(state.planId) : null;
    track('purchase', {
      // Checkout Session ID は購入状況APIの鍵なので生のまま計測へ送らない（末尾8桁で重複排除には足りる）
      transaction_id: `cs_${sessionId.slice(-8)}`,
      plan: state.planId ?? '',
      value: plan?.priceJpy ?? undefined,
      currency: 'JPY',
    });
  }, [state, sessionId]);

  // 失敗・発行待ちタイムアウトも1回だけ計測する
  const failTracked = useRef(false);
  useEffect(() => {
    if (failTracked.current) return;
    if (state?.status === 'failed' || timedOut) {
      failTracked.current = true;
      track('ai_course_purchase_fail', { reason: state?.status === 'failed' ? 'failed' : 'provision_timeout', plan: state?.planId ?? '' });
    }
  }, [state, timedOut]);

  const title = zh ? '购买手续｜你的日语搭档' : 'ご購入手続き｜日本語の相棒';
  const planName = state?.planId ? planView(planById(state.planId)!, zh ? 'zh' : 'ja').name : null;
  const loginHref = `/${lang}/ai-course/login`;
  /** 自動ログイン済みなら、学習画面へそのまま入る */
  const startHref = `/${lang}/ai-course`;

  const primaryBtn = 'mt-6 inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-lp-coral px-8 py-3.5 font-extrabold text-white shadow-[0_8px_0_var(--color-lp-coral-deep)]';

  const body = (() => {
    if (!sessionId || (state && state.status === 'unknown')) {
      return (
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-lp-coral-deep" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-extrabold text-lp-ink">
            {zh ? '找不到购买信息' : 'ご購入情報が見つかりません'}
          </h1>
          <p className="mt-3 text-[0.95rem] text-lp-ink-soft leading-relaxed">
            {zh
              ? '链接可能已失效。如果你已完成付款，请查收邮件；有疑问请联系我们。'
              : 'リンクが無効になっている可能性があります。お支払いがお済みの場合はメールをご確認ください。ご不明な点はご連絡ください。'}
          </p>
          <p className="mt-2 text-[0.95rem] font-bold text-lp-ink select-all">{LP.consultation.email}</p>
          <Link to={`/${lang}/ai-course`} className="mt-6 inline-flex items-center min-h-11 underline underline-offset-4 font-bold text-lp-pine">
            {zh ? '返回课程页面' : 'コースのページへ戻る'}
          </Link>
        </div>
      );
    }

    if (state?.status === 'provisioned') {
      const signedIn = authPhase === 'signed_in';
      const claiming = authPhase === 'claiming' || authPhase === 'idle';
      return (
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-lp-pine" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-extrabold text-lp-ink">
            {zh ? '准备好了，可以开始学习了！' : '600円体験の準備ができました！'}
          </h1>
          {planName && <p className="mt-1 text-[0.95rem] text-lp-ink-soft">{planName}</p>}

          {/* 「時計はまだ動いていない」を先に言う。ここが不安だと人は始められない */}
          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-lp-pine-soft/40 border border-lp-pine/30 px-4 py-3 text-left">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-lp-pine" aria-hidden="true" />
            <p className="text-[0.88rem] leading-relaxed text-lp-ink">
              {zh
                ? '准备和设置的时间不会消耗60分钟的体验时间。计时从你按下「开始体验」的那一刻才开始。'
                : '準備・設定中は60分の体験時間を消費しません。時計は「体験を始める」を押したときから動きます。'}
            </p>
          </div>

          {claiming && (
            <p className="mt-5 inline-flex items-center gap-2 text-[0.92rem] text-lp-ink-soft" role="status" aria-live="polite">
              <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
              {zh ? '正在为你登录……' : 'ログインしています…'}
            </p>
          )}

          {signedIn && (
            <>
              <a href={startHref} className={primaryBtn}>
                {zh ? '开始学习' : '学習を始める'}
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </a>
              <p className="mt-4 text-[0.82rem] text-lp-ink-soft leading-relaxed">
                {zh
                  ? `已经登录，可以直接开始。登录ID是「${claimedLoginId ?? '—'}」，密码也已发送到你的邮箱（下次登录时使用）。`
                  : `すでにログイン済みです。ログインIDは「${claimedLoginId ?? '—'}」、パスワードはメールでもお送りしています（次回のログイン用）。`}
              </p>
            </>
          )}

          {/* 自動ログインに失敗したとき。人力対応を主導線にしない */}
          {authPhase === 'manual' && (
            <div className="mt-5 rounded-2xl border border-lp-line bg-lp-ivory-2 px-4 py-4 text-left">
              <p className="text-[0.9rem] font-bold text-lp-ink">
                {zh ? '请从登录页面进入' : 'ログインページからお進みください'}
              </p>
              <p className="mt-1.5 text-[0.86rem] text-lp-ink-soft leading-relaxed">
                {zh
                  ? '自动登录没有成功，但账号已经开通了。登录ID和初始密码已发送到你的邮箱。'
                  : '自動ログインはできませんでしたが、アカウントは開通しています。ログインIDと初期パスワードはメールでお送りしています。'}
              </p>
              {state.loginId && (
                <p className="mt-2 text-[0.86rem] text-lp-ink">
                  {zh ? '登录ID：' : 'ログインID：'}
                  <span className="font-extrabold text-lg tracking-wide select-all">{state.loginId}</span>
                </p>
              )}
              {state.maskedEmail && (
                <p className="mt-1 text-[0.82rem] text-lp-ink-soft">
                  {zh ? `发送到：${state.maskedEmail}` : `送信先：${state.maskedEmail}`}
                </p>
              )}
              <a href={loginHref}
                className="mt-3 inline-flex items-center justify-center gap-2 min-h-11 w-full rounded-xl bg-lp-coral px-5 font-bold text-white">
                {zh ? '打开登录页面' : 'ログインページを開く'}
              </a>
              <p className="mt-3 text-[0.8rem] text-lp-ink-soft leading-relaxed">
                {zh
                  ? `收不到邮件时，请先查看垃圾邮件文件夹；仍未收到请联系 ${LP.consultation.email}。`
                  : `メールが届かない場合は迷惑メールフォルダをご確認のうえ、${LP.consultation.email} へご連絡ください。`}
              </p>
            </div>
          )}
        </div>
      );
    }

    if (state?.status === 'failed' || timedOut) {
      return (
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-lp-coral-deep" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-extrabold text-lp-ink">
            {zh ? '开通手续需要一点时间' : 'アカウント発行に少し時間がかかっています'}
          </h1>
          <p className="mt-3 text-[0.95rem] text-lp-ink-soft leading-relaxed">
            {zh
              ? '你的付款已完成。开通完成后会给你发邮件；如果30分钟内没有收到，请联系我们（会尽快处理）。'
              : 'お支払いは完了しています。発行が完了するとメールが届きます。30分経っても届かない場合は、こちらへご連絡ください（すぐに対応します）。'}
          </p>
          <p className="mt-2 text-[0.95rem] font-bold text-lp-ink select-all">{LP.consultation.email}</p>
        </div>
      );
    }

    /* pending / paid（＝webhook待ち）。
       Alipay・WeChat Pay は決済確定が遅れることがあるので、
       「払えたのか分からない」状態にしないよう、いま何を待っているかを言う */
    return (
      <div className="text-center" role="status" aria-live="polite">
        <Loader2 className="w-10 h-10 mx-auto text-lp-pine motion-safe:animate-spin" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-extrabold text-lp-ink">
          {zh ? '正在确认付款……' : 'お支払いを確認しています…'}
        </h1>
        <p className="mt-3 text-[0.95rem] text-lp-ink-soft leading-relaxed">
          {zh
            ? '通常几秒钟内完成。用支付宝・微信支付时，确认可能会稍慢一点。请不要关闭这个页面。'
            : '通常は数秒で完了します。Alipay・WeChat Payの場合は少し時間がかかることがあります。このページは閉じずにお待ちください。'}
        </p>
      </div>
    );
  })();

  return (
    <div className="bg-lp-ivory text-lp-ink min-h-screen [font-feature-settings:'palt']">
      <Helmet>
        <html lang={zh ? 'zh' : 'ja'} />
        <title>{title}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="mx-auto max-w-md px-5 py-16">
        <div className="bg-lp-card border border-lp-line rounded-3xl p-7 shadow-[0_10px_26px_rgba(55,43,38,0.08)]">
          {body}
        </div>
      </div>
    </div>
  );
}

export default PurchaseCompletePage;
