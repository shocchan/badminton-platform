// テキストモードのレッスン（LLM会話＋決定的ガードレール）。
//
// 通常時: ai-lesson-chat Edge Function（gpt-4o-mini）が学習者の発言を理解して
//   「反応＋（必要時のみ訂正）＋質問1つ」を返す。N3等のレベルに応じて語彙・文長を制御。
// 障害時: 決定的エンジン（courseTextTurn）へターン数を引き継いで自動フォールバック（明示表示）。
// 端末間再開: ターン毎に発話をDBへチェックポイント保存し、別端末から履歴ごと復元できる。
// 補助: AI発話ごとに「中国語訳」を折り畳み表示（同一応答で生成済み＝追加API課金なし）、
//   難しい語は readingAids から <ruby> で読みを付ける（LLM文字列をHTMLとして描画しない）。

import { useMemo, useRef, useState, useEffect } from 'react';
import { X, Send, Lightbulb, Flag, ArrowRight, CheckCircle2, WifiOff, Languages, ChevronDown } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { detectTargetUsage } from '../../lib/aiLesson/course/courseLesson';
import { nextTextTurn, initialTextTurnState, TEXT_MAX_TURNS_DEFAULT } from '../../lib/aiLesson/course/courseTextTurn';
import type { TextTurnState } from '../../lib/aiLesson/course/courseTextTurn';
import {
  initialChatConvState, willBeClosing, applyChatTurn, composeTutorText, toGuidedState,
} from '../../lib/aiLesson/course/courseChatTurn';
import type { ChatConvState } from '../../lib/aiLesson/course/courseChatTurn';
import { requestChatTurn, estimateChatCostUsd } from '../../lib/aiLesson/course/courseChatApi';
import { segmentWithReadings } from '../../lib/aiLesson/course/courseTextResume';
import type { ReadingAid, ResumedTextLesson } from '../../lib/aiLesson/course/courseTextResume';
import { courseRepository } from '../../lib/aiLesson/course/courseRepository';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseUtterance, Learner, LessonPlanStep } from '../../lib/aiLesson/course/types';
import type { VoiceLessonResult } from './CourseVoiceLesson';

interface Msg {
  role: 'student' | 'tutor';
  text: string;
  /** AI発話の簡体字訳（折り畳み表示・LLM応答と同時生成） */
  zh?: string | null;
  /** 難しい語の読み（最大3語） */
  aids?: ReadingAid[];
}

interface Props {
  t: AiCourseDict;
  step: LessonPlanStep;
  /** 予約済みセッションID（LLM会話の認可・チェックポイント保存に使う） */
  sessionId: string | null;
  learner: Learner | null;
  /** 別端末からの再開データ（保存済み履歴とターン状態） */
  resume?: ResumedTextLesson | null;
  onComplete: (r: VoiceLessonResult) => void;
  onExit: () => void;
}

/** 導入メッセージ（7日後復習では目標表現を見せない） */
const introText = (step: LessonPlanStep): string => {
  const m = step.mission;
  return step.hideTarget
    ? m.openingQuestion
    : `今日のテーマは「${m.titleJa}」です。目標の表現は ${m.targetExpression}。例えば「${m.simpleExample}」。\n${m.openingQuestion}`;
};

/** ruby表示（構造化データからのみ描画。dangerouslySetInnerHTML不使用） */
const RubyText = ({ text, aids }: { text: string; aids?: ReadingAid[] }) => {
  const segs = useMemo(() => segmentWithReadings(text, aids ?? []), [text, aids]);
  return (
    <>
      {segs.map((s, i) => s.reading
        ? <ruby key={i}>{s.text}<rt className="text-[10px] text-gray-500">{s.reading}</rt></ruby>
        : <span key={i}>{s.text}</span>)}
    </>
  );
};

export const CourseTextLesson = ({ t, step, sessionId, learner, resume = null, onComplete, onExit }: Props) => {
  const tl = t.lesson;
  const mission = step.mission;
  const isReview = step.kind !== 'new';
  // 再開時は保存済み履歴から復元。新規は導入メッセージから
  const [msgs, setMsgs] = useState<Msg[]>(() =>
    resume && resume.msgs.length > 0 ? resume.msgs : [{ role: 'tutor', text: introText(step) }]);
  const [engineMode, setEngineMode] = useState<'llm' | 'guided'>(() => (sessionId ? 'llm' : 'guided'));
  const [chatState, setChatState] = useState<ChatConvState>(() => resume?.chatState ?? initialChatConvState(TEXT_MAX_TURNS_DEFAULT));
  const [guidedState, setGuidedState] = useState<TextTurnState>(() => initialTextTurnState());
  const [busy, setBusy] = useState(false);
  const [fallbackNoticeShown, setFallbackNoticeShown] = useState(false);
  const [openZh, setOpenZh] = useState<Set<number>>(new Set()); // 中国語訳を開いたメッセージindex
  const [input, setInput] = useState('');
  const [hintIdx, setHintIdx] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [offerSummary, setOfferSummary] = useState(false);
  const startAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uttRef = useRef<CourseUtterance[]>([]);
  const savedRef = useRef(0);          // チェックポイント保存済みの発話数（再保存防止）
  const chatCostRef = useRef(0);
  const finishedRef = useRef(false);
  const aliveRef = useRef(true);

  const detect = useMemo(() => { try { return new RegExp(mission.detect); } catch { return null; } }, [mission.detect]);
  const turnCount = engineMode === 'llm' ? chatState.studentTurns : guidedState.turn;
  const closed = engineMode === 'llm' ? chatState.done : guidedState.phase === 'done';

  useEffect(() => {
    startAt.current = Date.now();
    if (resume && resume.msgs.length > 0) {
      // 復元分は既にDB保存済み: uttRef に取り込み（usage判定用）、再保存はしない
      uttRef.current = resume.msgs.map((m, i) => ({
        speaker: m.role, transcript: m.text, atMs: i, isFinal: true,
        relatedTarget: m.role === 'student' && !!detect && detect.test(m.text),
      }));
      savedRef.current = uttRef.current.length;
      if (uttRef.current.some((u) => u.relatedTarget)) setUsed(true);
    } else {
      uttRef.current.push({ speaker: 'tutor', transcript: introText(step), atMs: 0, isFinal: true, relatedTarget: false });
    }
    return () => { aliveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回マウント時のみ（resume/stepは開始時に確定）
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

  const log = (role: 'student' | 'tutor', text: string, rel = false) =>
    uttRef.current.push({ speaker: role, transcript: text, atMs: Date.now() - startAt.current, isFinal: true, relatedTarget: rel });

  /** ターン毎チェックポイント（端末間再開用・fire-and-forget・重複保存なし） */
  const flushCheckpoint = () => {
    if (!sessionId || !learner) return;
    const fresh = uttRef.current.slice(savedRef.current);
    savedRef.current = uttRef.current.length;
    if (fresh.length > 0) void courseRepository.appendUtterances(sessionId, learner.id, fresh);
  };

  const pushTutor = (text: string, zh: string | null = null, aids: ReadingAid[] = []) => {
    setMsgs((p) => [...p, { role: 'tutor', text, zh, aids }]);
    log('tutor', text);
  };

  const guidedReply = (text: string, state: TextTurnState) => {
    const r = nextTextTurn(state, text, mission);
    setGuidedState(r.state);
    if (r.targetHit) setUsed(true);
    if (r.offerSummary) setOfferSummary(true);
    pushTutor(r.text);
    flushCheckpoint();
  };

  const fallbackToGuided = (text: string) => {
    const seeded = toGuidedState(chatState);
    setEngineMode('guided');
    if (!fallbackNoticeShown) {
      setFallbackNoticeShown(true);
      pushTutor(`📶 ${tl.fallbackNotice}`);
    }
    guidedReply(text, seeded);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || closed || busy) return;
    setInput('');
    const hit = detect ? detect.test(text) : false;
    if (hit) setUsed(true);
    setMsgs((p) => [...p, { role: 'student', text }]);
    log('student', text, hit);

    if (engineMode === 'guided' || !sessionId) {
      guidedReply(text, guidedState);
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    const res = await requestChatTurn({
      sessionId,
      locale: t.locale === 'zh' ? 'zh' : 'ja',
      learnerLevel: learner?.difficultyLevel ?? 3,
      estimatedLevel: learner?.estimatedLevel ?? 'N3',
      missionTitleJa: mission.titleJa,
      targetExpression: step.hideTarget ? '' : mission.targetExpression,
      history,
      studentText: text,
      maxTurns: chatState.maxTurns,
      closingAnnounced: willBeClosing(chatState),
      askedQuestions: chatState.asked,
    });
    if (!aliveRef.current) return;
    setBusy(false);

    if (!res.ok || !res.turn) {
      fallbackToGuided(text);
      inputRef.current?.focus();
      return;
    }
    chatCostRef.current += estimateChatCostUsd(res.usage);
    const nextState = applyChatTurn(chatState, res.turn);
    setChatState(nextState);
    if (res.turn.shouldClose) setOfferSummary(true);
    pushTutor(composeTutorText(res.turn), res.turn.translationZh, res.turn.readingAids);
    flushCheckpoint();
    if (!nextState.done) inputRef.current?.focus();
  };

  const hint = () => {
    if (closed || busy) return;
    const h = mission.hintLevels[Math.min(hintIdx, mission.hintLevels.length - 1)];
    setHintIdx((i) => i + 1);
    pushTutor(`💡 ${h}`);
    flushCheckpoint();
  };

  const toggleZh = (i: number) => setOpenZh((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else { next.add(i); trackCourse('open_ai_course_translation'); }
    return next;
  });

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setConfirmOpen(false);
    const { usage, count } = detectTargetUsage(uttRef.current.map((u) => ({ role: u.speaker === 'student' ? 'student' : 'tutor', text: u.transcript })), mission.detect);
    flushCheckpoint(); // 未保存分を確定
    onComplete({
      utterances: uttRef.current,
      usage,
      targetUsed: count > 0,
      targetUsedIndependently: usage === 'self',
      chineseSupportUsed: false,
      durationSeconds: Math.floor((Date.now() - startAt.current) / 1000),
      completionStatus: 'completed',
      endReason: closed ? 'text-max-turns' : 'text-complete',
      translateCostUsd: chatCostRef.current,
      // チェックポイント保存済み → finalize時の一括insertをスキップ（重複保存防止）
      utterancesAlreadySaved: !!(sessionId && learner),
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="bg-white border-b border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setConfirmOpen(true)} className="min-h-11 -ml-1 px-2 flex items-center gap-1 text-gray-500 hover:text-gray-700 rounded-lg">
            <X className="w-5 h-5" /><span className="text-xs font-medium">{tl.seeSummary}</span>
          </button>
          <div className="flex items-center gap-2">
            {engineMode === 'guided' && sessionId && (
              <WifiOff className="w-3.5 h-3.5 text-amber-500" aria-label={tl.fallbackNotice} />
            )}
            <span className="text-xs font-mono font-bold text-gray-600 tabular-nums" aria-label={`${turnCount}/${TEXT_MAX_TURNS_DEFAULT}`}>
              {tl.textProgress(Math.min(turnCount, TEXT_MAX_TURNS_DEFAULT), TEXT_MAX_TURNS_DEFAULT)}
            </span>
            <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${isReview ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{isReview ? tl.reviewBadge : tl.newBadge}</span>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 overflow-hidden">
          <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate">{tl.theme}: {mission.titleJa}{step.hideTarget ? ` ／ ${tl.hiddenTarget}` : ` ／ ${tl.target}: ${mission.targetExpression}`}</span>
        </p>
      </div>

      {used && !closed && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-emerald-800 font-medium">{tl.usedBanner}</p>
          <button type="button" onClick={finish} className="min-h-11 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg flex items-center gap-1 shrink-0">{tl.seeSummary}<ArrowRight className="w-4 h-4" /></button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-0.5 px-1">{m.role === 'student' ? (t.locale === 'zh' ? '你' : 'あなた') : (t.locale === 'zh' ? '翔子老师' : '翔子先生')}</p>
              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${m.role === 'student' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'}`}>
                {m.role === 'tutor' ? <RubyText text={m.text} aids={m.aids} /> : m.text}
              </div>
              {/* 中国語訳（AI発話ごとに折り畳み・追加API呼び出しなし） */}
              {m.role === 'tutor' && m.zh && (
                <div className="mt-1 px-1">
                  <button type="button" onClick={() => toggleZh(i)} aria-expanded={openZh.has(i)}
                    className="min-h-9 inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700">
                    <Languages className="w-3.5 h-3.5" aria-hidden="true" />
                    {t.locale === 'zh' ? '中文翻译' : '中国語訳'}
                    <ChevronDown className={`w-3 h-3 transition-transform ${openZh.has(i) ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {openZh.has(i) && (
                    <p className="text-[13px] text-gray-600 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">{m.zh}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm bg-white/80 text-gray-400 border border-gray-200 border-dashed flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden="true">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 motion-safe:animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 motion-safe:animate-bounce [animation-delay:120ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 motion-safe:animate-bounce [animation-delay:240ms]" />
              </span>
              {tl.aiThinking}
            </div>
          </div>
        )}
        {closed && (
          <div className="mx-auto max-w-sm text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-gray-600">{tl.textInputClosed}</p>
          </div>
        )}
      </div>

      <div className="bg-gray-50 border-t border-gray-200 px-3 pt-2 shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={finish}
          className={`w-full min-h-11 py-2.5 mb-2 font-bold rounded-xl flex items-center justify-center gap-1.5 text-sm transition-colors ${
            closed || offerSummary
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
          {tl.endAndSummarize}<ArrowRight className="w-4 h-4" />
        </button>
        {!closed && (
          <>
            <button type="button" onClick={hint} disabled={busy} className="w-full min-h-11 py-2 mb-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1 disabled:opacity-40"><Lightbulb className="w-4 h-4" />{t.locale === 'zh' ? '提示' : 'ヒント'}</button>
            <div className="flex gap-2 items-end">
              <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send(); }}
                disabled={busy}
                placeholder={t.locale === 'zh' ? '用日语输入…' : '日本語で入力…'}
                className="flex-1 min-h-12 px-4 py-3 border border-gray-300 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0 disabled:bg-gray-100" />
              <button type="button" onClick={() => void send()} disabled={!input.trim() || busy} aria-label="send"
                className="min-h-12 min-w-12 px-4 bg-blue-600 text-white rounded-xl disabled:opacity-40 flex items-center justify-center shrink-0"><Send className="w-5 h-5" /></button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog open={confirmOpen} title={t.voice.endSummaryConfirm} confirmLabel={tl.seeSummary} cancelLabel={t.voice.endContinue} onConfirm={finish} onCancel={() => setConfirmOpen(false)} />
      <button type="button" onClick={onExit} className="hidden" aria-hidden />
    </div>
  );
};
