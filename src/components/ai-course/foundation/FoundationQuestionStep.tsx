// 問題1問の共通レンダラー（データ駆動・4メカニクス・§8/§9）。判定は安定choice ID。
import { useMemo, useState } from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import type { FoundationQuestion } from '../../../lib/aiLesson/course/foundationTypes';
import { mechanicOf } from '../../../lib/aiLesson/course/foundationTypes';
import { judgeQuestion, shuffledChoicesSeeded, shuffledOrderSeeded, shuffledMatchingRight } from '../../../lib/aiLesson/course/foundationGrade';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; q: FoundationQuestion; attemptSeed: number;
  index: number; total: number;
  onJudged: (r: { correct: boolean; hintUsed: boolean }) => void;
  onNext: () => void;
}

export const FoundationQuestionStep = ({ t, q, attemptSeed, index, total, onJudged, onNext }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const mech = mechanicOf(q.type);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [orderPick, setOrderPick] = useState<number[]>([]);
  const [matchPick, setMatchPick] = useState<(number | null)[]>(() => (q.pairs ?? []).map(() => null));
  const [hintShown, setHintShown] = useState(false);
  const [judged, setJudged] = useState<boolean | null>(null);
  const choiceOrder = useMemo(() => (mech === 'choice' ? shuffledChoicesSeeded(q, attemptSeed) : []), [q, attemptSeed, mech]);
  const orderTokens = useMemo(() => (mech === 'order' ? shuffledOrderSeeded(q, attemptSeed) : []), [q, attemptSeed, mech]);
  const rightOrder = useMemo(() => (mech === 'matching' ? shuffledMatchingRight(q, attemptSeed) : []), [q, attemptSeed, mech]);
  const nextLeft = matchPick.indexOf(null);
  const hint = zh ? q.hintZh : q.hintJa;

  const canSubmit = mech === 'choice' ? picked !== null
    : mech === 'input' ? !!text.trim()
    : mech === 'order' ? orderPick.length === (q.orderTokens?.length ?? 0)
    : matchPick.every((v) => v !== null);

  const submit = () => {
    if (judged !== null || !canSubmit) return;
    const ok = judgeQuestion(q, {
      choiceIndex: picked ?? undefined, text,
      orderIndexes: mech === 'order' ? orderPick : undefined,
      matchingIndexes: mech === 'matching' ? matchPick.map((v) => v ?? -1) : undefined,
    });
    setJudged(ok);
    onJudged({ correct: ok, hintUsed: hintShown });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{tl.dims[q.dimension]}</span>
        <span className="text-xs font-mono text-gray-400">{index + 1} / {total}</span>
      </div>
      <p className="text-sm font-bold text-gray-900 mb-3">{zh ? q.promptZh : q.promptJa}</p>

      {mech === 'choice' && (
        <div className="space-y-2">
          {choiceOrder.map((orig) => (
            <button key={orig} type="button" disabled={judged !== null} onClick={() => setPicked(orig)}
              className={`w-full min-h-11 px-4 py-2.5 text-left text-sm rounded-xl border ${
                judged !== null && orig === q.answerIndex ? 'border-emerald-400 bg-emerald-50'
                  : picked === orig ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'}`}>{q.choices![orig]}</button>
          ))}
        </div>
      )}
      {mech === 'input' && (
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} disabled={judged !== null}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
          aria-label={zh ? q.promptZh : q.promptJa}
          placeholder={q.type === 'kana_input' ? tl.inputKana : tl.inputText}
          className="w-full min-h-12 px-4 py-3 border border-gray-300 rounded-xl text-base" />
      )}
      {mech === 'order' && (
        <div>
          <div className="min-h-11 bg-gray-50 rounded-xl px-3 py-2 mb-2 text-sm text-gray-800">
            {orderPick.map((p) => q.orderTokens![p]).join(' ') || tl.orderHint}
          </div>
          <div className="flex flex-wrap gap-2">
            {orderTokens.map((origIdx) => (
              <button key={origIdx} type="button" disabled={judged !== null || orderPick.includes(origIdx)}
                onClick={() => setOrderPick((p) => [...p, origIdx])}
                className="min-h-10 px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-30">{q.orderTokens![origIdx]}</button>
            ))}
            <button type="button" onClick={() => setOrderPick([])} disabled={judged !== null}
              className="min-h-10 px-3 py-1.5 text-xs text-gray-400">{tl.orderReset}</button>
          </div>
        </div>
      )}
      {mech === 'matching' && (
        <div>
          <p className="text-[11px] text-gray-500 mb-2">{tl.matchingHint}</p>
          <div className="space-y-1.5 mb-3">
            {(q.pairs ?? []).map((p, li) => (
              <div key={li} className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 ${nextLeft === li && judged === null ? 'bg-indigo-50' : ''}`}>
                <span className="font-bold text-gray-900 min-w-16">{p.left}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-800">{matchPick[li] !== null ? q.pairs![matchPick[li]!].right : '？'}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {rightOrder.map((ri) => (
              <button key={ri} type="button" disabled={judged !== null || matchPick.includes(ri) || nextLeft === -1}
                onClick={() => setMatchPick((mp) => mp.map((v, i) => (i === nextLeft ? ri : v)))}
                className="min-h-10 px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-30">{q.pairs![ri].right}</button>
            ))}
            <button type="button" onClick={() => setMatchPick((q.pairs ?? []).map(() => null))} disabled={judged !== null}
              className="min-h-10 px-3 py-1.5 text-xs text-gray-400">{tl.orderReset}</button>
          </div>
        </div>
      )}

      {hint && judged === null && (
        <div className="mt-3">
          {hintShown ? (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex gap-1.5"><Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />{hint}</p>
          ) : (
            <button type="button" onClick={() => setHintShown(true)} className="min-h-10 text-xs text-amber-700 underline">{tl.showHint}</button>
          )}
        </div>
      )}

      {judged === null ? (
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-40">{tl.check}</button>
      ) : (
        <div className="mt-3" aria-live="polite">
          <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-gray-700'}`}>{judged ? tl.correct : tl.notYet}</p>
          <p className="text-xs text-gray-600 mt-1">{zh ? q.explanationZh : q.explanationJa}</p>
          <button type="button" onClick={onNext} className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-1.5">{tl.next}<ArrowRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};
