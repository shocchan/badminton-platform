// AI会話の回数券を買うカード（2026-09-09 CEO決定）。
//
// AI会話はベータ扱いで、毎日の冒険からは外し、**週3回までを全員の枠**にした。
// それ以上やりたい人だけがここから買い足す。
//
// 【出す場所】週の枠を使い切った人の会話画面。買う気のない人の前には出さない。
// 【書き方】「使えません」で終わらせない。**いつ1回もどるか**を先に言い、
//   そのうえで「待てない人はこちら」として券を置く。順番を逆にすると売り込みになる。
import { useState } from 'react';
import { Mic, Loader2, ArrowRight, CalendarClock } from 'lucide-react';
import { CONVERSATION_TOPUPS, topupView, PAID_SESSION_MINUTES } from '../../lib/aiLesson/course/plans/conversationTopups';
import { startTopupCheckout, checkoutMode } from '../../lib/aiLesson/course/plans/planCheckout';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';

/** 「あと何日で1回もどるか」。過ぎていれば0（マイナスにしない） */
export const daysUntil = (iso: string | null, nowISO: string): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((t - now) / 86_400_000));
};

export function ConversationTopupCard({ lang, nextAvailableAtISO, credits, nowISO }: {
  lang: 'ja' | 'zh';
  /** 週の枠が次に1回もどる時刻。取れなければ null＝日数を書かない */
  nextAvailableAtISO: string | null;
  /** いま持っている回数券 */
  credits: number;
  nowISO?: string;
}) {
  const zh = lang === 'zh';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // 決済が使えない環境では、券の話を出さない（買えないものを見せない）
  if (checkoutMode() === 'off') return null;

  const days = daysUntil(nextAvailableAtISO, nowISO ?? new Date().toISOString());

  const buy = async (id: string) => {
    if (busy) return;
    setError('');
    setBusy(id);
    trackCourse('click_ai_course_topup', { topup: id });
    const r = await startTopupCheckout(id, lang);
    if (r.ok) { window.location.href = r.url; return; }   // 遷移するのでbusyは解除しない
    setBusy(null);
    setError(zh
      ? '暂时无法打开支付页面。请稍后再试，或发邮件到 info@kawabado.com 告诉我们。'
      : 'いま決済ページを開けませんでした。少し待ってからもう一度お試しください。うまくいかない場合は info@kawabado.com へご連絡ください。');
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-4">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* 見出し帯。**買わせる面ではなく、状況を伝える面**として静かに置く */}
        <div className="bg-gradient-to-b from-teal-50 to-white px-5 pt-5 pb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-teal-700 ring-1 ring-teal-200">
            <Mic className="h-3 w-3" aria-hidden />{zh ? 'AI会话' : 'AI会話'}
          </span>
          <h2 className="mt-2 text-lg font-bold leading-snug text-gray-900">
            {zh ? '本周的AI会话已用完' : '今週のAI会話は使い切りました'}
          </h2>

          {/* まず「待てば戻る」。買わなくても続けられることを先に置く */}
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/90 px-3 py-2.5 ring-1 ring-teal-100">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            <p className="text-[13px] leading-relaxed text-gray-700">
              {days > 0
                ? (zh ? <>再过 <b className="text-gray-900">{days}天</b> 会恢复1次。冒险・语法战斗・小模考・复习，这段时间都可以照常使用。</>
                  : <>あと <b className="text-gray-900">{days}日</b> で1回もどります。冒険・文法バトル・ミニ模試・復習は、その間もこのまま使えます。</>)
                : (zh ? '冒险・语法战斗・小模考・复习，这段时间都可以照常使用。'
                  : '冒険・文法バトル・ミニ模試・復習は、その間もこのまま使えます。')}
            </p>
          </div>

          {credits > 0 && (
            <p className="mt-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white">
              {zh ? `你还有 ${credits} 次，现在就可以用。` : `回数券が ${credits} 回ぶん残っています。いますぐ使えます。`}
            </p>
          )}
        </div>

        <div className="px-5 pb-5">
          <p className="text-[11px] font-bold tracking-wide text-gray-400">
            {zh ? '想现在就继续' : '待たずに続けたいときは'}
          </p>

          <div className="mt-2 flex flex-col gap-2.5">
            {CONVERSATION_TOPUPS.map((t) => {
              const v = topupView(t, lang);
              const best = t.credits > 1;   // 5回券。単価が安いほうに印をつける
              const perUse = Math.round(t.priceJpy / t.credits);
              return (
                <button key={v.id} type="button" onClick={() => void buy(v.id)} disabled={busy !== null}
                  className={`group relative w-full rounded-2xl border px-4 py-3.5 text-left transition-all disabled:opacity-50 ${
                    best
                      ? 'border-teal-300 bg-teal-50/40 hover:border-teal-400 hover:bg-teal-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {best && (
                    <span className="absolute -top-2 right-4 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      {zh ? '每次更便宜' : '1回あたりおトク'}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-gray-900">{v.name}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                        {zh ? `每次最长${PAID_SESSION_MINUTES}分钟` : `1回あたり最大${PAID_SESSION_MINUTES}分`}
                        {t.credits > 1 && (zh ? `・平均每次${perUse}日元` : `・1回あたり${perUse}円`)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-lg font-extrabold tabular-nums text-gray-900">{v.priceLabel}</span>
                      {busy === v.id
                        ? <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-hidden />
                        : <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            {zh ? '一次性付费，不会自动续费。购买后立刻可以使用。'
              : '買い切りで、自動更新はありません。購入後すぐに使えます。'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConversationTopupCard;
