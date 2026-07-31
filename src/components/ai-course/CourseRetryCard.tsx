// 会話後「この1文だけ、もう一度言ってみましょう」カード（テキスト・音声レッスン共通）。
// 最も学習価値の高い訂正1件だけを対象に、その場で1回言い直す一本道を作る。
// 判定は決定的（courseRetry.judgeRetry）・API呼び出しなし。スキップしても失敗扱いにしない。

import { useState } from 'react';
import { PenLine, Sparkles, Lightbulb, ArrowRight, CheckCircle2 } from 'lucide-react';
import { judgeRetry } from '../../lib/aiLesson/course/courseRetry';
import type { RetryTarget, RetryJudgement } from '../../lib/aiLesson/course/courseRetry';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  target: RetryTarget;
  /** 完了（good/close）またはスキップで1回だけ呼ばれる */
  onFinished: (outcome: 'done' | 'skipped') => void;
}

export const CourseRetryCard = ({ t, target, onFinished }: Props) => {
  const tr = t.report;
  const zh = t.locale === 'zh';
  const [input, setInput] = useState('');
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<RetryJudgement | null>(null);
  const [finished, setFinished] = useState(false);

  const finish = (outcome: 'done' | 'skipped') => {
    if (finished) return;
    setFinished(true);
    trackCourse(outcome === 'done' ? 'complete_ai_course_retry' : 'skip_ai_course_retry', { tries });
    onFinished(outcome);
  };

  const submit = () => {
    const text = input.trim();
    if (!text || finished) return;
    if (tries === 0) trackCourse('start_ai_course_retry');
    const j = judgeRetry(text, target.improved);
    setTries((n) => n + 1);
    setResult(j);
    if (j === 'good') finish('done');
    // close/tryAgain は再入力可能（2回目のcloseは受理して前へ進める＝詰まらせない）
    if (j === 'close' && tries >= 1) finish('done');
  };

  // 完了後の表示（成功体験を残す）
  if (finished && result === 'good') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5" aria-live="polite">
        <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5 check-pop">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />{tr.retryGood}
        </p>
        <p className="text-sm text-gray-800 mt-2">「{target.improved}」</p>
      </div>
    );
  }
  if (finished) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5" aria-live="polite">
        <p className="text-sm text-gray-700 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          {result ? tr.retryCloseAccepted : tr.retrySkipped}
        </p>
        <p className="text-sm text-gray-800 mt-1.5">「{target.improved}」</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-blue-100 p-5">
      <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
        <PenLine className="w-4 h-4 text-blue-600" />{tr.retryTitle}
      </p>

      <div className="space-y-2 mb-3">
        <div>
          <p className="text-[11px] text-gray-500">{tr.retryYour}</p>
          <p className="text-sm text-gray-500 line-through decoration-red-300">{target.original}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500">{tr.retryNatural}</p>
          <p className="text-base font-bold text-blue-700">{target.improved}</p>
          {zh && target.noteZh && <p className="text-xs text-gray-500 mt-0.5">{target.noteZh}</p>}
        </div>
      </div>

      {/* 判定フィードバック（1行・詰まらせない） */}
      {result === 'close' && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2 flex items-center gap-1.5" aria-live="polite">
          <Sparkles className="w-4 h-4 shrink-0" />{tr.retryClose}
        </p>
      )}
      {result === 'tryAgain' && (
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-2 flex items-center gap-1.5" aria-live="polite">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />{tr.retryHint}
        </p>
      )}

      <label className="block">
        <span className="sr-only">{tr.retryInputLabel}</span>
        <input
          type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
          placeholder={tr.retryInputLabel}
          className="w-full min-h-12 px-4 py-3 border border-gray-300 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <button type="button" onClick={submit} disabled={!input.trim()}
        className="w-full min-h-11 py-3 mt-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1.5">
        {tr.retryButton}<ArrowRight className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => finish('skipped')}
        className="w-full min-h-10 py-2 mt-1 text-xs text-gray-400 hover:text-gray-600">
        {tr.retrySkip}
      </button>
    </div>
  );
};
