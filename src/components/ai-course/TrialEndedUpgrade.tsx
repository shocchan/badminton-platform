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
import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight, Loader2, MessageSquare, X } from 'lucide-react';
import {
  publishedPlans, planView, type PlanId,
} from '../../lib/aiLesson/course/plans/planCatalog';
import { canStartCheckout, startCheckout } from '../../lib/aiLesson/course/plans/planCheckout';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { logCourseEvent } from '../../lib/aiLesson/course/courseEvents';
import { spokenMinutesLabel, type TrialSummary } from '../../lib/aiLesson/course/plans/trialSummary';

export function TrialEndedUpgrade({ lang, onApply, onLogout, summary = null }: {
  lang: 'ja' | 'zh';
  /** 6か月コース（人が対応する商品）の連絡先フォームを開く */
  onApply: (planId: PlanId) => void;
  onLogout: () => void;
  /**
   * 体験中に実際にやったこと（2026-08-26）。
   * 以前はこの画面がいきなり値段3つの表だった。60分やり切った直後の人が
   * 見たいのは値段ではなく自分が何をしたかで、続きを買う理由もそこにある。
   * 取得できなければ null（作り話はしない・無ければ出さない）。
   */
  summary?: TrialSummary | null;
}) {
  const zh = lang === 'zh';
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState('');
  const plans = publishedPlans();

  // 体験が終わってこの画面に到達したこと自体を1回だけ記録する
  // （「体験は終えたが続きを選ばなかった人」が何人いるかを見るため）
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    logCourseEvent('trial_completed', {});
    logCourseEvent('upgrade_view', { plans: plans.length });
  }, [plans.length]);

  const choose = async (planId: PlanId) => {
    const cfg = plans.find((p) => p.id === planId);
    if (!cfg || busy) return;
    setError('');
    logCourseEvent('upgrade_click', { plan: planId });
    trackCourse('click_ai_course_trial_end_plan', { plan: planId });
    // 人によるレッスンが含まれる商品は即決済にしない（連絡先→個別やりとり）
    if (cfg.ctaMode !== 'checkout' || !canStartCheckout(cfg)) { onApply(planId); return; }
    setBusy(planId);
    const r = await startCheckout(planId, lang);
    if (r.ok) { window.location.href = r.url; return; } // 遷移するのでbusyは解除しない
    setBusy(null);
    logCourseEvent('error_occurred', { where: 'checkout', code: planId });
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
          {zh ? '体验期结束了，辛苦啦！' : '体験期間が終了しました。おつかれさまでした！'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {zh
            ? '学习记录都保留着。选择下面任一方案，都可以从接下来的部分继续。'
            : '学習記録はすべて残っています。下のどれを選んでも、続きから再開できます。'}
        </p>
      </div>

      {summary?.hasAnything && (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <h2 className="text-sm font-bold text-emerald-900">
            {zh ? '你在体验期间做到的' : '体験のあいだにあなたがやったこと'}
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/80 px-2 py-2.5">
              <dt className="text-[11px] text-gray-500">{zh ? '开口时间' : '話した時間'}</dt>
              <dd className="text-lg font-extrabold text-gray-900">
                {spokenMinutesLabel(summary.spokenSeconds)}<span className="text-xs font-bold">{zh ? '分钟' : '分'}</span>
              </dd>
            </div>
            <div className="rounded-xl bg-white/80 px-2 py-2.5">
              <dt className="text-[11px] text-gray-500">{zh ? '对话次数' : '会話した回数'}</dt>
              <dd className="text-lg font-extrabold text-gray-900">
                {summary.conversations}<span className="text-xs font-bold">{zh ? '次' : '回'}</span>
              </dd>
            </div>
            <div className="rounded-xl bg-white/80 px-2 py-2.5">
              <dt className="text-[11px] text-gray-500">{zh ? '练过的说法' : '練習した表現'}</dt>
              <dd className="text-lg font-extrabold text-gray-900">
                {summary.expressions.length}<span className="text-xs font-bold">{zh ? '个' : '個'}</span>
              </dd>
            </div>
          </dl>

          {/* 追加の実測（2026-08-26 Phase S6）。0件の項目は行ごと出さない */}
          {(summary.correctedPhrases.length > 0 || summary.reviewsDone > 0) && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
              {summary.correctedPhrases.length > 0 && (
                <div className="rounded-xl bg-white/80 px-2 py-2.5">
                  <dt className="text-[11px] text-gray-500">{zh ? '被改过的说法' : '直してもらった言い方'}</dt>
                  <dd className="text-lg font-extrabold text-gray-900">
                    {summary.correctedPhrases.length}<span className="text-xs font-bold">{zh ? '个' : '個'}</span>
                  </dd>
                </div>
              )}
              {summary.reviewsDone > 0 && (
                <div className="rounded-xl bg-white/80 px-2 py-2.5">
                  <dt className="text-[11px] text-gray-500">{zh ? '完成的复习' : '復習した回数'}</dt>
                  <dd className="text-lg font-extrabold text-gray-900">
                    {summary.reviewsDone}<span className="text-xs font-bold">{zh ? '次' : '回'}</span>
                  </dd>
                </div>
              )}
            </dl>
          )}

          {/* 実際に直してもらった言い方を3つまで見せる。
              数字より、この3行のほうが「何が手に入ったか」が伝わる。
              生徒が言った文（original）は出さない＝失敗を並べない */}
          {summary.correctedPhrases.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {summary.correctedPhrases.slice(0, 3).map((phrase) => (
                <li key={phrase} className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 text-[13px] leading-relaxed text-gray-800">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>{phrase}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 自分から言えた回数は0のとき出さない（0を成果として見せない） */}
          {summary.saidIndependently > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-relaxed text-emerald-900">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              {zh
                ? `其中 ${summary.saidIndependently} 次，你是自己先说出目标说法的（不是跟着老师重复）。`
                : `そのうち ${summary.saidIndependently} 回は、お手本を待たずに自分から目標表現を使えました。`}
            </p>
          )}

          {/* ここが「続き」。売り文句ではなく、実際に予定されていた次の再会を言う */}
          {summary.scheduledForReview > 0 && (
            <p className="mt-3 rounded-xl bg-white/80 px-3 py-2.5 text-[13px] leading-relaxed text-gray-700">
              {summary.nextExpression
                ? (zh
                  ? `「${summary.nextExpression}」等 ${summary.scheduledForReview} 个说法，已经排进了之后的复习。忘记之前会再出现一次——这部分要继续才会送到你手上。`
                  : `「${summary.nextExpression}」など ${summary.scheduledForReview} 個の表現は、あとで復習に出る予定に入っています。忘れかけた頃にもう一度出てきます。ここから先は、続けたときに届きます。`)
                : (zh
                  ? `已经有 ${summary.scheduledForReview} 个说法排进了之后的复习。忘记之前会再出现一次——这部分要继续才会送到你手上。`
                  : `${summary.scheduledForReview} 個の表現が、あとで復習に出る予定に入っています。忘れかけた頃にもう一度出てきます。ここから先は、続けたときに届きます。`)}
            </p>
          )}
        </section>
      )}

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
                <>
                  {/*
                    6か月コースだけ、CTAの前に「人と何を改善するか」を出す（Phase S6）。
                    実測で弱かった表現があるときだけ。無いのに書くと作り話になる
                  */}
                  {summary?.weakestExpression && (
                    <p className="mt-2 rounded-xl bg-lp-pine-soft/40 border border-emerald-100 px-3 py-2.5 text-[12.5px] leading-relaxed text-gray-700">
                      {zh
                        ? `例如「${summary.weakestExpression}」这样还没稳的说法，会和教练一起找出为什么说不出口，并重新排进你的学习路线。`
                        : `たとえば「${summary.weakestExpression}」のように、まだ固まっていない表現。なぜ口から出ないのかをコーチと一緒に見て、あなたの学習ルートに組み直します。`}
                    </p>
                  )}
                  <p className="mt-1.5 text-center text-[11px] text-gray-500">
                    {zh ? '这个方案由真人对接，先确认内容后再决定。' : 'このプランは人がご案内します。内容を確認してから決められます。'}
                  </p>
                </>
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
