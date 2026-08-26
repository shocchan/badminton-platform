// AI体験パスの開始画面（2026-08-20 CEO決定: リアルタイム60分制）。
//
// 「開始ボタンを押したらそこから実時間60分。画面を閉じても・進まなくても止まらない」を
// **押す前に**正直に伝える。押した瞬間にサーバーが valid_until を開始+60分へ書き換え、
// 以降は既存の期間ゲートが自動で終了させる。
import { useRef, useState } from 'react';
import { Clock, Play, Loader2, AlertTriangle } from 'lucide-react';
import { startTrial } from '../../lib/aiLesson/course/courseAccess';
import { formatUntilJst } from '../../lib/aiLesson/course/courseAccess';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { logCourseEvent } from '../../lib/aiLesson/course/courseEvents';

export function TrialStartScreen({ lang, windowMinutes, startDeadlineISO, onStarted }: {
  lang: 'ja' | 'zh';
  windowMinutes: number;
  /** 開始の期限（購入+30日の valid_until） */
  startDeadlineISO: string;
  onStarted: () => void;
}) {
  const zh = lang === 'zh';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const viewed = useRef(false);
  if (!viewed.current) {
    viewed.current = true;
    trackCourse('view_ai_course_trial_start', { window_minutes: windowMinutes });
  }

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    trackCourse('click_ai_course_trial_start', { window_minutes: windowMinutes });
    const r = await startTrial();
    // 開始が**成功したとき**だけ trial_start を立てる（押した＝始まった、ではない・2026-08-23 監査）
    if (r.ok) { logCourseEvent('trial_started', { window_minutes: windowMinutes }); trackCourse('start_ai_course_trial', { window_minutes: windowMinutes }); onStarted(); return; }
    trackCourse('fail_ai_course_trial_start', { code: r.code ?? 'unknown' });
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
          {zh ? `准备好后，开始${windowMinutes}分钟的体验` : `準備ができたら、${windowMinutes}分の体験を始めましょう`}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {zh
            ? `按下开始按钮后，将从那一刻起计时${windowMinutes}分钟。期间内AI会话・语法战斗・教材都可以随意使用。`
            : `開始ボタンを押すと、その瞬間から実時間で${windowMinutes}分のカウントが始まります。時間内はAI会話・文法バトル・教材を自由に使えます。`}
        </p>

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
        <p className="mt-2 text-[12px] text-gray-500">
          {zh
            ? '目标设定与水平诊断已经完成，不计入体验时间。60分钟全部用于学习。'
            : '目標設定とレベル診断はもう終わっています（体験時間には含まれません）。60分はまるごと学習に使えます。'}
        </p>

        <button type="button" onClick={() => void begin()} disabled={busy}
          className="mt-5 inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Play className="w-5 h-5" aria-hidden="true" />}
          {busy
            ? (zh ? '正在开始…' : '開始しています…')
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
