// 会話前の旅立ちカード（FOREST FIRST §12）。AI会話を「カタリ港での出来事」として始める。
// 会話エンジンには触れない（Presentation Layerのみ）。場所・相手・目的・目標表現・所要時間を
// 会話前に示し、learnerが何をしに行くのか分かる状態でスタートさせる。
import { ArrowLeft, Mic, PenLine } from 'lucide-react';
import { TeacherAvatar } from '../TeacherAvatar';
import type { AiCourseDict } from '../../../locales/aiCourse';

export interface KatariPortIntroProps {
  t: AiCourseDict;
  /** 今日の目的（ミッションのタイトル） */
  purposeJa: string;
  targetExpression: string;
  /** 目安時間（分） */
  estimatedMinutes: number;
  /** 今日あと何回話せるか */
  remainingToday: number;
  starting?: boolean;
  onStartVoice: () => void;
  onStartText: () => void;
  onBack: () => void;
  /** 開始できなかった理由（上限など）。この画面で必ず見せる（黙って無反応にしない・原則15） */
  startError?: string;
  /** 進行中セッションが残っている（別端末 or 前回の中断）。この画面で復旧選択肢を出す。
   * 2026-08-16 CEO報告: ここに出さないと「押しても無反応」になっていた */
  recovery?: { mode: 'voice' | 'text' } | null;
  onDiscardActive?: () => void;
  onCancelRecovery?: () => void;
}

export const KatariPortIntro = ({
  t, purposeJa, targetExpression, estimatedMinutes, remainingToday, starting,
  onStartVoice, onStartText, onBack, startError, recovery, onDiscardActive, onCancelRecovery,
}: KatariPortIntroProps) => (
  <div className="max-w-md mx-auto px-4 py-4">
    <button type="button" onClick={onBack}
      className="transition-colors active:bg-gray-100 min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
      <ArrowLeft className="w-4 h-4" aria-hidden />{t.katari.backToMap}
    </button>

    <div className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50 to-white p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-teal-600">{t.katari.areaBadge}</p>
          <h2 className="text-lg font-bold text-gray-900">{t.katari.title}</h2>
          <p className="text-xs text-gray-600 mt-1">{t.katari.body}</p>
        </div>
        {/* 選択中の先生を出す（翔子固定スプライトだと悠斗先生を選んだ人に女性が出る・2026-08-17） */}
        <div className="w-10 shrink-0"><TeacherAvatar size={40} expression="smile" labeled={false} /></div>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="bg-white/80 rounded-xl p-2.5">
          <dt className="text-[11px] text-gray-400">{t.katari.partner}</dt>
          <dd className="text-gray-900 font-bold">{t.katari.partnerName}</dd>
        </div>
        <div className="bg-white/80 rounded-xl p-2.5">
          <dt className="text-[11px] text-gray-400">{t.katari.purpose}</dt>
          <dd className="text-gray-900 font-bold">{purposeJa}</dd>
        </div>
        <div className="bg-white/80 rounded-xl p-2.5">
          <dt className="text-[11px] text-gray-400">{t.katari.expression}</dt>
          <dd className="text-gray-900 font-bold">「{targetExpression}」</dd>
        </div>
        <div className="bg-white/80 rounded-xl p-2.5 flex gap-4">
          <div><dt className="text-[11px] text-gray-400">{t.katari.duration}</dt><dd className="text-gray-900 font-bold">{t.katari.durationValue(estimatedMinutes)}</dd></div>
          <div><dt className="text-[11px] text-gray-400">{t.katari.left}</dt><dd className="text-gray-900 font-bold">{t.katari.leftValue(remainingToday)}</dd></div>
        </div>
      </dl>

      {recovery ? (
        <div role="alertdialog" aria-label={t.katari.recoveryTitle}
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">{t.katari.recoveryTitle}</p>
          <p className="mt-1 text-xs text-amber-800">{t.katari.recoveryBody}</p>
          <button type="button" onClick={onDiscardActive}
            className="action-raised action-emerald touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-11 mt-2 bg-teal-600 text-white rounded-xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
            {t.katari.recoveryDiscardStart}
          </button>
          <button type="button" onClick={onCancelRecovery}
            className="transition-colors active:bg-amber-100 rounded w-full min-h-10 mt-1 text-xs text-amber-800 underline">
            {t.katari.recoveryCancel}
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={onStartVoice} disabled={starting}
            className="action-raised action-emerald touch-manipulation [-webkit-tap-highlight-color:transparent] w-full min-h-12 mt-4 bg-teal-600 text-white rounded-2xl font-bold text-sm disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
            <Mic className="inline w-4 h-4 -mt-0.5 mr-1" aria-hidden />{t.katari.startVoice}
          </button>
          <button type="button" onClick={onStartText} disabled={starting}
            className="transition-colors active:bg-gray-100 rounded w-full min-h-11 mt-2 text-sm text-gray-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <PenLine className="inline w-3.5 h-3.5 -mt-0.5 mr-1" aria-hidden />{t.katari.startText}
          </button>
        </>
      )}
      {startError && !recovery && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{startError}</p>
      )}
    </div>
  </div>
);

export default KatariPortIntro;
