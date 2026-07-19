// コースの音声レッスン。voiceSession(WebRTC) を使い、ミッション文脈でゆい先生と会話する。
// 終了体験（2:30着地→最大4分→finish_lesson→自動完了）と冪等cleanupは voiceSession 側で担保。
// 完了時に発話ログ＋目標表現の使用判定を onComplete で返す（Supabase保存はページ側）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Clock, Flag, Mic, MicOff, PenLine, Volume2, CheckCircle2, AlertTriangle, RefreshCw, FileText, Square } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { startVoiceSession } from '../../lib/aiLesson/voiceSession';
import type { VoiceErrorKind, VoiceSessionHandle, VoiceSessionStatus } from '../../lib/aiLesson/voiceSession';
import { buildVoicePayload, detectTargetUsage } from '../../lib/aiLesson/course/courseLesson';
import { getAccessToken } from '../../lib/aiLesson/course/courseAuth';
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
}

interface Props {
  t: AiCourseDict;
  learner: Learner;
  step: LessonPlanStep;
  /** ai_start_session で予約済みのセッションID。トークン発行の認可に使う */
  sessionId: string | null;
  onComplete: (r: VoiceLessonResult) => void;
  onSwitchToText: () => void;
  onExit: () => void;
}

const DURATION = 180, HARD_END = 240, CLOSING_BEFORE = 30;
const COMPLETE_OVERLAY_MS = 1600, MAX_RETRY = 2;
const isWeChat = () => /MicroMessenger/i.test(navigator.userAgent);
const hasZh = (s: string) => /(你|我们|什么|怎么|没有|可以|意思|就是|因为|所以|一下|这个|那个)/.test(s);
const fmt = (sec: number) => `${Math.floor(Math.max(sec, 0) / 60)}:${String(Math.max(sec, 0) % 60).padStart(2, '0')}`;

export const CourseVoiceLesson = ({ t, learner, step, sessionId, onComplete, onSwitchToText, onExit }: Props) => {
  const tv = t.voice, tl = t.lesson;
  const mission = step.mission;
  const isReview = step.kind !== 'new';
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

  const sessionRef = useRef<VoiceSessionHandle | null>(null);
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
    sessionRef.current = startVoiceSession({
      sessionId, accessToken, plan: payload,
      callbacks: {
        onStatus: (s) => {
          setStatus(s);
          if (s === 'connected' && startAtRef.current === null) { startAtRef.current = Date.now(); log({ speaker: 'system', transcript: 'connected', atMs: 0, isFinal: true, relatedTarget: false }); }
        },
        onUserTranscript: (text, isFinal) => {
          if (!isFinal) { setLiveU((p) => p + text); return; }
          setLiveU(''); const tr = text.trim(); if (!tr) return;
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
        onTutorSpeaking: setTutorSpeaking, onUserSpeaking: setUserSpeaking,
        onError: (kind) => { log({ speaker: 'system', transcript: `error:${kind}`, atMs: 0, isFinal: true, relatedTarget: false }); setErrorKind(kind); },
        onFinishLesson: (reason) => complete(reason === 'student_request' ? 'student-request' : 'completed', 'completed', true),
      },
    });
  }, [learner, mission, step, complete, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => { void start(() => cancelled); }, 0);
    const tm = timers.current;
    return () => {
      cancelled = true;
      clearTimeout(id);
      tm.forEach(clearTimeout);
      sessionRef.current?.stop();
    };
  }, [start]);

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

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, liveT, liveU]);

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
  const doRetry = () => { if (retry >= MAX_RETRY) return; setRetry((c) => c + 1); void start(); };
  const switchText = () => { sessionRef.current?.stop(); onSwitchToText(); };
  const partialReport = () => complete('interrupted', 'interrupted', false);

  const statusLine = () => ending ? tv.endingSummary : status === 'requesting-mic' ? tv.statusMicPermission
    : status === 'connecting' ? tv.statusConnecting : inExt ? tv.finalPractice
      : tutorSpeaking ? tv.statusTutorSpeaking : tv.statusListening;

  if (doneOverlay) return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-emerald-600" /></div>
        <p className="font-bold text-gray-900 text-lg">{tv.completedMessage}</p>
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
        <button type="button" onClick={switchText} className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"><PenLine className="w-4 h-4" />{tv.switchToText}</button>
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
            {hasProgress && <button type="button" onClick={partialReport} className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"><FileText className="w-4 h-4" />{tv.viewPartialReport}</button>}
            {canRetry && <button type="button" onClick={doRetry} className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" />{tv.retry}</button>}
            <button type="button" onClick={switchText} className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl flex items-center justify-center gap-2"><PenLine className="w-4 h-4" />{tv.switchToText}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="bg-white border-b border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setConfirmOpen(true)} disabled={ending} aria-label={tv.endLessonButton}
            className="min-h-11 -ml-1 px-2 flex items-center gap-1 text-gray-500 hover:text-gray-700 rounded-lg disabled:opacity-40">
            <X className="w-5 h-5" /><span className="text-xs font-medium whitespace-nowrap">{tv.endLessonButton}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <Clock className={`w-4 h-4 ${remaining <= 30 && !inExt ? 'text-red-500' : 'text-blue-600'}`} />
            <span className={`font-mono font-bold text-lg tabular-nums ${remaining <= 30 && !inExt ? 'text-red-600' : 'text-gray-900'}`}>{fmt(remaining)}</span>
          </div>
          <span className={`text-[11px] font-medium px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${isReview ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {kindLabel}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 overflow-hidden">
          <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate">{tl.theme}: {t.locale === 'zh' ? mission.titleZh : mission.titleJa}
            {step.hideTarget ? ` ／ ${tl.hiddenTarget}` : ` ／ ${tl.target}: ${mission.targetExpression}`}</span>
        </p>
      </div>

      {(inExt || ending) && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-amber-800 font-medium min-w-0">{ending ? tv.endingSummary : tv.finalPractice}</p>
          <button type="button" onClick={stopNow} className="min-h-9 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 bg-white rounded-lg flex items-center gap-1 shrink-0"><Square className="w-3 h-3" />{tv.emergencyStop}</button>
        </div>
      )}
      {isWeChat() && status !== 'connected' && <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 shrink-0"><p className="text-xs text-amber-800">{tv.wechatWarning}</p></div>}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {status === 'connected' && msgs.length === 0 && !liveT && <p className="text-xs text-gray-500 text-center py-4">{tv.speakFirstHint}</p>}
        {(status === 'requesting-mic' || status === 'connecting') && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center animate-pulse"><Mic className="w-7 h-7 text-blue-600" /></div>
            <p className="text-sm text-gray-600">{statusLine()}</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-0.5 px-1">{m.role === 'student' ? tl.target && '' : ''}{m.role === 'student' ? (t.locale === 'zh' ? '你' : 'あなた') : (t.locale === 'zh' ? '结衣老师' : 'ゆい先生')}</p>
              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${m.role === 'student' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'}`}>{m.text}</div>
            </div>
          </div>
        ))}
        {liveT && <div className="flex justify-start"><div className="max-w-[85%]"><div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm bg-white/70 text-gray-500 border border-gray-200 border-dashed">{liveT}</div></div></div>}
        {liveU && <div className="flex justify-end"><div className="max-w-[85%]"><div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm bg-blue-400/60 text-white">{liveU}</div></div></div>}
      </div>

      <div className="bg-white border-t border-gray-200 px-4 pt-3 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${status !== 'connected' ? 'bg-gray-100 text-gray-400' : tutorSpeaking ? 'bg-blue-100 text-blue-600' : userSpeaking ? 'bg-emerald-100 text-emerald-600 animate-pulse' : 'bg-emerald-50 text-emerald-500'}`}>
            {tutorSpeaking ? <Volume2 className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-800 truncate">{statusLine()}</p><p className="text-[11px] text-gray-400 truncate">{tv.transcriptNote}</p></div>
          <button type="button" onClick={switchText} className="min-h-11 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 shrink-0"><PenLine className="w-3.5 h-3.5" />{tv.switchToText}</button>
        </div>
      </div>

      <ConfirmDialog open={confirmOpen} title={tv.endSummaryConfirm} confirmLabel={tv.endSummarize} cancelLabel={tv.endContinue} onConfirm={handleSummaryEnd} onCancel={() => setConfirmOpen(false)} />
      {/* onExit is used by parent when leaving; keep referenced */}
      <button type="button" onClick={onExit} className="hidden" aria-hidden />
    </div>
  );
};
