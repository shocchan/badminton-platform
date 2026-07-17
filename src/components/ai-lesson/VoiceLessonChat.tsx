// 3分音声レッスン本体（集中モード・LessonChatと同じ全画面フレーム）
// - 音声通信は voiceSession.ts に委譲。このコンポーネントはUI・タイマー・学習判定・ログのみ
// - タイマーは接続完了時刻からの実経過（バックグラウンド遷移後も復帰時に補正）
// - 残り35秒で session.update によるまとめ移行シグナル → 3分でまとめ猶予バナー → 3分30秒で強制終了
// - 失敗時は再試行（最大2回）またはテキストモードへのフォールバック

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Clock, Flag, Mic, MicOff, PenLine, RefreshCw, Volume2, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { startVoiceSession } from '../../lib/aiLesson/voiceSession';
import type { VoiceErrorKind, VoiceSessionHandle, VoiceSessionStatus } from '../../lib/aiLesson/voiceSession';
import { appendVoiceLog } from '../../lib/aiLesson/repository';
import type { VoiceLogEntry } from '../../lib/aiLesson/repository';
import type { TutorOutcome } from '../../lib/aiLesson/tutorEngine';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { ChatMessage, LearningPlan } from '../../lib/aiLesson/types';

interface Props {
  t: AiLessonDict;
  plan: LearningPlan;
  courseMinutes: number;
  onFinish: (outcome: TutorOutcome, elapsedSeconds: number) => void;
  /** 音声が使えない・使いたくない時に既存テキストモードへ切り替える */
  onSwitchToText: () => void;
}

const formatTime = (sec: number): string => {
  const m = Math.floor(Math.max(sec, 0) / 60);
  const s = Math.max(sec, 0) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** 簡易的な中国語（簡体字圏の常用語）検出。ログ用の目安であり厳密ではない */
const hasChinese = (text: string): boolean =>
  /(你|我们|什么|怎么|没有|可以|意思|就是|因为|所以|一下|这个|那个)/.test(text);

const WRAP_SIGNAL_BEFORE_SEC = 35; // 残り35秒でまとめ移行を指示
const SUMMARY_GRACE_SEC = 30;      // 3分経過後のまとめ猶予（超えたら強制終了）
const MAX_RETRY = 2;

const isWeChatBrowser = (): boolean => /MicroMessenger/i.test(navigator.userAgent);

export const VoiceLessonChat = ({ t, plan, courseMinutes, onFinish, onSwitchToText }: Props) => {
  const tl = t.lesson;
  const tv = t.voice;
  const duration = courseMinutes * 60;

  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveTutor, setLiveTutor] = useState('');
  const [liveUser, setLiveUser] = useState('');
  const [tutorSpeaking, setTutorSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const sessionRef = useRef<VoiceSessionHandle | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const entriesRef = useRef<VoiceLogEntry[]>([]);
  const errorsRef = useRef<string[]>([]);
  const startAtRef = useRef<number | null>(null); // 接続完了時刻（タイマー基準）
  const sessionStartISORef = useRef<string>(new Date().toISOString());
  const finishedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const themeLabel = t.plan.themes[plan.themeKey as keyof typeof t.plan.themes] ?? plan.themeKey;
  const remaining = duration - elapsed;
  const inSummaryGrace = elapsed >= duration;

  const logEntry = (entry: Omit<VoiceLogEntry, 'atMs'>) => {
    const atMs = startAtRef.current ? Date.now() - startAtRef.current : 0;
    entriesRef.current.push({ ...entry, atMs });
  };

  const pushMessage = (m: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, m];
    setMessages(messagesRef.current);
  };

  /** 会話ログから学習結果を組み立てる。
   *  目標表現の判定は保守的に: 直前のゆい先生の発話に目標表現が含まれていた場合
   *  （お手本・復唱直後の可能性が高い）は 'self' ではなく 'hint' 扱いにする。 */
  const buildOutcome = (): TutorOutcome => {
    const detect = plan.target.detect;
    let usage: 'self' | 'hint' | null = null;
    let useCount = 0;
    let lastTutorText = '';
    for (const m of messagesRef.current) {
      if (m.role === 'tutor') {
        lastTutorText = m.text;
        continue;
      }
      if (detect.test(m.text)) {
        useCount += 1;
        const thisUsage: 'self' | 'hint' = detect.test(lastTutorText) ? 'hint' : 'self';
        if (usage !== 'self') usage = thisUsage === 'self' ? 'self' : 'hint';
      }
    }
    return {
      expressions: [{ label: plan.target.label, zhMeaning: plan.target.zhMeaning, usage: usage ?? 'learned' }],
      corrections: [], // 音声MVPでは自動抽出しない（フェーズ2: ai-lesson-report で会話ログから抽出）
      missionAchieved: useCount >= 1,
    };
  };

  const finish = useCallback((reason: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    sessionRef.current?.stop();

    const outcome = buildOutcome();
    const targetUseEntries = entriesRef.current.filter((e) => e.speaker === 'student' && e.targetUse);
    appendVoiceLog({
      startedAtISO: sessionStartISORef.current,
      endedAtISO: new Date().toISOString(),
      endReason: reason,
      entries: entriesRef.current,
      targetUseCount: targetUseEntries.length,
      targetUsage: outcome.expressions[0]?.usage === 'learned' ? null : (outcome.expressions[0]?.usage as 'self' | 'hint'),
      connectionErrors: errorsRef.current,
    });

    const elapsedSec = startAtRef.current
      ? Math.min(Math.floor((Date.now() - startAtRef.current) / 1000), duration + SUMMARY_GRACE_SEC)
      : 0;
    onFinish(outcome, elapsedSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, onFinish, plan]);

  const start = useCallback(async () => {
    setErrorKind(null);
    setStatus('requesting-mic');
    const code = (import.meta.env.VITE_AI_LESSON_DEMO_CODE as string | undefined) ?? '';
    const session = await startVoiceSession({
      code,
      plan: {
        themeLabel,
        estimatedLevel: plan.estimatedLevel,
        zhSupport: plan.zhSupport,
        correction: plan.correction,
        target: {
          label: plan.target.label,
          example: plan.target.example,
          zhMeaning: plan.target.zhMeaning,
          zhExample: plan.target.zhExample,
        },
      },
      callbacks: {
        onStatus: (s) => {
          setStatus(s);
          if (s === 'connected' && startAtRef.current === null) {
            startAtRef.current = Date.now();
            logEntry({ speaker: 'system', text: 'connected' });
          }
        },
        onUserTranscript: (text, isFinal) => {
          if (!isFinal) {
            setLiveUser((prev) => prev + text);
            return;
          }
          setLiveUser('');
          const trimmed = text.trim();
          if (!trimmed) return;
          pushMessage({ role: 'student', text: trimmed });
          logEntry({
            speaker: 'student',
            text: trimmed,
            targetUse: plan.target.detect.test(trimmed),
            hasZh: hasChinese(trimmed),
          });
        },
        onTutorTranscript: (text, isFinal) => {
          if (!isFinal) {
            setLiveTutor(text);
            return;
          }
          setLiveTutor('');
          const trimmed = text.trim();
          if (!trimmed) return;
          pushMessage({ role: 'tutor', text: trimmed });
          logEntry({ speaker: 'tutor', text: trimmed, hasZh: hasChinese(trimmed) });
        },
        onTutorSpeaking: setTutorSpeaking,
        onUserSpeaking: setUserSpeaking,
        onError: (kind, message) => {
          errorsRef.current.push(`${kind}${message ? `:${message}` : ''}`);
          logEntry({ speaker: 'system', text: `error:${kind}` });
          setErrorKind(kind);
        },
      },
    });
    sessionRef.current = session;
  }, [plan, themeLabel]);

  // 初回マウントで接続開始（setTimeoutで1tick遅らせ、effect内の同期setStateを避ける）。
  // アンマウント時は必ず切断（マイク停止・PeerConnection close）
  useEffect(() => {
    const id = setTimeout(() => { void start(); }, 0);
    return () => {
      clearTimeout(id);
      sessionRef.current?.stop();
    };
  }, [start]);

  // タイマー: 接続完了時刻からの実経過（visibilitychangeで復帰時にも補正）
  useEffect(() => {
    if (status !== 'connected') return;
    const tick = () => {
      if (startAtRef.current === null) return;
      setElapsed(Math.min(Math.floor((Date.now() - startAtRef.current) / 1000), duration + SUMMARY_GRACE_SEC));
    };
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [status, duration]);

  // 残り35秒: まとめ移行シグナル（session.update）
  const wrapSentRef = useRef(false);
  useEffect(() => {
    if (wrapSentRef.current || status !== 'connected') return;
    if (remaining <= WRAP_SIGNAL_BEFORE_SEC) {
      wrapSentRef.current = true;
      sessionRef.current?.sendWrapUpSignal();
      logEntry({ speaker: 'system', text: 'wrapup-signal' });
    }
  }, [remaining, status]);

  // 3分30秒（duration + 猶予）で強制終了
  useEffect(() => {
    if (elapsed >= duration + SUMMARY_GRACE_SEC && !finishedRef.current) {
      finish('timeout');
    }
  }, [elapsed, duration, finish]);

  // 新着で最下部へスクロール
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, liveTutor, liveUser]);

  const handleRetry = () => {
    if (retryCount >= MAX_RETRY) return;
    setRetryCount((c) => c + 1);
    void start();
  };

  const handleSwitchToText = () => {
    sessionRef.current?.stop();
    if (!finishedRef.current) {
      logEntry({ speaker: 'system', text: 'fallback-to-text' });
    }
    onSwitchToText();
  };

  const statusLine = (): string => {
    if (finishing) return tv.statusEnding;
    if (status === 'requesting-mic') return tv.statusMicPermission;
    if (status === 'connecting') return tv.statusConnecting;
    if (inSummaryGrace) return tv.summaryPhase;
    if (tutorSpeaking) return tv.statusTutorSpeaking;
    return tv.statusListening;
  };

  // ── エラー画面（接続前後の失敗・切断） ──
  if (errorKind && status === 'error') {
    const canRetry = errorKind !== 'mic-denied' && retryCount < MAX_RETRY;
    const message =
      errorKind === 'mic-denied' ? tv.micDenied
        : errorKind === 'disconnected' ? tv.connectionLost
          : retryCount >= MAX_RETRY ? tv.retryLimit : tv.connectFailed;
    return (
      <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            {errorKind === 'mic-denied'
              ? <MicOff className="w-6 h-6 text-amber-600" />
              : <AlertTriangle className="w-6 h-6 text-amber-600" />}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-5">{message}</p>
          {isWeChatBrowser() && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mb-4">{tv.wechatWarning}</p>
          )}
          <div className="space-y-2">
            {canRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {tv.retry}
              </button>
            )}
            <button
              type="button"
              onClick={handleSwitchToText}
              className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <PenLine className="w-4 h-4" />
              {tv.switchToText}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-gray-50 flex flex-col"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ── 上部バー: 終了 / 残り時間 / 状態 ── */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={tl.endLesson}
            className="min-h-11 min-w-11 -ml-1 px-2 flex items-center gap-1 text-gray-500 hover:text-gray-700 rounded-lg"
          >
            <X className="w-5 h-5" />
            <span className="text-xs font-medium">{tl.endShort}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <Clock className={`w-4 h-4 ${remaining <= 30 && !inSummaryGrace ? 'text-red-500' : 'text-blue-600'}`} />
            <span className={`font-mono font-bold text-lg tabular-nums ${remaining <= 30 && !inSummaryGrace ? 'text-red-600' : 'text-gray-900'}`}>
              {formatTime(remaining)}
            </span>
          </div>
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${
            status === 'connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
          }`}>
            {status === 'connected' && <Mic className="w-3 h-3" />}
            {statusLine()}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 overflow-hidden">
          <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate">
            {tl.theme}: {themeLabel} ／ {tl.target}: {plan.target.label}
          </span>
        </p>
      </div>

      {/* ── まとめ猶予バナー ── */}
      {inSummaryGrace && !finishing && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-2 shrink-0">
          <p className="text-sm text-emerald-800 font-medium">{tv.summaryPhase}</p>
        </div>
      )}

      {/* ── WeChat内ブラウザ警告 ── */}
      {isWeChatBrowser() && status !== 'connected' && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 shrink-0">
          <p className="text-xs text-amber-800">{tv.wechatWarning}</p>
        </div>
      )}

      {/* ── 文字起こし（この領域だけがスクロールする） ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {status === 'connected' && messages.length === 0 && !liveTutor && (
          <p className="text-xs text-gray-500 text-center py-4">{tv.speakFirstHint}</p>
        )}
        {(status === 'requesting-mic' || status === 'connecting') && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
              <Mic className="w-7 h-7 text-blue-600" />
            </div>
            <p className="text-sm text-gray-600">{statusLine()}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-0.5 px-1">
                {m.role === 'student' ? tl.youName : tl.tutorName}
              </p>
              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                m.role === 'student'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'
              }`}>
                {m.text}
              </div>
            </div>
          </div>
        ))}
        {/* 進行中の文字起こし（薄色で表示） */}
        {liveTutor && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-0.5 px-1">{tl.tutorName}</p>
              <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap break-words bg-white/70 text-gray-500 border border-gray-200 border-dashed">
                {liveTutor}
              </div>
            </div>
          </div>
        )}
        {liveUser && (
          <div className="flex justify-end">
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-0.5 px-1">{tl.youName}</p>
              <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words bg-blue-400/60 text-white">
                {liveUser}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 下部: 会話状態インジケーター＋操作 ── */}
      <div className="bg-white border-t border-gray-200 px-4 pt-3 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3">
          {/* 状態サークル: ゆい先生が話す時は青、聞いている時は緑で脈動 */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            status !== 'connected'
              ? 'bg-gray-100 text-gray-400'
              : tutorSpeaking
                ? 'bg-blue-100 text-blue-600'
                : userSpeaking
                  ? 'bg-emerald-100 text-emerald-600 animate-pulse'
                  : 'bg-emerald-50 text-emerald-500'
          }`}>
            {tutorSpeaking ? <Volume2 className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-800 truncate">{statusLine()}</p>
            <p className="text-[11px] text-gray-400 truncate">{tv.transcriptNote}</p>
          </div>
          <button
            type="button"
            onClick={handleSwitchToText}
            className="min-h-11 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 shrink-0"
          >
            <PenLine className="w-3.5 h-3.5" />
            {tv.switchToText}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={tl.endConfirm}
        confirmLabel={tl.endConfirmYes}
        cancelLabel={tl.endConfirmNo}
        onConfirm={() => { setConfirmOpen(false); finish('manual'); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
