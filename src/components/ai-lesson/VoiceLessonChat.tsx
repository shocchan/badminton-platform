// 3分音声レッスン本体（集中モード・LessonChatと同じ全画面フレーム）
// - 音声通信は voiceSession.ts に委譲。このコンポーネントはUI・タイマー・学習判定・ログのみ
// - 「3分きっかり」ではなく学習完了優先: 2:30で着地指示 → 3:00で完了していなければ
//   最大60秒延長（UIは「まとめ中」表示）→ 4:00で必ず終了
// - 正常終了はゆい先生の finish_lesson ツール＋最終音声の再生完了で検知し、
//   「レッスンが完了しました」表示 → 自動でレポートへ遷移（手動の終了操作は不要）
// - 途中終了・エラー時は自動遷移せず「レポートを見る / もう一度 / テキストへ」を選ばせる

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Clock, Flag, Mic, MicOff, PenLine, RefreshCw, Volume2, AlertTriangle, CheckCircle2, FileText, Square,
} from 'lucide-react';
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

const CLOSING_BEFORE_END_SEC = 30;  // 残り30秒（2:30）で着地・最終練習へ誘導
const MAX_EXTENSION_SEC = 60;       // 3:00以降のまとめ延長は最大60秒（=4:00で必ず終了）
const SUMMARY_END_TIMEOUT_MS = 25000; // 「まとめて終了」後、finish_lessonが来なくても終了する猶予
const COMPLETE_OVERLAY_MS = 1600;   // 「レッスンが完了しました」表示時間
const MAX_RETRY = 2;

const isWeChatBrowser = (): boolean => /MicroMessenger/i.test(navigator.userAgent);

export const VoiceLessonChat = ({ t, plan, courseMinutes, onFinish, onSwitchToText }: Props) => {
  const tl = t.lesson;
  const tv = t.voice;
  const duration = courseMinutes * 60;
  const hardEnd = duration + MAX_EXTENSION_SEC;

  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [errorKind, setErrorKind] = useState<VoiceErrorKind | null>(null);
  const [interrupted, setInterrupted] = useState(false); // 緊急停止など、エラー以外の途中終了
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveTutor, setLiveTutor] = useState('');
  const [liveUser, setLiveUser] = useState('');
  const [tutorSpeaking, setTutorSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [endingSummary, setEndingSummary] = useState(false); // 「まとめて終了」進行中
  const [completedOverlay, setCompletedOverlay] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const sessionRef = useRef<VoiceSessionHandle | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const entriesRef = useRef<VoiceLogEntry[]>([]);
  const errorsRef = useRef<string[]>([]);
  const startAtRef = useRef<number | null>(null); // 接続完了時刻（タイマー基準）
  const sessionStartISORef = useRef<string>(new Date().toISOString());
  const finishedRef = useRef(false);
  const closingSentRef = useRef(false);
  const extensionSentRef = useRef(false);
  const pendingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const themeLabel = t.plan.themes[plan.themeKey as keyof typeof t.plan.themes] ?? plan.themeKey;
  const remaining = Math.max(duration - elapsed, 0);
  const inExtension = elapsed >= duration && !completedOverlay;

  const logEntry = (entry: Omit<VoiceLogEntry, 'atMs'>) => {
    if (finishedRef.current) return; // 終了後はログを増やさない
    const atMs = startAtRef.current ? Date.now() - startAtRef.current : 0;
    entriesRef.current.push({ ...entry, atMs });
  };

  const pushMessage = (m: ChatMessage) => {
    if (finishedRef.current) return;
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

  /** すべての終了経路の共通処理。overlay=true なら完了表示→自動でレポートへ */
  const completeLesson = useCallback((reason: string, overlay: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
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
      ? Math.min(Math.floor((Date.now() - startAtRef.current) / 1000), hardEnd)
      : 0;

    if (overlay) {
      setCompletedOverlay(true);
      const id = setTimeout(() => onFinish(outcome, elapsedSec), COMPLETE_OVERLAY_MS);
      pendingTimersRef.current.push(id);
    } else {
      onFinish(outcome, elapsedSec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardEnd, onFinish, plan]);

  const start = useCallback(() => {
    setErrorKind(null);
    setInterrupted(false);
    setStatus('requesting-mic');
    const code = (import.meta.env.VITE_AI_LESSON_DEMO_CODE as string | undefined) ?? '';
    sessionRef.current = startVoiceSession({
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
        // ゆい先生がまとめ→finish_lessonを呼び、最終音声の再生が完了した
        onFinishLesson: (reason) => {
          logEntry({ speaker: 'system', text: `finish_lesson:${reason}` });
          completeLesson(reason === 'student_request' ? 'student-request' : 'completed', true);
        },
      },
    });
  }, [plan, themeLabel, completeLesson]);

  // 初回マウントで接続開始（setTimeoutで1tick遅らせ、effect内の同期setStateを避ける）。
  // アンマウント時は必ず切断（マイク停止・PeerConnection close・保留タイマー解除）
  useEffect(() => {
    const id = setTimeout(() => { start(); }, 0);
    const timers = pendingTimersRef.current; // 同一配列をpushで使い回すため参照コピーで安全
    return () => {
      clearTimeout(id);
      timers.forEach(clearTimeout);
      sessionRef.current?.stop();
    };
  }, [start]);

  // タイマー: 接続完了時刻からの実経過（visibilitychangeで復帰時にも補正）
  useEffect(() => {
    if (status !== 'connected') return;
    const tick = () => {
      if (startAtRef.current === null) return;
      setElapsed(Math.min(Math.floor((Date.now() - startAtRef.current) / 1000), hardEnd));
    };
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [status, hardEnd]);

  // 残り30秒（2:30）: 新しい話題を止め、最終練習→まとめへ誘導（session.update + system指示）
  useEffect(() => {
    if (closingSentRef.current || status !== 'connected' || finishedRef.current) return;
    if (elapsed >= duration - CLOSING_BEFORE_END_SEC) {
      closingSentRef.current = true;
      sessionRef.current?.sendCue(
        '残り約30秒です。新しい話題を始めず、今の話を短く着地させてください。目標表現が未使用なら最後の練習として復唱させ、言い直し→今日の表現の確認→短いまとめの後、必ず finish_lesson を呼んでください。',
        { switchToWrapUp: true, respondIfIdle: true },
      );
      logEntry({ speaker: 'system', text: 'closing-cue' });
    }
  }, [elapsed, duration, status]);

  // 3:00: 完了していなければ延長モード（最大60秒）。まとめを促す
  useEffect(() => {
    if (extensionSentRef.current || status !== 'connected' || finishedRef.current) return;
    if (elapsed >= duration) {
      extensionSentRef.current = true;
      sessionRef.current?.sendCue(
        '目安時間を過ぎました。60秒以内に、今日の表現の確認と短いまとめを終えて finish_lesson を呼んでください。',
        { respondIfIdle: true },
      );
      logEntry({ speaker: 'system', text: 'extension-cue' });
    }
  }, [elapsed, duration, status]);

  // 4:00: 必ず終了（ここまで来たら自動でレポートへ）
  useEffect(() => {
    if (elapsed >= hardEnd && !finishedRef.current) {
      completeLesson('timeout', true);
    }
  }, [elapsed, hardEnd, completeLesson]);

  // 新着で最下部へスクロール
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, liveTutor, liveUser]);

  /** 「まとめて終了する」: 即切断せず、短いまとめ→finish_lesson を待つ（最大25秒） */
  const handleSummaryEnd = () => {
    setConfirmOpen(false);
    if (finishedRef.current) return;
    if (status !== 'connected') {
      // 接続できていない場合はまとめようがないので中断扱い
      stopImmediately();
      return;
    }
    setEndingSummary(true);
    sessionRef.current?.sendCue(
      '生徒がレッスンの終了を希望しています。今の話を一言で受け止め、15秒程度で短くまとめて（今日できたこと＋明日の復習予告）、必ず finish_lesson を呼んでください。',
      { switchToWrapUp: true, respondIfIdle: true },
    );
    logEntry({ speaker: 'system', text: 'summary-end-requested' });
    const id = setTimeout(() => {
      completeLesson('manual-summary', true);
    }, SUMMARY_END_TIMEOUT_MS);
    pendingTimersRef.current.push(id);
  };

  /** 緊急停止（接続不良時など）: 即切断して選択画面へ */
  const stopImmediately = () => {
    sessionRef.current?.stop();
    setEndingSummary(false);
    setInterrupted(true);
  };

  const handleRetry = () => {
    if (retryCount >= MAX_RETRY) return;
    setRetryCount((c) => c + 1);
    start();
  };

  const handleSwitchToText = () => {
    sessionRef.current?.stop();
    if (!finishedRef.current) {
      logEntry({ speaker: 'system', text: 'fallback-to-text' });
    }
    onSwitchToText();
  };

  /** 途中終了時「ここまでのレポートを見る」 */
  const handlePartialReport = () => {
    completeLesson('interrupted', false);
  };

  const statusLine = (): string => {
    if (endingSummary) return tv.endingSummary;
    if (status === 'requesting-mic') return tv.statusMicPermission;
    if (status === 'connecting') return tv.statusConnecting;
    if (inExtension) return tv.finalPractice;
    if (tutorSpeaking) return tv.statusTutorSpeaking;
    return tv.statusListening;
  };

  // ── 完了オーバーレイ（正常終了 → 自動でレポートへ） ──
  if (completedOverlay) {
    return (
      <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="font-bold text-gray-900 text-lg">{tv.completedMessage}</p>
          <p className="text-sm text-gray-500 mt-1">{tv.completedSub}</p>
        </div>
      </div>
    );
  }

  // ── マイク拒否 ──
  if (errorKind === 'mic-denied' && status === 'error') {
    return (
      <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <MicOff className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-5">{tv.micDenied}</p>
          {isWeChatBrowser() && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mb-4">{tv.wechatWarning}</p>
          )}
          <button
            type="button"
            onClick={handleSwitchToText}
            className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <PenLine className="w-4 h-4" />
            {tv.switchToText}
          </button>
        </div>
      </div>
    );
  }

  // ── 途中終了・エラー（自動遷移せず選択させる） ──
  if ((errorKind && status === 'error') || interrupted) {
    const hasProgress = messages.length > 0;
    const canRetry = !hasProgress && retryCount < MAX_RETRY && !interrupted;
    const message = interrupted
      ? tv.interruptedTitle
      : errorKind === 'disconnected' ? tv.connectionLost
        : retryCount >= MAX_RETRY ? tv.retryLimit : tv.connectFailed;
    return (
      <div className="fixed inset-0 z-40 bg-gray-50 flex items-center justify-center px-4" style={{ height: '100dvh' }}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-5">{message}</p>
          <div className="space-y-2">
            {hasProgress && (
              <button
                type="button"
                onClick={handlePartialReport}
                className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {tv.viewPartialReport}
              </button>
            )}
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
      {/* ── 上部バー: レッスンを終える / 残り時間 / 状態 ── */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={endingSummary}
            aria-label={tv.endLessonButton}
            className="min-h-11 -ml-1 px-2 flex items-center gap-1 text-gray-500 hover:text-gray-700 rounded-lg disabled:opacity-40"
          >
            <X className="w-5 h-5" />
            <span className="text-xs font-medium whitespace-nowrap">{tv.endLessonButton}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <Clock className={`w-4 h-4 ${remaining <= 30 && !inExtension ? 'text-red-500' : 'text-blue-600'}`} />
            <span className={`font-mono font-bold text-lg tabular-nums ${remaining <= 30 && !inExtension ? 'text-red-600' : 'text-gray-900'}`}>
              {formatTime(remaining)}
            </span>
          </div>
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${
            inExtension || endingSummary ? 'bg-amber-50 text-amber-700'
              : status === 'connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
          }`}>
            {status === 'connected' && !inExtension && !endingSummary && <Mic className="w-3 h-3" />}
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

      {/* ── まとめ中バナー（延長 or まとめて終了） ── */}
      {(inExtension || endingSummary) && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-amber-800 font-medium min-w-0">
            {endingSummary ? tv.endingSummary : tv.finalPractice}
          </p>
          {/* 緊急切断（まとめが進まない・接続不良時の脱出口） */}
          <button
            type="button"
            onClick={stopImmediately}
            className="min-h-9 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 bg-white rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1 shrink-0"
          >
            <Square className="w-3 h-3" />
            {tv.emergencyStop}
          </button>
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

      {/* 「レッスンを終える」→ 即切断せず、まとめてから終了 */}
      <ConfirmDialog
        open={confirmOpen}
        title={tv.endSummaryConfirm}
        confirmLabel={tv.endSummarize}
        cancelLabel={tv.endContinue}
        onConfirm={handleSummaryEnd}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
