// テキストモードのレッスン（フォールバック）。API不要の決定的な進行。
// ミッションの opening/hint/detect を使い、目標表現を使えたら完了できる。

import { useMemo, useRef, useState, useEffect } from 'react';
import { X, Send, Lightbulb, Flag, ArrowRight } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { detectTargetUsage } from '../../lib/aiLesson/course/courseLesson';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseUtterance, LessonPlanStep } from '../../lib/aiLesson/course/types';
import type { VoiceLessonResult } from './CourseVoiceLesson';

interface Props {
  t: AiCourseDict;
  step: LessonPlanStep;
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

export const CourseTextLesson = ({ t, step, onComplete, onExit }: Props) => {
  const tl = t.lesson;
  const mission = step.mission;
  const isReview = step.kind !== 'new';
  // 導入はレンダー前に確定させる（effect内の同期setStateを避ける）
  const [msgs, setMsgs] = useState<{ role: 'student' | 'tutor'; text: string }[]>(
    () => [{ role: 'tutor', text: introText(step) }],
  );
  const [input, setInput] = useState('');
  const [hintIdx, setHintIdx] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const startAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uttRef = useRef<CourseUtterance[]>([]);

  const detect = useMemo(() => { try { return new RegExp(mission.detect); } catch { return null; } }, [mission.detect]);

  // 開始時刻の記録と導入発話のログ（stateは触らない）
  useEffect(() => {
    startAt.current = Date.now();
    uttRef.current.push({ speaker: 'tutor', transcript: introText(step), atMs: 0, isFinal: true, relatedTarget: false });
  }, [step]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);

  const log = (role: 'student' | 'tutor', text: string, rel = false) =>
    uttRef.current.push({ speaker: role, transcript: text, atMs: Date.now() - startAt.current, isFinal: true, relatedTarget: rel });

  const tutorSay = (text: string) => { setMsgs((p) => [...p, { role: 'tutor', text }]); log('tutor', text); };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const hit = detect ? detect.test(text) : false;
    setMsgs((p) => [...p, { role: 'student', text }]);
    log('student', text, hit);
    if (hit) {
      setUsed(true);
      tutorSay(`いいですね！「${mission.targetExpression}」が使えました。${step.hideTarget ? '' : `もう一度、別の場面でも使ってみましょう。例えば ${mission.alternateScenes[0] ?? ''} の場面ではどうですか？`}`);
    } else {
      // 未使用ならフォローアップ or ヒント誘導
      const fu = mission.followUpQuestions[Math.min(msgs.length, mission.followUpQuestions.length - 1)] ?? mission.followUpQuestions[0];
      tutorSay(fu ?? 'もう少し話してみましょう。');
    }
    inputRef.current?.focus();
  };

  const hint = () => {
    const h = mission.hintLevels[Math.min(hintIdx, mission.hintLevels.length - 1)];
    setHintIdx((i) => i + 1);
    tutorSay(`💡 ${h}`);
  };

  const finish = () => {
    setConfirmOpen(false);
    const { usage, count } = detectTargetUsage(uttRef.current.map((u) => ({ role: u.speaker === 'student' ? 'student' : 'tutor', text: u.transcript })), mission.detect);
    onComplete({
      utterances: uttRef.current,
      usage,
      targetUsed: count > 0,
      targetUsedIndependently: usage === 'self',
      chineseSupportUsed: false,
      durationSeconds: Math.floor((Date.now() - startAt.current) / 1000),
      completionStatus: 'completed',
      endReason: 'text-complete',
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-50 flex flex-col" style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="bg-white border-b border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setConfirmOpen(true)} className="min-h-11 -ml-1 px-2 flex items-center gap-1 text-gray-500 hover:text-gray-700 rounded-lg">
            <X className="w-5 h-5" /><span className="text-xs font-medium">{t.report.backHome}</span>
          </button>
          <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${isReview ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>{isReview ? tl.reviewBadge : tl.newBadge}</span>
        </div>
        <p className="text-xs text-gray-600 mt-1 flex items-center gap-1 overflow-hidden">
          <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate">{tl.theme}: {mission.titleJa}{step.hideTarget ? ` ／ ${tl.hiddenTarget}` : ` ／ ${tl.target}: ${mission.targetExpression}`}</span>
        </p>
      </div>

      {used && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-emerald-800 font-medium">{t.report.usageSelf}</p>
          <button type="button" onClick={finish} className="min-h-11 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg flex items-center gap-1 shrink-0">{t.report.backHome}<ArrowRight className="w-4 h-4" /></button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%]">
              <p className="text-[10px] text-gray-400 mb-0.5 px-1">{m.role === 'student' ? (t.locale === 'zh' ? '你' : 'あなた') : (t.locale === 'zh' ? '结衣老师' : 'ゆい先生')}</p>
              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${m.role === 'student' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'}`}>{m.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 border-t border-gray-200 px-3 pt-2 shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={hint} className="w-full min-h-11 py-2 mb-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1"><Lightbulb className="w-4 h-4" />{t.report.tooHard === '有点难' ? '提示' : 'ヒント'}</button>
        <div className="flex gap-2 items-end">
          <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
            placeholder={t.locale === 'zh' ? '用日语输入…' : '日本語で入力…'}
            className="flex-1 min-h-12 px-4 py-3 border border-gray-300 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
          <button type="button" onClick={send} disabled={!input.trim()} aria-label="send"
            className="min-h-12 min-w-12 px-4 bg-blue-600 text-white rounded-xl disabled:opacity-40 flex items-center justify-center shrink-0"><Send className="w-5 h-5" /></button>
        </div>
      </div>

      <ConfirmDialog open={confirmOpen} title={t.voice.endSummaryConfirm} confirmLabel={t.report.backHome} cancelLabel={t.voice.endContinue} onConfirm={finish} onCancel={() => setConfirmOpen(false)} />
      <button type="button" onClick={onExit} className="hidden" aria-hidden />
    </div>
  );
};
