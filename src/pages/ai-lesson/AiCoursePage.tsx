// AI日本語コース（完成版）オーケストレーター: /:lang/ai-course
// 認証 → 初回診断 → 学習ホーム → レッスン（音声/テキスト）→ レポート → ホーム
// ＋ ロードマップ / 履歴 / 設定。進捗は Supabase（RLS）、オフライン時は localStorage。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../contexts/LanguageContext';
import { useLessonFocus } from '../../contexts/LessonFocusContext';
import { aiCourseI18n } from '../../locales/aiCourse';
import type { AiCourseDict } from '../../locales/aiCourse';
import { getSession, onAuthChange, signOut, getAccessToken } from '../../lib/aiLesson/course/courseAuth';
import { courseRepository } from '../../lib/aiLesson/course/courseRepository';
import { deriveInitialLearner } from '../../lib/aiLesson/course/courseDiagnosis';
import type { DiagnosisAnswers } from '../../lib/aiLesson/course/courseDiagnosis';
import {
  buildLessonPlan, updateMasteryState, adjustDifficulty, selectNextMission, missionById, courseEndDateISO,
} from '../../lib/aiLesson/course/courseEngine';
import { learnerStats, weekStats, estimateSessionCost } from '../../lib/aiLesson/course/courseStats';
import { computeSpeechMetrics, buildGrowthSnapshot, dueSnapshotTrigger, calculateSpeakingGrowth } from '../../lib/aiLesson/course/courseGrowth';
import type { GrowthMetrics, GrowthSnapshot } from '../../lib/aiLesson/course/courseGrowth';
import { latestRepresentative, buildBeforeAfter } from '../../lib/aiLesson/course/courseBeforeAfter';
import type { BeforeAfter } from '../../lib/aiLesson/course/courseBeforeAfter';
import { currentCanDos, canDosThisWeek, nextAbility, stageOfMastery, weekLevelCanDo } from '../../lib/aiLesson/course/courseCanDo';
import type { AchievedCanDo } from '../../lib/aiLesson/course/courseCanDo';
import { buildJourney } from '../../lib/aiLesson/course/courseJourney';
import type { JourneyPlace } from '../../lib/aiLesson/course/courseJourney';
import { otherLang, swapCourseLocaleInPath } from '../../lib/aiLesson/course/courseLanguage';
import { GrowthOverview } from '../../components/ai-course/GrowthOverview';
import { calcLessonXp } from '../../lib/aiLesson/course/courseLesson';
import { COURSE_DIAGNOSIS_MIN_SESSIONS } from '../../lib/aiLesson/course/courseConfig';
import { getUsageLimits, getTodayUsage, remainingSessionsToday } from '../../lib/aiLesson/course/courseUsage';
import { trackCourse, trackCourseOnce } from '../../lib/aiLesson/course/courseAnalytics';
import { buildResumeFromUtterances } from '../../lib/aiLesson/course/courseTextResume';
import type { ResumedTextLesson } from '../../lib/aiLesson/course/courseTextResume';
import { needsHearing } from '../../lib/aiLesson/course/courseFlow';
import type {
  CourseSessionRecord, FeedbackInput, ItemProgress, Learner, LessonPlan, LessonReport,
} from '../../lib/aiLesson/course/types';
import { CourseHeader } from '../../components/ai-course/CourseHeader';
import type { CourseNavKey } from '../../components/ai-course/CourseHeader';
import { CourseLogin } from '../../components/ai-course/CourseLogin';
import { CourseOnboarding } from '../../components/ai-course/CourseOnboarding';
import { CourseSettings } from '../../components/ai-course/CourseSettings';
import { CourseHearing } from '../../components/ai-course/CourseHearing';
import { CourseHome } from '../../components/ai-course/CourseHome';
import { CourseLightPractice } from '../../components/ai-course/CourseLightPractice';
import { CourseMyExpressions } from '../../components/ai-course/CourseMyExpressions';
import { CourseNotebook } from '../../components/ai-course/CourseNotebook';
import { buildLightSession } from '../../lib/aiLesson/course/courseLightPractice';
import { CourseRoadmap } from '../../components/ai-course/CourseRoadmap';
import { CourseHistory } from '../../components/ai-course/CourseHistory';
import { CourseVoiceLesson } from '../../components/ai-course/CourseVoiceLesson';
import type { VoiceLessonResult } from '../../components/ai-course/CourseVoiceLesson';
import { CourseTextLesson } from '../../components/ai-course/CourseTextLesson';
import { CourseReport } from '../../components/ai-course/CourseReport';
import type { CourseReportData } from '../../components/ai-course/CourseReport';
import { CourseReviewNote } from '../../components/ai-course/CourseReviewNote';
import type { SelfEval } from '../../components/ai-course/CourseReviewNote';
import { buildReviewNote } from '../../lib/aiLesson/course/courseReviewNote';
import type { ReviewNote } from '../../lib/aiLesson/course/courseReviewNote';
import type { ReviewItem } from '../../lib/aiLesson/course/courseReviewPlan';
import { isReviewKind } from '../../lib/aiLesson/course/courseEngine';
import { CoursePreview } from '../../components/ai-course/CoursePreview';
import { CourseChapterList } from '../../components/ai-course/CourseChapterList';
import { N2GrammarLazy } from '../../components/ai-course/N2GrammarLazy';
import { missionAccessState, missingPrerequisites } from '../../lib/aiLesson/course/coursePreview';
import type { Mission } from '../../lib/aiLesson/course/types';

type Step = 'loading' | 'login' | 'hearing' | 'guide' | 'home' | 'lesson' | 'report' | 'growth' | 'roadmap' | 'history' | 'settings' | 'reviewNote' | 'preview' | 'chapters' | 'n2grammar' | 'light' | 'expressions' | 'notebook';

/** 利用開始案内を見終わったか（端末ごと） */
const GUIDE_SEEN_KEY = 'kawabado.aiCourse.v1.guideSeen';
const hasSeenGuide = (): boolean => {
  try { return localStorage.getItem(GUIDE_SEEN_KEY) === '1'; } catch { return false; }
};
const markGuideSeen = (): void => {
  try { localStorage.setItem(GUIDE_SEEN_KEY, '1'); } catch { /* private mode */ }
};

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

/** 今日のローカル日付 YYYY-MM-DD（module scope＝render純度ルールの対象外） */
const todayLocalISO = (): string => new Date().toISOString().slice(0, 10);
/** 現在時刻 ISO（module scope＝render純度ルールの対象外） */
const nowISO = (): string => new Date().toISOString();

/**
 * レポートをEdge Functionで生成（失敗時はローカルの簡易レポート）。
 * sessionId を渡すとサーバー側で本人確認＋保存＋二重生成防止が働く。
 */
const generateReport = async (
  targetExpression: string, themeJa: string, detectedUsage: string,
  utterances: { speaker: string; transcript: string }[],
  sessionId: string | null,
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
    const accessToken = await getAccessToken();
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-lesson-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ sessionId, targetExpression, themeJa, detectedUsage, utterances }),
    });
    if (!res.ok) return { report: localFallback, fromAi: false };
    const data = await res.json();
    return data?.report ? { report: data.report as LessonReport, fromAi: true } : { report: localFallback, fromAi: false };
  } catch {
    return { report: localFallback, fromAi: false };
  }
};

export default function AiCoursePage() {
  const { lang: urlLang } = useLanguage();
  // 表示言語は in-memory state。切替時に navigate しない（remount＝状態喪失を避ける）。
  // 初期値はURL（AIコースは常に /ja/ or /zh/）を優先。
  const [uiLang, setUiLang] = useState<'ja' | 'zh'>(urlLang === 'zh' ? 'zh' : 'ja');
  const lang = uiLang;
  const t = aiCourseI18n[uiLang];

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
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  // 別端末で進行中のセッション（エラーではなく復旧選択肢を出す・§B）
  const [recovery, setRecovery] = useState<CourseSessionRecord | null>(null);
  const [pendingMode, setPendingMode] = useState<'voice' | 'text'>('voice');
  const [textResume, setTextResume] = useState<ResumedTextLesson | null>(null);
  const [guideMode, setGuideMode] = useState<'first' | 'review'>('first');
  const [growthData, setGrowthData] = useState<{
    metrics: GrowthMetrics; journey: JourneyPlace[]; canDos: AchievedCanDo[];
    beforeAfter: BeforeAfter | null; snapshots: GrowthSnapshot[];
  } | null>(null);
  // 「今回の復習」ノート（Feature 5）。currentNote=直近レッスンのノート、activeNote=表示中
  const [currentNote, setCurrentNote] = useState<ReviewNote | null>(null);
  const [activeNote, setActiveNote] = useState<ReviewNote | null>(null);
  const [noteReturnStep, setNoteReturnStep] = useState<Step>('home');
  const [reviewedNoteIds, setReviewedNoteIds] = useState<Set<string>>(new Set());
  const noteUttsRef = useRef<{ transcript: string; sessionId: string }[]>([]);
  // テキスト予習（全章・鍵付き章の閲覧）
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [previewReturnStep, setPreviewReturnStep] = useState<Step>('chapters');

  const { setFocused } = useLessonFocus();
  useEffect(() => { setFocused(step === 'lesson'); return () => setFocused(false); }, [step, setFocused]);

  // 画面計測（個人情報なし。gtag未存在なら何もしない）
  useEffect(() => {
    if (step === 'home') trackCourseOnce('view_ai_course_home');
    else if (step === 'n2grammar') trackCourse('open_ai_course_n2');
    else if (step === 'history') trackCourse('open_ai_course_review');
    else if (step === 'notebook') trackCourse('view_ai_course_notebook'); // 名前・本文は送らない
  }, [step]);

  // 表示言語を反映（navigateせず、URLの locale segment だけ replaceState で同期）
  useEffect(() => { try { document.documentElement.lang = uiLang; } catch { /* noop */ } }, [uiLang]);

  const applyLang = useCallback((next: 'ja' | 'zh') => {
    setUiLang(next);
    try {
      document.documentElement.lang = next;
      const path = swapCourseLocaleInPath(window.location.pathname, next);
      window.history.replaceState(window.history.state, '', path + window.location.search + window.location.hash);
    } catch { /* noop */ }
  }, []);

  /** 言語をワンタップで切り替える（learner設定へ保存し複数端末で同期） */
  const toggleLang = useCallback(() => {
    const next = otherLang(uiLang);
    applyLang(next);
    setLearner((prev) => {
      if (!prev) return prev;
      const nextSettings = { ...prev.settings, uiLanguage: next };
      void courseRepository.updateLearner({ settings: nextSettings });
      return { ...prev, settings: nextSettings };
    });
  }, [uiLang, applyLang]);

  // データ読込
  const loadAll = useCallback(async () => {
    const user = await getSession();
    if (!user) { setStep('login'); return; }
    await courseRepository.flushPending();
    const l = await courseRepository.getLearner();
    // 新規（learner未作成）は8問ヒアリングへ。既存learnerは飛ばす
    if (needsHearing(l)) { setStep('hearing'); return; }
    const [prog, sess, lim] = await Promise.all([
      courseRepository.listProgress(), courseRepository.listRecentSessions(50), getUsageLimits(),
    ]);
    const usage = await getTodayUsage(l.id);
    setLearner(l); setProgress(prog); setSessions(sess);
    setRemaining(remainingSessionsToday(lim, usage));
    setPlan(buildLessonPlan(l, prog));
    setHasResume(courseRepository.loadResume<unknown>() !== null);
    // 保存済みの表示言語があれば反映（複数端末で同じ言語に）。無ければURL言語のまま。
    const saved = l.settings.uiLanguage;
    if ((saved === 'ja' || saved === 'zh') && saved !== uiLang) applyLang(saved);
    // 初回だけ利用開始案内を挟む。以降はホームへ直行する
    setStep(hasSeenGuide() ? 'home' : 'guide');
  }, [uiLang, applyLang]);

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

  /**
   * レッスン開始。上限判定はサーバー（ai_start_session）が正。
   * クライアント側の remaining は表示用で、ここでは開始可否の根拠にしない。
   */
  const startLesson = async (m: 'voice' | 'text', planArg: LessonPlan | null = plan) => {
    if (!learner || !planArg || starting) return;
    setStarting(true);
    setStartError('');
    const r = await courseRepository.createSession(learner.id, {
      missionId: planArg.main.mission.id, mode: m, lessonKind: planArg.main.kind, difficulty: learner.difficultyLevel,
      startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 0, completionStatus: 'in_progress',
      endReason: null, targetExpression: planArg.main.mission.targetExpression, targetUsed: false,
      targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false, errorCode: null,
      estimatedCostUsd: 0, report: null,
    });
    setStarting(false);
    if (!r.ok) {
      // 進行中セッション → 赤エラーではなく復旧選択肢（この端末で再開/新規/キャンセル）
      if (r.code === 'session_already_active') {
        const act = await courseRepository.getActiveSession();
        if (act) { setPendingMode(m); setRecovery(act); setStartError(''); return; }
      }
      setStartError(t.limits[r.code ?? 'unknown'] ?? t.limits.unknown);
      // 上限に当たったら表示も実際の状態に合わせる（日次・月次いずれも今は開始できない）
      if (r.code === 'daily_session_limit' || r.code === 'daily_time_limit'
        || r.code === 'monthly_session_limit' || r.code === 'monthly_time_limit') setRemaining(0);
      return;
    }
    setTextResume(null);
    setMode(m);
    setActiveSessionId(r.sessionId ?? null);
    setRemaining(r.remainingSessions ?? 0);
    trackCourse('start_ai_course_lesson', { mode: m, kind: planArg.main.kind, week: learner.currentWeek });
    courseRepository.saveResume({ missionId: planArg.main.mission.id, kind: planArg.main.kind, at: Date.now() });
    setHasResume(false);
    setStep('lesson');
  };

  /** 進行中セッションのミッションから復元用の LessonPlan を組む */
  const planForSession = (s: CourseSessionRecord): LessonPlan | null => {
    const mission = missionById(s.missionId);
    if (!mission) return null;
    const hide = ['review_day7', 'review_day30', 'weekly_practice'].includes(s.lessonKind);
    return { main: { mission, kind: s.lessonKind, hideTarget: hide }, review: null, reasonKey: 'resume' };
  };

  /** 【B-3】この端末で続きを再開（本人所有の in_progress セッション） */
  const resumeActiveSession = async () => {
    if (!recovery || !learner) return;
    const freshPlan = planForSession(recovery);
    if (!freshPlan) { await discardActiveAndStartNew(); return; } // 不明ミッション（想定外）は新規へ
    trackCourse('resume_ai_course_other_device', { mode: recovery.mode });
    if (recovery.mode === 'text') {
      // テキスト: 同じ sessionId を引き継ぎ、保存済み発話から履歴・ターン・出題済み質問を復元
      const utts = await courseRepository.listSessionUtterances(recovery.id);
      setTextResume(buildResumeFromUtterances(utts));
      setPlan(freshPlan);
      setActiveSessionId(recovery.id);
      setMode('text');
      setRecovery(null);
      setStep('lesson');
      return;
    }
    // 音声: 古いWebRTC接続は引き継げないため、旧セッションを中断扱いにして
    // 同じミッションを新しい音声セッションとして開始（二重接続・二重課金なし）
    await courseRepository.finalizeSession(recovery.id, {
      endedAt: nowISO(), completionStatus: 'interrupted', endReason: 'superseded-resume',
    }, [], learner.id);
    setRecovery(null);
    await startLesson('voice', freshPlan);
  };

  /** 【B-4】前のレッスンを終了して新しく始める（完了扱いにしない＝XP・復習登録なし） */
  const discardActiveAndStartNew = async () => {
    if (!recovery || !learner) return;
    trackCourse('abandon_ai_course_previous', { mode: recovery.mode });
    await courseRepository.finalizeSession(recovery.id, {
      endedAt: nowISO(), completionStatus: 'interrupted', endReason: 'superseded-new',
    }, [], learner.id);
    setRecovery(null);
    await startLesson(pendingMode);
  };

  /**
   * 次の章へすぐ進む（Feature 3）。完了後、最新の進捗から次のミッションを組み、直接開始する。
   * 進行（新しい章）と間隔反復（復習予定）は分離: 復習の nextReviewAt は消さない。
   * サーバーの ai_start_session が上限・同時開始を判定するため、二重セッションにはならない。
   */
  const advanceToNext = async () => {
    if (!learner || starting) return;
    const prog = await courseRepository.listProgress();
    setProgress(prog);
    const fresh = buildLessonPlan(learner, prog);
    setPlan(fresh);
    await startLesson(mode, fresh);
  };

  /** 「今回の復習」ノートを開く（直近レッスン or 過去セッション） */
  const openNoteForSession = (sessionId: string, utts: { transcript: string; sessionId: string }[]) => {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const mission = missionById(s.missionId);
    if (!mission) return;
    const prog = progress.find((p) => p.itemId === s.missionId);
    setActiveNote(buildReviewNote({
      sessionId: s.id, dateISO: s.startedAt.slice(0, 10), mission, report: s.report,
      myUtterances: utts.filter((u) => u.sessionId === s.id).map((u) => u.transcript),
      isReview: isReviewKind(s.lessonKind), nextReviewISO: prog?.nextReviewAt ?? null,
    }));
    setStep('reviewNote');
  };

  /** 学習記録カード（ReviewItem）から復習ノートを開く。過去発話を必要時に読み込む */
  const openNoteForReviewItem = async (item: ReviewItem) => {
    if (!learner) return;
    setNoteReturnStep('history');
    if (noteUttsRef.current.length === 0) {
      noteUttsRef.current = await courseRepository.loadStudentUtterances(learner.id, 200);
    }
    if (item.sessionId) { openNoteForSession(item.sessionId, noteUttsRef.current); return; }
    // セッション未紐付け（レア）: Mission だけで最小ノートを組む（実発話・レポートなし）
    const mission = missionById(item.missionId);
    if (!mission) return;
    setActiveNote(buildReviewNote({
      sessionId: `m-${item.missionId}`, dateISO: item.dateISO ?? todayLocalISO(), mission, report: null,
      myUtterances: [], isReview: item.reasons.includes('overdue') || item.reasons.includes('due'),
      nextReviewISO: item.nextReviewISO,
    }));
    setStep('reviewNote');
  };

  /** テキスト予習を開く（全章・鍵付き含む）。進捗・mastery・review は変更しない */
  const openPreview = (mission: Mission, from: Step) => {
    setActiveMission(mission);
    setPreviewReturnStep(from);
    setStep('preview');
  };

  /** 学習済み章の復習ノートを開く（予習ページから） */
  const openNoteForMission = async (missionId: string) => {
    if (!learner) return;
    const s = sessions
      .filter((x) => x.missionId === missionId && x.completionStatus === 'completed')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!s) return;
    setNoteReturnStep('preview');
    if (noteUttsRef.current.length === 0) noteUttsRef.current = await courseRepository.loadStudentUtterances(learner.id, 200);
    openNoteForSession(s.id, noteUttsRef.current);
  };

  /**
   * 30秒確認の自己評価を記録（非破壊）。定着は断定しない:
   * - remembered/hesitated: lastPracticedAt を今日へ（接触記録のみ・ステージ昇格なし）
   * - again: settings.practiceAgainIds へ追加（「もう一度」タブに出す）
   */
  const handleSelfEval = (note: ReviewNote, kind: SelfEval) => {
    if (!learner) return;
    setReviewedNoteIds((prev) => new Set(prev).add(note.sessionId));
    const prog = progress.find((p) => p.itemId === note.missionId);
    if (prog) void courseRepository.upsertProgress(learner.id, { ...prog, lastPracticedAt: nowISO() });
    if (kind === 'again') {
      const ids = Array.from(new Set([...(learner.settings.practiceAgainIds ?? []), note.missionId]));
      const nextSettings = { ...learner.settings, practiceAgainIds: ids };
      setLearner({ ...learner, settings: nextSettings });
      void courseRepository.updateLearner({ settings: nextSettings });
    }
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
    const courseEnd = courseEndDateISO(learner);
    const updated = updateMasteryState(prev, mission.id, { kind: mainStep.kind, usage: result.usage, succeeded: reviewSucceeded }, new Date(), courseEnd);
    await courseRepository.upsertProgress(learner.id, updated);
    // ウォームアップ復習があれば、それも更新
    if (plan.review) {
      const rPrev = progress.find((p) => p.itemId === plan.review!.mission.id) ?? null;
      const rUpdated = updateMasteryState(rPrev, plan.review.mission.id, { kind: plan.review.kind, usage: 'hint', succeeded: true }, new Date(), courseEnd);
      await courseRepository.upsertProgress(learner.id, rUpdated);
    }

    // セッション確定＋発話保存＋利用量記録（音声コスト＋中国語補助字幕の翻訳コスト）
    const cost = estimateSessionCost(result.durationSeconds) + (result.translateCostUsd ?? 0);
    // 成長計算の材料（発話メトリクス）を実発話から算出して保存
    const speechMetrics = computeSpeechMetrics(result.utterances);
    if (activeSessionId) {
      await courseRepository.finalizeSession(activeSessionId, {
        endedAt: new Date().toISOString(), durationSeconds: result.durationSeconds,
        completionStatus: result.completionStatus, endReason: result.endReason,
        targetUsed: result.targetUsed, targetUsedIndependently: result.targetUsedIndependently,
        chineseSupportUsed: result.chineseSupportUsed, estimatedCostUsd: cost,
        speechMetrics,
        // ターン毎チェックポイント保存済み（テキスト会話）なら一括insertしない（重複保存防止）
      }, result.utterancesAlreadySaved ? [] : result.utterances, learner.id);
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
      activeSessionId,
    );
    // AI生成時は Edge Function 側が保存済み。ローカル版のときだけここで保存する
    // （AIレポートを後からローカル版で上書きして内容が消えるのを防ぐ）
    if (activeSessionId && !fromAi) {
      await courseRepository.finalizeSession(activeSessionId, { report: rep }, [], learner.id);
    }

    const stats = learnerStats(sessions, freshProgress);
    const xp = calcLessonXp(result.usage, isReview, reviewSucceeded, Math.max(stats.streak, 1));
    const nextMission = selectNextMission(learner, freshProgress);
    courseRepository.clearResume();

    // レポート先頭の「今日できるようになったこと」（誠実表示）＋次の能力
    const todayCanDo = {
      category: mission.category,
      expression: mission.targetExpression,
      stage: stageOfMastery(updated.masteryState),
      isReview,
      reviewSucceeded,
    };
    const nextAbilityDef = nextAbility(nextMission?.id ?? null);

    setReport({
      mission, report: rep, masteryState: updated.masteryState, nextReviewISO: updated.nextReviewAt,
      nextMissionLabel: nextMission?.targetExpression ?? null, xpEarned: xp.earned, xpBreakdown: xp.breakdown,
      weekSessions: stats.weekSessions + 1, weeklyTarget: learner.settings.weeklyTarget, fromAi,
      durationSeconds: result.durationSeconds,
      todayCanDo, nextAbility: nextAbilityDef,
    });
    // 「今回の復習」ノートを既存データから生成（音声を使わず後で見返せる・Feature 5）
    setCurrentNote(buildReviewNote({
      sessionId: activeSessionId ?? `local-${mission.id}`,
      dateISO: todayLocalISO(),
      mission, report: rep,
      myUtterances: result.utterances.filter((u) => u.speaker === 'student').map((u) => u.transcript),
      isReview, nextReviewISO: updated.nextReviewAt,
    }));
    setStep('report');
    trackCourse('complete_ai_course_lesson', {
      kind: mainStep.kind, usage: result.usage, duration_seconds: result.durationSeconds,
      status: result.completionStatus,
    });

    // 成長スナップショット（マイルストーン到達時に1回だけ・非同期・失敗しても学習に影響しない）
    void maybeCaptureSnapshot(learner, freshProgress);
  };

  /** マイルストーン到達時に成長スナップショットを撮る（append-only） */
  const maybeCaptureSnapshot = async (l: Learner, freshProgress: ItemProgress[]) => {
    try {
      const freshSessions = await courseRepository.listRecentSessions(80);
      const completed = freshSessions.filter((s) => s.completionStatus === 'completed').length;
      const existing = new Set((await courseRepository.listGrowthSnapshots(l.id)).map((s) => s.triggerKind));
      const trigger = dueSnapshotTrigger(completed, l.currentWeek, existing);
      if (!trigger) return;
      const samples = await courseRepository.loadStudentUtterances(l.id);
      const canDoIds = currentCanDos(freshProgress).map((c) => c.id);
      const nm = selectNextMission(l, freshProgress);
      const snap = buildGrowthSnapshot({
        trigger, sessions: freshSessions, progresses: freshProgress,
        canDoIds, nextAbilityId: nm ? missionById(nm.id)?.category ?? null : null,
        representativeUtterance: latestRepresentative(samples),
      });
      await courseRepository.saveGrowthSnapshot(l.id, snap);
    } catch { /* 成長スナップショットの失敗は無視 */ }
  };

  const handleFeedback = async (fb: FeedbackInput) => {
    if (!learner) return;
    await courseRepository.saveFeedback(learner.id, activeSessionId, fb);
    // フィードバックで難易度を微調整（明示的な「難しい/簡単」）
    if (fb.difficultyRating === 'too_hard' && learner.difficultyLevel > 1) await courseRepository.updateLearner({ difficultyLevel: learner.difficultyLevel - 1 });
    if (fb.difficultyRating === 'too_easy' && learner.difficultyLevel < 5) await courseRepository.updateLearner({ difficultyLevel: learner.difficultyLevel + 1 });
  };

  const backHome = () => { void loadAll(); };

  /** 成長画面を開く: 実発話を読み、成長データを組み立ててから遷移 */
  const openGrowth = async () => {
    if (!learner) return;
    setGrowthData(null);
    setStep('growth');
    const [samples, snapshots] = await Promise.all([
      courseRepository.loadStudentUtterances(learner.id),
      courseRepository.listGrowthSnapshots(learner.id),
    ]);
    // 自力使用フラグを Before/After サンプルへ付与（該当セッションの targetUsedIndependently）
    const selfSessions = new Set(sessions.filter((s) => s.targetUsedIndependently).map((s) => s.id));
    const enriched = samples.map((s) => ({ ...s, usedIndependently: selfSessions.has(s.sessionId) }));
    setGrowthData({
      metrics: calculateSpeakingGrowth(sessions, progress),
      journey: buildJourney(progress, learner.currentWeek),
      canDos: currentCanDos(progress),
      beforeAfter: buildBeforeAfter(enriched),
      snapshots,
    });
  };

  // ── レンダリング ──
  if (step === 'loading') return <Shell t={t} lang={uiLang} onToggleLang={toggleLang}><div className="py-16 text-center text-gray-500">{t.common.loading}</div></Shell>;
  if (step === 'login') return <Shell t={t} lang={uiLang} onToggleLang={toggleLang}><CourseLogin t={t} onLoggedIn={() => void loadAll()} /></Shell>;
  if (step === 'hearing') return <Shell t={t} lang={uiLang} onToggleLang={toggleLang}><CourseHearing t={t} onComplete={handleHearing} busy={hearingBusy} /></Shell>;

  if (!learner) return <Shell t={t} lang={uiLang} onToggleLang={toggleLang}><div className="py-16 text-center text-gray-500">{t.common.loading}</div></Shell>;

  const stats = learnerStats(sessions, progress);
  const reviewsDue = progress.filter((p) => p.nextReviewAt && p.nextReviewAt <= new Date().toISOString().slice(0, 10) && p.reviewStage !== 'none').length;

  const handleLogout = async () => { await signOut(); setStep('login'); };
  const goNav = (k: CourseNavKey) => { if (k === 'growth') { void openGrowth(); } else { setStep(k); } };
  const navFor = (current: CourseNavKey) => ({
    current,
    onNavigate: goNav,
    onLogout: () => { void handleLogout(); },
  });

  if (step === 'lesson' && plan) {
    return mode === 'voice'
      ? <CourseVoiceLesson t={t} learner={learner} step={plan.main} sessionId={activeSessionId} lang={uiLang} onToggleLang={toggleLang} onComplete={handleLessonComplete} onSwitchToText={() => setMode('text')} onExit={backHome} />
      : <CourseTextLesson t={t} step={plan.main} sessionId={activeSessionId} learner={learner} resume={textResume} onComplete={handleLessonComplete} onExit={backHome} />;
  }
  if (step === 'report' && report) {
    return <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('home')}><CourseReport t={t} data={report} onFeedback={handleFeedback} onBackHome={backHome}
      onAgain={() => { void startLesson(mode); }} canAgain={remaining > 0 && learner.isActive}
      onNextChapter={() => { void advanceToNext(); }} canNext={remaining > 0 && learner.isActive}
      onSeeReviewNote={currentNote ? () => { setActiveNote(currentNote); setNoteReturnStep('report'); setStep('reviewNote'); } : undefined}
      onSeeNotebook={activeSessionId ? () => { trackCourse('open_notebook_from_completion'); setStep('notebook'); } : undefined}
      learnerName={learner.displayName} /></Shell>;
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
    return <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('roadmap')}><CourseRoadmap t={t} weeks={ws} currentWeek={learner.currentWeek} nextMission={selectNextMission(learner, progress)} progress={progress} estimate={est} onSeeChapters={() => setStep('chapters')} onOpenPreview={(m) => openPreview(m, 'roadmap')} onSeeN2Grammar={() => setStep('n2grammar')} onBack={() => setStep('home')} /></Shell>;
  }
  if (step === 'history') return <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('history')}><CourseHistory t={t} sessions={sessions} progress={progress} practiceAgainIds={learner.settings.practiceAgainIds ?? []} onOpenNote={(item) => { void openNoteForReviewItem(item); }} onOpenExpressions={() => setStep('expressions')} onOpenNotebook={() => setStep('notebook')} onBack={() => setStep('home')} /></Shell>;
  if (step === 'growth') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('growth')}>
        {growthData ? (
          <GrowthOverview
            t={t} metrics={growthData.metrics} journey={growthData.journey} currentWeek={learner.currentWeek}
            canDos={growthData.canDos} beforeAfter={growthData.beforeAfter} snapshots={growthData.snapshots}
            onBack={() => setStep('home')}
          />
        ) : (
          <div className="py-16 text-center text-gray-500">{t.common.loading}</div>
        )}
      </Shell>
    );
  }
  if (step === 'reviewNote' && activeNote) {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('history')}>
        <CourseReviewNote t={t} note={activeNote} selfEvaluated={reviewedNoteIds.has(activeNote.sessionId)}
          onSelfEval={(kind) => handleSelfEval(activeNote, kind)}
          onBack={() => setStep(noteReturnStep)} />
      </Shell>
    );
  }
  if (step === 'light') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('home')}>
        <CourseLightPractice t={t} progress={progress}
          practiceAgainIds={learner.settings.practiceAgainIds ?? []} onExit={() => setStep('home')} />
      </Shell>
    );
  }
  if (step === 'notebook') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('history')}>
        <CourseNotebook t={t} learner={learner} sessions={sessions} progress={progress}
          onStartToday={() => setStep('home')} onBack={() => setStep('history')} />
      </Shell>
    );
  }
  if (step === 'expressions') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('history')}>
        <CourseMyExpressions t={t} progress={progress}
          practiceAgainIds={learner.settings.practiceAgainIds ?? []} onBack={() => setStep('history')} />
      </Shell>
    );
  }
  if (step === 'chapters') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('roadmap')}>
        <CourseChapterList t={t} progress={progress}
          onOpenPreview={(m) => openPreview(m, 'chapters')} onBack={() => setStep('roadmap')} />
      </Shell>
    );
  }
  if (step === 'n2grammar') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('roadmap')}>
        <N2GrammarLazy t={t} onBack={() => setStep('roadmap')} learnerId={learner.id} />
      </Shell>
    );
  }
  if (step === 'preview' && activeMission) {
    const access = missionAccessState(activeMission, progress);
    const prereqTitles = missingPrerequisites(activeMission, progress)
      .map((id) => { const m = missionById(id); return m ? (uiLang === 'zh' ? m.titleZh : m.titleJa) : ''; })
      .filter(Boolean);
    const isCurrentNext = access === 'current' && plan?.main.mission.id === activeMission.id;
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('roadmap')}>
        <CoursePreview t={t} mission={activeMission} access={access} prereqTitles={prereqTitles}
          estMinutes={activeMission.estimatedMinutes}
          onStartVoice={isCurrentNext && remaining > 0 && learner.isActive ? () => { void startLesson(mode); } : undefined}
          onSeeReviewNote={access === 'completed' ? () => { void openNoteForMission(activeMission.id); } : undefined}
          onBack={() => setStep(previewReturnStep)} />
      </Shell>
    );
  }
  if (step === 'guide') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('home')}>
        <CourseOnboarding
          t={t} mode={guideMode}
          onDone={() => { markGuideSeen(); setStep(guideMode === 'first' ? 'home' : 'settings'); }}
        />
      </Shell>
    );
  }
  if (step === 'settings') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('settings')}>
        <CourseSettings
          t={t} learner={learner}
          onSaveNickname={async (name) => {
            const prev = learner.displayName;
            setLearner({ ...learner, displayName: name });
            try {
              await courseRepository.updateLearner({ displayName: name });
              trackCourse('save_ai_course_nickname'); // 本文は送らない
              return true;
            } catch {
              setLearner({ ...learner, displayName: prev });
              return false;
            }
          }}
          onShowGuide={() => { setGuideMode('review'); setStep('guide'); }}
          onSaveSettings={(patch) => {
            const nextSettings = { ...learner.settings, ...patch };
            setLearner({ ...learner, settings: nextSettings });
            void courseRepository.updateLearner({ settings: nextSettings });
          }}
          onLogout={() => { void handleLogout(); }}
          onBack={() => setStep('home')}
        />
      </Shell>
    );
  }

  return (
    <Shell t={t} lang={uiLang} onToggleLang={toggleLang} nav={navFor('home')}>
      <CourseHome
        t={t} learner={learner} plan={plan} stats={stats}
        reviewsDue={reviewsDue}
        reviewsOverdue={progress.filter((p) => p.nextReviewAt && p.nextReviewAt < new Date().toISOString().slice(0, 10) && p.reviewStage !== 'none').length}
        remainingToday={remaining} hasResume={hasResume}
        weekLearningDays={(() => {
          const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
          return new Set(sessions.filter((s2) => new Date(s2.startedAt) >= monday).map((s2) => s2.startedAt.slice(0, 10))).size;
        })()}
        hasLightMaterial={buildLightSession(progress, learner.settings.practiceAgainIds ?? [], new Date().toISOString().slice(0, 10)).length > 0}
        onStartLight={() => setStep('light')}
        sessions={sessions}
        onOpenNotebook={() => setStep('notebook')}
        onUpdateAvatarSettings={(patch) => {
          const nextSettings = { ...learner.settings, ...patch };
          setLearner({ ...learner, settings: nextSettings });
          void courseRepository.updateLearner({ settings: nextSettings });
        }}
        starting={starting} startError={startError}
        recovery={recovery ? { mode: recovery.mode } : null}
        onResumeActive={() => { void resumeActiveSession(); }}
        onDiscardActive={() => { void discardActiveAndStartNew(); }}
        onCancelRecovery={() => setRecovery(null)}
        currentStageLabel={weekLevelCanDo(learner.currentWeek, t.locale === 'zh' ? 'zh' : 'ja')}
        thisWeekCanDos={canDosThisWeek(progress, learner.currentWeek)}
        nextAbility={nextAbility(selectNextMission(learner, progress)?.id ?? null)}
        journey={buildJourney(progress, learner.currentWeek)}
        onStart={(m) => { void startLesson(m); }}
        onResume={() => { setHasResume(false); void startLesson(mode); }}
        onDiscardResume={() => { courseRepository.clearResume(); setHasResume(false); }}
        onSeeGrowth={() => { void openGrowth(); }}
        onSeePastNotes={() => { setStep('history'); }}
        onPreview={() => { if (plan) openPreview(plan.main.mission, 'home'); }}
      />
    </Shell>
  );
}

const missionsInWeek = (week: number) => missionById(`w${String(week).padStart(2, '0')}m1`) ? [1, 2, 3, 4, 5].map((o) => missionById(`w${String(week).padStart(2, '0')}m${o}`)!).filter(Boolean) : [];

/** AIコース共通の外枠。通常会員ヘッダーではなく AIコース専用ヘッダーを出す（App.tsx 側で通常ヘッダーは非表示） */
const Shell = ({ children, nav, t, lang, onToggleLang }: {
  children: React.ReactNode;
  /** ログイン後のみナビを出す。未ログイン・初回診断中は undefined */
  nav?: { current: CourseNavKey; onNavigate: (k: CourseNavKey) => void; onLogout: () => void };
  t: AiCourseDict;
  lang: 'ja' | 'zh';
  onToggleLang: () => void;
}) => {
  return (
    <>
      <Helmet>
        <html lang={lang} />
        <title>{t.brand} | kawabado</title>
        <meta name="robots" content="noindex, nofollow" />
        {/* ホーム画面追加用。AIコースのページでだけ読み込むので、
            サイト全体のPWA挙動（現状なし）には影響しない */}
        <link rel="manifest" href={lang === 'zh' ? '/ai-course-zh.webmanifest' : '/ai-course.webmanifest'} />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={lang === 'zh' ? 'AI日语' : 'AI日本語'} />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </Helmet>
      <CourseHeader
        t={t} showNav={!!nav} current={nav?.current}
        onNavigate={nav?.onNavigate} onLogout={nav?.onLogout}
        lang={lang} onToggleLang={onToggleLang}
      />
      {children}
    </>
  );
};

