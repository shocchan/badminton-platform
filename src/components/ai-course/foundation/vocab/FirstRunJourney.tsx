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
import { JourneyStepper, ResultBars, ReviewTimeline } from './LearningIllustrations';
import { STEP_ILLUSTRATIONS } from './stepIllustrationMap';
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

/**
 * 進捗表示（§5・CEO指示: 見やすく・視線が左から右へ流れるように）。
 * 番号／ラベル／接続線で「今どこか」「あといくつか」を一目で示す。
 * 済み=チェック・現在=塗り＋リング・未来=薄い丸 と形も変え、色だけに依存しない。
 */
const StepProgress = ({ t, step }: { t: AiCourseDict; step: JourneyStep }) => {
  const tv = t.vocab;
  const idx = stepIndexOf(step);
  return (
    <div className="mb-1">
      <JourneyStepper
        steps={JOURNEY_STEPS.map((s) => ({ key: s, label: tv.frSteps[s] }))}
        currentIndex={idx - 1}
        ariaLabel={tv.frStepLabel(idx, TOTAL_STEPS)} />
      <p className="sr-only">{tv.frStepLabel(idx, TOTAL_STEPS)}・{tv.frSteps[step]}</p>
    </div>
  );
};

/** 各ステップの見出し（イラスト＋大きな見出しで視線の起点を作る） */
const StepHeading = ({ t, step, title, body }: {
  t: AiCourseDict; step: JourneyStep; title: string; body?: string;
}) => {
  const Illustration = STEP_ILLUSTRATIONS[step];
  return (
    <div className="flex items-center gap-3 mb-3">
      <Illustration label={t.vocab.frSteps[step]} />
      <div className="min-w-0">
        <h2 className="text-base font-bold text-gray-900 leading-snug" tabIndex={-1}>{title}</h2>
        {body && <p className="text-xs text-gray-600 mt-1">{body}</p>}
      </div>
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
  // Step4の復習タイムライン用（読み取りのみ・予定は作らない）
  const scheduleRepo = useMemo(
    () => createVocabSpacedReviewRepository(window.sessionStorage, defaultLearningClock), []);
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
  // 次回予定の件数（Step4のみ・読み取り専用）
  const upcoming = step === 'done'
    ? scheduleRepo.getDueSummary().upcoming
    : { tomorrow: 0, inThreeDays: 0, inSevenDays: 0 };
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
          <StepHeading t={t} step="goal" title={tv.frGoalHeading} body={tv.frGoalNote} />
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
          <StepHeading t={t} step="check" title={tv.frCheckHeading} body={tv.frCheckNote} />
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
          <StepHeading t={t} step="practice" title={tv.frPracticeHeading} body={goalReason(goal)} />
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
          <StepHeading t={t} step="done" title={tv.frDoneHeading} />
          {/* 実際に確定した結果だけを表示。取得できなかった値は0と断定しない（§8）。
              数値テキストと棒グラフの両方を出し、図が読めなくても内容が分かるようにする。 */}
          {snapshot && (
            <div className="bg-gray-50 rounded-xl p-3 mb-3">
              <p className="text-[11px] font-bold text-gray-500 mb-2">{tv.frResultChartLabel}</p>
              <ul className="text-sm text-gray-700 space-y-1">
                {snapshot.checkedCount !== null && <li>・{tv.frResultChecked(snapshot.checkedCount)}</li>}
                {snapshot.independentCount !== null && <li>・{tv.frResultIndependent(snapshot.independentCount)}</li>}
                {snapshot.supportedCount !== null && <li>・{tv.frResultSupported(snapshot.supportedCount)}</li>}
                {snapshot.needsReviewCount !== null && <li>・{tv.frResultNeedsReview(snapshot.needsReviewCount)}</li>}
                {snapshot.partial && <li className="text-xs text-gray-500">{tv.frResultPartial}</li>}
              </ul>
              <div className="mt-2">
                <ResultBars total={snapshot.checkedCount ?? 0} bars={[
                  { label: tv.frBarIndependent, count: snapshot.independentCount ?? 0, tone: 'good' },
                  { label: tv.frBarSupported, count: snapshot.supportedCount ?? 0, tone: 'support' },
                  { label: tv.frBarReview, count: snapshot.needsReviewCount ?? 0, tone: 'review' },
                ]} />
              </div>
            </div>
          )}
          {/* 新規利用者へ復習の仕組みを一文で（定着は断定しない・§4）＋時間軸の図 */}
          <p className="text-sm text-gray-700">{tv.frReviewExplain}</p>
          <div className="mb-4">
            <p className="sr-only">{tv.frTimelineLabel}</p>
            <ReviewTimeline todayLabel={tv.frTimelineToday} points={[
              { label: tv.frTimelineTomorrow, count: upcoming.tomorrow, emphasis: true },
              { label: tv.frTimelineThree, count: upcoming.inThreeDays },
              { label: tv.frTimelineSeven, count: upcoming.inSevenDays },
            ]} />
          </div>
          <ActionButton variant="primary" fullWidth
            onClick={() => { repo.complete(); taskRepo.clear(); trackCourse('complete_ai_course_first_run', { step: 'done' }); onComplete(); }}>
            {tv.frGoHome}
          </ActionButton>
        </>
      )}
    </div>
  );
}
