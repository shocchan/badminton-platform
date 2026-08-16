// コースの音声レッスン。voiceSession(WebRTC) を使い、ミッション文脈で翔子先生と会話する。
// 終了体験（2:30着地→最大4分→finish_lesson→自動完了）と冪等cleanupは voiceSession 側で担保。
// 完了時に発話ログ＋目標表現の使用判定を onComplete で返す（Supabase保存はページ側）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Clock, Flag, Mic, MicOff, PenLine, CheckCircle2, AlertTriangle, RefreshCw, FileText, Square, Languages, ChevronDown, Subtitles } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { VoicePulse } from './VoicePulse';
import type { VoicePulseStatus } from './VoicePulse';
import { ShokoAvatar } from './ShokoAvatar';
import { useTeacher } from './teacherContext';
import { trackAdv } from '../../lib/aiLesson/course/adventure/advAnalytics';
import { CourseIllustration } from './CourseIllustration';
import { startVoiceSession } from '../../lib/aiLesson/voiceSession';
import type { VoiceErrorKind, VoiceSessionHandle, VoiceSessionStatus } from '../../lib/aiLesson/voiceSession';
import { buildVoicePayload, detectTargetUsage } from '../../lib/aiLesson/course/courseLesson';
import { isMeaningfulUserTurn, COURSE_TURN_DETECTION, shouldShowGreetingGuide } from '../../lib/aiLesson/course/courseInteraction';
import { getAccessToken } from '../../lib/aiLesson/course/courseAuth';
import {
  effectiveSubtitleMode, autoTranslateAll, zhAssistAvailable,
  shouldAutoShowOnStuck, isRepeatedTutorQuestion,
} from '../../lib/aiLesson/course/courseSubtitles';
import { translateTutorLine, cachedTranslation, estimateTranslateCostUsd } from '../../lib/aiLesson/course/courseTranslateApi';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseUtterance, Learner, LessonPlanStep } from '../../lib/aiLesson/course/types';

export interface VoiceLessonResult {
  utterances: CourseUtterance[];
  usage: 'self' | 'hint' | 'none';
  targetUsed: boolean;
  targetUsedIndependently: boolean;
  chineseSupportUsed: boolean;
  durationSeconds: number;
  completionStatus: 'completed' | 'interrupted' | 'error';
  endReason: string;
  /** 中国語補助字幕でかかった追加API概算コスト（USD） */
  translateCostUsd: number;
  /** 発話をターン毎に保存済み（テキスト会話）。finalize時の一括insertをスキップして重複保存を防ぐ */
  utterancesAlreadySaved?: boolean;
}

/** 翔子先生の1発話ぶんの中国語補助字幕の状態 */
type SubState = { zh?: string; state: 'pending' | 'shown' | 'error' };

interface Props {
  t: AiCourseDict;
  learner: Learner;
  step: LessonPlanStep;
  /** ai_start_session で予約済みのセッションID。トークン発行の認可に使う */
  sessionId: string | null;
  /** 現在の表示言語（字幕・UIの言語切替に使う） */
  lang: 'ja' | 'zh';
  /** ワンタップ言語切替（音声セッションは継続。確認後に呼ぶ） */
  onToggleLang: () => void;
  onComplete: (r: VoiceLessonResult) => void;
  onSwitchToText: () => void;
  onExit: () => void;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const DURATION = 180, HARD_END = 240, CLOSING_BEFORE = 30;
const COMPLETE_OVERLAY_MS = 1600, MAX_RETRY = 2;
const isWeChat = () => /MicroMessenger/i.test(navigator.userAgent);
const hasZh = (s: string) => /(你|我们|什么|怎么|没有|可以|意思|就是|因为|所以|一下|这个|那个)/.test(s);
const fmt = (sec: number) => `${Math.floor(Math.max(sec, 0) / 60)}:${String(Math.max(sec, 0) % 60).padStart(2, '0')}`;

export const CourseVoiceLesson = ({ t, learner, step, sessionId, lang, onToggleLang, onComplete, onSwitchToText, onExit }: Props) => {
  const tv = t.voice, tl = t.lesson;
  const mission = step.mission;
  const isReview = step.kind !== 'new';
  // 案内の先生。**音声名はここでは決めない**（サーバーの allowlist が teacherId から決める）
  const teacher = useTeacher();
  // 復習の種類（翌日/3日後/7日後/追加）をバッジに出す
  const kindLabel = step.kind === 'new' ? tl.newBadge
    : step.kind === 'review_day1' ? tl.reviewDay1
      : step.kind === 'review_day3' ? tl.reviewDay3
        : step.kind === 'review_day7' ? tl.reviewDay7 : tl.extra;

  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [msgs, setMsgs] = useState<{ role: 'student' | 'tutor'; text: string }[]>([]);
  const [liveT, setLiveT] = useState(''); const [liveU, setLiveU] = useState('');
  const [tutorSpeaking, setTutorSpeaking] = useState(false); const [userSpeaking, setUserSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false); const [doneOverlay, setDoneOverlay] = useState(false);
  const [retry, setRetry] = useState(0);
  const [atBottom, setAtBottom] = useState(true);      // 会話履歴が最下部にあるか（自動追従の可否）
  const [langConfirmOpen, setLangConfirmOpen] = useState(false);
  const [hasMeaningfulTurn, setHasMeaningfulTurn] = useState(false); // 有効な生徒発話が1回来たか（開始案内の消灯用）
  // 生徒の発話継続時間の推定（speech_started→stopped）。咳・物音の誤確定を弾く材料
  const speakStartRef = useRef<number | null>(null);
  const lastSpeakMsRef = useRef(0);

  // 中国語補助字幕（表示側）。zhSupport（音声側）とは別軸で、learner設定＋レベルから決まる。
  const subtitleMode = effectiveSubtitleMode(learner.settings, t.locale === 'zh' ? 'zh' : 'ja', learner.difficultyLevel);
  const [subs, setSubs] = useState<Record<number, SubState>>({});
  const processedRef = useRef<Set<number>>(new Set()); // 自動翻訳を実行済みのメッセージ index
  const translateCostRef = useRef(0);
  // 翻訳の文脈ヒント（今日の目標表現＋その中国語の意味）。固定文はここから流用でき、API節約になる。
  const targetHint = `${mission.targetExpression}（${mission.meaningZh}）`;

  const sessionRef = useRef<VoiceSessionHandle | null>(null);
  // サーバーが実際に適用した先生・音声（診断用。会話本文は持たない）
  const routedRef = useRef<{ teacherId: string | null; voice: string | null; model: string } | null>(null);
  // セッション開始時の先生。途中で先生が変わったかの判定に使う
  const startedTeacherRef = useRef<string | null>(null);
  const uttRef = useRef<CourseUtterance[]>([]);
  const msgsRef = useRef<{ role: 'student' | 'tutor'; text: string }[]>([]);
  const startAtRef = useRef<number | null>(null);
  const doneRef = useRef(false); const closingRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const remaining = Math.max(DURATION - elapsed, 0);
  const inExt = elapsed >= DURATION && !doneOverlay;

  const log = (u: CourseUtterance) => { if (!doneRef.current) uttRef.current.push(u); };

  const complete = useCallback((endReason: string, statusKind: VoiceLessonResult['completionStatus'], overlay: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    trackAdv('realtime_session_completed', { teacherId: startedTeacherRef.current ?? undefined });
    sessionRef.current?.stop();
    const turns = msgsRef.current;
    const { usage, count } = detectTargetUsage(turns, mission.detect);
    const durationSeconds = startAtRef.current ? Math.min(Math.floor((Date.now() - startAtRef.current) / 1000), HARD_END) : 0;
    const result: VoiceLessonResult = {
      utterances: uttRef.current,
      usage,
      targetUsed: count > 0,
      targetUsedIndependently: usage === 'self',
      chineseSupportUsed: uttRef.current.some((u) => u.speaker === 'tutor' && hasZh(u.transcript)),
      durationSeconds, completionStatus: statusKind, endReason,
      translateCostUsd: translateCostRef.current,
    };
    if (overlay) {
      setDoneOverlay(true);
      const id = setTimeout(() => onComplete(result), COMPLETE_OVERLAY_MS);
      timers.current.push(id);
    } else onComplete(result);
  }, [mission.detect, onComplete]);

  const start = useCallback(async (isCancelled: () => boolean = () => false) => {
    setErrorKind(null); setInterrupted(false); setStatus('requesting-mic');
    // コースでは招待コードではなく「JWT＋予約済みセッションID」で認可する
    const accessToken = await getAccessToken();
    // トークン取得の待ち時間中に離脱していたら接続を始めない
    // （始めてしまうと cleanup 済みの後にセッションが動き出し、マイクが残る）
    if (isCancelled()) return;
    const payload = buildVoicePayload(mission, learner, step);
    startedTeacherRef.current = teacher.id;
    trackAdv('realtime_session_started', { teacherId: teacher.id, locale: t.locale === 'zh' ? 'zh' : 'ja' });
    sessionRef.current = startVoiceSession({
      sessionId, accessToken, plan: payload,
      teacherId: teacher.id,
      turnDetection: COURSE_TURN_DETECTION,
      // 先生の発話中はマイクを止める（半二重・2026-08-16）。
      // スピーカーの声がマイクへ回り込み、先生が自分のエコーに割り込まれ続けて
      // 生徒が一度も話せなくなる不具合（サマーさん報告）の根本対策
      muteMicWhileTutorSpeaks: true,
      callbacks: {
        // 実際に適用された先生（サーバー決定）。voice名はanalyticsへ送らない
        onVoiceRouted: (info) => {
          routedRef.current = info;
          trackAdv('realtime_voice_routed', { teacherId: info.teacherId ?? teacher.id });
        },
        onStatus: (s) => {
          setStatus(s);
          if (s === 'connected' && startAtRef.current === null) { startAtRef.current = Date.now(); log({ speaker: 'system', transcript: 'connected', atMs: 0, isFinal: true, relatedTarget: false }); }
        },
        onUserTranscript: (text, isFinal) => {
          if (!isFinal) { setLiveU((p) => p + text); return; }
          setLiveU(''); const tr = text.trim(); if (!tr) return;
          // 咳・雑音・短い相づちを「回答」として扱わない（会話・ミッションを勝手に進めない）。
          // 直前の翔子先生の発話が短答（〜か？）を期待していれば短答を許可する。
          const lastTutor = [...msgsRef.current].reverse().find((m) => m.role === 'tutor')?.text ?? '';
          const shortAnswerExpected = /(か|ですか|ますか)[。.\s]*[?？]?\s*$/.test(lastTutor) || /どちら|ですか|ますか/.test(lastTutor);
          if (!isMeaningfulUserTurn({ transcript: tr, durationMs: lastSpeakMsRef.current, shortAnswerExpected })) {
            return; // 空の生徒発話を保存しない・ターンを確定しない
          }
          setHasMeaningfulTurn(true);
          msgsRef.current = [...msgsRef.current, { role: 'student', text: tr }]; setMsgs(msgsRef.current);
          const rel = (() => { try { return new RegExp(mission.detect).test(tr); } catch { return false; } })();
          log({ speaker: 'student', transcript: tr, atMs: startAtRef.current ? Date.now() - startAtRef.current : 0, isFinal: true, relatedTarget: rel });
        },
        onTutorTranscript: (text, isFinal) => {
          if (!isFinal) { setLiveT(text); return; }
          setLiveT(''); const tr = text.trim(); if (!tr) return;
          msgsRef.current = [...msgsRef.current, { role: 'tutor', text: tr }]; setMsgs(msgsRef.current);
          log({ speaker: 'tutor', transcript: tr, atMs: startAtRef.current ? Date.now() - startAtRef.current : 0, isFinal: true, relatedTarget: false });
        },
        onTutorSpeaking: setTutorSpeaking,
        onUserSpeaking: (speaking) => {
          if (speaking) { speakStartRef.current = Date.now(); }
          else if (speakStartRef.current) { lastSpeakMsRef.current = Date.now() - speakStartRef.current; speakStartRef.current = null; }
          setUserSpeaking(speaking);
        },
        onError: (kind) => { log({ speaker: 'system', transcript: `error:${kind}`, atMs: 0, isFinal: true, relatedTarget: false }); setErrorKind(kind); },
        onFinishLesson: (reason) => complete(reason === 'student_request' ? 'student-request' : 'completed', 'completed', true),
      },
    });
  }, [learner, mission, step, complete, sessionId, teacher.id, t.locale]);

  // start は毎renderで identity が変わりうる（onComplete等に依存）。
  // ref経由で「最新のstart」を保持し、マウント時に1回だけ起動する。
  // → 言語切替など親の再renderが起きても、音声セッションを再起動しない（§4）。
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; }); // 常に最新の start を保持（render中には書かない）
  useEffect(() => {
    // マウント時のみ起動。sessionId は起動前に確定済み（page側でcreateSession→setStepの順）
    let cancelled = false;
    const id = setTimeout(() => { void startRef.current(() => cancelled); }, 0);
    const tm = timers.current;
    return () => {
      cancelled = true;
      clearTimeout(id);
      tm.forEach(clearTimeout);
      sessionRef.current?.stop();
    };
  }, []);

  // 先生が変わったら、**いまのrealtime sessionを正常終了してから**新しい音声で作り直す。
  // 音声は session 作成時に決まるため、生成済みsessionのvoiceを途中で差し替えない。
  // 言語切替（§4）では発火しない＝teacher.id だけを依存にしている。
  useEffect(() => {
    const started = startedTeacherRef.current;
    if (started === null || started === teacher.id) return; // 未開始 or 同じ先生なら何もしない
    if (doneRef.current) return;                            // 終了済みのレッスンは触らない
    trackAdv('teacher_changed', { teacherId: teacher.id });
    sessionRef.current?.stop();   // 既存sessionを正常終了（マイク・PeerConnectionも閉じる）
    sessionRef.current = null;
    routedRef.current = null;
    setStatus('idle'); setErrorKind(null);
    startAtRef.current = null; setElapsed(0);
    let cancelled = false;
    const id = setTimeout(() => { void startRef.current(() => cancelled); }, 0);
    timers.current.push(id);
    return () => { cancelled = true; clearTimeout(id); };
  }, [teacher.id]);

  useEffect(() => {
    if (status !== 'connected') return;
    const tick = () => { if (startAtRef.current !== null) setElapsed(Math.min(Math.floor((Date.now() - startAtRef.current) / 1000), HARD_END)); };
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [status]);

  // 残り30秒: まとめ移行
  useEffect(() => {
    if (closingRef.current || status !== 'connected' || doneRef.current) return;
    if (elapsed >= DURATION - CLOSING_BEFORE) {
      closingRef.current = true;
      sessionRef.current?.sendCue('残り約30秒です。新しい話題を始めず、今の話を短く着地させてください。目標表現が未使用なら最後の練習として復唱させ、まとめの後 finish_lesson を呼んでください。', { switchToWrapUp: true, respondIfIdle: true });
    }
  }, [elapsed, status]);

  // 4分で強制終了
  useEffect(() => { if (elapsed >= HARD_END && !doneRef.current) complete('timeout', 'completed', true); }, [elapsed, complete]);

  // 会話履歴のスクロール（§12）:
  // - ユーザーが上へスクロールして過去ログを読んでいる間は自動追従しない
  // - 最下部にいるときだけ最新へ追従（字幕の subs 変化では追従しない＝跳ねさせない）
  const scrollToLatest = useCallback((smooth = true) => {
    const el = scrollRef.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    setAtBottom(true);
  }, []);
  const onHistoryScroll = () => {
    const el = scrollRef.current; if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };
  useEffect(() => { if (atBottom) scrollToLatest(); }, [msgs, liveT, liveU, atBottom, scrollToLatest]);

  // 翔子先生の1発話を中国語補助訳にする（キャッシュ優先・失敗は握りつぶす）
  const requestTranslate = useCallback((index: number, text: string) => {
    const cachedZh = cachedTranslation(text);
    if (cachedZh) { setSubs((s) => ({ ...s, [index]: { zh: cachedZh, state: 'shown' } })); return; }
    setSubs((s) => ({ ...s, [index]: { state: 'pending' } }));
    void translateTutorLine(sessionId, text, targetHint).then((r) => {
      if (r.ok && r.zh) {
        setSubs((s) => ({ ...s, [index]: { zh: r.zh as string, state: 'shown' } }));
        translateCostRef.current += estimateTranslateCostUsd(r.usage);
      } else {
        setSubs((s) => ({ ...s, [index]: { state: 'error' } }));
      }
    });
  }, [sessionId, targetHint]);

  // 確定した翔子先生の発話だけを対象に、モードに応じて自動翻訳する。
  // ・ja_zh: 常時 / ・whenStuck: 困った合図のときだけ / ・ja: なにもしない
  // 暫定字幕(liveT)や生徒の発話は対象にしない。
  useEffect(() => {
    if (!zhAssistAvailable(subtitleMode)) return;
    msgs.forEach((m, i) => {
      if (m.role !== 'tutor' || processedRef.current.has(i)) return;
      processedRef.current.add(i);
      let prevStudent: string | null = null;
      for (let k = i - 1; k >= 0; k--) { if (msgs[k].role === 'student') { prevStudent = msgs[k].text; break; } }
      const tutorLines = msgs.slice(0, i + 1).filter((x) => x.role === 'tutor').map((x) => x.text);
      const repeated = isRepeatedTutorQuestion(m.text, tutorLines);
      const auto = autoTranslateAll(subtitleMode)
        || (subtitleMode === 'whenStuck'
          && shouldAutoShowOnStuck({ tutorText: m.text, prevStudentText: prevStudent, tutorRepeatedQuestion: repeated }));
      if (auto) requestTranslate(i, m.text);
    });
  }, [msgs, subtitleMode, requestTranslate]);

  const handleSummaryEnd = () => {
    setConfirmOpen(false);
    if (doneRef.current) return;
    if (status !== 'connected') { sessionRef.current?.stop(); setInterrupted(true); return; }
    setEnding(true);
    sessionRef.current?.sendCue('生徒がレッスンの終了を希望しています。15秒程度で短くまとめて（今日できたこと＋明日の復習予告）、finish_lesson を呼んでください。', { switchToWrapUp: true, respondIfIdle: true });
    const id = setTimeout(() => complete('manual-summary', 'completed', true), 25000);
    timers.current.push(id);
  };
  const stopNow = () => { sessionRef.current?.stop(); setEnding(false); setInterrupted(true); };
  // 言語切替は音声セッションを継続したまま表示言語だけ変える（mount一回化により再起動しない）
  const confirmLangSwitch = () => { setLangConfirmOpen(false); onToggleLang(); };
  const doRetry = () => { if (retry >= MAX_RETRY) return; setRetry((c) => c + 1); void start(); };
  const switchText = () => { sessionRef.current?.stop(); onSwitchToText(); };
  const partialReport = () => complete('interrupted', 'interrupted', false);

  const statusLine = () => ending ? tv.endingSummary : status === 'requesting-mic' ? tv.statusMicPermission
    : status === 'connecting' ? tv.statusConnecting : inExt ? tv.finalPractice
      : tutorSpeaking ? tv.statusTutorSpeaking : tv.statusListening;

  if (doneOverlay) return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
      <div className="text-center">
        {/* 完了の達成感（翔子先生が拍手・会話終了後なので集中は妨げない） */}
        <CourseIllustration slot="complete" width={110} lang={t.locale === 'zh' ? 'zh' : 'ja'} decorative className="mx-auto mb-3" />
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          <p className="font-bold text-gray-900 text-lg">{tv.completedMessage}</p>
        </div>
        <p className="text-sm text-gray-500 mt-1">{tv.completedSub}</p>
      </div>
    </div>
  );

  if (errorKind === 'mic-denied' && status === 'error') return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4"><MicOff className="w-6 h-6 text-amber-600" /></div>
        <p className="text-sm text-gray-700 leading-relaxed mb-5">{tv.micDenied}</p>
        {isWeChat() && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mb-4">{tv.wechatWarning}</p>}
        <button type="button" onClick={switchText} className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 action-raised action-primary-blue touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><PenLine className="w-4 h-4" />{tv.switchToText}</button>
      </div>
    </div>
  );

  if ((errorKind && status === 'error') || interrupted) {
    const hasProgress = msgs.length > 0;
    const canRetry = !hasProgress && retry < MAX_RETRY && !interrupted;
    const message = interrupted ? tv.interruptedTitle : errorKind === 'disconnected' ? tv.connectionLost : retry >= MAX_RETRY ? tv.retryLimit : tv.connectFailed;
    return (
      <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-6 h-6 text-amber-600" /></div>
          <p className="text-sm text-gray-700 leading-relaxed mb-5">{message}</p>
          <div className="space-y-2">
            {hasProgress && <button type="button" onClick={partialReport} className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 action-raised action-primary-blue touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><FileText className="w-4 h-4" />{tv.viewPartialReport}</button>}
            {canRetry && <button type="button" onClick={doRetry} className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 action-raised action-primary-blue touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><RefreshCw className="w-4 h-4" />{tv.retry}</button>}
            <button type="button" onClick={switchText} className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl flex items-center justify-center gap-2 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><PenLine className="w-4 h-4" />{tv.switchToText}</button>
          </div>
        </div>
      </div>
    );
  }

  // 最新の翔子先生発話（強調表示用）
  let lastTutorIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'tutor') { lastTutorIdx = i; break; } }

  const langBtn = (
    <button type="button" onClick={() => setLangConfirmOpen(true)}
      aria-label={lang === 'ja' ? '切换到中文' : '日本語に切り替える'}
      className="min-h-11 px-2.5 text-xs font-medium text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg flex items-center gap-1 shrink-0 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
      <Languages className="w-3.5 h-3.5" />{lang === 'ja' ? '中文' : '日本語'}
    </button>
  );

  // 目標表現カード（PC右パネル）。答えを隠す回は中国語意味を出さない
  const targetCard = (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-1"><Flag className="w-3.5 h-3.5 text-amber-500" />{tl.theme}</p>
      <p className="text-sm font-bold text-gray-900 leading-snug">{t.locale === 'zh' ? mission.titleZh : mission.titleJa}</p>
      {step.hideTarget ? (
        <p className="text-xs text-gray-500 mt-2">{tl.hiddenTarget}</p>
      ) : (
        <>
          <p className="text-base font-bold text-blue-700 mt-2 leading-snug break-words">{mission.targetExpression}</p>
          {zhAssistAvailable(subtitleMode) && mission.meaningZh && (
            <p className="text-[13px] text-gray-500 mt-1 leading-relaxed break-words">{mission.meaningZh}</p>
          )}
        </>
      )}
    </div>
  );

  const pulseStatus: VoicePulseStatus =
    status !== 'connected' ? (status === 'connecting' || status === 'requesting-mic' ? 'connecting' : 'idle')
      : tutorSpeaking ? 'tutorSpeaking' : userSpeaking ? 'userSpeaking' : 'listening';
  const statusIndicator = (big = false) => (
    <div className="flex items-center gap-3">
      <VoicePulse status={pulseStatus} big={big} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800" aria-live="polite">{statusLine()}</p>
        <p className="text-[11px] text-gray-400">{tv.transcriptNote}</p>
      </div>
    </div>
  );

  const conversation = (
    <>
      {shouldShowGreetingGuide({ connected: status === 'connected', hasMeaningfulUserTurn: hasMeaningfulTurn, ended: doneOverlay || ending }) && !liveT && (
        <div className="mx-auto max-w-sm text-center py-6 px-4">
          <ShokoAvatar size={56} className="mx-auto mb-3 ring-4 ring-blue-100 voice-breathe" />
          <p className="text-base font-bold text-gray-900 leading-snug">{tv.greetingGuideTitle}</p>
          <div className="inline-flex items-center gap-2 mt-3 mb-2 px-4 py-2 bg-blue-50 rounded-2xl">
            <Mic className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-lg font-bold text-blue-700">「{tv.greetingExample}」</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{tv.greetingGuideHint}</p>
        </div>
      )}
      {(status === 'requesting-mic' || status === 'connecting') && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ShokoAvatar size={72} className="ring-4 ring-blue-100 voice-breathe" />
          <p className="text-sm text-gray-600">{statusLine()}</p>
        </div>
      )}
      {msgs.map((m, i) => {
        const isStudent = m.role === 'student';
        const emphasize = i === lastTutorIdx; // 最新の翔子先生発話を少し大きく
        const turnStart = i === 0 || msgs[i - 1].role !== m.role; // 話者が変わった最初の発話
        return (
          <div key={i} className={`flex gap-2 ${isStudent ? 'justify-end' : 'justify-start'} ${turnStart ? 'mt-1' : ''}`}>
            {/* 翔子先生のターン頭にだけアバター（連続発話はスペーサーで揃える） */}
            {!isStudent && (turnStart
              ? <ShokoAvatar size={28} className="shrink-0 mt-5" />
              : <div className="w-7 shrink-0" aria-hidden />)}
            <div className="max-w-[85%] lg:max-w-[78%]">
              {turnStart && <p className="text-[11px] lg:text-xs text-gray-500 mb-0.5 px-1">{isStudent ? (t.locale === 'zh' ? '你' : 'あなた') : (t.locale === 'zh' ? '翔子老师' : '翔子先生')}</p>}
              <div className={`px-4 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap break-words ${
                isStudent
                  ? 'bg-blue-600 text-white rounded-tr-sm text-[15px] lg:text-base'
                  : `bg-white text-gray-900 border border-gray-200 rounded-tl-sm ${emphasize ? 'text-[17px] lg:text-lg font-medium shadow-sm' : 'text-[15px] lg:text-base'}`
              }`}>{m.text}</div>
              {m.role === 'tutor' && zhAssistAvailable(subtitleMode) && (
                <ZhAssist sub={subs[i]} tv={tv} onShow={() => requestTranslate(i, m.text)} />
              )}
            </div>
          </div>
        );
      })}
      {liveT && <div className="flex justify-start"><div className="max-w-[85%] lg:max-w-[78%]"><div className="px-4 py-2.5 rounded-2xl rounded-tl-sm text-[15px] bg-white/80 text-gray-500 border border-gray-200 border-dashed">{liveT}</div></div></div>}
      {liveU && <div className="flex justify-end"><div className="max-w-[85%] lg:max-w-[78%]"><div className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] bg-blue-400/70 text-white">{liveU}</div></div></div>}
    </>
  );

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>
      {/* ── トップバー ── */}
      <div className="bg-white border-b border-gray-200 px-3 lg:px-4 py-2 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <button type="button" onClick={() => setConfirmOpen(true)} disabled={ending} aria-label={tv.endLessonButton}
            className="min-h-11 -ml-1 px-2 flex items-center gap-1 text-gray-500 hover:text-gray-700 rounded-lg disabled:opacity-40 transition-colors active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <X className="w-5 h-5" /><span className="text-xs font-medium whitespace-nowrap">{tv.endLessonButton}</span>
          </button>
          <div className="flex items-center gap-2">
            {langBtn}
            <div className="flex items-center gap-1.5">
              <Clock className={`w-4 h-4 ${remaining <= 30 && !inExt ? 'text-red-500' : 'text-blue-600'}`} />
              <span className={`font-mono font-bold text-lg tabular-nums ${remaining <= 30 && !inExt ? 'text-red-600' : 'text-gray-900'}`}>{fmt(remaining)}</span>
            </div>
            <span className={`text-[11px] font-medium px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${isReview ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {kindLabel}
            </span>
          </div>
        </div>
        {/* スマホ/タブレット用の目標表現行（PCは右パネルに出す） */}
        <div className="lg:hidden max-w-6xl mx-auto">
          <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 overflow-hidden">
            <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{tl.theme}: {t.locale === 'zh' ? mission.titleZh : mission.titleJa}
              {step.hideTarget ? ` ／ ${tl.hiddenTarget}` : ` ／ ${tl.target}: ${mission.targetExpression}`}</span>
          </p>
          {!step.hideTarget && zhAssistAvailable(subtitleMode) && mission.meaningZh && (
            <p className="text-[11px] text-gray-500 mt-0.5 pl-[18px] truncate">{mission.meaningZh}</p>
          )}
        </div>
      </div>

      {(inExt || ending) && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 shrink-0">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
            <p className="text-sm text-amber-800 font-medium min-w-0">{ending ? tv.endingSummary : tv.finalPractice}</p>
            <button type="button" onClick={stopNow} className="min-h-9 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 bg-white rounded-lg flex items-center gap-1 shrink-0 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><Square className="w-3 h-3" />{tv.emergencyStop}</button>
          </div>
        </div>
      )}
      {isWeChat() && status !== 'connected' && <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 shrink-0"><p className="text-xs text-amber-800 max-w-6xl mx-auto">{tv.wechatWarning}</p></div>}

      {/* ── 本体: スマホ=1カラム / PC=会話（左）＋補助（右）の2カラム ── */}
      <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto flex flex-col lg:flex-row">
        {/* 左: 会話 */}
        <div className="flex-1 min-h-0 relative flex flex-col">
          <div ref={scrollRef} onScroll={onHistoryScroll} className="flex-1 overflow-y-auto px-3 lg:px-6 py-3 lg:py-5 space-y-3 overscroll-contain">
            {conversation}
          </div>
          {/* 最新へ戻る（過去ログ閲覧中のみ） */}
          {!atBottom && (
            <button type="button" onClick={() => scrollToLatest()}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 min-h-9 px-3 py-1.5 bg-gray-900/85 text-white text-xs font-medium rounded-full shadow-lg flex items-center gap-1 transition-colors active:bg-gray-800 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              <ChevronDown className="w-3.5 h-3.5" />{tv.backToLatest}
            </button>
          )}
          {/* スマホ用の下部ステータスバー（PCは右パネルへ） */}
          <div className="lg:hidden bg-white border-t border-gray-200 px-4 pt-3 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">{statusIndicator(false)}</div>
              <button type="button" onClick={switchText} className="min-h-11 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 shrink-0 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><PenLine className="w-3.5 h-3.5" />{tv.switchToText}</button>
            </div>
          </div>
        </div>

        {/* 右: 補助パネル（PCのみ） */}
        <aside className="hidden lg:flex lg:flex-col lg:w-80 xl:w-96 shrink-0 border-l border-gray-200 bg-white p-5 gap-4 overflow-y-auto">
          {targetCard}
          {statusIndicator(true)}
          {zhAssistAvailable(subtitleMode) && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Subtitles className="w-4 h-4 text-blue-500" />
              {subtitleMode === 'ja_zh' ? t.settings.subtitleModes.ja_zh : subtitleMode === 'whenStuck' ? t.settings.subtitleModes.whenStuck : t.settings.subtitleModes.ja}
            </div>
          )}
          <button type="button" onClick={switchText} className="mt-auto min-h-11 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg flex items-center justify-center gap-1.5 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><PenLine className="w-4 h-4" />{tv.switchToText}</button>
        </aside>
      </div>

      <ConfirmDialog open={confirmOpen} title={tv.endSummaryConfirm} confirmLabel={tv.endSummarize} cancelLabel={tv.endContinue} onConfirm={handleSummaryEnd} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog open={langConfirmOpen} title={tv.langSwitchConfirm} confirmLabel={tv.langSwitchOnly} cancelLabel={tv.endContinue} onConfirm={confirmLangSwitch} onCancel={() => setLangConfirmOpen(false)} />
      {/* onExit is used by parent when leaving; keep referenced */}
      <button type="button" onClick={onExit} className="hidden" aria-hidden />
    </div>
  );
};

/**
 * 翔子先生の発話の下に出す中国語補助字幕。
 * - 日本語より小さく・薄く（主役を日本語にする）
 * - まだ翻訳していない（whenStuckで未トリガー）ときは「中文を見る」ボタン
 * - 失敗時は静かに再取得ボタン。音声・日本語字幕は止めない
 */
const ZhAssist = ({ sub, tv, onShow }: {
  sub: SubState | undefined;
  tv: AiCourseDict['voice'];
  onShow: () => void;
}) => {
  // コントラスト確保のため gray-600（WCAG AA相当）。日本語より小さいが読める大きさに。
  if (sub?.state === 'shown' && sub.zh) {
    return <p className="text-[13px] lg:text-sm text-gray-600 mt-1 px-1 leading-relaxed whitespace-pre-wrap break-words">{sub.zh}</p>;
  }
  if (sub?.state === 'pending') {
    return <p className="text-[13px] text-gray-400 mt-1 px-1">{tv.subtitleTranslating}</p>;
  }
  // 未翻訳（whenStuckで未トリガー）または失敗 → 「中文を見る」ボタン
  return (
    <button type="button" onClick={onShow}
      className="min-h-11 text-[13px] text-blue-600 hover:text-blue-700 mt-1 px-1 underline decoration-dotted transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
      {sub?.state === 'error' ? tv.subtitleRetry : tv.subtitleShowZh}
    </button>
  );
};
