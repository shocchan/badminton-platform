// AI日本語コース（完成版）オーケストレーター: /:lang/ai-course
// 認証 → 初回診断 → 学習ホーム → レッスン（音声/テキスト）→ レポート → ホーム
// ＋ ロードマップ / 履歴 / 設定。進捗は Supabase（RLS）、オフライン時は localStorage。

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CourseLoading, CourseChunkLoading } from '../../components/ai-course/CourseLoading';
import { LegalFooterLinks } from './legal/LegalPage';
import { parseLabUrl, buildLabSearch, parseVocabUrl, buildVocabSearch, hasLabPreview } from '../../lib/aiLesson/course/labUrlState';
import WorldHomeShell from '../../components/ai-course/rpg/WorldHomeShell';
import type { VocabUrlView } from '../../lib/aiLesson/course/labUrlState';
import type { LabUrlInput } from '../../lib/aiLesson/course/labUrlState';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../contexts/LanguageContext';
import { useLessonFocus } from '../../contexts/LessonFocusContext';
import { aiCourseI18n } from '../../locales/aiCourse';
import type { AiCourseDict } from '../../locales/aiCourse';
import { getSession, onAuthChange, signOut, getAccessToken } from '../../lib/aiLesson/course/courseAuth';
import { courseRepository } from '../../lib/aiLesson/course/courseRepository';
import { deriveInitialLearner, V2_INVITE_DEFAULT_ANSWERS } from '../../lib/aiLesson/course/courseDiagnosis';
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
import { getUsageLimits, getTodayUsage, remainingSessionsToday } from '../../lib/aiLesson/course/courseUsage';
import { accessTierOf, isMissionLockedByTier } from '../../lib/aiLesson/course/courseWeekMapping';
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
import { CourseNameOnlyHearing } from '../../components/ai-course/CourseNameOnlyHearing';
import { CourseHome } from '../../components/ai-course/CourseHome';
import { CourseLightPractice } from '../../components/ai-course/CourseLightPractice';
import { CourseMyExpressions } from '../../components/ai-course/CourseMyExpressions';
import { CourseNotebook } from '../../components/ai-course/CourseNotebook';
// しくみラボ・ことば図鑑・冒険は lazy chunk（教材・画像manifestをメインbundleへ含めない・§17）
/**
 * 旧コース入口を明示したか（?legacy）。
 * 入口の既定は冒険モードV2（2026-08-17 CEO指摘: 以前は既定が旧コースで、
 * ?v2 を付け忘れた新規が旧8問ヒアリング→ミナモ列島の旧ホームに入ってしまう罠があった。
 * 現役・今後の生徒は全員V2。?v2 は付いていても単に無視される＝過去に配った招待URLはそのまま有効）
 */
const wantsLegacyEntry = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('legacy');

const CourseFoundationLab = lazy(() => import('../../components/ai-course/foundation/FoundationLabShell'));
const VocabularyHubLazy = lazy(() => import('../../components/ai-course/foundation/vocab/VocabularyHub'));
const Chapter1AdventureLazy = lazy(() => import('../../components/ai-course/rpg/Chapter1AdventurePanel'));
const N3AreaPanelLazy = lazy(() => import('../../components/ai-course/n3unit/N3AreaPanel'));
const N2QuestLazy = lazy(() => import('../../components/ai-course/n2quest/N2GrammarQuestPanel'));
// Adventure V2（learner単位flag・adventure-v2 D-004）。flag無効のlearnerには一切ロードされない
const AdvShellLazy = lazy(() => import('../../components/ai-course/adventure/AdvShell'));
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
import { missionAccessState, missingPrerequisites } from '../../lib/aiLesson/course/coursePreview';
import type { Mission } from '../../lib/aiLesson/course/types';
import { LearnerErrorBoundary } from '../../components/ai-course/foundation/vocab/LearnerRecovery';
import { WORLD_AREAS, areaById } from '../../lib/aiLesson/course/rpg/worldAtlas';
import { n3FirstReviewAreaId } from '../../lib/aiLesson/course/rpg/gardenCounts';
import {
  probeUnitProgressSync, createSyncedUnitStorage,
  type FullProbeClient, type UnitSyncMode,
} from '../../lib/aiLesson/course/persistence/syncedUnitStorage';
import { chapterForArea } from '../../lib/aiLesson/course/rpg/chapterRegistry';
import { isChapterCompleted } from '../../lib/aiLesson/course/rpg/adventureState';
import { CHAPTER1_ID as CHAPTER1_ID_FOR_PAGE } from '../../lib/aiLesson/course/rpg/chapter1Data';
import type { SupabaseLike } from '../../lib/aiLesson/course/persistence/supabaseUnitProgressServer';
import type { StoragePort } from '../../lib/aiLesson/course/n3unit/unitRuntime';
import { supabase } from '../../services/supabaseClient';
import { KatariPortIntro } from '../../components/ai-course/rpg/KatariPortIntro';
import { OmoideGardenPanel } from '../../components/ai-course/rpg/OmoideGardenPanel';
import { AdventureRecordCard } from '../../components/ai-course/rpg/AdventureRecordCard';
import { SupportReportButton } from '../../components/ai-course/ops/SupportReportButton';
import { createUnsetSupportAdapter } from '../../lib/aiLesson/course/ops/supportReport';

// support送信先が確定するまでの既定adapter（「受け付けました」と偽らない・§19）
const supportAdapter = createUnsetSupportAdapter();
import { deriveCurrentAreaId, areaNodeStateOf } from '../../lib/aiLesson/course/rpg/worldProgress';
import { TeacherProvider } from '../../components/ai-course/TeacherAvatar';
import type { AdvTeacherId } from '../../lib/aiLesson/course/adventure/advTeacher';
import { applyTeacherName } from '../../lib/aiLesson/course/adventure/advTeacherText';
import { isAdvEnabled, readAdvProfile, setAdvEnabled } from '../../lib/aiLesson/course/adventure/advProfile';

type Step = 'loading' | 'login' | 'hearing' | 'guide' | 'home' | 'lesson' | 'report' | 'growth' | 'roadmap' | 'history' | 'settings' | 'reviewNote' | 'preview' | 'chapters' | 'n2grammar' | 'light' | 'expressions' | 'notebook' | 'lab' | 'vocab' | 'adventure' | 'n3area' | 'conversationIntro' | 'garden';

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
    // 中国語補助（UX-004）。fallbackでも中国語localeのlearnerが成果を読めるようにする
    achievementsZh: [detectedUsage === 'self' ? '靠自己的力量用出来了' : detectedUsage === 'hint' ? '借助提示说出来了' : '确认了意思'],
    encouragementZh: '做得很好。下次也继续吧！',
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
  const baseDict = aiCourseI18n[uiLang];

  const [step, setStep] = useState<Step>('loading');
  /**
   * V2ヘッダーからAdvShellの画面を切り替えるための要求（canon §5）。
   * counterを進めることで「同じ画面をもう一度押した」ときも伝わる。
   */
  const [advRequest, setAdvRequest] = useState<{ view: 'home' | 'map' | 'teacher' | 'redo'; n: number } | null>(null);
  const [advNavKey, setAdvNavKey] = useState<CourseNavKey>('home');
  // V2入口「冒険を始める」の連打ガード（updateLearnerの二重発火を防ぐ）
  const [advEntryBusy, setAdvEntryBusy] = useState(false);
  const [learner, setLearner] = useState<Learner | null>(null);
  // 選んだ先生（未選択は null＝既定の先生）。全画面のアバターと文言をこれに揃える
  const advTeacherId: AdvTeacherId | null = readAdvProfile(learner?.settings)?.teacherId ?? null;
  // 文言中の先生名だけを差し替える（商品名 brand は変えない）
  const t = useMemo(() => applyTeacherName(baseDict, advTeacherId, uiLang), [baseDict, advTeacherId, uiLang]);
  // labPreview（管理者）は内部レビュー画面の表示にのみ使う。
  // 学習機能（ことば図鑑・しくみラボ・冒険）は全learnerが利用できる（FOREST FIRST §5-§6）。
  const labAllowed = hasLabPreview(learner?.adminOverrides);
  const [progress, setProgress] = useState<ItemProgress[]>([]);
  const [sessions, setSessions] = useState<CourseSessionRecord[]>([]);
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [remaining, setRemaining] = useState(5);
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [report, setReport] = useState<CourseReportData | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hearingBusy, setHearingBusy] = useState(false);
  const [hearingError, setHearingError] = useState(false);
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
  // World Map（ミナモ列島）: 開いているエリアと現在地（localStorageから導出・read only）
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  // 開いている章（'adventure' step用）。既定はChapter 1（庭園の再会導線などの後方互換）
  const [adventureChapterId, setAdventureChapterId] = useState<string>(CHAPTER1_ID_FOR_PAGE);
  const [currentAreaId, setCurrentAreaId] = useState<string>(() => deriveCurrentAreaId(window.localStorage));
  // 単元進捗の保存先（H2準備）: ai_course_unit_progress がremoteに存在する時だけ同期つきへ切替。
  // 未適用の現在は probe が false → undefined のまま（N3AreaPanelは従来の端末内保存）。
  const [unitStorage, setUnitStorage] = useState<StoragePort | undefined>(undefined);
  // 保存先の実状態（表示用）。probeが通らない間は local_only のまま＝正直に「この端末」と出す
  const [syncMode, setSyncMode] = useState<UnitSyncMode>('local_only');
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!learner) { if (alive) { setUnitStorage(undefined); setSyncMode('local_only'); } return; }
      // table単体ではなく、列・RLS・RPC・schema versionまで確認してから同期を有効化する
      const probe = await probeUnitProgressSync(supabase as unknown as FullProbeClient, learner.id);
      if (!alive || !probe.enabled) return;
      const synced = createSyncedUnitStorage({
        learnerId: learner.id,
        supabase: supabase as unknown as SupabaseLike,
        localStore: window.localStorage,
      });
      // 前回未送信分を先に流し、残があれば「未送信あり」と表示する
      const flushed = await synced.flushOutbox();
      if (!alive) return;
      setUnitStorage(synced);
      setSyncMode(flushed.remaining > 0 ? 'pending' : 'synced');
    })();
    return () => { alive = false; };
  }, [learner]);

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

  // loadAllのdepsからuiLangを外すためのref（言語切替でinitial-load effectが再発火しstepがhomeへ戻るバグの根本修正）
  const uiLangRef = useRef(uiLang);
  const applyLang = useCallback((next: 'ja' | 'zh') => {
    uiLangRef.current = next;
    setUiLang(next);
    try {
      document.documentElement.lang = next;
      const path = swapCourseLocaleInPath(window.location.pathname, next);
      window.history.replaceState(window.history.state, '', path + window.location.search + window.location.hash);
    } catch { /* noop */ }
  }, []);

  /** ラボの表示位置をURLへ同期（app=1等は維持・回答内容は入れない・§7/§9） */
  const syncLabUrl = useCallback((state: LabUrlInput | null) => {
    try {
      const search = buildLabSearch(window.location.search, state);
      window.history.replaceState(window.history.state, '', window.location.pathname + search + window.location.hash);
    } catch { /* noop */ }
  }, []);

  /** ことば図鑑の表示位置をURLへ同期（§59） */
  const syncVocabUrl = useCallback((state: { view: VocabUrlView; category: string | null; itemId: string | null } | null) => {
    try {
      const search = buildVocabSearch(window.location.search, state);
      window.history.replaceState(window.history.state, '', window.location.pathname + search + window.location.hash);
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
    if ((saved === 'ja' || saved === 'zh') && saved !== uiLangRef.current) applyLang(saved);
    // URLにラボ位置があれば復元（言語切替・リロード・再マウント対応・§7）。
    // labPreviewが無い場合はURLからラボparamsを外してホームへ（教材非表示・attempt非生成・§11）
    const labUrl = parseLabUrl(window.location.search);
    const vocabUrl = parseVocabUrl(window.location.search);
    const allowed = hasLabPreview(l.adminOverrides);
    // 旧コースの必須ガイドは **?legacy 明示の学習者にだけ** 出す。
    // 旧音声コース前提の説明（「N2合格には別の学習が必要」等）が
    // V2で買った商品と正反対で、初回の信頼を壊すため（監査P1）。
    // ※2026-08-17監査P0: 入口既定反転時にここの符号を取り違え、V2全員にguideが出ていた
    if (!hasSeenGuide() && wantsLegacyEntry()) { setStep('guide'); return; }
    if (labUrl.lab && allowed) { setStep('lab'); return; }
    if (vocabUrl.vocab && allowed) { setStep('vocab'); return; }
    if (labUrl.lab) syncLabUrl(null);
    if (vocabUrl.vocab) syncVocabUrl(null);
    setStep('home');
  }, [applyLang, syncLabUrl, syncVocabUrl]);

  // 初回ロードは1tick遅らせ、effect内の同期setStateを避ける
  useEffect(() => {
    const id = setTimeout(() => { void loadAll(); }, 0);
    const off = onAuthChange((u) => { if (!u) setStep('login'); });
    return () => { clearTimeout(id); off(); };
  }, [loadAll]);

  // 初回診断 → learner作成
  const handleHearing = async (answers: DiagnosisAnswers, displayName: string) => {
    setHearingBusy(true);
    setHearingError(false);
    const init = deriveInitialLearner(answers);
    const created = await courseRepository.createLearner({
      displayName: displayName || (lang === 'zh' ? '学习者' : '学習者'), preferredLanguage: lang === 'zh' ? 'zh' : 'ja',
      estimatedLevel: init.estimatedLevel, difficultyLevel: init.difficultyLevel,
      currentWeek: init.currentWeek, hearing: answers as unknown as Record<string, unknown>, settings: init.settings,
    });
    setHearingBusy(false);
    if (created) { await loadAll(); return; }
    // 作成失敗を黙って握りつぶさない（原則15）。権限（signup grant欠落）や通信断で起きる
    setHearingError(true);
  };

  /**
   * レッスン開始。上限判定はサーバー（ai_start_session）が正。
   * クライアント側の remaining は表示用で、ここでは開始可否の根拠にしない。
   */
  const startLesson = async (m: 'voice' | 'text', planArg: LessonPlan | null = plan) => {
    if (!learner || !planArg || starting) return;
    // §24W: starter_12w は第4章以降（内部7週〜）を開始不可（UI非表示だけに依存しない）
    if (isMissionLockedByTier(accessTierOf(learner), planArg.main.mission)) {
      setStartError(t.roadmap.lockedStart);
      return;
    }
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
    // 通信失敗でも成長画面を行き止まりにしない（ローカルで計算できる分は必ず出す・§16）
    const [samples, snapshots] = await Promise.all([
      courseRepository.loadStudentUtterances(learner.id).catch(() => []),
      courseRepository.listGrowthSnapshots(learner.id).catch(() => []),
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
  if (step === 'loading') return <Shell t={t} lang={uiLang} onToggleLang={toggleLang}><CourseLoading t={t} scene="mist" minHeightClass="min-h-[200px]" /></Shell>;
  if (step === 'login') return <Shell t={t} lang={uiLang} onToggleLang={toggleLang}><CourseLogin t={t} onLoggedIn={() => void loadAll()} /></Shell>;
  if (step === 'hearing') {
    // 新規は既定で**名前だけ**聞く（V2入口）。目標・レベル・週頻度は直後の
    // V2オンボーディングで聞くため、旧8問と二重に答えさせない（監査P1）。
    // 旧コースの8問ヒアリングは ?legacy を明示したときだけ
    const v2Invite = !wantsLegacyEntry();
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang}>
        {hearingError && (
          <p role="alert" className="mx-auto mb-2 w-full max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {uiLang === 'zh'
              ? '无法创建账号数据。请检查网络后重试；如果仍然失败，请联系老师（可能是账号权限设置的问题）。'
              : 'アカウントデータを作成できませんでした。通信を確認して再度お試しください。続く場合は先生に連絡してください（権限設定の可能性があります）。'}
          </p>
        )}
        {v2Invite
          ? <CourseNameOnlyHearing lang={uiLang} busy={hearingBusy}
              onComplete={(name) => handleHearing(V2_INVITE_DEFAULT_ANSWERS, name)} />
          : <CourseHearing t={t} onComplete={handleHearing} busy={hearingBusy} />}
      </Shell>
    );
  }

  if (!learner) return <Shell t={t} lang={uiLang} onToggleLang={toggleLang}><CourseLoading t={t} scene="mist" minHeightClass="min-h-[200px]" /></Shell>;

  const stats = learnerStats(sessions, progress);
  const reviewsDue = progress.filter((p) => p.nextReviewAt && p.nextReviewAt <= new Date().toISOString().slice(0, 10) && p.reviewStage !== 'none').length;
  // V2有効の生徒には**全step**でナビを3タブ（今日の冒険/冒険マップ/設定）に絞る（canon §5）。
  // 従来はV2ホームだけv2Modeで、設定・復習・単元などの共有stepでは旧5タブが出ていた
  // （成長・学習記録から旧コース画面へ迷い込める：サマーさんの旧ホーム混乱と同根・2026-08-16修正）
  const advOn = isAdvEnabled(learner.settings);

  const handleLogout = async () => { await signOut(); setStep('login'); };
  const goNav = (k: CourseNavKey) => {
    // V2有効時のナビは「今日の冒険 / 冒険マップ / 設定」だけ。
    // 旧コースの成長・ロードマップ・学習記録（別の進捗モデル）へは飛ばさない（canon §5）
    if (isAdvEnabled(learner?.settings)) {
      if (k === 'home' || k === 'roadmap') {
        const view = k === 'roadmap' ? 'map' : 'home';
        setAdvNavKey(k);
        setAdvRequest((p) => ({ view, n: (p?.n ?? 0) + 1 }));
        setStep('home');
        return;
      }
    }
    if (k === 'growth') { void openGrowth(); return; }
    if (k === 'conversation') {
      // AI会話の主要ナビ入口（§19）: ホームの会話開始カードへ直行
      trackCourse('click_ai_course_conversation_nav');
      setStep('home');
      setTimeout(() => {
        try {
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          document.getElementById('ai-course-conversation-entry')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        } catch { /* noop */ }
      }, 80);
      return;
    }
    if (k === 'lab') {
      trackCourse('click_ai_course_foundation_nav');
      syncVocabUrl(null);
      syncLabUrl({ section: 'today', unit: null, step: null });
      setStep('lab');
      return;
    }
    if (k === 'vocab') {
      trackCourse('click_ai_course_foundation_nav');
      syncLabUrl(null);
      syncVocabUrl({ view: 'top', category: null, itemId: null });
      setStep('vocab');
      return;
    }
    setStep(k);
  };
  const navFor = (current: CourseNavKey) => ({
    current,
    onNavigate: goNav,
    onLogout: () => { void handleLogout(); },
  });

  /** オモイデ庭園（復習の統合入口・§13）。語彙/文法/会話の復習はここから分岐する */
  const openReview = () => setStep('garden');
  /** ことばの3分復習（庭園の中の実復習フロー） */
  const openVocabQuickReview = () => { syncLabUrl(null); syncVocabUrl({ view: 'quickreview', category: null, itemId: null }); setStep('vocab'); };

  /** World Mapのエリア→実機能ルーティング（全kind接続済み・行き止まりなし・§7） */
  const chapterCompleted = (chapterId: string) =>
    isChapterCompleted(chapterId, Date.now(), window.localStorage);

  const openArea = (areaId: string) => {
    const area = areaById(areaId);
    if (!area) return;
    trackCourse('open_ai_course_world_area');
    // 施設エリア（塔・港・庭園）は、その施設を使う意味を伝える導入章を「初回だけ」通す。
    // ロックではない: 章は3〜4分で終わり、Homeの施設カードからは常に機能へ直行できる。
    // ※V2生徒には旧・章アドベンチャーを出さない（2026-08-17 監査P1: 物語はV2の冒険マップが担う）
    if (area.destination.kind !== 'n3area' && !advOn) {
      const ch = chapterForArea(areaId);
      if (ch && !chapterCompleted(ch.chapterId)) {
        setAdventureChapterId(ch.chapterId); setStep('adventure'); return;
      }
    }
    switch (area.destination.kind) {
      case 'n3area': setActiveAreaId(areaId); setStep('n3area'); break;
      case 'n2grammar': setStep('n2grammar'); break;
      // 会話は「カタリ港の旅立ちカード」を経由（場所・相手・目的・所要時間を先に示す・§12）
      case 'conversation': setStep(plan ? 'conversationIntro' : 'home'); break;
      case 'review': openReview(); break;
    }
  };

  if (step === 'lesson' && plan) {
    // 会話が始まる前のエラー（マイク拒否・接続失敗）から戻るときは、予約済みセッションを
    // interruptedで閉じてから戻す。閉じないと以降の「声で会話を始める」が
    // session_already_active で弾かれ続ける（2026-08-16 CEO報告「押しても無反応」の根本原因）
    const abortExit = () => {
      const sid = activeSessionId;
      if (sid) {
        void courseRepository.finalizeSession(sid, {
          endedAt: nowISO(), completionStatus: 'interrupted', endReason: 'error-exit-before-start',
        }, [], learner.id);
      }
      setActiveSessionId(null);
      setStep(plan ? 'conversationIntro' : 'home');
    };
    // レッスンはShellの外（全画面）だが、先生の同一性は保つ必要がある。
    // TeacherProviderを直接巻かないと useTeacher() が既定の翔子先生に落ち、
    // 悠斗先生を選んだ生徒でも**アイコンも音声も翔子のまま**になっていた（2026-08-17 CEO報告）
    return (
      <TeacherProvider teacherId={advTeacherId}>
        {mode === 'voice'
          ? <CourseVoiceLesson t={t} learner={learner} step={plan.main} sessionId={activeSessionId} lang={uiLang} onToggleLang={toggleLang} onComplete={handleLessonComplete} onSwitchToText={() => setMode('text')} onExit={backHome} onAbortExit={abortExit} />
          : <CourseTextLesson t={t} step={plan.main} sessionId={activeSessionId} learner={learner} resume={textResume} onComplete={handleLessonComplete} onExit={backHome} />}
      </TeacherProvider>
    );
  }
  if (step === 'report' && report) {
    // V2（冒険）の生徒には「もう一度」「次の章へ」を出さない（2026-08-17 CEO指摘）。
    // 旧コースの章を連打で先送りでき、①実費のAI会話が上限（1日10回）まで連続実行できる
    // ②「今日はこの4つだけ」のペース設計と矛盾する。V2の会話は今日の冒険の1stepとして
    // 完結し、続きは明日の冒険が用意する（canAgain/canNextの !advOn がその実装）
    return <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}><CourseReport t={t} data={report} onFeedback={handleFeedback} onBackHome={backHome}
      onAgain={() => { void startLesson(mode); }} canAgain={remaining > 0 && learner.isActive && !advOn}
      onNextChapter={() => { void advanceToNext(); }} canNext={remaining > 0 && learner.isActive && !advOn}
      onSeeReviewNote={currentNote ? () => { setActiveNote(currentNote); setNoteReturnStep('report'); setStep('reviewNote'); } : undefined}
      onSeeNotebook={activeSessionId && !advOn ? () => { trackCourse('open_notebook_from_completion'); setStep('notebook'); } : undefined}
      learnerName={learner.displayName}
      worldLineJa={t.katari.fogClearedToday} /></Shell>;
  }
  if (step === 'roadmap') {
    const ws = weekStats(progress);
    return <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('roadmap')} showLab={labAllowed}><CourseRoadmap t={t} weeks={ws} currentWeek={learner.currentWeek} nextMission={selectNextMission(learner, progress)} progress={progress} accessTier={accessTierOf(learner)} doneInCurrentWeek={progress.filter((p) => missionById(p.itemId)?.week === learner.currentWeek).length} onSeeChapters={() => setStep('chapters')} onOpenPreview={(m) => openPreview(m, 'roadmap')} onSeeN2Grammar={() => setStep('n2grammar')} onBack={() => setStep('home')} /></Shell>;
  }
  if (step === 'history') return <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}><CourseHistory t={t} sessions={sessions} progress={progress} practiceAgainIds={learner.settings.practiceAgainIds ?? []} onOpenNote={(item) => { void openNoteForReviewItem(item); }} onOpenExpressions={() => setStep('expressions')} onOpenNotebook={() => setStep('notebook')} onBack={() => setStep('home')} /></Shell>;
  if (step === 'growth') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('growth')} showLab={labAllowed}>
        {/* 冒険の進み（Adventure）と日本語の実力は分けて見せる（§14） */}
        <AdventureRecordCard t={t} />
        {labAllowed && (
          <div className="max-w-md mx-auto px-4 pt-4 flex gap-2">
            <button type="button" onClick={() => setStep('roadmap')} className="card-interactive flex-1 min-h-11 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl">{t.nav.roadmap}</button>
            <button type="button" onClick={() => setStep('history')} className="card-interactive flex-1 min-h-11 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl">{t.nav.history}</button>
          </div>
        )}
        {labAllowed && (
          <GrowthVocabCard t={t} onAction={(view) => {
            trackCourse('click_ai_course_growth_next_action', { view });
            syncLabUrl(null);
            syncVocabUrl({ view, category: null, itemId: null });
            setStep('vocab');
          }} />
        )}
        {growthData ? (
          <GrowthOverview
            t={t} metrics={growthData.metrics} journey={growthData.journey} currentWeek={learner.currentWeek}
            canDos={growthData.canDos} beforeAfter={growthData.beforeAfter} snapshots={growthData.snapshots}
            onBack={() => setStep('home')}
          />
        ) : (
          <CourseLoading t={t} scene="mist" minHeightClass="min-h-[200px]" />
        )}
      </Shell>
    );
  }
  if (step === 'reviewNote' && activeNote) {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}>
        <CourseReviewNote t={t} note={activeNote} selfEvaluated={reviewedNoteIds.has(activeNote.sessionId)}
          onSelfEval={(kind) => handleSelfEval(activeNote, kind)}
          onBack={() => setStep(noteReturnStep)} />
      </Shell>
    );
  }
  if (step === 'light') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <CourseLightPractice t={t} progress={progress}
          practiceAgainIds={learner.settings.practiceAgainIds ?? []} onExit={() => setStep('home')} />
      </Shell>
    );
  }
  if (step === 'lab') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('lab')} showLab={labAllowed}>
        <LearnerErrorBoundary t={t} onHome={() => setStep('home')} labPreview={labAllowed}>
        <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
          <CourseFoundationLab t={t}
            initial={(() => { const u = parseLabUrl(window.location.search); return { section: u.section, unit: u.unit, step: u.step }; })()}
            onStateChange={(st) => syncLabUrl({ section: st.section, unit: st.unit, step: (st.step ?? null) as LabUrlInput['step'] })}
            onBack={() => { syncLabUrl(null); setStep('home'); }} />
        </Suspense>
        </LearnerErrorBoundary>
      </Shell>
    );
  }
  if (step === 'vocab') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('vocab')} showLab={labAllowed}>
        <LearnerErrorBoundary t={t} onHome={() => { syncVocabUrl(null); setStep('home'); }} labPreview={labAllowed}>
        <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
          <VocabularyHubLazy t={t} labPreview={labAllowed} learnerLevel={learner.estimatedLevel}
            initial={(() => { const u = parseVocabUrl(window.location.search); return { view: u.view, category: (u.category ?? null) as never, itemId: u.itemId }; })()}
            onStateChange={(st) => syncVocabUrl({ view: st.view, category: st.category, itemId: st.itemId })}
            onGoConversation={() => { syncVocabUrl(null); setStep('home'); }}
            onBack={() => { syncVocabUrl(null); setStep('home'); }} />
        </Suspense>
        </LearnerErrorBoundary>
      </Shell>
    );
  }
  if (step === 'garden') {
    // V2生徒には旧コース行きのカード（会話ノート・再会Quest）を出さない（2026-08-17 監査P1）
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <OmoideGardenPanel
          t={t}
          conversationReviewsDue={reviewsDue}
          onOpenVocabReview={openVocabQuickReview}
          onOpenConversationHistory={advOn ? undefined : () => setStep('history')}
          onOpenN3={() => openArea(n3FirstReviewAreaId(window.localStorage) ?? currentAreaId)}
          onOpenN2={() => setStep('n2grammar')}
          onOpenAdventure={advOn ? undefined : () => setStep('adventure')}
          onBack={() => setStep('home')}
        />
      </Shell>
    );
  }
  if (step === 'conversationIntro' && plan) {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <KatariPortIntro
          t={t}
          purposeJa={uiLang === 'zh' ? plan.main.mission.titleZh : plan.main.mission.titleJa}
          targetExpression={plan.main.mission.targetExpression}
          estimatedMinutes={plan.main.mission.estimatedMinutes}
          remainingToday={remaining}
          starting={starting}
          onStartVoice={() => { void startLesson('voice'); }}
          onStartText={() => { void startLesson('text'); }}
          onBack={() => setStep('home')}
          startError={startError || undefined}
          recovery={recovery ? { mode: recovery.mode } : null}
          onDiscardActive={() => { void discardActiveAndStartNew(); }}
          onCancelRecovery={() => setRecovery(null)}
        />
      </Shell>
    );
  }
  if (step === 'n3area' && activeAreaId && areaById(activeAreaId)) {
    const area = areaById(activeAreaId)!;
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <LearnerErrorBoundary t={t} onHome={() => setStep('home')} labPreview={labAllowed}>
          <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
            <N3AreaPanelLazy t={t} area={area} storage={unitStorage} syncMode={syncMode}
              onExit={() => { setCurrentAreaId(deriveCurrentAreaId(window.localStorage)); setStep('home'); }}
              onOpenArea={(id) => { setCurrentAreaId(deriveCurrentAreaId(window.localStorage)); openArea(id); }}
              onOpenAdventure={(() => {
                // 2026-07-31: 全学習エリアに章ができた。エリア対応の章を開く
                // ※V2生徒には旧・章アドベンチャーの入口を出さない（2026-08-17 監査P1）
                if (advOn) return undefined;
                const ch = chapterForArea(area.areaId);
                return ch ? () => { setAdventureChapterId(ch.chapterId); setStep('adventure'); } : undefined;
              })()}
              onOpenReview={openReview}
            />
          </Suspense>
        </LearnerErrorBoundary>
      </Shell>
    );
  }
  if (step === 'adventure') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <LearnerErrorBoundary t={t} onHome={() => setStep('home')} labPreview={labAllowed}>
          <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
            {/* keyで章ごとに必ず再mount（章切替時に前章のstateを持ち越さない） */}
            <Chapter1AdventureLazy key={adventureChapterId} t={t} chapterId={adventureChapterId} onBack={() => setStep('home')} devTools={labAllowed} />
          </Suspense>
        </LearnerErrorBoundary>
      </Shell>
    );
  }
  if (step === 'notebook') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}>
        <CourseNotebook t={t} learner={learner} sessions={sessions} progress={progress}
          onStartToday={() => setStep('home')}
          onBack={() => setStep(advOn ? 'home' : 'history')} />
      </Shell>
    );
  }
  if (step === 'expressions') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}>
        <CourseMyExpressions t={t} progress={progress}
          practiceAgainIds={learner.settings.practiceAgainIds ?? []} onBack={() => setStep('history')} />
      </Shell>
    );
  }
  if (step === 'chapters') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('roadmap')} showLab={labAllowed}>
        <CourseChapterList t={t} progress={progress}
          onOpenPreview={(m) => openPreview(m, 'chapters')} onBack={() => setStep('roadmap')} />
      </Shell>
    );
  }
  if (step === 'n2grammar') {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <LearnerErrorBoundary t={t} onHome={() => setStep('home')} labPreview={labAllowed}>
          <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
            <N2QuestLazy t={t} onBack={() => setStep('home')} onOpenReview={openReview}
              onGoConversation={() => { void startLesson(mode); }} />
          </Suspense>
        </LearnerErrorBoundary>
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
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('roadmap')} showLab={labAllowed}>
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
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <CourseOnboarding
          t={t} mode={guideMode}
          onDone={() => { markGuideSeen(); setStep(guideMode === 'first' ? 'home' : 'settings'); }}
        />
      </Shell>
    );
  }
  if (step === 'settings') {
    // V2の冒険設定（先生・目的レベル）は設定画面に集約する
    // （2026-08-16 ホーム二次メニューの項目過多解消。AdvShellのrequestViewで画面を開く）
    const openAdvView = (view: 'teacher' | 'redo') => {
      setAdvNavKey('home');
      setAdvRequest((p) => ({ view, n: (p?.n ?? 0) + 1 }));
      setStep('home');
    };
    const advActions = isAdvEnabled(learner.settings)
      ? {
        title: uiLang === 'zh' ? '冒险的设置' : '冒険の設定',
        items: [
          { label: uiLang === 'zh' ? '更换引导老师' : '案内の先生を変える', onClick: () => openAdvView('teacher') },
          { label: uiLang === 'zh' ? '更改目标・级别（重新准备）' : '目的・レベルを変える（準備をやり直す）', onClick: () => openAdvView('redo') },
        ],
      }
      : null;
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('settings')} showLab={labAllowed}>
        <CourseSettings
          t={t} learner={learner} advActions={advActions}
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
          onShowGuide={advOn ? undefined : () => { setGuideMode('review'); setStep('guide'); }}
          onSaveSettings={(patch) => {
            const nextSettings = { ...learner.settings, ...patch };
            setLearner({ ...learner, settings: nextSettings });
            void courseRepository.updateLearner({ settings: nextSettings });
          }}
          onLogout={() => { void handleLogout(); }}
          onBack={() => setStep('home')}
        />
        {/* 問い合わせ（§19）。送信先未確定の間は「この端末に控えました」と正直に表示する */}
        <div className="max-w-md lg:max-w-2xl mx-auto px-4 pb-8">
          <p className="text-xs font-bold text-gray-500 mb-1">{uiLang === 'zh' ? '遇到问题时' : 'こまったとき'}</p>
          <SupportReportButton
            adapter={supportAdapter}
            lang={uiLang === 'zh' ? 'zh' : 'ja'}
            context={{ route: 'settings', feature: 'support', locale: uiLang,
              appVersion: import.meta.env.MODE === 'production' ? 'production' : import.meta.env.MODE,
              contentVersion: 'course-v1', deviceClass: 'unknown' }}
            contactFallback={{
              ja: 'うまくいかない状態が続くときは、先生に直接お知らせください。',
              zh: '如果问题一直没有解决，请直接告诉老师。',
            }}
          />
        </div>
      </Shell>
    );
  }

  // ── Adventure V2（learner単位feature flag・adventure-v2 §2/D-004）──
  // 有効learnerのみHomeをV2へ切替。lesson/report/設定など他stepは共通（既存runtime再利用・§19）。
  if (isAdvEnabled(learner.settings)) {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang}
        v2Mode={advOn} nav={navFor(advNavKey)} showLab={labAllowed}>
        <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
          <AdvShellLazy
            lang={uiLang} learner={learner} progress={progress} sessions={sessions} reviewsDue={reviewsDue}
            requestView={advRequest}
            onRequestConsumed={() => setAdvRequest(null)}
            onViewChange={(v) => setAdvNavKey(v === 'map' ? 'roadmap' : 'home')}
            onSaveSettings={(next) => {
              setLearner({ ...learner, settings: next });
              void courseRepository.updateLearner({ settings: next });
            }}
            onOpenReview={openReview}
            onStartConversation={() => setStep(plan ? 'conversationIntro' : 'home')}
            conversationAvailable={!!plan && remaining > 0}
            onStartRestate={() => setStep('light')}
            restateAvailable={buildLightSession(progress, learner.settings.practiceAgainIds ?? [], new Date().toISOString().slice(0, 10)).length > 0}
            onOpenArea={openArea}
            onExitV2={() => {
              // 入口の既定がV2になったため、?legacy を付けないと enabled:false にしても
              // すぐV2入口ゲートへ戻されてしまう。従来ホームへの脱出は ?legacy で明示する
              if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', `${window.location.pathname}?legacy`);
              }
              const next = setAdvEnabled(learner.settings, false, new Date().toISOString());
              setLearner({ ...learner, settings: next });
              void courseRepository.updateLearner({ settings: next });
            }}
          />
        </Suspense>
      </Shell>
    );
  }
  // V2の入口ゲート: **既定で表示**（2026-08-17 CEO指摘: パラメータ無しの新規が
  // 旧コースの初期設定に入ってしまう罠があった。現役・今後の生徒は全員V2）。
  // 旧コースへ行きたいときだけ ?legacy を明示する（自動移行はしない: enabledを
  // 立てるのは本人が「冒険を始める」を押したときだけ・§2/§23）。
  // ナビのタブは出さない: この画面はまだ v2Mode ではないので旧コースのナビが出てしまい、
  // 「冒険を始める」を押す前の学習者が旧コースへ迷い込める（canon 原則3「1画面1決断」）。
  // 旧コース歴のある人の道は下の「従来のホームへ」で残している。
  if (!wantsLegacyEntry()) {
    return (
      <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed} navHidden>
        <div className="mx-auto w-full max-w-xl px-4 py-10 text-center">
          <h2 className="text-lg font-bold text-gray-900">
            {uiLang === 'zh' ? '要开始「冒险模式」吗？' : '「冒険モード」を始めますか？'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {/* 「いつでも従来のホームに戻せます」は撤去（2026-08-17 staging確認）。
                冒険モードのホームから旧ホームへ戻す導線は監査P1で削除済みで、
                実装していない挙動を約束する文になっていた。データが消えないことだけを言う */}
            {progress.length > 0
              ? (uiLang === 'zh'
                ? '目的地由你选择，当前位置由AI判断，每天的学习冒险由AI为你安排。现在的学习数据不会被删除。'
                : '目的地はあなたが選び、現在地はAIが測り、今日の冒険はAIが案内します。いまの学習データは消えません。')
              : (uiLang === 'zh'
                ? '目的地由你选择，当前位置由AI判断，每天的学习冒险由AI为你安排。'
                : '目的地はあなたが選び、現在地はAIが測り、今日の冒険はAIが案内します。')}
          </p>
          <button type="button" disabled={advEntryBusy}
            className="mt-6 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow-md shadow-blue-600/20 transition-all duration-150 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-40 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            onClick={() => {
              if (advEntryBusy) return;
              setAdvEntryBusy(true);
              trackCourse('adv_onboarding_started');
              const next = setAdvEnabled(learner.settings, true, new Date().toISOString());
              setLearner({ ...learner, settings: next });
              void courseRepository.updateLearner({ settings: next });
            }}>
            {uiLang === 'zh' ? '开始冒险' : '冒険を始める'}
          </button>
          {/* 旧コース歴のある人だけに旧ホームの道を残す（2026-08-16。V2から始めた
              生徒に旧システムを見せると混乱する — ホーム側と同じルール） */}
          {progress.length > 0 && (
            <button type="button"
              className="mt-3 w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline transition-colors active:bg-gray-100 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              onClick={() => { window.history.replaceState(null, '', window.location.pathname); setStep('home'); }}>
              {uiLang === 'zh' ? '回到原来的主页' : '従来のホームへ'}
            </button>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell teacherId={advTeacherId} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
      {/*
        一度でも冒険モードV2に入ったことがある人へ、戻る道を常に見せる。
        「従来のホームに戻す」を押すと enabled が OFF になり、以前は ?v2=1 のURLを
        知らない限りアプリ内からV2へ戻れなかった（行き止まり・原則15）。
        V2歴の無い旧コース学習者には出さない（自動移行しない・§2/§23）
      */}
      {readAdvProfile(learner.settings) !== null && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
            <p className="text-sm text-blue-900">
              {uiLang === 'zh' ? '冒险模式V2可以随时回去（数据保持不变）' : '冒険モードV2にいつでも戻れます（データはそのまま）'}
            </p>
            <button type="button"
              className="action-raised action-primary-blue min-h-[40px] rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-bold text-white touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              onClick={() => {
                const next = setAdvEnabled(learner.settings, true, new Date().toISOString());
                setLearner({ ...learner, settings: next });
                void courseRepository.updateLearner({ settings: next });
              }}>
              {uiLang === 'zh' ? '回到V2' : 'V2に戻る'}
            </button>
          </div>
        </div>
      )}
      <WorldHomeShell
        t={t}
        areaName={t.world.islandsName}
        locationName={(areaById(currentAreaId)?.nameJa ?? 'ミナト').split('（')[0]}
        clarity={reviewsDue === 0 ? 'clear' : reviewsDue <= 5 ? 'light_fog' : 'foggy'}
        reviewsDue={reviewsDue}
        onOpenReview={openReview}
        areas={WORLD_AREAS}
        currentAreaId={currentAreaId}
        onOpenArea={openArea}
        areaStateOf={(a) => areaNodeStateOf(window.localStorage, a, currentAreaId, reviewsDue)}
        record={{
          daysThisWeek: (() => {
            const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
            return new Set(sessions.filter((s2) => new Date(s2.startedAt) >= monday).map((s2) => s2.startedAt.slice(0, 10))).size;
          })(),
          totalSessions: sessions.length,
        }}
        todayAction={plan ? {
          worldLead: hasResume ? t.world.worldLeadResume : t.world.worldLeadGo,
          learningTitle: t.locale === 'zh' ? plan.main.mission.titleZh : plan.main.mission.titleJa,
          learningDetail: t.world.todaySub(plan.main.mission.targetExpression, remaining),
          ctaLabel: hasResume ? t.world.ctaResume : t.world.ctaStart,
          onStart: () => { setHasResume(false); void startLesson(mode); },
        } : null}
        upcoming={buildJourney(progress, learner.currentWeek).slice(0, 6).map((j) => ({
          label: t.world.weekLabel(t.locale === 'zh' ? j.nameZh : j.nameJa, j.week),
          detail: t.world.retainedDetail(t.locale === 'zh' ? j.themeZh : j.themeJa, j.retained, j.total),
          unlocked: j.state === 'done',
        }))}
        facilities={[
          { id: 'lib', worldName: t.world.facilities.lib.name, functionName: t.world.facilities.lib.fn,
            descriptionJa: t.world.facilities.lib.body, badge: reviewsDue,
            onOpen: () => { syncLabUrl(null); syncVocabUrl({ view: 'top', category: null, itemId: null }); setStep('vocab'); } },
          { id: 'workshop', worldName: t.world.facilities.workshop.name, functionName: t.world.facilities.workshop.fn,
            descriptionJa: t.world.facilities.workshop.body,
            onOpen: () => { syncVocabUrl(null); syncLabUrl({ section: 'units', unit: null, step: null }); setStep('lab'); } },
          { id: 'plaza', worldName: t.world.facilities.plaza.name, functionName: t.world.facilities.plaza.fn,
            descriptionJa: t.world.facilities.plaza.body,
            onOpen: () => setStep(plan ? 'conversationIntro' : 'home') },
          { id: 'garden', worldName: t.world.facilities.garden.name, functionName: t.world.facilities.garden.fn,
            descriptionJa: t.world.facilities.garden.body, badge: reviewsDue,
            onOpen: openReview },
          { id: 'record', worldName: t.world.facilities.record.name, functionName: t.world.facilities.record.fn,
            descriptionJa: t.world.facilities.record.body,
            onOpen: () => { void openGrowth(); } },
          { id: 'adventure', worldName: t.world.facilities.adventure.name, functionName: t.world.facilities.adventure.fn,
            descriptionJa: t.world.facilities.adventure.body,
            onOpen: () => openArea(currentAreaId) },
          // N2文法への直行（UX監査G: Map経由のみでja表示にN2の文字が無く発見不能だった）
          { id: 'tower', worldName: t.world.facilities.tower.name, functionName: t.world.facilities.tower.fn,
            descriptionJa: t.world.facilities.tower.body,
            onOpen: () => setStep('n2grammar') },
        ]}
      >
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
        onOpenLab={(section) => { syncVocabUrl(null); syncLabUrl({ section: section === 'units' ? 'units' : section === 'records' ? 'records' : 'today', unit: null, step: null }); setStep('lab'); }}
        onOpenVocab={(view) => {
          syncLabUrl(null);
          // 期限復習・今日の3語・トップの3系統（第一CTAから直接開く・2E-1.10 §15）
          const v = view === 'daily' ? 'daily' : view === 'quickreview' ? 'quickreview' : 'top';
          syncVocabUrl({ view: v, category: null, itemId: null });
          setStep('vocab');
        }}
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
      </WorldHomeShell>
    </Shell>
  );
}

const missionsInWeek = (week: number) => missionById(`w${String(week).padStart(2, '0')}m1`) ? [1, 2, 3, 4, 5].map((o) => missionById(`w${String(week).padStart(2, '0')}m${o}`)!).filter(Boolean) : [];

/**
 * 成長画面の語彙状態カード（Phase 2E-1 §25・labPreviewのみ）。
 * 語彙データは動的import（メインbundleへ入れない・§31）。自己評価は問題確認と別行で表示し、
 * 「語彙力◯◯」のような断定スコアは出さない。
 */
const GrowthVocabCard = ({ t, onAction }: { t: AiCourseDict; onAction?: (view: 'quickreview' | 'daily') => void }) => {
  const tv = t.vocab;
  const [sum, setSum] = useState<import('../../lib/aiLesson/course/vocabHomeSummary').VocabGrowthSummary | null>(null);
  useEffect(() => {
    let alive = true;
    void import('../../lib/aiLesson/course/vocabHomeSummary')
      .then((m) => { if (alive) setSum(m.getVocabGrowthSummary()); })
      .catch(() => { /* 表示なしで成立 */ });
    return () => { alive = false; };
  }, []);
  if (!sum || sum.startedCount === 0) return null;
  const d = sum.confirmedByDimension;
  const rows: [string, number][] = [
    [tv.growthVocabStarted, sum.startedCount],
    [`${tv.diagDims.reading}${tv.dimStates.confirmed}`, d.reading],
    [`${tv.diagDims.meaning}${tv.dimStates.confirmed}`, d.meaning],
    [`${tv.diagDims.usage}・${tv.diagDims.collocation}${tv.dimStates.confirmed}`, d.usage + d.collocation + d.particle + d.conjugation],
    [tv.statRetainedLabel, sum.retainedCandidateCount],
    [tv.growthVocabNeedsReview, sum.needsReviewCount],
  ];
  return (
    <div className="max-w-md mx-auto px-4 pt-3">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-bold text-gray-500 mb-2">{tv.growthVocabHeading}</p>
        <div className="space-y-1">
          {rows.map(([label, n]) => (
            <p key={label} className="text-xs text-gray-700 flex justify-between"><span>{label}</span><span className="font-mono">{n}</span></p>
          ))}
        </div>
        {/* 自己評価は別表示（問題確認と混ぜない・§25） */}
        <p className="text-[11px] text-gray-400 mt-2">{tv.statsSelfKnown}: {sum.selfKnownCount}。{tv.growthVocabSelfNote}</p>
        {/* 次の一手は一つだけ（2E-1.5 §33・数値を見るだけにしない） */}
        {onAction && (
          sum.needsReviewCount > 0 ? (
            <button type="button" onClick={() => onAction('quickreview')}
              className="action-raised w-full min-h-11 mt-2 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl">
              {tv.quickReviewChip(sum.needsReviewCount)}
            </button>
          ) : (
            <button type="button" onClick={() => onAction('daily')}
              className="action-raised w-full min-h-11 mt-2 py-2 text-sm font-bold text-indigo-700 bg-white border border-indigo-200 rounded-xl">
              {tv.dailyCta}
            </button>
          )
        )}
      </div>
    </div>
  );
};

/** AIコース共通の外枠。通常会員ヘッダーではなく AIコース専用ヘッダーを出す（App.tsx 側で通常ヘッダーは非表示） */
const Shell = ({ children, nav, t, lang, onToggleLang, showLab = false, teacherId = null, v2Mode = false, navHidden = false }: {
  children: React.ReactNode;
  /** ログイン後のみナビを出す。未ログイン・初回診断中は undefined */
  nav?: { current: CourseNavKey; onNavigate: (k: CourseNavKey) => void; onLogout: () => void };
  t: AiCourseDict;
  lang: 'ja' | 'zh';
  onToggleLang: () => void;
  showLab?: boolean;
  /**
   * 案内の先生。ログイン前（loading/login/hearing）は null＝既定の先生。
   * 画面ツリー全体へ配るので、AI会話・復習・レポートのアバターも選択結果に揃う。
   */
  teacherId?: AdvTeacherId | null;
  /** V2有効時はナビを「今日の冒険 / 冒険マップ / 設定」の3つへ絞る（canon §5） */
  v2Mode?: boolean;
  /** ナビのタブだけ隠す（ログアウト・言語切替は残す）。V2の入場画面で使う */
  navHidden?: boolean;
}) => {
  return (
    <TeacherProvider teacherId={teacherId}>
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
        <meta name="apple-mobile-web-app-title" content={lang === 'zh' ? '日语搭档' : '日本語の相棒'} />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </Helmet>
      <CourseHeader
        t={t} showNav={!!nav} current={nav?.current}
        onNavigate={nav?.onNavigate} onLogout={nav?.onLogout}
        lang={lang} onToggleLang={onToggleLang} showLab={showLab} v2Mode={v2Mode} navHidden={navHidden}
      />
      {children}
      {/* 学習アプリ側にも法務導線を置く（LPだけにあると、
          ログイン後の学習者が規約・削除申請へ辿り着けない）。
          「キャンセル・返金について」の単独リンクは学習面では出さない（2026-08-16 CEO判断）。
          開示義務は特商法ページ内の「返品・キャンセル」節とLP側フッターで担保。
          中途解約権など法定権利は表示の有無に関係なく消えない点に注意 */}
      <footer className="mt-10 border-t border-gray-100 py-6">
        <div className="max-w-md lg:max-w-2xl mx-auto px-4 text-gray-500">
          <LegalFooterLinks lang={lang} exclude={['cancel-policy']} />
        </div>
      </footer>
    </TeacherProvider>
  );
};

