// 利用期限の表示（2026-09-09 CEO指示:「いつまでも使えると思われたくない」）。
//
// PlanStatusChip は**カタログにある購入プランの人**だけが対象で（設計上わざとそうしている）、
// いまいる生徒13人のうち9人（手動発行・plan_id が null）と Friends Beta の人には
// 期限がどこにも出ていなかった。この帯はその**残り全員**のためのもの。
//
// - PlanStatusChip が出ている人には出さない（同じことを2回言わない）＝呼び出し側で排他
// - 煽らない。残り日数は事実として置くだけ。色が変わるのは7日以下から
import { CalendarClock } from 'lucide-react';
import { accessPeriodNotice } from '../../lib/aiLesson/course/accessPeriod';

const TONE = {
  normal: 'border-slate-200 bg-slate-50 text-slate-700',
  soon: 'border-amber-200 bg-amber-50 text-amber-900',
  last: 'border-rose-200 bg-rose-50 text-rose-900',
} as const;

export function AccessPeriodChip({ lang, validUntilISO, trialStartedAtISO = null, trialDays = null }: {
  lang: 'ja' | 'zh';
  validUntilISO: string;
  trialStartedAtISO?: string | null;
  trialDays?: number | null;
}) {
  const notice = accessPeriodNotice({
    validUntilISO, trialStartedAtISO, trialDays,
    nowISO: new Date().toISOString(),
    lang,
  });
  // 日付が壊れている行では何も出さない（推測した日付を書かない）
  if (!notice) return null;

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-2xl px-4 pt-3">
      <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border px-4 py-2.5 text-[13px] ${TONE[notice.level]}`}>
        <span className="inline-flex items-baseline gap-1.5 font-bold tabular-nums">
          <CalendarClock className="w-3.5 h-3.5 self-center shrink-0" aria-hidden="true" />
          {/* headline はラベル（「利用期限：」）まで含んだ1行。ここで足すと重なる */}
          {notice.headline}
        </span>
        {notice.sub && <span className="text-[12px] opacity-80">{notice.sub}</span>}
      </div>
    </div>
  );
}

export default AccessPeriodChip;
