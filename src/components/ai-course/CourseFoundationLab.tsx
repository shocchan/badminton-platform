// 日本語のしくみラボ（Phase 2A・1単元縦切りMVP）。draft教材＝labPreview権限のみ。
// 進捗はReact stateのみ（正式保存しない旨を明示）。会話XP/masteryState/current_weekへ不接触。
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FlaskConical, Lightbulb } from 'lucide-react';
import { UNIT1, UNIT1_ITEMS, UNIT1_RULES, UNIT1_QUESTIONS } from '../../lib/aiLesson/course/foundationUnit1';
import { judgeQuestion, aggregateByDimension, deriveReviewCandidates, shuffledOrder, shuffledChoices } from '../../lib/aiLesson/course/foundationGrade';
import type { QuestionResult } from '../../lib/aiLesson/course/foundationGrade';
import type { AiCourseDict } from '../../locales/aiCourse';

type Phase = 'intro' | 'words' | 'rules' | 'quiz' | 'result';
interface Props { t: AiCourseDict; onBack: () => void; }

export const CourseFoundationLab = ({ t, onBack }: Props) => {
  const tl = t.lab;
  const zh = t.locale === 'zh';
  const [phase, setPhase] = useState<Phase>('intro');
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [orderPick, setOrderPick] = useState<number[]>([]);
  const [judged, setJudged] = useState<boolean | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const q = UNIT1_QUESTIONS[qi];
  const shuffled = useMemo(() => (q?.type === 'order' ? shuffledOrder(q) : []), [q]);
  const choiceOrder = useMemo(() => (q?.type === 'choice' ? shuffledChoices(q) : []), [q]);

  const submit = () => {
    if (!q || judged !== null) return;
    const ok = judgeQuestion(q, {
      choiceIndex: picked ?? undefined, text,
      orderIndexes: q.type === 'order' ? orderPick.map((p) => p) : undefined,
    });
    setJudged(ok);
    setResults((r) => [...r, { questionId: q.id, dimension: q.dimension, correct: ok, errorTag: q.errorTag, targetId: q.targetItemId ?? q.targetRuleId ?? q.id }]);
  };
  const next = () => {
    setPicked(null); setText(''); setOrderPick([]); setJudged(null);
    if (qi + 1 >= UNIT1_QUESTIONS.length) setPhase('result'); else setQi(qi + 1);
  };

  const dims = aggregateByDimension(results);
  const weak = deriveReviewCandidates(results);

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={onBack} aria-label={t.roadmap.back} className="min-h-11 min-w-11 flex items-center justify-center text-gray-500"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><FlaskConical className="w-4 h-4 text-indigo-600" />{tl.title}</h1>
      </div>
      {/* draft・非保存の明示（§8） */}
      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mb-4">{tl.draftNote}</p>

      {phase === 'intro' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-lg font-bold text-gray-900">{zh ? UNIT1.titleZh : UNIT1.titleJa}</h2>
          <ul className="mt-2 space-y-1">
            {(zh ? UNIT1.canDoZh : UNIT1.canDoJa).map((c, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />{c}</li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-2">{tl.estimate}</p>
          <button type="button" onClick={() => setPhase('words')} className="w-full min-h-11 py-3 mt-4 bg-indigo-600 text-white font-bold rounded-xl">{tl.start}</button>
        </div>
      )}

      {phase === 'words' && (
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">{tl.stepWords}</p>
          <div className="space-y-2">
            {UNIT1_ITEMS.map((it) => (
              <div key={it.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-gray-900">{it.displayForm}</span>
                  <span className="text-xs text-gray-500">{it.readingKana}</span>
                  <span className="text-[10px] text-gray-400">{it.readingRomaji}</span>
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{tl.pos[it.partOfSpeech]}</span>
                </div>
                <p className="text-xs text-gray-700 mt-0.5">{it.meaningZh}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{it.exampleJa}／{it.exampleZh}</p>
                {it.usageNoteZh && <p className="text-[11px] text-amber-700 mt-0.5 flex gap-1"><Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />{it.usageNoteZh}</p>}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPhase('rules')} className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.next}</button>
        </div>
      )}

      {phase === 'rules' && (
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">{tl.stepRules}</p>
          <div className="space-y-2">
            {UNIT1_RULES.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-bold text-gray-900">{zh ? r.titleZh : r.titleJa}</p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{zh ? r.explanationZh : r.explanationJa}</p>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPhase('quiz')} className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.startQuiz}</button>
        </div>
      )}

      {phase === 'quiz' && q && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{tl.dims[q.dimension]}</span>
            <span className="text-xs font-mono text-gray-400">{qi + 1} / {UNIT1_QUESTIONS.length}</span>
          </div>
          <p className="text-sm font-bold text-gray-900 mb-3">{zh ? q.promptZh : q.promptJa}</p>
          {q.type === 'choice' && (
            <div className="space-y-2">
              {/* 表示順は決定的シャッフル・判定は元index（安定choice ID）で行う */}
              {choiceOrder.map((orig) => (
                <button key={orig} type="button" disabled={judged !== null} onClick={() => setPicked(orig)}
                  className={`w-full min-h-11 px-4 py-2.5 text-left text-sm rounded-xl border ${
                    judged !== null && orig === q.answerIndex ? 'border-emerald-400 bg-emerald-50'
                      : picked === orig ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'}`}>{q.choices![orig]}</button>
              ))}
            </div>
          )}
          {q.type === 'input' && (
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} disabled={judged !== null}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
              placeholder={tl.inputKana} className="w-full min-h-12 px-4 py-3 border border-gray-300 rounded-xl text-base" />
          )}
          {q.type === 'order' && (
            <div>
              <div className="min-h-11 bg-gray-50 rounded-xl px-3 py-2 mb-2 text-sm text-gray-800">
                {orderPick.map((p) => q.orderTokens![p]).join(' ') || tl.orderHint}
              </div>
              <div className="flex flex-wrap gap-2">
                {shuffled.map((origIdx) => (
                  <button key={origIdx} type="button" disabled={judged !== null || orderPick.includes(origIdx)}
                    onClick={() => setOrderPick((p) => [...p, origIdx])}
                    className="min-h-10 px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-30">{q.orderTokens![origIdx]}</button>
                ))}
                <button type="button" onClick={() => setOrderPick([])} disabled={judged !== null}
                  className="min-h-10 px-3 py-1.5 text-xs text-gray-400">{tl.orderReset}</button>
              </div>
            </div>
          )}
          {judged === null ? (
            <button type="button" onClick={submit}
              disabled={q.type === 'choice' ? picked === null : q.type === 'input' ? !text.trim() : orderPick.length !== (q.orderTokens?.length ?? 0)}
              className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-40">{tl.check}</button>
          ) : (
            <div className="mt-3" aria-live="polite">
              <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-gray-700'}`}>
                {judged ? tl.correct : tl.notYet}
              </p>
              <p className="text-xs text-gray-600 mt-1">{zh ? q.explanationZh : q.explanationJa}</p>
              <button type="button" onClick={next} className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-1.5">{tl.next}<ArrowRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}

      {phase === 'result' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-1.5"><CheckCircle2 className="w-5 h-5 text-emerald-600" />{tl.resultTitle}</h2>
          <div className="space-y-1.5 mb-3">
            {Object.entries(dims).map(([d, v]) => (
              <p key={d} className="text-sm text-gray-800 flex justify-between">
                <span>{tl.dims[d as keyof typeof tl.dims]}</span>
                <span className="font-bold">{v.correct} / {v.total}</span>
              </p>
            ))}
          </div>
          {weak.length > 0 ? (
            <div className="bg-amber-50 rounded-xl p-3 mb-3">
              <p className="text-xs font-bold text-amber-800 mb-1">{tl.weakTitle}</p>
              {weak.slice(0, 3).map((w) => (
                <p key={`${w.reviewTarget}-${w.reviewDimension}`} className="text-xs text-gray-700">・{tl.dims[w.reviewDimension]}: {tl.weakOf(labelOf(w.reviewTarget, zh))}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3 mb-3">{tl.allGood}</p>
          )}
          <p className="text-[11px] text-gray-500 mb-1">{tl.retainNote}</p>
          <p className="text-[11px] text-gray-400 mb-3">{tl.notSaved}</p>
          <button type="button" onClick={onBack} className="w-full min-h-11 py-3 bg-indigo-600 text-white font-bold rounded-xl">{t.report.backHome}</button>
        </div>
      )}
    </div>
  );
};

const labelOf = (targetId: string, zh: boolean): string => {
  const it = UNIT1_ITEMS.find((i) => i.id === targetId);
  if (it) return it.displayForm;
  const r = UNIT1_RULES.find((x) => x.id === targetId);
  return r ? (zh ? r.titleZh : r.titleJa) : targetId;
};
