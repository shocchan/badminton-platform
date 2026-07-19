// AI日本語コース（完成版）オーケストレーター: /:lang/ai-course
// 認証 → 初回診断 → 学習ホーム → レッスン（音声/テキスト）→ レポート → ホーム
// ＋ ロードマップ / 履歴 / 設定。進捗は Supabase（RLS）、オフライン時は localStorage。

import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../contexts/LanguageContext';
import { useLessonFocus } from '../../contexts/LessonFocusContext';
import { aiCourseI18n } from '../../locales/aiCourse';
import { getSession, onAuthChange, signOut } from '../../lib/aiLesson/course/courseAuth';
import { courseRepository } from '../../lib/aiLesson/course/courseRepository';
import { deriveInitialLearner } from '../../lib/aiLesson/course/courseDiagnosis';
import type { DiagnosisAnswers } from '../../lib/aiLesson/course/courseDiagnosis';
import {
  buildLessonPlan, updateMasteryState, adjustDifficulty, selectNextMission, missionById,
} from '../../lib/aiLesson/course/courseEngine';
import { learnerStats, weekStats, estimateSessionCost } from '../../lib/aiLesson/course/courseStats';
import { calcLessonXp } from '../../lib/aiLesson/course/courseLesson';
import { COURSE_DIAGNOSIS_MIN_SESSIONS } from '../../lib/aiLesson/course/courseConfig';
import { getUsageLimits, getTodayUsage, remainingSessionsToday } from '../../lib/aiLesson/course/courseUsage';
import type {
  CourseSessionRecord, FeedbackInput, ItemProgress, Learner, LessonPlan, LessonReport,
} from '../../lib/aiLesson/course/types';
import { CourseLogin } from '../../components/ai-course/CourseLogin';
import { CourseHearing } from '../../components/ai-course/CourseHearing';
import { CourseHome } from '../../components/ai-course/CourseHome';
import { CourseRoadmap } from '../../components/ai-course/CourseRoadmap';
import { CourseHistory } from '../../components/ai-course/CourseHistory';
import { CourseVoiceLesson } from '../../components/ai-course/CourseVoiceLesson';
import type { VoiceLessonResult } from '../../components/ai-course/CourseVoiceLesson';
import { CourseTextLesson } from '../../components/ai-course/CourseTextLesson';
import { CourseReport } from '../../components/ai-course/CourseReport';
import type { CourseReportData } from '../../components/ai-course/CourseReport';

type Step = 'loading' | 'login' | 'hearing' | 'home' | 'lesson' | 'report' | 'roadmap' | 'history' | 'settings';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const DEMO_CODE = (import.meta.env.VITE_AI_LESSON_DEMO_CODE as string | undefined) ?? '';

/** レポートをEdge Functionで生成（失敗時はローカルの簡易レポート） */
const generateReport = async (
  targetExpression: string, themeJa: string, detectedUsage: string,
  utterances: { speaker: string; transcript: string }[],
): Promise<{ report: LessonReport; fromAi: boolean }> => {
  const localFallback: LessonReport = {
    todaySummaryJa: `今日は「${targetExpression}」を練習しました。`,
    todaySummaryZh: `今天练习了「${targetExpression}」。`,
    achievements: [detectedUsage === 'self' ? '自分の力で使えました' : detectedUsage === 'hint' ? 'ヒントを使って言えました' : '意味を確認しました'],
    corrections: [], naturalPhrases: [],
    targetUsage: (detectedUsage === 'self' || detectedUsage === 'hint' ? detectedUsage : 'none'),
    encouragementJa: 'よくがんばりました。次も続けましょう！',
  };
  if (!SUPA_URL || utterances.filter((u) => u.speaker === 'student').length === 0) return { report: localFallback, fromAi: false };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-lesson-report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: DEMO_CODE, targetExpression, themeJa, detectedUsage, utterances }),
    });
    if (!res.ok) return { report: localFallback, fromAi: false };
    const data = await res.json();
    return data?.report ? { report: data.report as LessonReport, fromAi: true } : { report: localFallback, fromAi: false };
  } catch {
    return { report: localFallback, fromAi: false };
  }
};

export default function AiCoursePage() {
  const { lang } = useLanguage();
  const t = aiCourseI18n[lang === 'zh' ? 'zh' : 'ja'];

  const [step, setStep] = useState<Step>('loading');
  const [learner, setLearner] = useState<Learner | null>(null);
  const [progress, setProgress] = useState<ItemProgress[]>([]);
  const [sessions, setSessions] = useState<CourseSessionRecord[]>([]);
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [remaining, setRemaining] = useState(5);
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [report, setReport] = useState<CourseReportData | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hearingBusy, setHearingBusy] = useState(false);
  const [hasResume, setHasResume] = useState(false);

  const { setFocused } = useLessonFocus();
  useEffect(() => { setFocused(step === 'lesson'); return () => setFocused(false); }, [step, setFocused]);

  // データ読込
  const loadAll = useCallback(async () => {
    const user = await getSession();
    if (!user) { setStep('login'); return; }
    await courseRepository.flushPending();
    const l = await courseRepository.getLearner();
    if (!l) { setStep('hearing'); return; }
    const [prog, sess, lim] = await Promise.all([
      courseRepository.listProgress(), courseRepository.listRecentSessions(50), getUsageLimits(),
    ]);
    const usage = await getTodayUsage(l.id);
    setLearner(l); setProgress(prog); setSessions(sess);
    setRemaining(remainingSessionsToday(lim, usage));
    setPlan(buildLessonPlan(l, prog));
    setHasResume(courseRepository.loadResume<unknown>() !== null);
    setStep('home');
  }, []);

  // 初回ロードは1tick遅らせ、effect内の同期setStateを避ける
  useEffect(() => {
    const id = setTimeout(() => { void loadAll(); }, 0);
    const off = onAuthChange((u) => { if (!u) setStep('login'); });
    return () => { clearTimeout(id); off(); };
  }, [loadAll]);

  // 初回診断 → learner作成
  const handleHearing = async (answers: DiagnosisAnswers, displayName: string) => {
    setHearingBusy(true);
    const init = deriveInitialLearner(answers);
    const created = await courseRepository.createLearner({
      displayName: displayName || 'Andy', preferredLanguage: lang === 'zh' ? 'zh' : 'ja',
      estimatedLevel: init.estimatedLevel, difficultyLevel: init.difficultyLevel,
      currentWeek: init.currentWeek, hearing: answers as unknown as Record<string, unknown>, settings: init.settings,
    });
    setHearingBusy(false);
    if (created) await loadAll();
  };

  const startLesson = (m: 'voice' | 'text') => {
    if (!learner || !plan || remaining <= 0 || !learner.isActive) return;
    setMode(m);
    courseRepository.saveResume({ missionId: plan.main.mission.id, kind: plan.main.kind, at: Date.now() });
    setHasResume(false);
    // Supabaseにセッション作成（IDを保持）
    void courseRepository.createSession(learner.id, {
      missionId: plan.main.mission.id, mode: m, lessonKind: plan.main.kind, difficulty: learner.difficultyLevel,
      startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 0, completionStatus: 'in_progress',
      endReason: null, targetExpression: plan.main.mission.targetExpression, targetUsed: false,
      targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false, errorCode: null,
      estimatedCostUsd: 0, report: null,
    }).then((id) => setActiveSessionId(id));
    setStep('lesson');
  };

  // レッスン完了 → 状態更新・保存・レポート生成
  const handleLessonComplete = async (result: VoiceLessonResult) => {
    if (!learner || !plan) return;
    const mainStep = plan.main;
    const mission = mainStep.mission;
    const isReview = mainStep.kind !== 'new';
    const reviewSucceeded = result.usage === 'self' || (result.usage === 'hint' && !mainStep.hideTarget);

    // 進捗更新（新規/復習）
    const prev = progress.find((p) => p.itemId === mission.id) ?? null;
    const updated = updateMasteryState(prev, mission.id, { kind: mainStep.kind, usage: result.usage, succeeded: reviewSucceeded });
    await courseRepository.upsertProgress(learner.id, updated);
    // ウォームアップ復習があれば、それも更新
    if (plan.review) {
      const rPrev = progress.find((p) => p.itemId === plan.review!.mission.id) ?? null;
      const rUpdated = updateMasteryState(rPrev, plan.review.mission.id, { kind: plan.review.kind, usage: 'hint', succeeded: true });
      await courseRepository.upsertProgress(learner.id, rUpdated);
    }

    // セッション確定＋発話保存＋利用量記録
    const cost = estimateSessionCost(result.durationSeconds);
    if (activeSessionId) {
      await courseRepository.finalizeSession(activeSessionId, {
        endedAt: new Date().toISOString(), durationSeconds: result.durationSeconds,
        completionStatus: result.completionStatus, endReason: result.endReason,
        targetUsed: result.targetUsed, targetUsedIndependently: result.targetUsedIndependently,
        chineseSupportUsed: result.chineseSupportUsed, estimatedCostUsd: cost,
      }, result.utterances, learner.id);
    }
    await courseRepository.recordUsage(learner.id, result.durationSeconds, cost);

    // 難易度調整（直近の完了セッション）
    const recent = [{ ...(activeSessionId ? {} : {}), completionStatus: result.completionStatus, lessonKind: mainStep.kind, targetUsed: result.targetUsed, targetUsedIndependently: result.targetUsedIndependently } as CourseSessionRecord, ...sessions];
    const adj = adjustDifficulty(learner.difficultyLevel, recent);
    if (adj.changed) await courseRepository.updateLearner({ difficultyLevel: adj.level });

    // 週の進行（現在の週が全て学習開始済みなら次の週へ）
    const freshProgress = [...progress.filter((p) => p.itemId !== updated.itemId), updated];
    const weekMissions = missionsInWeek(learner.currentWeek);
    const weekDone = weekMissions.every((mm) => freshProgress.some((p) => p.itemId === mm.id));
    if (weekDone && learner.currentWeek < 12) await courseRepository.updateLearner({ currentWeek: learner.currentWeek + 1 });

    // レポート生成（AI or フォールバック）
    const { report: rep, fromAi } = await generateReport(
      mission.targetExpression, mission.titleJa, result.usage,
      result.utterances.filter((u) => u.speaker !== 'system').map((u) => ({ speaker: u.speaker, transcript: u.transcript })),
    );
    if (activeSessionId) await courseRepository.finalizeSession(activeSessionId, { report: rep }, [], learner.id);

    const stats = learnerStats(sessions, freshProgress);
    const xp = calcLessonXp(result.usage, isReview, reviewSucceeded, Math.max(stats.streak, 1));
    const nextMission = selectNextMission(learner, freshProgress);
    courseRepository.clearResume();

    setReport({
      mission, report: rep, masteryState: updated.masteryState, nextReviewISO: updated.nextReviewAt,
      nextMissionLabel: nextMission?.targetExpression ?? null, xpEarned: xp.earned, xpBreakdown: xp.breakdown,
      weekSessions: stats.weekSessions + 1, weeklyTarget: learner.settings.weeklyTarget, fromAi,
    });
    setStep('report');
  };

  const handleFeedback = async (fb: FeedbackInput) => {
    if (!learner) return;
    await courseRepository.saveFeedback(learner.id, activeSessionId, fb);
    // フィードバックで難易度を微調整（明示的な「難しい/簡単」）
    if (fb.difficultyRating === 'too_hard' && learner.difficultyLevel > 1) await courseRepository.updateLearner({ difficultyLevel: learner.difficultyLevel - 1 });
    if (fb.difficultyRating === 'too_easy' && learner.difficultyLevel < 5) await courseRepository.updateLearner({ difficultyLevel: learner.difficultyLevel + 1 });
  };

  const backHome = () => { void loadAll(); };

  // ── レンダリング ──
  if (step === 'loading') return <Shell><div className="py-16 text-center text-gray-500">{t.common.loading}</div></Shell>;
  if (step === 'login') return <Shell><CourseLogin t={t} onLoggedIn={() => void loadAll()} /></Shell>;
  if (step === 'hearing') return <Shell><CourseHearing t={t} onComplete={handleHearing} busy={hearingBusy} /></Shell>;

  if (!learner) return <Shell><div className="py-16 text-center text-gray-500">{t.common.loading}</div></Shell>;

  const stats = learnerStats(sessions, progress);
  const reviewsDue = progress.filter((p) => p.nextReviewAt && p.nextReviewAt <= new Date().toISOString().slice(0, 10) && p.reviewStage !== 'none').length;

  if (step === 'lesson' && plan) {
    return mode === 'voice'
      ? <CourseVoiceLesson t={t} learner={learner} step={plan.main} onComplete={handleLessonComplete} onSwitchToText={() => setMode('text')} onExit={backHome} />
      : <CourseTextLesson t={t} step={plan.main} onComplete={handleLessonComplete} onExit={backHome} />;
  }
  if (step === 'report' && report) {
    return <Shell><CourseReport t={t} data={report} onFeedback={handleFeedback} onBackHome={backHome}
      onAgain={() => { if (remaining > 1) startLesson(mode); }} canAgain={remaining > 1 && learner.isActive} /></Shell>;
  }
  if (step === 'roadmap') {
    const ws = weekStats(progress);
    const est = sessions.length < COURSE_DIAGNOSIS_MIN_SESSIONS
      ? { mode: 'diagnosing' as const, remaining: COURSE_DIAGNOSIS_MIN_SESSIONS - sessions.length }
      : (() => {
        const remainingMissions = 60 - progress.length;
        const wk = Math.max(learner.settings.weeklyTarget, 1);
        return { mode: 'ready' as const, minWeeks: Math.ceil(remainingMissions / wk), maxWeeks: Math.ceil((remainingMissions * 1.5) / wk) };
      })();
    return <Shell><CourseRoadmap t={t} weeks={ws} currentWeek={learner.currentWeek} nextMission={selectNextMission(learner, progress)} estimate={est} onBack={() => setStep('home')} /></Shell>;
  }
  if (step === 'history') return <Shell><CourseHistory t={t} sessions={sessions} onBack={() => setStep('home')} /></Shell>;
  if (step === 'settings') return <Shell><SettingsView t={t} onLogout={async () => { await signOut(); setStep('login'); }} onBack={() => setStep('home')} /></Shell>;

  return (
    <Shell>
      <CourseHome
        t={t} learner={learner} plan={plan} stats={stats}
        reviewsDue={reviewsDue}
        reviewsOverdue={progress.filter((p) => p.nextReviewAt && p.nextReviewAt < new Date().toISOString().slice(0, 10) && p.reviewStage !== 'none').length}
        remainingToday={remaining} hasResume={hasResume}
        onStart={startLesson}
        onResume={() => { setHasResume(false); startLesson(mode); }}
        onDiscardResume={() => { courseRepository.clearResume(); setHasResume(false); }}
        onRoadmap={() => setStep('roadmap')} onHistory={() => setStep('history')} onSettings={() => setStep('settings')}
      />
    </Shell>
  );
}

const missionsInWeek = (week: number) => missionById(`w${String(week).padStart(2, '0')}m1`) ? [1, 2, 3, 4, 5].map((o) => missionById(`w${String(week).padStart(2, '0')}m${o}`)!).filter(Boolean) : [];

const Shell = ({ children }: { children: React.ReactNode }) => {
  const { lang } = useLanguage();
  const t = aiCourseI18n[lang === 'zh' ? 'zh' : 'ja'];
  return (
    <>
      <Helmet><title>{t.brand} | kawabado</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      {children}
    </>
  );
};

const SettingsView = ({ t, onLogout, onBack }: { t: typeof aiCourseI18n['ja']; onLogout: () => void; onBack: () => void }) => (
  <div className="max-w-md mx-auto px-4 py-6">
    <button type="button" onClick={onBack} className="min-h-11 px-2 -ml-1 text-sm text-gray-500 mb-4">← {t.roadmap.back}</button>
    <p className="text-[11px] text-gray-400 leading-relaxed mb-4">{t.positioning}</p>
    <button type="button" onClick={onLogout} className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50">{t.login.logout}</button>
  </div>
);
