// 体験（60分）が終わった直後のアップグレード画面（2026-08-20 CEO指示）。
//
// 以前は「料金プランを見る」で販売LPの先頭へ飛ばしていた。
// 学習を終えたばかりの人に、また商品説明を最初から読ませるのは無駄で、
// いちばん決めやすい瞬間を捨てている。ここで**その場で3択**を出して決めきる:
//   ① もう一度60分（体験パス）  → クレジット決済へ直行
//   ② 1か月 AI自学プラン        → クレジット決済へ直行
//   ③ 6か月 伴走コース          → 連絡先を送って個別やりとり（人が対応する商品なので即決済にしない）
//
// 価格・期間・含まれるものは planCatalog が正準。ここには数値を書かない。
import { useState } from 'react';
import { Check, ArrowRight, Loader2, MessageSquare, X } from 'lucide-react';
import {
  publishedPlans, planView, type PlanId,
} from '../../lib/aiLesson/course/plans/planCatalog';
import { canStartCheckout, startCheckout } from '../../lib/aiLesson/course/plans/planCheckout';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';

export function TrialEndedUpgrade({ lang, onApply, onLogout }: {
  lang: 'ja' | 'zh';
  /** 6か月コース（人が対応する商品）の連絡先フォームを開く */
  onApply: (planId: PlanId) => void;
  onLogout: () => void;
}) {
  const zh = lang === 'zh';
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState('');
  const plans = publishedPlans();

  const choose = async (planId: PlanId) => {
    const cfg = plans.find((p) => p.id === planId);
    if (!cfg || busy) return;
    setError('');
    trackCourse('click_ai_course_trial_end_plan', { plan: planId });
    // 人によるレッスンが含まれる商品は即決済にしない（連絡先→個別やりとり）
    if (cfg.ctaMode !== 'checkout' || !canStartCheckout(cfg)) { onApply(planId); return; }
    setBusy(planId);
    const r = await startCheckout(planId, lang);
    if (r.ok) { window.location.href = r.url; return; } // 遷移するのでbusyは解除しない
    setBusy(null);
    setError(zh
      ? '暂时无法打开支付页面。请稍后再试，或通过下面的方式联系我们。'
      : 'いま決済ページを開けませんでした。少し待ってからもう一度お試しください。うまくいかない場合は下からご連絡ください。');
    onApply(planId); // 決済が使えないときは申込フォームで受ける（行き止まりにしない）
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="text-center">
        <div className="text-4xl mb-2">🎉</div>
        <h1 className="text-xl font-bold text-gray-900">
          {zh ? '60分钟的体验结束了，辛苦啦！' : '60分の体験が終了しました。おつかれさまでした！'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {zh
            ? '学习记录都保留着。选择下面任一方案，都可以从接下来的部分继续。'
            : '学習記録はすべて残っています。下のどれを選んでも、続きから再開できます。'}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {plans.map((cfg) => {
          const v = planView(cfg, lang);
          const isCheckout = cfg.ctaMode === 'checkout';
          const hot = v.recommended;
          return (
            <div key={v.id}
              className={`rounded-2xl border bg-white p-5 ${hot ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-bold text-gray-900">{v.name}</h2>
                <span className="text-lg font-extrabold text-gray-900 whitespace-nowrap">{v.priceLabel}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{v.durationLabel}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {v.features.slice(0, 3).map((f, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{f}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void choose(v.id)} disabled={busy !== null}
                className={`mt-4 flex w-full min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                  hot ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}>
                {busy === v.id
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{zh ? '正在打开支付页面…' : '決済ページへ移動中…'}</>
                  : isCheckout
                    ? <>{zh ? `用信用卡购买（${v.priceLabel}）` : `クレジットカードで購入（${v.priceLabel}）`}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                    : <><MessageSquare className="h-4 w-4" aria-hidden="true" />{zh ? '填写联系方式，先咨询' : '連絡先を送って相談する'}</>}
              </button>
              {!isCheckout && (
                <p className="mt-1.5 text-center text-[11px] text-gray-500">
                  {zh ? '这个方案由真人对接，先确认内容后再决定。' : 'このプランは人がご案内します。内容を確認してから決められます。'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

      <p className="mt-5 text-center text-[11px] leading-relaxed text-gray-500">
        {zh
          ? '购买时使用哪个邮箱都可以，登录中购买会自动延续到当前账号。'
          : '購入時のメールアドレスは何でも構いません。ログインしたまま購入すると、いまのアカウントに自動で引き継がれます。'}
      </p>

      <button type="button" onClick={onLogout}
        className="mt-6 flex w-full min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
        <X className="h-4 w-4" aria-hidden="true" />{zh ? '退出登录' : 'ログアウト'}
      </button>
    </div>
  );
}

export default TrialEndedUpgrade;
