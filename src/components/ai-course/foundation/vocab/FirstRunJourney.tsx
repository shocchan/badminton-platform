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
import { planJourneyRepair } from '../../../../lib/aiLesson/course/journeyRecovery';
import { isQuizBreakdownComplete } from '../../../../lib/aiLesson/course/learnerResultModel';
import { classifySchema } from '../../../../lib/aiLesson/course/journeySchemaVersion';
import { JOURNEY_TASK_KEY } from '../../../../lib/aiLesson/course/courseStorageRegistry';
import { CONTRACT_SCHEMA_VERSION, MIGRATABLE_CONTRACT_VERSIONS } from '../../../../lib/aiLesson/course/journeyTaskContract';
import type { StorageLike } from '../../../../lib/aiLesson/course/courseStorageRegistry';
import { JourneyStepper, ResultBars, ReviewTimeline } from './LearningIllustrations';
import { STEP_ILLUSTRATIONS } from './stepIllustrationMap';
import { createJourneyTaskRepository } from '../../../../lib/aiLesson/course/journeyTaskContract';
import type { JourneyResultSnapshot } from '../../../../lib/aiLesson/course/journeyTaskContract';

interface Props {
  t: AiCourseDict;
  /** 検証用サンドボックスで動作中（UIに明示・§13） */
  sandbox?: boolean;
  /** 保存先。sandbox動作中は分離namespaceが渡る（既定は通常のsessionStorage） */
  storage?: StorageLike;
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

/** 各ステップの見出し（イラスト＋大きな見出しで視線の起点を作る）。
 *  絵は装飾（隣の見出しが同じ意味を伝えるため、読み上げを重複させない・§11） */
const StepHeading = ({ step, title, body }: {
  step: JourneyStep; title: string; body?: string;
}) => {
  const Illustration = STEP_ILLUSTRATIONS[step];
  return (
    <div className="flex items-center gap-3 mb-3">
      <Illustration />
      <div className="min-w-0">
        <h2 className="text-base font-bold text-gray-900 leading-snug" tabIndex={-1}>{title}</h2>
        {body && <p className="text-xs text-gray-600 mt-1">{body}</p>}
      </div>
    </div>
  );
};

export default function FirstRunJourney({ t, sandbox, storage, onStartCheck, onStartPractice, onHome, onComplete }: Props) {
  const store: StorageLike = storage ?? window.sessionStorage;
  const tv = t.vocab;
  const repo = useMemo(() => {
    const progress = createVocabProgressRepository(store);
    const schedule = createVocabSpacedReviewRepository(store, defaultLearningClock);
    return createFirstRunRepository(store, progress, schedule);
  }, [store]);
  // Journeyと診断・練習の往復契約（2E-1.12 §4）
  const taskRepo = useMemo(() => createJourneyTaskRepository(store), [store]);
  // Step4の復習タイムライン用（読み取りのみ・予定は作らない）
  const scheduleRepo = useMemo(
    () => createVocabSpacedReviewRepository(store, defaultLearningClock), [store]);
  // 保存後に再読込するための状態（stateへJourneyの内容を持たず、常にRepositoryを正とする）
  const [loaded, setLoaded] = useState(() => repo.load());
  useEffect(() => { trackCourseOnce('start_ai_course_first_run'); }, []);

  const state: FirstRunState = loaded.state;
  const rawStep: JourneyStep = loaded.record?.step ?? 'goal';
  const goal = loaded.record?.goal ?? null;
  const refresh = () => setLoaded(repo.load());   // イベントハンドラ内でのみ呼ぶ

  // 保存データのversion判定（2E-1.15 §7）。判定は一箇所・決定的。
  // 学習進捗と復習予定には触れず、Journey状態だけを対象にする。
  const contractCheck = classifySchema({
    raw: store.getItem(JOURNEY_TASK_KEY),
    currentVersion: CONTRACT_SCHEMA_VERSION,
    migratableVersions: MIGRATABLE_CONTRACT_VERSIONS,
    requiredFields: ['journeyId', 'activeTaskId', 'activeTaskStatus'],
  });

  // 保存データの方が新しい: 上書きせず、読み直しを案内する（自動reloadはしない・§9）
  if (contractCheck.classification === 'newer_than_client') {
    return (
      <LearnerRecovery t={t} kind="version_conflict" onHome={onHome}
        onRetry={() => window.location.reload()}
        labPreview={sandbox} devDetail={`saved v${contractCheck.foundVersion} > client v${CONTRACT_SCHEMA_VERSION}`} />
    );
  }
  // 続き方を判断できない保存データ: 自動で完了扱いにせず、初回Journeyだけ作り直せるようにする
  if (contractCheck.classification === 'incompatible_schema' || contractCheck.classification === 'corrupted_state') {
    return (
      <LearnerRecovery t={t} kind="unreadable_journey" onHome={onHome}
        onResetOnboarding={() => { taskRepo.clear(); repo.resetOnboardingOnly(); refresh(); }}
        labPreview={sandbox} devDetail={`contract: ${contractCheck.classification} (v${contractCheck.foundVersion})`} />
    );
  }

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
  const learner = snapshot?.learnerResult ?? null;
  // 棒グラフは「合計の完全な内訳」のときだけ描く（§6）
  const quizComplete = learner ? isQuizBreakdownComplete(learner) : false;
  // 部分成功Recovery（2E-1.14 §5）: 契約は完了しているのにstepが前、という状態を直す。
  // 判定は保存済みの事実だけから決定的に行い、完了処理・token消費は絶対に再実行しない。
  const repair = planJourneyRepair({
    contract, step: rawStep, journeyCompleted: !!loaded.record?.completedAt,
    currentView: 'firstrun', hasLearningResult: false,
  });
  if (repair.setStep && repair.setStep !== rawStep) {
    // stepだけを安全に修復する（同じ値なら何も書かないので、renderごとに繰り返さない）
    repo.repairStep(repair.setStep);
  }
  // 修復後のstepをその場の表示にも使う。保存だけして画面が1つ前のまま、を防ぐ。
  const step: JourneyStep = repair.setStep ?? rawStep;
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
          <StepHeading step="goal" title={tv.frGoalHeading} body={tv.frGoalNote} />
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
          <StepHeading step="check" title={tv.frCheckHeading} body={tv.frCheckNote} />
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
          <StepHeading step="practice" title={tv.frPracticeHeading} body={goalReason(goal)} />
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
          <StepHeading step="done" title={tv.frDoneHeading} />
          {/* 結果は3つの別々の軸として見せる（2E-1.15 §3-§4）。
              軸A クイズの結果だけが「今日確認したことば」の完全な内訳。
              軸B 本人の感じ方と 軸C これからの予定は、合計の分解ではないので別のカードにする。 */}
          {learner ? (
            <>
              <p className="text-sm text-gray-800 mb-2">{tv.lrChecked(learner.checkedCount)}</p>
              {/* 軸A: 問題の結果（ここだけ棒グラフにしてよい） */}
              <div className="bg-gray-50 rounded-xl p-3 mb-2">
                <p className="text-[11px] font-bold text-gray-500 mb-1.5">{tv.lrQuizHeading}</p>
                <ul className="text-sm text-gray-700 space-y-0.5">
                  <li>・{tv.lrCorrect(learner.correctCount)}</li>
                  {learner.incorrectCount > 0 && <li>・{tv.lrIncorrect(learner.incorrectCount)}</li>}
                  {learner.notAnsweredCount > 0 && <li>・{tv.lrNotAnswered(learner.notAnsweredCount)}</li>}
                </ul>
                {quizComplete && (
                  <div className="mt-2">
                    <ResultBars total={learner.checkedCount} bars={[
                      { label: tv.lrBarCorrect, count: learner.correctCount, tone: 'good' },
                      { label: tv.lrBarIncorrect, count: learner.incorrectCount, tone: 'review' },
                      { label: tv.lrBarNotAnswered, count: learner.notAnsweredCount, tone: 'support' },
                    ]} />
                  </div>
                )}
              </div>
              {/* 軸B: 本人の感じ方（正解の代わりにしない） */}
              {(learner.feltConfidentCount > 0 || learner.feltUnsureCount > 0) && (
                <div className="bg-gray-50 rounded-xl p-3 mb-2">
                  <p className="text-[11px] font-bold text-gray-500 mb-1.5">{tv.lrFeelHeading}</p>
                  <ul className="text-sm text-gray-700 space-y-0.5">
                    {learner.feltConfidentCount > 0 && <li>・{tv.lrConfident(learner.feltConfidentCount)}</li>}
                    {learner.feltUnsureCount > 0 && <li>・{tv.lrUnsure(learner.feltUnsureCount)}</li>}
                  </ul>
                </div>
              )}
              {learner.partial && <p className="text-xs text-gray-500 mb-2">{tv.lrPartial}</p>}
            </>
          ) : snapshot && (
            /* 旧版のsnapshot（学習者向けモデルを持たない）はそのまま数値だけ見せる */
            <ul className="text-sm text-gray-700 space-y-1 mb-3">
              {snapshot.checkedCount !== null && <li>・{tv.frResultChecked(snapshot.checkedCount)}</li>}
              {snapshot.partial && <li className="text-xs text-gray-500">{tv.frResultPartial}</li>}
            </ul>
          )}
          {/* 軸C: これからの予定（合計の分解ではないので独立したカードにする） */}
          {learner && (
            <div className="bg-indigo-50/60 rounded-xl p-3 mb-2">
              <p className="text-[11px] font-bold text-indigo-800 mb-1">{tv.lrNextHeading}</p>
              <p className="text-sm text-gray-800">
                {learner.scheduledForReviewCount > 0
                  ? tv.lrScheduled(learner.scheduledForReviewCount)
                  : tv.lrNoSchedule}
              </p>
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
