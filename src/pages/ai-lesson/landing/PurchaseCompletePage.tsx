// 決済完了ページ（Stripe Checkout の success_url の戻り先）。
//
// - 決済→自動発行は Webhook 側で走る。この画面は台帳の状態を数秒おきに照会して、
//   発行が終わったら **ログインID** と次の手順を表示する（初期パスワードはメールのみ）
// - URLの session_id は Stripe 発行の推測不能トークン。購入者のブラウザだけが知る
// - メールが届く前に画面を閉じても、ログイン情報はメールに残るので詰まない
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Mail, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { track } from './lpHelpers';
import { LP } from './lpContent';
import { fetchPurchaseStatus, type PurchaseStatus } from '../../../lib/aiLesson/course/plans/planCheckout';
import { planById, planView } from '../../../lib/aiLesson/course/plans/planCatalog';

const POLL_MS = 2500;
const MAX_POLLS = 40; // 約100秒。Webhookは通常数秒で完了する

export function PurchaseCompletePage() {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') ?? '';
  const [state, setState] = useState<PurchaseStatus | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const purchaseTracked = useRef(false);

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

  // 失敗・発行待ちタイムアウトも1回だけ計測する（2026-08-23 監査: purchase_fail が無く、
  // 「決済はしたのに学習に入れなかった人」がファネルから消えていた）
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
      return (
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-lp-pine" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-extrabold text-lp-ink">
            {zh ? '购买完成，账号已开通！' : 'ご購入ありがとうございます。アカウントを発行しました！'}
          </h1>
          {planName && <p className="mt-1 text-[0.95rem] text-lp-ink-soft">{planName}</p>}

          <div className="mt-5 rounded-2xl bg-lp-ivory-2 border border-lp-line px-4 py-4 text-left">
            <p className="text-[0.8rem] font-bold text-lp-ink-soft">{zh ? '登录ID' : 'ログインID'}</p>
            <p className="mt-0.5 font-extrabold text-lp-ink text-2xl tracking-wide select-all">{state.loginId}</p>
            <p className="mt-2 text-[0.88rem] text-lp-ink-soft leading-relaxed">
              <Mail className="inline w-4 h-4 mr-1 align-[-2px]" aria-hidden="true" />
              {state.maskedEmail
                ? (zh
                  ? `初始密码已发送到你的邮箱（${state.maskedEmail}）。`
                  : `初期パスワードはメール（${state.maskedEmail}）へお送りしました。`)
                /* メールが取得できなかった購入（2026-08-23 監査P0）。
                   「送りました」と言うと、届かない人が黙って詰む。この画面でだけ本当のことを言う */
                : (zh
                  ? '本次购买没有取得邮箱地址，因此无法发送初始密码。请把上面的登录ID记下来，并联系我们。'
                  : 'この購入ではメールアドレスを取得できなかったため、初期パスワードをお送りできていません。上のログインIDを控えて、ご連絡ください。')}
            </p>
            {/* ログインIDは**この画面を閉じると二度と出ない**。控える前提を明示する */}
            <p className="mt-2 text-[0.82rem] text-lp-ink-soft leading-relaxed">
              {zh
                ? '※ 这个登录ID请先记下来或截图保存。'
                : '※ このログインIDは、スクリーンショットなどで控えておいてください。'}
            </p>
          </div>

          {!state.maskedEmail && (
            <div role="alert" className="mt-3 rounded-2xl border border-lp-coral bg-lp-coral/10 px-4 py-3 text-left">
              <p className="text-[0.9rem] font-bold text-lp-ink">
                {zh ? '请联系我们以获取密码' : 'パスワードのご案内が必要です'}
              </p>
              <p className="mt-1 text-[0.86rem] text-lp-ink-soft leading-relaxed">
                {zh
                  ? `请把登录ID「${state.loginId}」写在邮件里，发送到 ${LP.consultation.email}。我们会尽快回复初始密码。`
                  : `ログインID「${state.loginId}」を書いて ${LP.consultation.email} までご連絡ください。折り返し初期パスワードをお送りします。`}
              </p>
            </div>
          )}

          <ol className="mt-4 text-left text-[0.92rem] text-lp-ink leading-relaxed list-decimal pl-5 space-y-1">
            <li>{zh ? '查收邮件，确认初始密码' : 'メールを開いて初期パスワードを確認'}</li>
            <li>{zh ? '在登录页面输入ID和密码' : 'ログインページでIDとパスワードを入力'}</li>
            <li>{zh ? '输入名字，就可以开始学习了' : 'お名前を入力したら、学習スタート'}</li>
          </ol>

          <a href={loginHref}
            className="mt-6 inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-lp-coral px-8 py-3.5 font-extrabold text-white shadow-[0_8px_0_var(--color-lp-coral-deep)]">
            {zh ? '打开登录页面' : 'ログインページを開く'}
          </a>

          <p className="mt-5 text-[0.82rem] text-lp-ink-soft leading-relaxed">
            {zh
              ? `收不到邮件时，请先查看垃圾邮件文件夹；仍未收到请联系 ${LP.consultation.email}。`
              : `メールが届かない場合は迷惑メールフォルダをご確認のうえ、${LP.consultation.email} へご連絡ください。`}
          </p>
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
    return (
      <div className="text-center" role="status" aria-live="polite">
        <Loader2 className="w-10 h-10 mx-auto text-lp-pine motion-safe:animate-spin" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-extrabold text-lp-ink">
          {zh ? '正在确认付款……' : 'お支払いを確認しています…'}
        </h1>
        <p className="mt-3 text-[0.95rem] text-lp-ink-soft leading-relaxed">
          {zh
            ? '通常几秒钟内完成。账号开通后，登录信息也会发送到你的邮箱。'
            : '通常は数秒で完了します。アカウント発行が終わると、ログイン情報がメールでも届きます。'}
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
