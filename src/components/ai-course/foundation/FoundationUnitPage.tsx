// 単元共通ページ（intro→ことば→しくみ→小テスト→結果）。データ駆動・単元専用UIを増やさない（§8）。
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository, FoundationAttemptRecord } from '../../../lib/aiLesson/course/foundationProgress';
import { aggregateByDimension, deriveReviewCandidates } from '../../../lib/aiLesson/course/foundationGrade';
import { trackCourse } from '../../../lib/aiLesson/course/courseAnalytics';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { FoundationQuestionStep } from './FoundationQuestionStep';

type Phase = 'intro' | 'words' | 'rules' | 'quiz' | 'result';
interface Props {
  t: AiCourseDict; bundle: FoundationUnitBundle; repo: FoundationProgressRepository;
  onExit: () => void; onGoReview: () => void; onProgressChanged: () => void;
}

export const FoundationUnitPage = ({ t, bundle, repo, onExit, onGoReview, onProgressChanged }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const { unit, items, rules, questions } = bundle;
  const [attempt, setAttempt] = useState<FoundationAttemptRecord | null>(() => {
    // 中断中attemptがあればリロード後も途中から（§8）
    const existing = repo.getAttempts().find((a) => a.unitId === unit.id && a.completedAt === null);
    return existing ?? null;
  });
  const answered = attempt?.answers.length ?? 0;
  const [phase, setPhase] = useState<Phase>(attempt && answered > 0 ? 'quiz' : 'intro');
  const [qi, setQi] = useState(answered < questions.length ? answered : 0);
  const [stepKey, setStepKey] = useState(0);

  const startQuiz = () => {
    const a = repo.startAttempt(unit.id, zh ? 'zh' : 'ja');
    setAttempt(a);
    setQi(Math.min(a.answers.length, questions.length - 1));
    if (a.answers.length === 0) trackCourse('start_ai_course_foundation_unit', { unitId: unit.id });
    setPhase('quiz');
  };
  const onJudged = (r: { correct: boolean; hintUsed: boolean }) => {
    if (!attempt) return;
    const q = questions[qi];
    repo.recordAnswer(attempt.attemptId, {
      questionId: q.id, targetId: q.targetItemId ?? q.targetRuleId ?? q.id, dimension: q.dimension,
      correct: r.correct, hintUsed: r.hintUsed || undefined, errorTag: q.errorTag, attemptedAt: new Date().toISOString(),
    });
    onProgressChanged();
  };
  const next = () => {
    if (qi + 1 >= questions.length) {
      if (attempt) {
        repo.completeAttempt(attempt.attemptId);
        const done = repo.getAttempts().find((a) => a.attemptId === attempt.attemptId);
        trackCourse('complete_ai_course_foundation_unit', { unitId: unit.id, correct: done?.answers.filter((x) => x.correct).length ?? 0, total: done?.answers.length ?? 0 });
        onProgressChanged();
      }
      setPhase('result');
    } else { setQi(qi + 1); setStepKey((k) => k + 1); }
  };

  const results = (repo.getAttempts().find((a) => a.attemptId === attempt?.attemptId)?.answers ?? [])
    .map((x) => ({ questionId: x.questionId, targetId: x.targetId, dimension: x.dimension, correct: x.correct, hintUsed: x.hintUsed, errorTag: x.errorTag }));
  const dims = aggregateByDimension(results.map(({ questionId, dimension, correct, errorTag, targetId }) => ({ questionId, dimension, correct, errorTag, targetId })));
  const weak = deriveReviewCandidates(results).filter((w) => w.candidateState !== 'confirm_day7' && w.candidateState !== 'retained');

  const labelOf = (targetId: string): string => {
    const it = items.find((i) => i.id === targetId);
    if (it) return it.displayForm;
    const r = rules.find((x) => x.id === targetId);
    return r ? (zh ? r.titleZh : r.titleJa) : targetId;
  };

  return (
    <div>
      {phase === 'intro' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-lg font-bold text-gray-900">{zh ? unit.titleZh : unit.titleJa}</h2>
          <ul className="mt-2 space-y-1">
            {(zh ? unit.canDoZh : unit.canDoJa).map((c, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />{c}</li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-2">{tl.aboutMinutes(unit.estimatedMinutes)}・{unit.level}</p>
          <button type="button" onClick={() => setPhase('words')} className="w-full min-h-11 py-3 mt-4 bg-indigo-600 text-white font-bold rounded-xl">{tl.start}</button>
        </div>
      )}
      {phase === 'words' && (
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">{tl.stepWords}</p>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-bold text-gray-900">{it.displayForm}</span>
                  <span className="text-xs text-gray-500">{it.readingKana}</span>
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{tl.pos[it.partOfSpeech]}</span>
                </div>
                <p className="text-xs text-gray-700 mt-0.5">{it.meaningZh}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{it.exampleJa}／{it.exampleZh}</p>
                {it.usageNoteZh && <p className="text-[11px] text-amber-700 mt-0.5">💡 {it.usageNoteZh}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setPhase('intro')} className="min-h-11 px-4 text-sm text-gray-500 border border-gray-200 rounded-xl">{tl.back}</button>
            <button type="button" onClick={() => setPhase('rules')} className="flex-1 min-h-11 py-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.next}</button>
          </div>
        </div>
      )}
      {phase === 'rules' && (
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">{tl.stepRules}</p>
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-bold text-gray-900">{zh ? r.titleZh : r.titleJa}</p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{zh ? r.explanationZh : r.explanationJa}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setPhase('words')} className="min-h-11 px-4 text-sm text-gray-500 border border-gray-200 rounded-xl">{tl.back}</button>
            <button type="button" onClick={startQuiz} className="flex-1 min-h-11 py-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.startQuiz}</button>
          </div>
        </div>
      )}
      {phase === 'quiz' && attempt && questions[qi] && (
        <FoundationQuestionStep key={`${questions[qi].id}-${stepKey}`} t={t} q={questions[qi]} attemptSeed={attempt.attemptSeed}
          index={qi} total={questions.length} onJudged={onJudged} onNext={next} />
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
              {weak.slice(0, 4).map((w) => (
                <p key={`${w.reviewTarget}-${w.reviewDimension}`} className="text-xs text-gray-700">・{tl.dims[w.reviewDimension]}: {tl.weakOf(labelOf(w.reviewTarget))}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3 mb-3">{tl.allGood}</p>
          )}
          <p className="text-[11px] text-gray-500 mb-1">{tl.retainNote}</p>
          <p className="text-[11px] text-gray-400 mb-3">{tl.notSaved}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onGoReview} className="flex-1 min-h-11 py-3 text-sm font-bold text-indigo-700 border border-indigo-200 rounded-xl">{tl.toReview}</button>
            <button type="button" onClick={onExit} className="flex-1 min-h-11 py-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.toUnits}</button>
          </div>
        </div>
      )}
    </div>
  );
};
