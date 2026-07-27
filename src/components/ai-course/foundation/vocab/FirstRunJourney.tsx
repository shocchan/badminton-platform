// 初回4ステップJourney（Phase 2E-1.11 §4-§5・§11・labPreview限定・lazy chunk）。
// 学習者向け画面。内部状態名・内部用語は表示しない。第一CTAは各画面で一つ。
// 既存の診断・推薦・完了画面を再利用し、新しい学習ロジックを作らない。
import { useEffect, useMemo, useState } from 'react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { ActionButton } from '../ActionButton';
import { trackCourse, trackCourseOnce } from '../../../../lib/aiLesson/course/courseAnalytics';
import {
  createFirstRunRepository, LEARNING_GOALS, JOURNEY_STEPS, stepIndexOf, TOTAL_STEPS,
} from '../../../../lib/aiLesson/course/firstRunJourney';
import type { LearningGoal, JourneyStep, FirstRunState } from '../../../../lib/aiLesson/course/firstRunJourney';
import { createVocabProgressRepository } from '../../../../lib/aiLesson/course/vocabProgress';
import { createVocabSpacedReviewRepository } from '../../../../lib/aiLesson/course/vocabSpacedReview';
import { defaultLearningClock } from '../../../../lib/aiLesson/course/learningClock';
import { LearnerRecovery } from './LearnerRecovery';
import { createJourneyTaskRepository } from '../../../../lib/aiLesson/course/journeyTaskContract';
import type { JourneyResultSnapshot } from '../../../../lib/aiLesson/course/journeyTaskContract';

interface Props {
  t: AiCourseDict;
  /** 検証用サンドボックスで動作中（UIに明示・§13） */
  sandbox?: boolean;
  /** 短い確認（既存の開始診断）へ進む */
  onStartCheck: () => void;
  /** 最初の練習（既存の今日のことば）へ進む */
  onStartPractice: () => void;
  /** ホームへ */
  onHome: () => void;
  /** 完了時（通常ホームへ自然に移行・§12） */
  onComplete: () => void;
}

/** 進捗表示（§5・色だけに依存せず番号とステップ名を出す・読み上げ対応） */
const StepProgress = ({ t, step }: { t: AiCourseDict; step: JourneyStep }) => {
  const tv = t.vocab;
  const idx = stepIndexOf(step);
  return (
    <div className="mb-3">
      <p className="text-[11px] font-bold text-indigo-700">{tv.frStepLabel(idx, TOTAL_STEPS)}・{tv.frSteps[step]}</p>
      <ol className="flex gap-1 mt-1" aria-label={tv.frStepLabel(idx, TOTAL_STEPS)}>
        {JOURNEY_STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined}
            className={`h-1.5 flex-1 rounded-full ${i < idx ? 'bg-indigo-500' : 'bg-gray-200'}`}>
            <span className="sr-only">{tv.frSteps[s]}{s === step ? '（現在）' : ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default function FirstRunJourney({ t, sandbox, onStartCheck, onStartPractice, onHome, onComplete }: Props) {
  const tv = t.vocab;
  const repo = useMemo(() => {
    const progress = createVocabProgressRepository(window.sessionStorage);
    const schedule = createVocabSpacedReviewRepository(window.sessionStorage, defaultLearningClock);
    return createFirstRunRepository(window.sessionStorage, progress, schedule);
  }, []);
  // Journeyと診断・練習の往復契約（2E-1.12 §4）
  const taskRepo = useMemo(() => createJourneyTaskRepository(window.sessionStorage), []);
  // 保存後に再読込するための状態（stateへJourneyの内容を持たず、常にRepositoryを正とする）
  const [loaded, setLoaded] = useState(() => repo.load());
  useEffect(() => { trackCourseOnce('start_ai_course_first_run'); }, []);

  const state: FirstRunState = loaded.state;
  const step: JourneyStep = loaded.record?.step ?? 'goal';
  const goal = loaded.record?.goal ?? null;
  const refresh = () => setLoaded(repo.load());   // イベントハンドラ内でのみ呼ぶ

  // 壊れた/非互換の保存データ: 初回状態だけ作り直す（学習記録は消さない・§7）
  if (state === 'corrupted_onboarding' || state === 'incompatible_schema') {
    return (
      <LearnerRecovery t={t} kind="corrupted" onHome={onHome}
        onResetOnboarding={() => { repo.resetOnboardingOnly(); refresh(); }} />
    );
  }

  const goalReason = (g: LearningGoal | null): string => {
    if (g === 'jlpt_n3') return tv.frReasonN3;
    if (g === 'daily_conversation') return tv.frReasonDaily;
    return tv.frReasonBasic;
  };

  // 進行中タスクの復帰（診断・練習の途中でJourneyへ戻ってきた場合・§9）
  const contract = taskRepo.get();
  const resumable = contract && (contract.activeTaskStatus === 'in_progress' || contract.activeTaskStatus === 'interrupted')
    ? contract : null;
  const snapshot: JourneyResultSnapshot | null = contract?.completionSnapshot ?? null;
  const startTask = (type: 'diagnostic' | 'practice', go: () => void) => {
    taskRepo.startTask({
      journeyId: loaded.record?.startedAt ?? 'journey',
      taskType: type, taskId: `${type}-${Date.now().toString(36)}`,
      returnStep: type === 'diagnostic' ? 'practice' : 'done',
    });
    go();
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {sandbox && (
        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
          {tv.frSandboxBadge}
        </p>
      )}
      <StepProgress t={t} step={step} />
      {loaded.saveFailed && <p role="alert" className="text-[11px] text-orange-700 mb-2">{tv.recSaveFailed}</p>}
      {/* 中断からの復帰（§9・完了処理は再実行しない） */}
      {resumable && (
        <div role="status" className="bg-indigo-50 rounded-xl p-3 mb-3">
          <p className="text-sm font-bold text-gray-900 mb-2">
            {resumable.activeTaskType === 'diagnostic' ? tv.frResumeCheck : tv.frResumePractice}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button"
              onClick={() => (resumable.activeTaskType === 'diagnostic' ? onStartCheck() : onStartPractice())}
              className="flex-1 min-h-10 px-3 text-xs font-bold text-white bg-indigo-600 rounded-xl">{tv.frResumeCta}</button>
            <button type="button" onClick={() => { taskRepo.markInterrupted(); onHome(); }}
              className="flex-1 min-h-10 px-3 text-xs text-gray-600 border border-gray-200 rounded-xl">{tv.frResumeHome}</button>
          </div>
        </div>
      )}

      {step === 'goal' && (
        <>
          <h2 className="text-base font-bold text-gray-900 mb-1">{tv.frGoalHeading}</h2>
          <p className="text-xs text-gray-500 mb-3">{tv.frGoalNote}</p>
          <fieldset className="space-y-2">
            <legend className="sr-only">{tv.frGoalHeading}</legend>
            {LEARNING_GOALS.map((g) => (
              <ActionButton key={g} variant="choice" fullWidth selected={goal === g}
                onClick={() => { repo.setGoal(g); trackCourse('complete_ai_course_first_run', { step: 'goal', goal: g }); refresh(); }}>
                <span className="flex-1 text-left">{tv.frGoals[g]}</span>
              </ActionButton>
            ))}
          </fieldset>
        </>
      )}

      {step === 'check' && (
        <>
          <h2 className="text-base font-bold text-gray-900 mb-1">{tv.frCheckHeading}</h2>
          <p className="text-xs text-gray-600 mb-4">{tv.frCheckNote}</p>
          <ActionButton variant="primary" fullWidth
            onClick={() => { trackCourse('start_ai_course_first_run', { step: 'check' }); startTask('diagnostic', onStartCheck); }}>
            {tv.frCheckStart}
          </ActionButton>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={() => { repo.goBack(); refresh(); }}
              className="flex-1 min-h-10 px-3 text-xs text-gray-600 border border-gray-200 rounded-xl">{tv.frBack}</button>
            <button type="button" onClick={() => { repo.completeCheck(); refresh(); }}
              className="flex-1 min-h-10 px-3 text-xs text-indigo-700 border border-indigo-100 rounded-xl">{tv.frNext}</button>
          </div>
        </>
      )}

      {step === 'practice' && (
        <>
          <h2 className="text-base font-bold text-gray-900 mb-1">{tv.frPracticeHeading}</h2>
          <p className="text-xs text-gray-600 mb-4">{goalReason(goal)}</p>
          <ActionButton variant="primary" fullWidth
            onClick={() => { repo.completePractice(); refresh(); trackCourse('start_ai_course_first_run', { step: 'practice' }); startTask('practice', onStartPractice); }}>
            {tv.frPracticeStart}
          </ActionButton>
          <button type="button" onClick={() => { repo.goBack(); refresh(); }}
            className="w-full min-h-10 mt-2 px-3 text-xs text-gray-600 border border-gray-200 rounded-xl">{tv.frBack}</button>
        </>
      )}

      {step === 'done' && (
        <>
          <h2 className="text-base font-bold text-gray-900 mb-1" tabIndex={-1}>{tv.frDoneHeading}</h2>
          {/* 実際に確定した結果だけを表示。取得できなかった値は0と断定しない（§8） */}
          {snapshot && (
            <ul className="text-sm text-gray-700 space-y-1 mb-3">
              {snapshot.checkedCount !== null && <li>・{tv.frResultChecked(snapshot.checkedCount)}</li>}
              {snapshot.independentCount !== null && <li>・{tv.frResultIndependent(snapshot.independentCount)}</li>}
              {snapshot.supportedCount !== null && <li>・{tv.frResultSupported(snapshot.supportedCount)}</li>}
              {snapshot.needsReviewCount !== null && <li>・{tv.frResultNeedsReview(snapshot.needsReviewCount)}</li>}
              {snapshot.partial && <li className="text-xs text-gray-500">{tv.frResultPartial}</li>}
            </ul>
          )}
          {/* 新規利用者へ復習の仕組みを一文で（定着は断定しない・§4） */}
          <p className="text-sm text-gray-700 mb-4">{tv.frReviewExplain}</p>
          <ActionButton variant="primary" fullWidth
            onClick={() => { repo.complete(); taskRepo.clear(); trackCourse('complete_ai_course_first_run', { step: 'done' }); onComplete(); }}>
            {tv.frGoHome}
          </ActionButton>
        </>
      )}
    </div>
  );
}
