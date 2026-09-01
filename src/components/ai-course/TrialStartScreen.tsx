// AI体験パスの開始画面。
//
// 2026-08-20: リアルタイム60分制で作った画面。
// 2026-08-26（Phase S2）: **開始から7日間**へ変更。
//   60分では、翌日以降にしか届かない間隔反復＝この商品の中心を体験できなかった。
//   AI原価は時間ではなく回数（音声会話 合計3回）で抑えているので、日数化しても増えない。
//
// 旧仕様（実時間◯分）の受講権も残っているので、両方の言い方を出し分ける。
// どちらの場合も「押した瞬間から始まる」ことを**押す前に**正直に伝える。
import { useRef, useState } from 'react';
import { Clock, Play, Loader2, AlertTriangle, CalendarCheck } from 'lucide-react';
import { startTrial } from '../../lib/aiLesson/course/courseAccess';
import { formatUntilJst } from '../../lib/aiLesson/course/courseAccess';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { logCourseEvent } from '../../lib/aiLesson/course/courseEvents';
import { micSupport, inAppBrowser } from '../../lib/aiLesson/course/micSupport';

export function TrialStartScreen({ lang, trialDays, windowMinutes, startDeadlineISO, onStarted }: {
  lang: 'ja' | 'zh';
  /** 日数制の体験（現行=7）。null＝旧仕様の実時間制 */
  trialDays: number | null;
  /** 実時間制の分数（旧仕様=60）。null＝日数制 */
  windowMinutes: number | null;
  /** 開始の期限（購入+30日の valid_until） */
  startDeadlineISO: string;
  onStarted: () => void;
}) {
  const zh = lang === 'zh';
  const byDays = trialDays !== null;
  /*
   * マイクが使える環境かを、**時計を動かす前に**見る（2026-09-01）。
   * 体験の中心はAI音声会話で、使えないと何も起きない。
   * これまでは会話画面に入ってから気づく作りで、そのときには既に
   * 「体験を始める」を押していて7日の時計が動いていた。
   *
   * 許可ダイアログは出さない（存在と安全コンテキストだけを見る）。
   * 判定できないときは ok に倒すので、使える人を止めることはない。
   */
  const mic = micSupport();
  const app = inAppBrowser();
  // 計測に残す値。日数制は分数を持たないので0で埋めず、日数側を送る
  const meta: Record<string, number> = byDays
    ? { trial_days: trialDays }
    : { window_minutes: windowMinutes ?? 0 };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const viewed = useRef(false);
  if (!viewed.current) {
    viewed.current = true;
    trackCourse('view_ai_course_trial_start', { ...meta, mic, in_app: app ?? 'no' });
    // マイクが使えない環境で開始画面まで来た人を数える。
    // ここが多いなら、案内をもっと手前（購入前）へ出す必要がある
    if (mic !== 'ok') logCourseEvent('error_occurred', { where: 'mic_check', code: mic });
  }

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    trackCourse('click_ai_course_trial_start', { ...meta, mic });
    const r = await startTrial();
    // 開始が**成功したとき**だけ trial_start を立てる（押した＝始まった、ではない・2026-08-23 監査）
    if (r.ok) { logCourseEvent('trial_started', meta); trackCourse('start_ai_course_trial', meta); onStarted(); return; }
    trackCourse('fail_ai_course_trial_start', { code: r.code ?? 'unknown' });
    // GA4だけでなく学習DB側にも残す（管理画面のファネルから見えるように・2026-08-26）
    logCourseEvent('error_occurred', { where: 'trial_start', code: r.code ?? 'unknown' });
    setBusy(false);
    setError(r.code === 'activation_expired'
      ? (zh ? '开始期限（购买后30天）已过。请联系 info@kawabado.com。' : '開始期限（購入後30日）を過ぎています。info@kawabado.com へご連絡ください。')
      : (zh ? '暂时无法开始。请稍后再试。' : 'いま開始できませんでした。少し待ってからもう一度お試しください。'));
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="rounded-2xl border border-blue-100 bg-white p-6 text-center shadow-sm">
        <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mx-auto">
          <Clock className="w-7 h-7" aria-hidden="true" />
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-gray-900">
          {byDays
            ? (zh ? `准备好后，开始${trialDays}天的体验` : `準備ができたら、${trialDays}日間の体験を始めましょう`)
            : (zh ? `准备好后，开始${windowMinutes}分钟的体验` : `準備ができたら、${windowMinutes}分の体験を始めましょう`)}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {byDays
            ? (zh
              ? `按下开始按钮后，从那一刻起的${trialDays}天内都可以使用。AI语音会话共3次（每天最多2次），语法战斗・教材・冒险随意使用。`
              : `開始ボタンを押すと、その日から${trialDays}日間使えます。AI音声会話は合計3回（1日2回まで）、文法バトル・教材・冒険は使い放題です。`)
            : (zh
              ? `按下开始按钮后，将从那一刻起计时${windowMinutes}分钟。期间内AI会话・语法战斗・教材都可以随意使用。`
              : `開始ボタンを押すと、その瞬間から実時間で${windowMinutes}分のカウントが始まります。時間内はAI会話・文法バトル・教材を自由に使えます。`)}
        </p>

        {byDays ? (
          /* 日数制でいちばん伝えるべきは「一気にやらなくていい」。
             1日で終わらせると、この教室の中心である翌日の復習に出会えない */
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left">
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-emerald-900">
              <CalendarCheck className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {zh
                  ? '不用一天做完。今天说过的表达，第二天会以复习的形式再出现一次——这才是这个教室最核心的部分。'
                  : '1日で終わらせなくて大丈夫です。今日話した表現は、翌日に復習として出てきます。そこがこの教室のいちばん効くところです。'}
              </span>
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {zh
                  ? '计时开始后不会暂停（关闭页面・中途离开也会继续计时）。请在有整段时间时开始。'
                  : 'カウントは一時停止できません（画面を閉じても・離席しても進みます）。まとまった時間があるときに始めてください。'}
              </span>
            </p>
          </div>
        )}
        <p className="mt-2 text-[12px] text-gray-500">
          {byDays
            ? (zh
              ? '目标设定与水平诊断已经完成，不计入体验期间。'
              : '目標設定とレベル診断はもう終わっています（体験期間には含まれません）。')
            : (zh
              ? '目标设定与水平诊断已经完成，不计入体验时间。60分钟全部用于学习。'
              : '目標設定とレベル診断はもう終わっています（体験時間には含まれません）。60分はまるごと学習に使えます。')}
        </p>

        {mic !== 'ok' && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left">
            <p className="text-[13px] font-bold text-red-900">
              {zh ? '这个画面无法使用麦克风' : 'この画面ではマイクが使えません'}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-red-800">
              {zh
                ? '体验的核心是和AI老师的语音会话。请先解决之后再开始，否则会白白用掉体验期间。'
                : '体験の中心はAI先生との音声会話です。このまま始めると、話せないまま期間を使ってしまいます。'}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-red-800">
              {app
                ? (zh
                  ? '请点右上角「⋯」→「在浏览器中打开」，用 Chrome / Safari 再打开一次。'
                  : '右上の「…」から「ブラウザで開く」を選び、Chrome / Safari で開き直してください。')
                : (zh
                  ? '请用最新版的 Chrome / Safari 打开，并允许麦克风权限。'
                  : '最新版の Chrome / Safari で開き、マイクの使用を許可してください。')}
            </p>
          </div>
        )}

        <button type="button" onClick={() => void begin()} disabled={busy}
          className="mt-5 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Play className="w-5 h-5" aria-hidden="true" />}
          {busy
            ? (zh ? '正在开始…' : '開始しています…')
            : byDays
              ? (zh ? `开始体验（${trialDays}天）` : `体験を始める（${trialDays}日間）`)
              : (zh ? `开始体验（${windowMinutes}分钟）` : `体験を始める（${windowMinutes}分）`)}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

        <p className="mt-4 text-[12px] text-gray-500">
          {zh
            ? `开始期限：${formatUntilJst(startDeadlineISO, 'zh')} 之前`
            : `開始期限：${formatUntilJst(startDeadlineISO, 'ja')} まで`}
        </p>
        <p className="mt-1 text-[12px] text-gray-500">
          {zh
            ? '体验结束后学习记录仍会保留。升级方案后可以从接下来的部分继续。'
            : '体験終了後も学習記録は残ります。プランをアップグレードすると続きから再開できます。'}
        </p>
      </div>
    </div>
  );
}

export default TrialStartScreen;
