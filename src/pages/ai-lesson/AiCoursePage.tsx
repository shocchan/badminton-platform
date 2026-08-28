// AI日本語コース（完成版）オーケストレーター: /:lang/ai-course
// 認証 → 初回診断 → 学習ホーム → レッスン（音声/テキスト）→ レポート → ホーム
// ＋ ロードマップ / 履歴 / 設定。進捗は Supabase（RLS）、オフライン時は localStorage。

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CourseLoading, CourseChunkLoading } from '../../components/ai-course/CourseLoading';
import { LegalFooterLinks } from './legal/LegalPage';
import { ChunkReloadBoundary } from '../../components/ai-course/ChunkReloadBoundary';
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
import { fetchAccessState, formatUntilJst, type CourseAccessState, reviewUnreachable, trialShapeOf } from '../../lib/aiLesson/course/courseAccess';
import { ensureCoursePass } from '../../lib/aiLesson/course/coursePass';
import { logCourseEvent } from '../../lib/aiLesson/course/courseEvents';
import { upsellMomentFor, readUpsellDismissedAt, writeUpsellDismissedAt } from '../../lib/aiLesson/course/plans/planUpsell';
import { planById } from '../../lib/aiLesson/course/plans/planCatalog';
import { UpsellCoachBanner } from '../../components/ai-course/UpsellCoachBanner';
import { PlanStatusChip } from '../../components/ai-course/PlanStatusChip';
import { TrialStartScreen } from '../../components/ai-course/TrialStartScreen';
import { TrialEndedUpgrade } from '../../components/ai-course/TrialEndedUpgrade';
import { buildTrialSummary, type TrialSummary } from '../../lib/aiLesson/course/plans/trialSummary';
import { linkAttributionToUser } from '../../lib/aiLesson/course/attribution';
import { ApplicationModal } from './landing/ApplicationModal';
import type { PlanId } from '../../lib/aiLesson/course/plans/planCatalog';
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
import { buildJourney, LAST_CONVERSATION_WEEK } from '../../lib/aiLesson/course/courseJourney';
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
// 今日の冒険（V2）の「単元のことばを学ぶ」。旧エリア画面を経由せず単元だけを開く（2026-08-18 監査P1）
const N3UnitSoloLazy = lazy(() => import('../../components/ai-course/n3unit/N3UnitSolo'));
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
import { getServiceStatus, markChatPaused } from '../../lib/aiLesson/course/courseServiceStatus';
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

type Step = 'loading' | 'login' | 'accessGate' | 'hearing' | 'guide' | 'home' | 'lesson' | 'report' | 'growth' | 'roadmap' | 'history' | 'settings' | 'reviewNote' | 'preview' | 'chapters' | 'n2grammar' | 'light' | 'expressions' | 'notebook' | 'lab' | 'vocab' | 'adventure' | 'n3area' | 'n3unit' | 'conversationIntro' | 'garden';

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
  // タイムアウト無しだと、AI側が詰まったとき会話後の画面で無限に待たされる
  // （体験パスは時計が動き続ける＝待ち時間がそのまま損になる）。25秒でローカル版へ倒す
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 25_000);
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-lesson-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ sessionId, targetExpression, themeJa, detectedUsage, utterances }),
      signal: abort.signal,
    });
    // 残高切れでも生徒にはレポートを出す（AIなしの簡易版へ静かに落とす）
    if (!res.ok) {
      if (res.status === 503) markChatPaused();
      return { report: localFallback, fromAi: false };
    }
    const data = await res.json();
    return data?.report ? { report: data.report as LessonReport, fromAi: true } : { report: localFallback, fromAi: false };
  } catch {
    return { report: localFallback, fromAi: false };
  } finally {
    clearTimeout(timer);
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
  const [accessState, setAccessState] = useState<CourseAccessState | null>(null);
  /**
   * いまログインしているアカウント名（2026-08-22 CEO報告）。
   * 学習IDのアカウントはメールが `<学習ID>@id.badminton-platform.pages.dev` なので、
   * その場合は学習IDだけを出す（生徒にとっても自分のIDのほうが分かりやすい）
   */
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  // 受講権のプランID（ai_course_access.plan_id）。購入者のみ値が入る（手動契約は null）
  const [accessPlanId, setAccessPlanId] = useState<string | null>(null);
  // 体験パスの使用済み秒数（累計）。上限つきプランの人だけ取得する
  const [planUsedSeconds, setPlanUsedSeconds] = useState<number | null>(null);
  /** AdvShell内で解答中（バトル・読解・聴解など）。体験のタイムアップ割り込みを待たせる */
  const [advBusy, setAdvBusy] = useState(false);
  /** 体験終了画面から開く連絡先フォームのプラン（6か月コース等） */
  const [applyPlanId, setApplyPlanId] = useState<PlanId | null>(null);
  // アップセル案内を閉じた日時（端末内保存の写し。閉じた瞬間に再描画するためstateにも持つ）
  const [upsellDismissedAt, setUpsellDismissedAt] = useState<string | null>(
    () => { try { return readUpsellDismissedAt(window.localStorage); } catch { return null; } },
  );
  /**
   * V2ヘッダーからAdvShellの画面を切り替えるための要求（canon §5）。
   * counterを進めることで「同じ画面をもう一度押した」ときも伝わる。
   */
  const [advRequest, setAdvRequest] = useState<{ view: 'home' | 'map' | 'teacher' | 'redo' | 'nextStep'; n: number } | null>(null);
  /** 冒険の「次にやるstep」。復習画面から直接そこへ入れるようにするため親で保持する（2026-08-17） */
  const [advNextStep, setAdvNextStep] = useState<{ titleJa: string; titleZh: string } | null>(null);
  const [advNavKey, setAdvNavKey] = useState<CourseNavKey>('home');
  /** AI会話だけが停止中か（会話の入口を「アップデート中」に差し替える） */
  const [aiPaused, setAiPaused] = useState(false);
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
  /**
   * 会話がまだ一度も無い（＝1回目のウォームアップを出す）。
   * 学習履歴からの推測ではなく、セッション一覧を実際に見て決める。
   * 1本終えたら false にし、2回目からは申告レベルどおりの入口に戻す。
   */
  const [firstEverConv, setFirstEverConv] = useState(false);
  /**
   * AI音声会話の残り回数（体験パス=3のうち）。
   * 日数制の体験では**時間ではなく回数が上限**なので、残りを見せる相手はこちら。
   * サーバーが返す値だけを使い、分からないうちは null（数字を作らない）。
   */
  const [remainingVoiceTotal, setRemainingVoiceTotal] = useState<number | null>(null);
  /**
   * 体験終了画面に出す「あなたの現在地」（2026-08-26）。
   * 受講権ゲートで止まる人は learner/progress を読み込む前に return しているので、
   * この画面のためだけに読み直す。失敗したら null のまま（作り話をしない）。
   */
  const [trialSummary, setTrialSummary] = useState<TrialSummary | null>(null);
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
  // 今日の冒険（V2）の「単元のことばを学ぶ」で開いている単元。旧エリア画面は経由しない
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
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

  // 体験パス（累計上限つきプラン）の使用済み秒数。自分の ai_usage_daily を合算する。
  // 会話を終えたとき（sessions更新）とホームへ戻るたびに取り直す＝
  // 「のこり◯分」が常に確定値の最新になる（別端末で使った分も戻ってきた時に反映）
  const atHome = step === 'home';
  useEffect(() => {
    const row = accessState && 'row' in accessState ? accessState.row : null;
    if (!learner || !row || row.aiSecondsLimit === null || row.aiSecondsLimit === undefined) {
      setPlanUsedSeconds(null);
      return;
    }
    let alive = true;
    void supabase
      .from('ai_usage_daily')
      .select('seconds_used')
      .eq('learner_id', learner.id)
      .then(({ data }) => {
        if (!alive || !data) return;
        setPlanUsedSeconds(data.reduce((sum, r) => sum + ((r.seconds_used as number) ?? 0), 0));
      });
    return () => { alive = false; };
  }, [learner, accessState, sessions.length, atHome]);

  // AI会話が運営都合で止まっていないか（OpenAIのクレジット切れ）。
  // 会話を始めてからエラーに落とすのではなく、**始める前**に案内へ差し替えるために見る。
  useEffect(() => {
    if (step !== 'home') return;
    let alive = true;
    void getServiceStatus().then((st) => { if (alive) setAiPaused(st.chatPaused); });
    return () => { alive = false; };
  }, [step]);

  // 画面計測（個人情報なし。gtag未存在なら何もしない）
  useEffect(() => {
    if (step === 'home') {
      trackCourseOnce('view_ai_course_home');
      // 自社DB側の再訪記録（GA4と違い管理画面のファネルに出る）。日次集計なので重複送信は無害
      logCourseEvent('app_open');
      /*
       * このブラウザの流入元を本人に紐付ける（2026-08-26 Phase S1）。
       * ここまで来た＝ログイン済みなので、未ログインのまま積んだ
       * LP閲覧・CTA・checkout開始が「誰の行動だったか」つながる。
       * 1ブラウザ1回で足り、付け替えはサーバー側が拒否する。
       */
      linkAttributionToUser();
    } else if (step === 'n2grammar') trackCourse('open_ai_course_n2');
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
    if (!user) { setStep('login'); setAccountLabel(null); return; }
    setAccountLabel(user.email
      ? (user.email.endsWith('@id.badminton-platform.pages.dev') ? user.email.split('@')[0] : user.email)
      : null);
    // 受講権ゲート（2026-08-18 CEO指示）。期間内の人と管理者だけが先へ進める。
    // 期限の実体はDBの ai_course_access。学習記録はここでは一切触らない（残る）
    const access = await fetchAccessState();
    setAccessState(access); // 期間内でも保持する（プラン表示・期限前案内が期間を読む）
    if (access.kind === 'none' || access.kind === 'expired' || access.kind === 'not_started') {
      setStep('accessGate');
      /*
       * 体験を使い切って止まった人にだけ、この60分でやったことを読み直す（2026-08-26）。
       * ゲートで止まる人はここより先の読み込みに進まないので、この画面用に別途取る。
       * 学習データの読み取りはRLSで本人の行だけ。失敗しても画面は出す（await しない）。
       */
      if (access.kind === 'expired' && access.row.trialWindowMinutes) {
        void Promise.all([courseRepository.listRecentSessions(50), courseRepository.listProgress()])
          .then(([sess, prog]) => setTrialSummary(buildTrialSummary(sess, prog)))
          .catch(() => setTrialSummary(null));
      }
      return;
    }
    setAccessPlanId('row' in access ? access.row.planId ?? null : null);
    /* 有料教材assetの通行証をもらう（2026-08-24）。
       受講権が通った人にだけ発行する。教材は AdvShell（下で lazy import）からしか
       参照されないので、この時点で取っておけば間に合う。
       **失敗しても学習は止めない。** 門は既定でOFFなので、取れなくても教材は配られる。
       詳細は src/lib/aiLesson/course/coursePass.ts と scripts/generate-worker.mjs */
    void ensureCoursePass().then((r) => {
      if (r !== 'granted' && r !== 'disabled') {
        console.warn('[coursePass] 通行証を取得できませんでした:', r);
      }
    });
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
    const firstEver = sess.length === 0 && prog.length === 0;
    setFirstEverConv(firstEver);
    setPlan(buildLessonPlan(l, prog, undefined, { firstEverConversation: firstEver }));
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

  /**
   * リアルタイム体験の自動終了（2026-08-20）。60分経過で体験終了画面へ切り替える。
   *
   * ただし**レッスン中・レポート表示中は割り込まない**（会話は最長4分で必ず終わる）。
   * 話している最中に画面を奪うと、その回の会話とレポートが消える＝最悪の終わり方になる。
   * 会話を終えてホームへ戻った時点で終了画面にする（超過は最大4分・原価的にも許容）
   */
  useEffect(() => {
    const row = accessState && 'row' in accessState ? accessState.row : null;
    if (!row?.trialStartedAtISO || !row.trialWindowMinutes) return;
    // 割り込んではいけない画面: AI会話系（親のstep）＋ AdvShell内の解答中（バトル・読解・
    // 聴解・模試・かな道場など。これらは step==='home' のままなので専用フラグで受け取る）
    const inLesson = step === 'lesson' || step === 'report' || step === 'conversationIntro' || advBusy;
    const ms = Date.parse(row.validUntilISO) - Date.now();
    if (!Number.isFinite(ms)) return;
    if (ms <= 0) {
      if (inLesson) return; // 会話が終わるのを待つ（このeffectはstep変化で再評価される）
      void loadAll();
      return;
    }
    const id = window.setTimeout(() => { void loadAll(); }, ms + 1000);
    return () => window.clearTimeout(id);
  }, [accessState, loadAll, step, advBusy]);

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
      // 体験パス（リアルタイム）の人に「明日また続けましょう」は嘘になる（明日は無い）。
      // 残り時間でできること（語彙バトル・教材）へ案内する（2026-08-20 満足度チェック）
      const inRealtimeTrial = !!(accessState && 'row' in accessState && accessState.row.trialStartedAtISO);
      const dailyCapped = r.code === 'daily_session_limit' || r.code === 'daily_time_limit'
        || r.code === 'monthly_session_limit' || r.code === 'monthly_time_limit';
      setStartError(
        inRealtimeTrial && dailyCapped
          ? (uiLang === 'zh'
            ? 'AI会话已达今天的使用上限。剩余的体验时间可以用词汇战斗和教材继续学习。'
            : 'AI会話は本日の上限に達しました。のこりの体験時間は、語彙バトルと教材で学べます。')
          : t.limits[r.code ?? 'unknown'] ?? t.limits.unknown,
      );
      // 上限に当たったら表示も実際の状態に合わせる（日次・月次いずれも今は開始できない）
      if (r.code === 'daily_session_limit' || r.code === 'daily_time_limit'
        || r.code === 'monthly_session_limit' || r.code === 'monthly_time_limit') setRemaining(0);
      return;
    }
    setTextResume(null);
    setMode(m);
    setActiveSessionId(r.sessionId ?? null);
    setRemaining(r.remainingSessions ?? 0);
    if (r.remainingVoiceTotal != null) setRemainingVoiceTotal(r.remainingVoiceTotal);
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
    // 会話中に1分ごとライブ記録済みのぶんを差し引いて追加記録する（二重計上防止・2026-08-20）
    await courseRepository.recordUsage(
      learner.id,
      Math.max(0, result.durationSeconds - (result.usageSecondsRecordedLive ?? 0)),
      cost,
    );
    // 会話の完了を冒険の「AI会話ミッション」ステップへ即時に伝える（2026-08-19 CEO実害報告）。
    // これまで sessions state は初回ロードでしか更新されず、会話を終えても
    // リロードするまで冒険側が「未完了」のままだった＝同じ会話を何度もやり直せてしまった
    setSessions(await courseRepository.listRecentSessions(50));

    // 難易度調整（直近の完了セッション）
    const recent = [{ ...(activeSessionId ? {} : {}), completionStatus: result.completionStatus, lessonKind: mainStep.kind, targetUsed: result.targetUsed, targetUsedIndependently: result.targetUsedIndependently } as CourseSessionRecord, ...sessions];
    const adj = adjustDifficulty(learner.difficultyLevel, recent);
    if (adj.changed) await courseRepository.updateLearner({ difficultyLevel: adj.level });

    // 週の進行（現在の週が全て学習開始済みなら次の週へ）
    const freshProgress = [...progress.filter((p) => p.itemId !== updated.itemId), updated];
    const weekMissions = missionsInWeek(learner.currentWeek);
    const weekDone = weekMissions.every((mm) => freshProgress.some((p) => p.itemId === mm.id));
    if (weekDone && learner.currentWeek < LAST_CONVERSATION_WEEK) await courseRepository.updateLearner({ currentWeek: learner.currentWeek + 1 });

    // 完了を画面状態へ即反映し、レッスン計画を**次のミッション**で組み直す
    // （2026-08-20 CEO実害報告: 「AI会話をもう1回」が同じミッションの繰り返しになり
    //  先へ進めなかった。planが初回ロードのまま更新されていなかったのが原因）。
    // これで、おかわり会話のたびに新しいミッションへ進み、週も攻略に応じて進む
    const nextLearner: Learner = {
      ...learner,
      // adjustDifficulty は 1..5 の範囲でしか動かさないが、返り値の型が広い（number）ので合わせる
      difficultyLevel: adj.changed ? (adj.level as Learner['difficultyLevel']) : learner.difficultyLevel,
      currentWeek: weekDone && learner.currentWeek < LAST_CONVERSATION_WEEK ? learner.currentWeek + 1 : learner.currentWeek,
    };
    setLearner(nextLearner);
    setProgress(freshProgress);
    setFirstEverConv(false);
    setPlan(buildLessonPlan(nextLearner, freshProgress));

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
    const nextMission = selectNextMission(nextLearner, freshProgress);
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
    // 「次のミッション」「次にできるようになること」は selectNextMission＝旧コース12週エンジンの結果。
    // V2（冒険）の生徒には、今日の冒険が示す次の一手と食い違う別物になるので出さない（2026-08-18 監査P2）
    const advOnNow = isAdvEnabled(learner.settings);

    setReport({
      mission, report: rep, masteryState: updated.masteryState, nextReviewISO: updated.nextReviewAt,
      nextMissionLabel: advOnNow ? null : (nextMission?.targetExpression ?? null),
      xpEarned: xp.earned, xpBreakdown: xp.breakdown,
      weekSessions: stats.weekSessions + 1, weeklyTarget: learner.settings.weeklyTarget, fromAi,
      durationSeconds: result.durationSeconds,
      todayCanDo, nextAbility: advOnNow ? null : nextAbilityDef,
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
    // 会話後のレポートに実際に到達したか（会話は終えたがレポートを見ずに閉じる人を分ける）
    logCourseEvent('report_viewed', { kind: mainStep.kind, is_review: isReview });
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
  if (step === 'login') {
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang}>
        {/* ログイン画面のタイトルをLPと区別する（1-3: LPとログイン画面のURL・タイトル分離） */}
        <Helmet>
          <title>{uiLang === 'zh' ? '登录｜你的日语搭档' : 'ログイン｜日本語の相棒'}</title>
        </Helmet>
        <CourseLogin t={t} onLoggedIn={() => void loadAll()} />
      </Shell>
    );
  }
  if (step === 'accessGate') {
    const a = accessState;
    const zh = uiLang === 'zh';
    const until = a && a.kind === 'expired' ? formatUntilJst(a.row.validUntilISO, zh ? 'zh' : 'ja') : null;
    const from = a && a.kind === 'not_started' ? formatUntilJst(a.row.validFromISO, zh ? 'zh' : 'ja') : null;
    // 体験パス（リアルタイム60分）の終了は「期限切れ」ではなく体験完了。
    // その場でアップグレード（1か月プラン）へつなぐ（2026-08-20 CEO決定の設計意図）
    const trialEnded = a?.kind === 'expired' && a.row.planId === 'ai-trial-pass';
    const monthPlan = planById('ai-month');
    const title = trialEnded
      ? (zh ? '60分钟的体验结束了，辛苦啦！' : '60分の体験が終了しました。おつかれさまでした！')
      : a?.kind === 'expired'
        ? (zh ? '学习期限已结束' : '利用期間が終了しています')
        : a?.kind === 'not_started'
          ? (zh ? '学习还未开始' : '利用開始前です')
          : (zh ? '课程还未开通' : 'コースが開通していません');
    const body = trialEnded
      ? (zh
        ? `学习记录都保留着。升级到「${monthPlan?.nameZh}」（${monthPlan?.priceLabelZh}）即可从接下来的部分继续，30天内解锁全部区域。`
        : `学習記録はすべて残っています。「${monthPlan?.nameJa}」（${monthPlan?.priceLabelJa}）にアップグレードすると、続きから30日間・全地域で学べます。`)
      : a?.kind === 'expired'
        ? (zh ? `你的学习期限到 ${until} 为止。学习记录都还保留着，续期后可以从原来的地方继续。请联系老师。`
          : `利用期間は ${until} まででした。学習記録はすべて残っています。延長すると続きから再開できます。先生に連絡してください。`)
        : a?.kind === 'not_started'
          ? (zh ? `你的学习将从 ${from} 开始。到时候用同一个ID登录就可以。`
            : `利用開始日は ${from} です。当日から同じIDでログインできます。`)
          : (zh ? '这个账号还没有开通课程。请联系老师确认。' : 'このアカウントはまだコースが開通していません。先生に確認してください。');
    // 体験が終わった人には、LPへ戻さず**その場で3択**（もう一度60分／1か月／6か月伴走）を出す。
    // 60分・1か月はクレジット決済へ直行、6か月は連絡先フォーム（人が対応する商品なので即決済にしない）
    if (trialEnded) {
      return (
        <Shell t={t} lang={uiLang} onToggleLang={toggleLang} accountLabel={accountLabel} onLogout={() => { void signOut().then(() => setStep('login')); }}>
          <TrialEndedUpgrade
            lang={uiLang}
            summary={trialSummary}
            onApply={(planId) => setApplyPlanId(planId)}
            onLogout={() => { void signOut().then(() => setStep('login')); }}
          />
          {/* 6か月コースの連絡先フォーム（決済が使えないときの受け皿も兼ねる） */}
          <ApplicationModal key={applyPlanId ?? 'closed'} planId={applyPlanId}
            onClose={() => setApplyPlanId(null)} lang={uiLang} />
        </Shell>
      );
    }
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} accountLabel={accountLabel} onLogout={() => { void signOut().then(() => setStep('login')); }}>
        <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
          <div className="text-4xl mb-3">🌱</div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{body}</p>
          <button type="button"
            className="mt-8 w-full min-h-[44px] rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            onClick={() => { void signOut().then(() => setStep('login')); }}>
            {zh ? '退出登录' : 'ログアウト'}
          </button>
        </div>
      </Shell>
    );
  }
  if (step === 'hearing') {
    // 新規は既定で**名前だけ**聞く（V2入口）。目標・レベル・週頻度は直後の
    // V2オンボーディングで聞くため、旧8問と二重に答えさせない（監査P1）。
    // 旧コースの8問ヒアリングは ?legacy を明示したときだけ
    const v2Invite = !wantsLegacyEntry();
    return (
      <Shell t={t} lang={uiLang} onToggleLang={toggleLang} accountLabel={accountLabel} onLogout={() => { void signOut().then(() => setStep('login')); }}>
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

  if (!learner) return <Shell t={t} lang={uiLang} onToggleLang={toggleLang} accountLabel={accountLabel} onLogout={() => { void signOut().then(() => setStep('login')); }}><CourseLoading t={t} scene="mist" minHeightClass="min-h-[200px]" /></Shell>;

  const stats = learnerStats(sessions, progress);
  const reviewsDue = progress.filter((p) => p.nextReviewAt && p.nextReviewAt <= new Date().toISOString().slice(0, 10) && p.reviewStage !== 'none').length;
  // V2有効の生徒には**全step**でナビを3タブ（今日の冒険/冒険マップ/設定）に絞る（canon §5）。
  // 従来はV2ホームだけv2Modeで、設定・復習・単元などの共有stepでは旧5タブが出ていた
  // （成長・学習記録から旧コース画面へ迷い込める：サマーさんの旧ホーム混乱と同根・2026-08-16修正）
  const advOn = isAdvEnabled(learner.settings);

  // 購入プランの地域上限（体験パス=3）。冒険マップの表示ゲートへ渡す
  const planRegionLimit = accessPlanId ? planById(accessPlanId)?.contentRegionLimit ?? null : null;

  // 購入プランの状態チップ（体験パスの残り時間・期限。CEO指摘 2026-08-19:
  // ログインしても60分の上限がどこにも見えなかった）。手動契約の生徒には出ない
  const accessRow = accessState && 'row' in accessState ? accessState.row : null;
  /**
   * 体験の残りが会話1回ぶん（HARD_END=4分）に満たないか。
   * 満たないときは会話を出さない＝途中で打ち切られてレポートが残らない事故を防ぐ
   * （2026-08-20 本番前の満足度チェック）
   */
  // 実時間制（旧仕様）でだけ意味がある。日数制では残り時間で会話が切れることはない
  const trialTooShortForConversation = !!(
    accessRow?.trialStartedAtISO
    && reviewUnreachable(accessRow)
    && Date.parse(accessRow.validUntilISO) - Date.now() < 4 * 60 * 1000
  );
  const planChip = accessPlanId && accessRow ? (
    <PlanStatusChip
      lang={uiLang}
      planId={accessPlanId}
      validUntilISO={accessRow.validUntilISO}
      // 残りの表示は開始済みのときだけ（未開始は開始画面がホームを差し替える）
      realtimeWindowMinutes={accessRow.trialStartedAtISO ? (accessRow.trialWindowMinutes ?? null) : null}
      trialDays={accessRow.trialStartedAtISO ? (accessRow.trialDays ?? null) : null}
      remainingVoiceTotal={remainingVoiceTotal}
      usedSeconds={planUsedSeconds}
    />
  ) : null;

  // 1か月AI自学プラン利用者向けの伴走コース案内（6章のアップセル導線）。
  // plan_id 列が remote に無い間（migration 20260819100000 未適用）は accessPlanId が
  // null のままなので、既存の全生徒に対して**何も表示されない**（後方互換）
  const upsellMoment = upsellMomentFor({
    planId: accessPlanId,
    nowISO: new Date().toISOString(),
    validFromISO: accessState && 'row' in accessState ? accessState.row.validFromISO : null,
    validUntilISO: accessState && 'row' in accessState ? accessState.row.validUntilISO : null,
    sessionCount: sessions.length,
    dismissedAtISO: upsellDismissedAt,
  });
  const upsellBanner = upsellMoment ? (
    <UpsellCoachBanner
      lang={uiLang}
      moment={upsellMoment}
      onDismiss={() => {
        const now = new Date().toISOString();
        writeUpsellDismissedAt(window.localStorage, now);
        setUpsellDismissedAt(now);
        trackCourse('dismiss_ai_course_upsell', { moment: upsellMoment });
      }}
    />
  ) : null;
  // ホーム上部に出す購入プラン関連の帯（チップ＋アップセル）。従来契約の生徒は両方 null
  const planTopSlot = (planChip || upsellBanner) ? <>{planChip}{upsellBanner}</> : null;

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
  /**
   * 復習を開く。
   *
   * V2の生徒は**復習そのものへ直行**する（2026-08-17 CEO実機報告「復習も3つあってよくわからない」）。
   * 旧コースの庭園（オモイデ庭園）は入口が3つあり、しかも2つは旧世界の別画面
   * （N3攻略・ソラノ塔）へ出ていく。「復習 3件」と言われて押した生徒に
   * 3つの分かれ道を見せるのは、1画面1決断に反するうえ旧コースへ迷い込ませる。
   * 旧コースの生徒には従来どおり庭園を見せる（そちらの世界観の入口なので壊さない）。
   */
  /** ことばの3分復習（庭園の中の実復習フロー） */
  const openVocabQuickReview = () => { syncLabUrl(null); syncVocabUrl({ view: 'quickreview', category: null, itemId: null }); setStep('vocab'); };
  const openReview = () => { if (advOn) { openVocabQuickReview(); return; } setStep('garden'); };

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
    return <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}><CourseReport t={t} data={report} onFeedback={handleFeedback} onBackHome={backHome}
      onAgain={() => { void startLesson(mode); }} canAgain={remaining > 0 && learner.isActive && !advOn}
      onNextChapter={() => { void advanceToNext(); }} canNext={remaining > 0 && learner.isActive && !advOn}
      onSeeReviewNote={currentNote ? () => { setActiveNote(currentNote); setNoteReturnStep('report'); setStep('reviewNote'); } : undefined}
      onSeeNotebook={activeSessionId && !advOn ? () => { trackCourse('open_notebook_from_completion'); setStep('notebook'); } : undefined}
      learnerName={learner.displayName}
      /* 感想を聞くのは3回目以降だけ（毎回だと邪魔・2026-08-26 Phase S7） */
      sessionCount={sessions.length}
      /* 実時間制の体験（旧仕様）では、来ない復習日を約束しない。
         7日制では届くので日付を出す（2026-08-26 Phase S2） */
      realtimeTrial={reviewUnreachable(accessRow)}
      /* 「カタリ港の霧が…」はミナモ列島（旧コース）の物語。V2の生徒はその世界を一度も見ていないので出さない（2026-08-18 監査P2） */
      worldLineJa={advOn ? undefined : t.katari.fogClearedToday} /></Shell>;
  }
  if (step === 'roadmap') {
    const ws = weekStats(progress);
    return <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('roadmap')} showLab={labAllowed}><CourseRoadmap t={t} weeks={ws} currentWeek={learner.currentWeek} nextMission={selectNextMission(learner, progress)} progress={progress} accessTier={accessTierOf(learner)} doneInCurrentWeek={progress.filter((p) => missionById(p.itemId)?.week === learner.currentWeek).length} onSeeChapters={() => setStep('chapters')} onOpenPreview={(m) => openPreview(m, 'roadmap')} onSeeN2Grammar={() => setStep('n2grammar')} onBack={() => setStep('home')} /></Shell>;
  }
  if (step === 'history') return <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}><CourseHistory t={t} sessions={sessions} progress={progress} practiceAgainIds={learner.settings.practiceAgainIds ?? []} onOpenNote={(item) => { void openNoteForReviewItem(item); }} onOpenExpressions={() => setStep('expressions')} onOpenNotebook={() => setStep('notebook')} onBack={() => setStep('home')} /></Shell>;
  if (step === 'growth') {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('growth')} showLab={labAllowed}>
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}>
        <CourseReviewNote t={t} note={activeNote} selfEvaluated={reviewedNoteIds.has(activeNote.sessionId)}
          onSelfEval={(kind) => handleSelfEval(activeNote, kind)}
          onBack={() => setStep(noteReturnStep)}
          onBackToAdventure={advOn ? () => setStep('home') : undefined} />
      </Shell>
    );
  }
  if (step === 'light') {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <CourseLightPractice t={t} progress={progress}
          practiceAgainIds={learner.settings.practiceAgainIds ?? []} onExit={() => setStep('home')} />
      </Shell>
    );
  }
  if (step === 'lab') {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('lab')} showLab={labAllowed}>
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('vocab')} showLab={labAllowed}>
        <LearnerErrorBoundary t={t} onHome={() => { syncVocabUrl(null); setStep('home'); }} labPreview={labAllowed}>
        <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
          <VocabularyHubLazy t={t} labPreview={labAllowed} learnerLevel={learner.estimatedLevel}
            initial={(() => { const u = parseVocabUrl(window.location.search); return { view: u.view, category: (u.category ?? null) as never, itemId: u.itemId }; })()}
            onStateChange={(st) => syncVocabUrl({ view: st.view, category: st.category, itemId: st.itemId })}
            // V2の生徒には「AI会話で話す」を出さない（2026-08-17 CEO指摘）。理由は2つ。
            // ①AI会話は今日の冒険のstep（AI会話ミッション）に既にある
            // ②この導線は実際には会話を始めず**ホームへ戻るだけ**で、ボタン名が嘘になっていた
            onGoConversation={advOn ? undefined : () => { syncVocabUrl(null); setStep('home'); }}
            // V2の生徒は復習を終えたら今日の冒険へ戻す（旧コースの図鑑に置き去りにしない・2026-08-17）
            onExitReview={advOn ? () => { syncVocabUrl(null); setStep('home'); } : undefined}
            // 復習を終えたら、戻ってもう一度押さずに次のstepへ入れる（2026-08-17 CEO要望）
            nextStepLabel={advOn && advNextStep ? (uiLang === 'zh' ? advNextStep.titleZh : advNextStep.titleJa) : undefined}
            onGoNextStep={advOn && advNextStep ? () => {
              syncVocabUrl(null); setStep('home');
              setAdvRequest((p) => ({ view: 'nextStep', n: (p?.n ?? 0) + 1 }));
            } : undefined}
            onBack={() => { syncVocabUrl(null); setStep('home'); }} />
        </Suspense>
        </LearnerErrorBoundary>
      </Shell>
    );
  }
  if (step === 'garden') {
    // V2生徒には旧コース行きのカード（会話ノート・再会Quest）を出さない（2026-08-17 監査P1）
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <OmoideGardenPanel
          t={t}
          conversationReviewsDue={reviewsDue}
          onOpenVocabReview={openVocabQuickReview}
          onOpenConversationHistory={advOn ? undefined : () => setStep('history')}
          onOpenN3={advOn ? undefined : () => openArea(n3FirstReviewAreaId(window.localStorage) ?? currentAreaId)}
          onOpenN2={advOn ? undefined : () => setStep('n2grammar')}
          onOpenAdventure={advOn ? undefined : () => setStep('adventure')}
          onBack={() => setStep('home')}
        />
      </Shell>
    );
  }
  if (step === 'conversationIntro' && plan) {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <KatariPortIntro
          t={t}
          /* V2の生徒に「ミナモ列島・第9エリア／カタリ港」は出さない。
             戻り先も今日の冒険なので、ボタンの名前を行き先に合わせる（2026-08-18 監査P1） */
          questMode={advOn}
          warmUpFirst={firstEverConv}
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
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
  // 今日の冒険（V2）の「単元のことばを学ぶ」。旧エリア画面（ミナモ列島）を経由しない（2026-08-18 監査P1）。
  // 旧エリア画面には「次のエリアへ進む」があり、押すと旧コースのエリア連鎖→旧N2文法→
  // 確認なしで始まる有料AI会話まで到達できてしまっていた
  if (step === 'n3unit' && activeUnitId) {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
        <LearnerErrorBoundary t={t} onHome={() => setStep('home')} labPreview={labAllowed}>
          <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
            <N3UnitSoloLazy t={t} unitId={activeUnitId} storage={unitStorage}
              onExit={() => { setCurrentAreaId(deriveCurrentAreaId(window.localStorage)); setStep('home'); }} />
          </Suspense>
        </LearnerErrorBoundary>
      </Shell>
    );
  }
  if (step === 'adventure') {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}>
        <CourseNotebook t={t} learner={learner} sessions={sessions} progress={progress}
          onStartToday={() => setStep('home')}
          onBack={() => setStep(advOn ? 'home' : 'history')} />
      </Shell>
    );
  }
  if (step === 'expressions') {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('history')} showLab={labAllowed}>
        <CourseMyExpressions t={t} progress={progress}
          practiceAgainIds={learner.settings.practiceAgainIds ?? []} onBack={() => setStep('history')} />
      </Shell>
    );
  }
  if (step === 'chapters') {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('roadmap')} showLab={labAllowed}>
        <CourseChapterList t={t} progress={progress}
          onOpenPreview={(m) => openPreview(m, 'chapters')} onBack={() => setStep('roadmap')} />
      </Shell>
    );
  }
  if (step === 'n2grammar') {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('roadmap')} showLab={labAllowed}>
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('settings')} showLab={labAllowed}>
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

  // ── 体験パスの開始ゲート（2026-08-20 CEO決定 / 2026-08-26 日数制へ）──
  // 未開始のあいだはホームの代わりに開始画面を出す。開始（ai_start_trial）で
  // valid_until が開始+7日（旧仕様の行は開始+60分）になり、
  // 以降は既存の期間ゲートが自動で終了させる。
  //
  // ⚠️ **目標設定・レベル診断が終わるまでは開始画面を出さない**（2026-08-20 本番前チェック）。
  // 準備（AdvShell内のオンボーディング＝目標選択＋診断）は数分かかる。ここでタイマーを
  // 先に回すと、買った時間の何割かが設定作業で消える。準備は無料、時計は学習開始から。
  // この原則は日数制でも変えない（CEO指示 Phase S2）。
  {
    const row = accessState && 'row' in accessState ? accessState.row : null;
    const shape = trialShapeOf(row);
    const advProfile = readAdvProfile(learner.settings);
    // AdvShell の needsOnboarding と同じ判定（!profile || !goalType || !diagnosis || !route）
    const onboardingDone = !!(advProfile?.goalType && advProfile?.diagnosis && advProfile?.route);
    if (shape.kind !== 'none' && row && !row.trialStartedAtISO && onboardingDone) {
      return (
        <Shell t={t} lang={uiLang} onToggleLang={toggleLang} accountLabel={accountLabel} onLogout={() => { void signOut().then(() => setStep('login')); }}>
          <TrialStartScreen
            lang={uiLang}
            trialDays={shape.kind === 'days' ? shape.days : null}
            windowMinutes={shape.kind === 'minutes' ? shape.minutes : null}
            startDeadlineISO={row.validUntilISO}
            onStarted={() => void loadAll()}
          />
        </Shell>
      );
    }
  }

  // ── Adventure V2（learner単位feature flag・adventure-v2 §2/D-004）──
  // 有効learnerのみHomeをV2へ切替。lesson/report/設定など他stepは共通（既存runtime再利用・§19）。
  if (isAdvEnabled(learner.settings)) {
    return (
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang}
        v2Mode={advOn} nav={navFor(advNavKey)} showLab={labAllowed}>
        {planTopSlot}
        {/*
          学習画面で何かが落ちても、真っ白にしない（2026-08-28 統合で復帰・元は 2a0a2a8）。
          白い画面はいちばん悪い行き止まりで、生徒は自力で戻れない
          （実際に、定着の記録が1件壊れているだけで全画面が消える事故が起きた）。
          ここは冒険画面そのものなので、戻り先は step ではなくページの読み直しにする
          （読み直せば advProfile の復元で壊れた記録が落ちる）。
        */}
        <LearnerErrorBoundary t={t} onHome={() => { window.location.href = window.location.pathname; }} labPreview={labAllowed}>
        <Suspense fallback={<CourseChunkLoading t={t} scene="map" />}>
          <AdvShellLazy
            lang={uiLang} learner={learner} progress={progress} sessions={sessions} reviewsDue={reviewsDue}
            planRegionLimit={planRegionLimit}
            requestView={advRequest}
            onRequestConsumed={() => setAdvRequest(null)}
            onNextStepChange={setAdvNextStep}
            onViewChange={(v) => setAdvNavKey(v === 'map' ? 'roadmap' : 'home')}
            onActivityChange={setAdvBusy}
            onSaveSettings={(next) => {
              const nextLearner = { ...learner, settings: next };
              setLearner(nextLearner);
              /**
               * AI会話のミッションを選び直す（2026-08-23 修正）。
               *
               * plan はページを開いた時点で1回だけ組んでいた。冒険の準備で
               * 「JLPT N1を持っている」と申告しても、その場では plan が古いままで、
               * **会話が第1週の「〜といいます」から始まっていた**（実機で発覚）。
               * 設定が変わったらその場で組み直す。
               */
              setPlan(buildLessonPlan(nextLearner, progress, undefined, { firstEverConversation: firstEverConv }));
              void courseRepository.updateLearner({ settings: next });
            }}
            onStartConversation={() => setStep(plan ? 'conversationIntro' : 'home')}
            /* 残り時間が会話1回ぶん（4分）に満たないときは会話を出さない。
               始めた会話が途中で打ち切られてレポートも残らない、が最悪の終わり方
               （AdvShell側は「押しても無反応」にせず理由を出してstepを飛ばせる・2026-08-20） */
            conversationAvailable={!!plan && remaining > 0 && !trialTooShortForConversation}
            conversationUnavailableReasonJa={trialTooShortForConversation
              ? '体験の残り時間が会話1回ぶん（約4分）を下回りました。のこりは語彙バトル・教材でしめくくりましょう。' : undefined}
            conversationUnavailableReasonZh={trialTooShortForConversation
              ? '体验剩余时间不足一次会话（约4分钟）。剩下的时间用词汇战斗和教材来收尾吧。' : undefined}
            /* 「単元のことばを学ぶ」は単元だけを開く。旧エリア画面（ミナモ列島）へは出さない */
            onOpenUnit={(unitId) => { setActiveUnitId(unitId); setStep('n3unit'); }}
          />
        </Suspense>
        </LearnerErrorBoundary>
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
      <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed} navHidden>
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
    <Shell teacherId={advTeacherId} accountLabel={accountLabel} t={t} lang={uiLang} onToggleLang={toggleLang} v2Mode={advOn} nav={navFor('home')} showLab={labAllowed}>
      {planTopSlot}
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
        t={t} learner={learner} plan={plan} stats={stats} aiPaused={aiPaused}
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
        /* 実時間制の体験（旧仕様）では「明日また続けましょう」が嘘になる。
           7日制では翌日が来るので通常表示に戻す（2026-08-26 Phase S2） */
        realtimeTrial={reviewUnreachable(accessRow)}
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
const Shell = ({ children, nav, t, lang, onToggleLang, showLab = false, teacherId = null, v2Mode = false, navHidden = false, accountLabel = null, onLogout }: {
  children: React.ReactNode;
  /** ログイン後のみナビを出す。未ログイン・初回診断中は undefined */
  nav?: { current: CourseNavKey; onNavigate: (k: CourseNavKey) => void; onLogout: () => void };
  /**
   * いまのアカウント名（学習ID or メール）。ナビの有無に関係なくヘッダーへ出す。
   * 管理者が生徒のアカウントを次々に開くとき、**どの人の画面か**が分かるようにするため
   */
  accountLabel?: string | null;
  /** ナビが無い画面（名前入力など）でもログアウトできるようにする */
  onLogout?: () => void;
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
        onNavigate={nav?.onNavigate} onLogout={nav?.onLogout ?? onLogout}
        accountLabel={accountLabel}
        lang={lang} onToggleLang={onToggleLang} showLab={showLab} v2Mode={v2Mode} navHidden={navHidden}
      />
      {/*
        本番を更新した瞬間に開いていたタブを真っ白にしない（2026-08-22）。
        画面の部品は必要になってから読み込むので、古いタブが**もう無い名前**を要求して
        失敗することがある。受け止める人がいないと画面ごと消えるので、ここで受けて
        「新しい版が出ています／読み込み直す」を出す（1回だけ自動で読み込み直す）
      */}
      <ChunkReloadBoundary lang={lang}>
        {children}
      </ChunkReloadBoundary>
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

