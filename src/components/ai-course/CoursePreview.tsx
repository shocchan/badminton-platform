// テキスト予習（＝鍵付き章の閲覧も兼ねる）。全章で利用可・APIを一切呼ばない。
// 進捗/mastery/review を変更しない。未学習章では個人発話・添削・習得状態を出さない。

import { useState } from 'react';
import { ArrowLeft, BookOpen, Lock, Mic, ArrowRight, ChevronDown, Eye, Timer, AlertTriangle, Target, Sparkles, PenLine, CheckCircle2 } from 'lucide-react';
import { ShokoAvatar } from './ShokoAvatar';
import { buildPreviewExpression, type MissionAccess } from '../../lib/aiLesson/course/coursePreview';
import { canDoLineForMission } from '../../lib/aiLesson/course/courseCanDo';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { Mission } from '../../lib/aiLesson/course/types';

interface Props {
  t: AiCourseDict;
  mission: Mission;
  access: MissionAccess;
  /** 解放に必要な未完了の前提章タイトル（ロック時の説明用） */
  prereqTitles: string[];
  estMinutes: number;
  onStartVoice?: () => void;   // current のみ
  onSeeReviewNote?: () => void; // completed のみ
  onBack: () => void;
}

const Section = ({ icon, title, children, defaultOpen = true }: { icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left">
        {icon}
        <span className="text-sm font-bold text-gray-900 flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
};

/** 答えを隠して見せる小さな練習（穴埋め・並べ替え・想起） */
const Reveal = ({ label, front, hint, answer, revealLabel }: { label: string; front: React.ReactNode; hint: string; answer: string; revealLabel: string }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="bg-gray-50 rounded-xl p-3.5">
      <p className="text-[11px] font-medium text-gray-500 mb-1">{label}</p>
      <div className="text-[15px] text-gray-900 leading-relaxed break-words">{front}</div>
      <p className="text-[11px] text-gray-400 mt-1">{hint}</p>
      {!shown ? (
        <button type="button" onClick={() => setShown(true)}
          className="mt-2 min-h-9 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 text-sm font-medium rounded-lg inline-flex items-center gap-1.5 hover:bg-blue-50">
          <Eye className="w-3.5 h-3.5" />{revealLabel}
        </button>
      ) : (
        <p className="mt-2 text-[15px] font-bold text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 break-words">{answer}</p>
      )}
    </div>
  );
};

export const CoursePreview = ({ t, mission, access, prereqTitles, estMinutes, onStartVoice, onSeeReviewNote, onBack }: Props) => {
  const tp = t.preview;
  const zh = t.locale === 'zh';
  const e = buildPreviewExpression(mission);
  const [answerShown, setAnswerShown] = useState(false);
  const prompts = [mission.openingQuestion, ...(mission.followUpQuestions ?? [])].filter(Boolean).slice(0, 3);
  const stateLabel = access === 'locked' ? tp.stateLocked : access === 'current' ? tp.stateCurrent : tp.stateCompleted;
  const stateClass = access === 'locked' ? 'bg-gray-100 text-gray-500' : access === 'current' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700';

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={tp.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900 leading-tight truncate">{zh ? mission.titleZh : mission.titleJa}</h1>
          </div>
          <div className="flex items-center gap-2 text-[11px] mt-0.5">
            <span className={`px-2 py-0.5 rounded-full font-medium ${stateClass}`}>{stateLabel}</span>
            <span className="text-gray-400">Week {mission.week} ・ {tp.estMinutes(estMinutes)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-blue-500" />{tp.anytime} — {tp.intro}</p>

      <div className="space-y-3">
        {/* 章の目的・できること */}
        <Section icon={<Target className="w-4 h-4 text-blue-600" />} title={tp.chapterGoal}>
          <p className="text-sm text-gray-700 leading-relaxed">{zh ? e.usageZh : e.usageJa}</p>
          <div className="mt-2 bg-emerald-50 rounded-xl p-3 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-emerald-700 font-medium">{tp.canDo}</p>
              <p className="text-sm text-gray-800">{canDoLineForMission(mission.category, mission.targetExpression, zh ? 'zh' : 'ja')}</p>
            </div>
          </div>
        </Section>

        {/* 重要表現カード（最初に・主役） */}
        <Section icon={<Sparkles className="w-4 h-4 text-amber-500" />} title={tp.keyExpression}>
          <p className="text-xl font-bold text-gray-900 leading-snug break-words">{e.targetExpression}</p>
          <p className="text-sm text-gray-500 mt-0.5">{tp.reading}: {e.reading}</p>
          <p className="text-sm text-blue-700 mt-1">{tp.meaning}: {e.meaningZh}</p>
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] text-gray-400">{tp.example}</p>
            <p className="text-[15px] text-gray-900 leading-relaxed">💬 {e.simpleExample}</p>
            {e.naturalExample && e.naturalExample !== e.simpleExample && (
              <p className="text-sm text-gray-600 leading-relaxed">🗣 {tp.naturalExample}: {e.naturalExample}</p>
            )}
          </div>
          {e.commonMistakes.length > 0 && (
            <div className="mt-3 bg-amber-50 rounded-xl p-3">
              <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mb-1"><AlertTriangle className="w-3.5 h-3.5" />{tp.mistakes}</p>
              <ul className="space-y-0.5">
                {e.commonMistakes.map((m, i) => <li key={i} className="text-sm text-gray-700">・{m}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-3 bg-blue-50 rounded-xl p-3">
            <p className="text-[11px] text-blue-700 font-medium flex items-center gap-1 mb-0.5"><Mic className="w-3.5 h-3.5" />{tp.voiceGoalTitle}</p>
            <p className="text-sm text-gray-800">{tp.voiceGoal(e.targetExpression)}</p>
          </div>
        </Section>

        {/* 30秒確認（想起・答えを見る。API不使用・記録もしない） */}
        <Section icon={<Timer className="w-4 h-4 text-blue-600" />} title={tp.flashcardTitle}>
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-lg font-bold text-blue-800 leading-snug break-words">{e.meaningZh}</p>
            <p className="text-[11px] text-gray-400 mt-1">{tp.thinkJa}</p>
            {!answerShown ? (
              <button type="button" onClick={() => setAnswerShown(true)}
                className="mt-3 min-h-11 px-5 py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl inline-flex items-center gap-1.5 hover:bg-blue-50">
                <Eye className="w-4 h-4" />{tp.showAnswer}
              </button>
            ) : (
              <div className="mt-3 pt-3 border-t border-blue-100">
                <p className="text-lg font-bold text-gray-900 break-words">{e.targetExpression}</p>
                <p className="text-xs text-gray-500 mt-0.5">{e.reading}</p>
                <p className="text-sm text-gray-700 mt-1">💬 {e.simpleExample}</p>
              </div>
            )}
          </div>
        </Section>

        {/* テキスト練習: 穴埋め・並べ替え */}
        <Section icon={<PenLine className="w-4 h-4 text-blue-600" />} title={tp.textPractice} defaultOpen={false}>
          <div className="space-y-3">
            <Reveal label={tp.clozeTitle} hint={tp.clozeHint} revealLabel={tp.checkAnswer}
              front={<span className="font-medium">{e.cloze.masked}</span>} answer={`${tp.answerLabel}: ${e.simpleExample}`} />
            <Reveal label={tp.scrambleTitle} hint={tp.scrambleHint} revealLabel={tp.checkAnswer}
              front={<span className="flex flex-wrap gap-1.5">{e.scramble.pieces.map((p, i) => (
                <span key={i} className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm">{p}</span>
              ))}</span>} answer={`${tp.answerLabel}: ${e.scramble.answer}`} />
          </div>
        </Section>

        {/* 音声で言ってみよう（会話の準備） */}
        {prompts.length > 0 && (
          <Section icon={<Mic className="w-4 h-4 text-emerald-600" />} title={tp.sayTheseTitle} defaultOpen={false}>
            <ul className="space-y-1.5">
              {prompts.map((p, i) => (
                <li key={i} className="text-sm text-gray-800 flex items-start gap-1.5"><span className="text-emerald-500 font-bold">{i + 1}.</span>{p}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* 音声レッスンへの接続（解放時のみ開始可） */}
        {access === 'locked' ? (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 text-center">
            <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-2"><Lock className="w-5 h-5 text-gray-500" /></div>
            <p className="text-sm font-medium text-gray-700">{tp.voiceLockedTitle}</p>
            <p className="text-xs text-gray-500 mt-1">{tp.voiceLockedHint}</p>
            {prereqTitles.length > 0 && (
              <div className="mt-3 text-left inline-block">
                <p className="text-[11px] text-gray-400">{tp.prereqTitle}</p>
                <ul className="mt-0.5">{prereqTitles.map((n, i) => <li key={i} className="text-xs text-gray-600">・{n}</li>)}</ul>
              </div>
            )}
          </div>
        ) : access === 'current' && onStartVoice ? (
          <button type="button" onClick={onStartVoice}
            className="w-full min-h-11 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">
            <Mic className="w-5 h-5" />{tp.tryVoice}<ArrowRight className="w-4 h-4" />
          </button>
        ) : access === 'completed' && onSeeReviewNote ? (
          <button type="button" onClick={onSeeReviewNote}
            className="w-full min-h-11 py-3 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-50 flex items-center justify-center gap-2">
            <BookOpen className="w-4 h-4" />{tp.seeReviewNote}
          </button>
        ) : null}

        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400 justify-center">
          <ShokoAvatar size={16} />{tp.allChaptersHint}
        </div>
      </div>
    </div>
  );
};
