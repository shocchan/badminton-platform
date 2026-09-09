// AI会話の回数券を買うカード（2026-09-09 CEO決定）。
//
// AI会話はベータ扱いで、毎日の冒険からは外し、**週3回までを全員の枠**にした。
// それ以上やりたい人だけがここから買い足す。
//
// 【出す場所】週の枠を使い切った人の会話画面。買う気のない人の前には出さない。
// 【書き方】「使えません」で終わらせない。**いつ1回もどるか**を先に言い、
//   そのうえで「待てない人はこちら」として券を置く。順番を逆にすると売り込みになる。
import { useState } from 'react';
import { Mic, Loader2, ArrowRight } from 'lucide-react';
import { CONVERSATION_TOPUPS, topupView } from '../../lib/aiLesson/course/plans/conversationTopups';
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
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="flex items-center gap-1.5 text-base font-bold text-gray-900">
          <Mic className="h-4 w-4 text-teal-600" aria-hidden />
          {zh ? '本周的AI会话已用完' : '今週のAI会話は使い切りました'}
        </h2>

        {/* まず「待てば戻る」を言う。買わなくても続けられることを先に伝える */}
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {days > 0
            ? (zh ? `再过 ${days} 天会恢复1次。冒险・语法战斗・小模考・复习，这段时间都可以照常使用。`
              : `あと ${days} 日で1回もどります。冒険・文法バトル・ミニ模試・復習は、その間もこのまま使えます。`)
            : (zh ? '冒险・语法战斗・小模考・复习，这段时间都可以照常使用。'
              : '冒険・文法バトル・ミニ模試・復習は、その間もこのまま使えます。')}
        </p>

        {credits > 0 && (
          <p className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-sm font-bold text-teal-900">
            {zh ? `你还有 ${credits} 次回数券，现在就可以用。` : `回数券が ${credits} 回ぶん残っています。いますぐ使えます。`}
          </p>
        )}

        <p className="mt-4 text-xs font-bold text-gray-500">
          {zh ? '想现在就继续的话' : '待たずに続けたいときは'}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {CONVERSATION_TOPUPS.map((t) => {
            const v = topupView(t, lang);
            return (
              <button key={v.id} type="button" onClick={() => void buy(v.id)} disabled={busy !== null}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-left transition-colors hover:bg-gray-50 disabled:opacity-50">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-gray-900">{v.name}</span>
                  <span className="block text-[11px] leading-relaxed text-gray-500">{v.description}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold text-gray-900">
                  {busy === v.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {v.priceLabel}<ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />
                </span>
              </button>
            );
          })}
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

        <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
          {zh ? '一次性付费，不会自动续费。购买后立刻可以使用。'
            : '買い切りで、自動更新はありません。購入後すぐに使えます。'}
        </p>
      </div>
    </div>
  );
}

export default ConversationTopupCard;
