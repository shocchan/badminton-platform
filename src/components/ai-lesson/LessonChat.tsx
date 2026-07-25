// 3分レッスン本体（集中モード）
// - 共通ヘッダー・フッターは AiLessonDemoPage が LessonFocusContext で非表示にする
// - このコンポーネントは h-dvh の全画面フレックス: 上部バー / 会話スクロール / 選択肢チップ / 入力欄
// - 会話履歴の領域だけがスクロールし、入力欄は常に下部固定（safe-area対応）
// - タイマーは開始時刻からの実経過で計算（バックグラウンド遷移・省電力でも復帰時に正しく補正）
// - タイマー終了後も遮断せず「まとめへ進む」バナーを出すだけ（仕様）
// - チューターは TutorEngine インターフェース経由（モック→AI接続の差し替えはこのファイル変更不要）

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, Lightbulb, Languages, Flag, ArrowRight, Clock, Mic, PenLine } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { createMockTutor } from '../../lib/aiLesson/mockTutor';
import type { TutorOutcome } from '../../lib/aiLesson/mockTutor';
import type { TutorTurn } from '../../lib/aiLesson/types';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { ChatMessage, LearningPlan, LessonPhase, QuickReply } from '../../lib/aiLesson/types';

interface Props {
  t: AiLessonDict;
  plan: LearningPlan;
  courseMinutes: number;
  onFinish: (outcome: TutorOutcome, elapsedSeconds: number) => void;
}

/** 経過秒 → フェーズ（3分コースの時間割。まとめは残り30秒から） */
const phaseAt = (elapsed: number): LessonPhase => {
  if (elapsed < 30) return 'warmup';
  if (elapsed < 60) return 'teach';
  if (elapsed < 150) return 'talk';
  return 'wrapup';
};

const formatTime = (sec: number): string => {
  const m = Math.floor(Math.max(sec, 0) / 60);
  const s = Math.max(sec, 0) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** 返信前の自然な待機時間（500〜1000ms） */
const naturalDelay = () => 600 + Math.random() * 400;

/** Web Speech API（対応ブラウザのみ。未対応なら null を返しボタン自体を出さない） */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
const getSpeechRecognitionCtor = (): (new () => SpeechRecognitionLike) | null => {
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as new () => SpeechRecognitionLike) : null;
};

export const LessonChat = ({ t, plan, courseMinutes, onFinish }: Props) => {
  const tl = t.lesson;
  const duration = courseMinutes * 60;
  const tutor = useMemo(() => createMockTutor(plan), [plan]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [input, setInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);

  const phase = phaseAt(Math.min(elapsed, duration - 1));
  const remaining = duration - elapsed;
  const timeUp = elapsed >= duration;
  const phaseRef = useRef<LessonPhase>('warmup');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pendingTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const themeLabel = t.plan.themes[plan.themeKey as keyof typeof t.plan.themes] ?? plan.themeKey;
  const speechCtor = useMemo(() => getSpeechRecognitionCtor(), []);

  /** チューターのターンを「考え中」表示付きで反映（500〜1000msの自然な待機） */
  const applyTurn = (turn: TutorTurn, delayMs?: number) => {
    if (turn.messages.length === 0) return;
    const delay = delayMs ?? naturalDelay();
    const t1 = setTimeout(() => setThinking(true), 0);
    const t2 = setTimeout(() => {
      setMessages((prev) => [...prev, ...turn.messages]);
      setQuickReplies(turn.quickReplies ?? []);
      setThinking(false);
    }, delay);
    pendingTimeouts.current.push(t1, t2);
  };

  // 開始時の導入（テーマ・目標表現の宣言＋ウォームアップ質問）
  useEffect(() => {
    const id = setTimeout(() => {
      const turn = tutor.start();
      setMessages((prev) => (prev.length === 0 ? turn.messages : prev));
      setQuickReplies(turn.quickReplies ?? []);
    }, 400);
    return () => clearTimeout(id);
  }, [tutor]);

  // 未実行タイマーの後始末
  useEffect(() => () => pendingTimeouts.current.forEach(clearTimeout), []);

  // タイマー: 開始時刻からの実経過で計算
  const startAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (startAtRef.current === null) startAtRef.current = Date.now();
    const startAt = startAtRef.current;
    const tick = () => {
      const next = Math.min(Math.floor((Date.now() - startAt) / 1000), duration);
      elapsedRef.current = next;
      setElapsed(next);
    };
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [duration]);

  // フェーズ境界でチューターの案内を自動投入
  useEffect(() => {
    if (phase === phaseRef.current) return;
    phaseRef.current = phase;
    const turn = tutor.onPhase(phase);
    if (turn.messages.length === 0) return;
    const t1 = setTimeout(() => setThinking(true), 0);
    const t2 = setTimeout(() => {
      setMessages((prev) => [...prev, ...turn.messages]);
      setQuickReplies(turn.quickReplies ?? []);
      setThinking(false);
    }, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 新着メッセージ・チップ・考え中表示で最下部へスクロール（会話領域のみ）
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking, quickReplies]);

  const sendStudentText = (text: string, viaQuickReply: boolean) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setMessages((prev) => [...prev, { role: 'student', text: trimmed }]);
    setQuickReplies([]);
    applyTurn(tutor.reply(trimmed, { viaQuickReply }));
  };

  const handleSend = () => {
    sendStudentText(input, false);
    setInput('');
    // スマホでキーボードを閉じさせない（連続入力しやすく）
    inputRef.current?.focus();
  };

  const toggleMic = () => {
    if (!speechCtor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      const rec = new speechCtor();
      rec.lang = 'ja-JP'; // 練習対象は日本語なので常に日本語認識
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e) => {
        const transcript = Array.from({ length: e.results.length }, (_, i) => e.results[i]?.[0]?.transcript ?? '').join('');
        if (transcript) setInput((prev) => (prev ? prev + transcript : transcript));
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false); // 失敗してもレッスンは継続（通常入力にフォールバック）
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const handleFinish = () => {
    setConfirmOpen(false);
    recognitionRef.current?.stop();
    onFinish(tutor.getOutcome(), Math.min(elapsedRef.current, duration));
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-gray-50 flex flex-col"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ── 上部バー: 終了 / 残り時間 / テーマ / 目標表現 ── */}
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
            <Clock className={`w-4 h-4 ${remaining <= 30 && !timeUp ? 'text-red-500' : 'text-blue-600'}`} />
            <span className={`font-mono font-bold text-lg tabular-nums ${remaining <= 30 && !timeUp ? 'text-red-600' : 'text-gray-900'}`}>
              {formatTime(remaining)}
            </span>
          </div>
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">
            {tl.phases[phase]}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 overflow-hidden">
          <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate">
            {tl.theme}: {themeLabel} ／ {tl.target}: {plan.target.label}
          </span>
        </p>
      </div>

      {/* ── 時間切れバナー（遮断はしない） ── */}
      {timeUp && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-emerald-800 font-medium min-w-0">{tl.timeUp}</p>
          <button
            type="button"
            onClick={handleFinish}
            className="min-h-11 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1 shrink-0"
          >
            {tl.toSummary}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 会話履歴（この領域だけがスクロールする） ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-0.5 px-1">
                {m.role === 'student' ? tl.youName : tl.tutorName}
              </p>
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'student'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : m.kind === 'hint'
                      ? 'bg-amber-50 text-gray-800 border border-amber-200 rounded-tl-sm'
                      : m.kind === 'praise'
                        ? 'bg-emerald-50 text-gray-800 border border-emerald-200 rounded-tl-sm'
                        : m.kind === 'correction'
                          ? 'bg-violet-50 text-gray-800 border border-violet-200 rounded-tl-sm'
                          : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'
                }`}
              >
                {m.text}
                {m.zhNote && (
                  <p className="mt-1.5 pt-1.5 border-t border-gray-300/50 text-xs text-gray-500 whitespace-pre-wrap">
                    {m.zhNote}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
              </span>
              <span className="text-xs text-gray-500">{tl.thinking}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 回答候補チップ（N3・N4でも日本語入力なしで答えられる） ── */}
      {quickReplies.length > 0 && !thinking && (
        <div className="px-3 pb-1 shrink-0">
          <p className="text-[10px] text-gray-400 mb-1">{tl.quickReplyLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((q) => (
              <button
                key={q.text}
                type="button"
                onClick={() => sendStudentText(q.text, true)}
                className="min-h-11 px-3 py-2 bg-white border border-blue-200 text-blue-700 text-sm rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors text-left"
              >
                {q.text}
              </button>
            ))}
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="min-h-11 px-3 py-2 bg-gray-100 border border-gray-200 text-gray-600 text-sm rounded-full hover:bg-gray-200 transition-colors flex items-center gap-1"
            >
              <PenLine className="w-3.5 h-3.5" />
              {tl.freeInputChip}
            </button>
          </div>
        </div>
      )}

      {/* ── 補助ボタン＋入力欄（下部固定・safe-area対応） ── */}
      <div className="bg-gray-50 border-t border-gray-200 px-3 pt-2 shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => applyTurn(tutor.hint(), 400)}
            className="flex-1 min-h-11 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl hover:bg-amber-100 transition-colors flex items-center justify-center gap-1"
          >
            <Lightbulb className="w-4 h-4" />
            {tl.hint}
          </button>
          <button
            type="button"
            onClick={() => applyTurn(tutor.zhExplain(), 400)}
            className="flex-1 min-h-11 py-2 bg-violet-50 border border-violet-200 text-violet-800 text-xs font-bold rounded-xl hover:bg-violet-100 transition-colors flex items-center justify-center gap-1"
          >
            <Languages className="w-4 h-4" />
            {tl.zhExplain}
          </button>
        </div>
        <div className="flex gap-2 items-end">
          {speechCtor && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? tl.micListening : tl.micStart}
              className={`min-h-12 min-w-12 rounded-xl flex items-center justify-center shrink-0 transition-colors border ${
                listening
                  ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // 日本語IME変換中のEnterでは送信しない
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend();
            }}
            placeholder={listening ? tl.micListening : tl.inputPlaceholder}
            className="flex-1 min-h-12 px-4 py-3 border border-gray-300 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-0"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            aria-label={tl.send}
            className="min-h-12 min-w-12 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={tl.endConfirm}
        confirmLabel={tl.endConfirmYes}
        cancelLabel={tl.endConfirmNo}
        onConfirm={handleFinish}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
