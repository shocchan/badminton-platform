// 単元共通ページ（intro→ことば→しくみ→小テスト→結果）。データ駆動・単元専用UIを増やさない（§8）。
import { useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import type { FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository, FoundationAttemptRecord } from '../../../lib/aiLesson/course/foundationProgress';
import { aggregateByDimension, deriveReviewCandidates } from '../../../lib/aiLesson/course/foundationGrade';
import { trackCourse } from '../../../lib/aiLesson/course/courseAnalytics';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { FoundationQuestionStep } from './FoundationQuestionStep';
import { diagramForRule } from './vocab/diagramForRule';

type Phase = 'intro' | 'words' | 'rules' | 'quiz' | 'result';
interface Props {
  t: AiCourseDict; bundle: FoundationUnitBundle; repo: FoundationProgressRepository;
  /** URL復元用（言語切替・リロード後の位置維持・§7）。不正値・矛盾は安全な段階へ落とす（§8） */
  initialPhase?: string | null;
  onPhaseChange?: (phase: Phase) => void;
  onExit: () => void; onGoReview: () => void; onProgressChanged: () => void;
}

export const FoundationUnitPage = ({ t, bundle, repo, initialPhase, onPhaseChange, onExit, onGoReview, onProgressChanged }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const { unit, items, rules, questions } = bundle;
  const [attempt, setAttempt] = useState<FoundationAttemptRecord | null>(() => {
    // 中断中attemptがあればリロード後も途中から（§8）
    const existing = repo.getAttempts().find((a) => a.unitId === unit.id && a.completedAt === null);
    return existing ?? null;
  });
  const answered = attempt?.answers.length ?? 0;
  const [phase, setPhaseRaw] = useState<Phase>(() => {
    // URL step と Repository の矛盾解決（§8）:
    // quiz指定→未完了attemptがある時のみ再開（勝手にattemptを作らない）。完了済みのみ→result。どちらも無ければintro
    if (initialPhase === 'quiz') {
      if (attempt) return 'quiz';
      return repo.getUnitSummary(unit.id).completedCount > 0 ? 'result' : 'intro';
    }
    if (initialPhase === 'result') return repo.getUnitSummary(unit.id).completedCount > 0 ? 'result' : 'intro';
    if (initialPhase === 'words' || initialPhase === 'rules' || initialPhase === 'intro') return initialPhase;
    return attempt && answered > 0 ? 'quiz' : 'intro';
  });
  const setPhase = (p: Phase) => { setPhaseRaw(p); onPhaseChange?.(p); };
  const [qi, setQi] = useState(answered < questions.length ? answered : 0);
  const [stepKey, setStepKey] = useState(0);

  const startQuiz = () => {
    const a = repo.startAttempt(unit.id, zh ? 'zh' : 'ja');
    setAttempt(a);
    setQi(Math.min(a.answers.length, questions.length - 1));
    if (a.answers.length === 0) trackCourse('start_ai_course_foundation_unit', { unitId: unit.id });
    setPhase('quiz');
  };
  const onJudged = (r: { correct: boolean; hintUsed: boolean; skipped?: boolean }) => {
    if (!attempt) return;
    const q = questions[qi];
    repo.recordAnswer(attempt.attemptId, {
      questionId: q.id, targetId: q.targetItemId ?? q.targetRuleId ?? q.id, dimension: q.dimension,
      correct: r.correct, hintUsed: r.hintUsed || undefined, skipped: r.skipped || undefined,
      errorTag: q.errorTag, attemptedAt: new Date().toISOString(),
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
  /** もう一度この単元（結果画面の第一CTA・新attemptとして開始） */
  const retryUnit = () => {
    const a = repo.startAttempt(unit.id, zh ? 'zh' : 'ja');
    setAttempt(a); setQi(0); setStepKey((k) => k + 1);
    trackCourse('start_ai_course_foundation_unit', { unitId: unit.id });
    setPhase('quiz');
  };


  const lastCompleted = [...repo.getAttempts()].reverse().find((a) => a.unitId === unit.id && a.completedAt !== null);
  const resultAttemptId = attempt?.attemptId ?? lastCompleted?.attemptId;
  const results = (repo.getAttempts().find((a) => a.attemptId === resultAttemptId)?.answers ?? [])
    .map((x) => ({ questionId: x.questionId, targetId: x.targetId, dimension: x.dimension, correct: x.correct, hintUsed: x.hintUsed, skipped: x.skipped, errorTag: x.errorTag }));
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
          <p className="text-[11px] text-gray-400 mt-2">{tl.aboutMinutes(unit.estimatedMinutes)}・{tl.questionCount(questions.length)}</p>
          <button type="button" onClick={() => setPhase('words')} className="w-full min-h-12 py-3 mt-4 bg-indigo-600 text-white font-bold rounded-xl">{tl.start}</button>
        </div>
      )}
      {phase === 'words' && (
        <div>
          <StepIndicator tl={tl} current="words" />
          <p className="text-xs font-bold text-gray-500 mb-2">{tl.stepWords}</p>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-bold text-gray-900">{it.displayForm}</span>
                  <span className="text-xs text-gray-500">{it.readingKana}</span>
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{tl.pos[it.partOfSpeech]}</span>
                  {it.verbGroup && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">{tl.verbGroups[it.verbGroup]}</span>}
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
          <StepIndicator tl={tl} current="rules" />
          <p className="text-xs font-bold text-gray-500 mb-2">{tl.stepRules}</p>
          <div className="space-y-2">
            {rules.map((r) => {
              const Diagram = diagramForRule(r.id);
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-sm font-bold text-gray-900">{zh ? r.titleZh : r.titleJa}</p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{zh ? r.explanationZh : r.explanationJa}</p>
                  {Diagram && <Diagram t={t} />}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setPhase('words')} className="min-h-11 px-4 text-sm text-gray-500 border border-gray-200 rounded-xl">{tl.back}</button>
            <button type="button" onClick={startQuiz} className="flex-1 min-h-11 py-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.startQuiz}</button>
          </div>
        </div>
      )}
      {phase === 'quiz' && attempt && questions[qi] && (
        <div>
          <StepIndicator tl={tl} current="quiz" />
          <FoundationQuestionStep key={`${questions[qi].id}-${stepKey}`} t={t} q={questions[qi]} attemptSeed={attempt.attemptSeed}
            unitTitle={zh ? unit.titleZh : unit.titleJa} unitId={unit.id}
            index={qi} total={questions.length} onJudged={onJudged} onNext={next} />
        </div>
      )}
      {phase === 'result' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <StepIndicator tl={tl} current="result" />
          <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-1.5"><CheckCircle2 className="w-5 h-5 text-emerald-600" />{tl.resultToday}</h2>
          <p className="text-2xl font-bold text-gray-900 mb-1">{tl.resultScore(results.filter((r) => r.correct).length, results.length)}</p>
          {results.some((r) => r.skipped) && (
            <p className="text-xs text-gray-500 mb-1">{tl.resultSkipped(results.filter((r) => r.skipped).length)}</p>
          )}
          {weak.length > 0 ? (
            <div className="bg-amber-50 rounded-xl p-3 my-3">
              <p className="text-xs font-bold text-amber-800 mb-0.5">{tl.topWeak}</p>
              <p className="text-sm text-gray-800">{tl.dims[weak[0].reviewDimension]}: {tl.weakOf(labelOf(weak[0].reviewTarget))}</p>
            </div>
          ) : (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3 my-3">{tl.allGood}</p>
          )}
          {/* 第一CTAは一つだけ（間違いあり→もう一度／全問自力→終える） */}
          {weak.length > 0 ? (
            <button type="button" onClick={retryUnit} className="w-full min-h-12 py-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.ctaRetryUnit}</button>
          ) : (
            <button type="button" onClick={onExit} className="w-full min-h-12 py-3 bg-indigo-600 text-white font-bold rounded-xl">{tl.ctaFinish}</button>
          )}
          <button type="button" onClick={weak.length > 0 ? onExit : onGoReview} className="w-full min-h-11 py-2.5 mt-2 text-sm text-gray-500">{weak.length > 0 ? tl.ctaFinish : tl.toReview}</button>
          {/* 詳細（分野別）は展開式・技術用語は出さない（§16/§17） */}
          <details className="mt-3">
            <summary className="text-xs font-bold text-gray-500 cursor-pointer min-h-6">{tl.resultDetails}</summary>
            <div className="mt-2 space-y-1.5">
              {Object.entries(dims).map(([d, v]) => (
                <p key={d} className="text-sm text-gray-800 flex justify-between">
                  <span>{tl.dims[d as keyof typeof tl.dims]}</span>
                  <span className="font-bold">{v.correct} / {v.total}</span>
                </p>
              ))}
              <p className="text-[11px] text-gray-500 pt-1">{tl.reviewTimingNote}</p>
            </div>
          </details>
          <p className="text-[11px] text-gray-400 mt-3">{tl.notSaved}</p>
        </div>
      )}
    </div>
  );
};

/** 現在位置だけを強調するステップ表示（ことば→しくみ→問題→結果・§8） */
const StepIndicator = ({ tl, current }: { tl: AiCourseDict['lab']; current: 'words' | 'rules' | 'quiz' | 'result' }) => {
  const steps: { key: typeof current; label: string }[] = [
    { key: 'words', label: tl.stepLabelWords }, { key: 'rules', label: tl.stepLabelRules },
    { key: 'quiz', label: tl.stepLabelQuiz }, { key: 'result', label: tl.stepLabelResult },
  ];
  return (
    <div className="flex items-center gap-1 mb-3 text-[11px]" aria-label={steps.find((x) => x.key === current)?.label}>
      {steps.map(({ key, label }, i) => (
        <span key={key} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
          <span className={key === current ? 'font-bold text-indigo-700' : 'text-gray-400'}>{label}</span>
        </span>
      ))}
    </div>
  );
};
