// 購入プランの状態表示（2026-08-19 CEO指摘: 体験パスでログインしても
// 「60分・期限」がどこにも見えなかった → 「後何分か、すぐわかるようにしたい」
// → 2026-08-20 CEO決定でリアルタイム60分制へ: **秒単位のライブカウントダウン**を出す）。
//
// - 対象は購入プラン（ai_course_access.plan_id が入っている人）だけ。
//   従来の手動契約（6か月コース生徒）には出さない＝既存の画面を変えない
// - 体験パス（リアルタイム制・開始済み）: 「のこり MM:SS」を毎秒更新＋残量バー。
//   実体は valid_until（サーバーが開始時に確定）との差分＝どの端末でも同じ残り時間
// - 1か月プラン: 利用期限のみの1行表示
// - 誇張しない・煽らない。残りが少なくなったら色で知らせる（10分以下で琥珀）
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { planById, planView } from '../../lib/aiLesson/course/plans/planCatalog';
import { formatUntilJst } from '../../lib/aiLesson/course/courseAccess';

export function PlanStatusChip({ lang, planId, validUntilISO, realtimeWindowMinutes,
  trialDays = null, remainingVoiceTotal = null, usedSeconds: _unusedLegacy }: {
  lang: 'ja' | 'zh';
  planId: string;
  validUntilISO: string;
  /** リアルタイム体験の分数（開始済みの体験パス=60）。null＝暦日プラン */
  realtimeWindowMinutes: number | null;
  /**
   * 日数制の体験（現行=7日・2026-08-26 Phase S2）。null＝日数制ではない。
   * 日数制では時間ではなく**音声会話の回数**が上限なので、残り日数と一緒に回数も出す。
   */
  trialDays?: number | null;
  /** AI音声会話の残り回数（合計3回のうち）。分からなければ null（出さない） */
  remainingVoiceTotal?: number | null;
  /** 旧・累計モデルの名残（呼び出し側互換のため残置。表示には使わない） */
  usedSeconds?: number | null;
}) {
  const plan = planById(planId);
  const zh = lang === 'zh';
  // リアルタイム体験: 毎秒カウントダウン（実体はvalid_untilとの差分）
  const [nowMs, setNowMs] = useState(() => Date.now());
  const realtime = realtimeWindowMinutes !== null;
  useEffect(() => {
    // 実時間制は秒、日数制は分で十分（秒を刻んで急かさない）
    if (!realtime && trialDays === null) return;
    const id = setInterval(() => setNowMs(Date.now()), realtime ? 1000 : 60_000);
    return () => clearInterval(id);
  }, [realtime, trialDays]);
  if (!plan) return null;
  const name = planView(plan, lang).name;
  const until = formatUntilJst(validUntilISO, lang);
  const upgradeLink = (
    <a href={`/${lang}/ai-course?lp=1#price`}
      className="font-bold underline underline-offset-2">
      {zh ? '查看价格方案（解锁全部）' : '料金プランを見る（全地域を解放）'}
    </a>
  );

  // ── リアルタイム体験（開始済み）: 秒単位のライブカウントダウン ──
  if (realtime) {
    const totalSec = realtimeWindowMinutes * 60;
    const leftSec = Math.max(0, Math.floor((Date.parse(validUntilISO) - nowMs) / 1000));
    const low = leftSec <= 10 * 60;
    const pct = Math.max(0, Math.min(100, Math.round((leftSec / totalSec) * 100)));
    const mm = Math.floor(leftSec / 60);
    const ss = String(leftSec % 60).padStart(2, '0');
    return (
      <div className="mx-auto w-full max-w-md lg:max-w-2xl px-4 pt-3">
        <div className={`rounded-xl border px-4 py-3 ${low ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-100 bg-blue-50 text-blue-900'}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />{name}
            </span>
            <span>{zh ? '计时中（关闭页面也不会停止）' : 'カウント中（閉じても止まりません）'}</span>
          </div>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[13px]">{zh ? '体验剩余' : '体験 のこり'}</span>
            <span className="text-2xl font-extrabold leading-none tabular-nums">{mm}:{ss}</span>
            <span className="text-[13px] font-bold">{zh ? `/ 共${realtimeWindowMinutes}分钟` : `/ ${realtimeWindowMinutes}分中`}</span>
          </p>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/70"
            role="progressbar" aria-valuenow={Math.ceil(leftSec / 60)} aria-valuemin={0} aria-valuemax={realtimeWindowMinutes}
            aria-label={zh ? '体验剩余时间' : '体験の残り時間'}>
            <div className={`h-full rounded-full ${low ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
            {plan.contentRegionLimit !== null && (
              <span>{zh ? `可攻略最初的${plan.contentRegionLimit}个区域` : `最初の${plan.contentRegionLimit}地域まで攻略可`}</span>
            )}
            {upgradeLink}
          </div>
        </div>
      </div>
    );
  }

  // ── 日数制の体験（2026-08-26〜）: 残り日数と、上限になっている会話の残り回数 ──
  // 実時間制と違って秒を刻む意味がない（急かすと1日で終わらせてしまい、
  // この教室の中心である翌日の復習に出会えない）
  if (trialDays !== null) {
    const leftMs = Date.parse(validUntilISO) - nowMs;
    const leftDays = Math.max(0, Math.ceil(leftMs / 86_400_000));
    const last = leftDays <= 1;
    return (
      <div className="mx-auto w-full max-w-md lg:max-w-2xl px-4 pt-3">
        <div className={`rounded-xl border px-4 py-3 ${last ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-100 bg-blue-50 text-blue-900'}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />{name}
            </span>
            <span>{zh ? `可用至 ${until}` : `${until} まで`}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-[13px]">{zh ? '体验剩余' : '体験 のこり'}</span>
              <span className="text-2xl font-extrabold leading-none tabular-nums">{leftDays}</span>
              <span className="text-[13px] font-bold">{zh ? `天 / 共${trialDays}天` : `日 / ${trialDays}日中`}</span>
            </span>
            {remainingVoiceTotal !== null && (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-[13px]">{zh ? 'AI语音会话' : 'AI音声会話'}</span>
                <span className="text-lg font-extrabold leading-none tabular-nums">{remainingVoiceTotal}</span>
                <span className="text-[13px] font-bold">{zh ? '次' : '回'}</span>
              </span>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
            {plan.contentRegionLimit !== null && (
              <span>{zh ? `可攻略最初的${plan.contentRegionLimit}个区域` : `最初の${plan.contentRegionLimit}地域まで攻略可`}</span>
            )}
            {upgradeLink}
          </div>
        </div>
      </div>
    );
  }

  // ── 上限なし（1か月プラン）: 期限だけの1行表示 ──
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-2xl px-4 pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-[13px] text-blue-900">
        <span className="inline-flex items-center gap-1.5 font-bold">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />{name}
        </span>
        {plan.contentRegionLimit !== null && (
          <span>{zh ? `可攻略最初的${plan.contentRegionLimit}个区域` : `最初の${plan.contentRegionLimit}地域まで攻略可`}</span>
        )}
        <span>{zh ? `可用至 ${until}` : `${until} まで利用可`}</span>
      </div>
    </div>
  );
}

export default PlanStatusChip;
