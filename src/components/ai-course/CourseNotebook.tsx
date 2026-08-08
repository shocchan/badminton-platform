// わたしの日本語ノート（MVP）。既存データを「本人がその日に日本語で何をしたか」として表示。
// できたことを先に・言い直しは責めない・存在しない値は行ごと非表示・LLM不使用（一言は決定的）。

import { useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, PenLine, ChevronDown, Mic, Album } from 'lucide-react';
import { buildNotebook, groupByDate } from '../../lib/aiLesson/course/courseNotebook';
import { deriveCourseMemories } from '../../lib/aiLesson/course/courseMemories';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { LearnerAvatar } from './LearnerAvatar';
import { usePrivateAvatarUrl } from '../../lib/aiLesson/course/usePrivateAvatarUrl';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseSessionRecord, ItemProgress, Learner } from '../../lib/aiLesson/course/types';

interface Props {
  t: AiCourseDict;
  learner: Learner;
  sessions: CourseSessionRecord[];
  progress: ItemProgress[];
  onStartToday: () => void; // 空状態のCTA=ホームへ（今日の会話へ接続）
  onBack: () => void;
}

export const CourseNotebook = ({ t, learner, sessions, progress, onStartToday, onBack }: Props) => {
  const tn = t.notebook;
  const tn2 = t.memories;
  const zh = t.locale === 'zh';
  const days = groupByDate(buildNotebook(sessions, progress));
  const memories = deriveCourseMemories(sessions);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={t.roadmap.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><ArrowLeft className="w-5 h-5" /></button>
        <LearnerAvatar displayName={learner.displayName} size={56} decorative className="ring-4 ring-amber-100"
          imageSrc={usePrivateAvatarUrl(learner.settings.avatarReviewStatus === 'approved' ? learner.settings.avatarObjectPath : null)} />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{tn.title(learner.displayName)}</h1>
          <p className="text-[11px] text-gray-400">{tn.subtitle}</p>
          {/* 表紙: 実データのみ（最初のページ日・ページ数=完了した会話1回を1ページと定義） */}
          {days.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-0.5">
              {tn.coverFirst(days[days.length - 1].dateISO)} ・ {tn.coverPages(days.reduce((n, d) => n + d.entries.length, 0))}
            </p>
          )}
        </div>
      </div>

      {/* 思い出アルバム（節目のみ・未達成非表示・既定は折り畳み=ノートを押し下げない・§Album） */}
      {memories.length > 0 && (
        <section className="mb-5">
          <button type="button" aria-expanded={albumOpen}
            onClick={() => setAlbumOpen((v) => { const nv = !v; if (nv) trackCourse('view_ai_course_memory_album', { count: memories.length }); return nv; })}
            className="w-full min-h-11 text-left bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-2.5 hover:bg-amber-100 transition-colors card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <Album className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-900">{tn2.sectionTitle}</span>
              <span className="block text-[11px] text-gray-500 truncate">
                {memories.length > 0 ? tn2.titles[memories[memories.length - 1].type] : tn2.sectionHint}
              </span>
            </span>
            <ChevronDown className={`w-4 h-4 text-amber-500 transition-transform ${albumOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {albumOpen && (
            <div className="mt-2 space-y-2 motion-safe:animate-[report-in_0.3s_ease-out]">
              {memories.map((m) => (
                <article key={m.stableKey} className="bg-white border border-amber-100 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <LearnerAvatar displayName={learner.displayName} size={24} decorative />
                    <h3 className="text-sm font-bold text-gray-900 min-w-0">{tn2.titles[m.type]}</h3>
                  </div>
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">
                    <CalendarDays className="w-3 h-3" aria-hidden="true" /><time dateTime={m.achievedAtISO}>{m.achievedAtISO}</time>
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed">{tn2.descs[m.type]}</p>
                  {m.targetExpression && (
                    <p className="text-xs text-blue-700 font-medium mt-1">{tn2.exprLabel}: 「{m.targetExpression}」</p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-1.5">
                    {m.teacher === 'shoko' ? tn.fromShoko : tn.fromYuto}: {tn2.teacherLines[m.type]}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {days.length === 0 ? (
        <div className="text-center py-10 px-4">
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{tn.empty}</p>
          <button type="button" onClick={onStartToday}
            className="min-h-11 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl action-raised action-primary-blue touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tn.emptyCta}</button>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map(({ dateISO, entries }) => (
            <section key={dateISO}>
              <h2 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" /><time dateTime={dateISO}>{dateISO}</time>
              </h2>
              <div className="space-y-2">
                {entries.map((e) => (
                  <article key={e.sessionId} className="bg-white border border-gray-100 rounded-2xl p-4">
                    {/* 1. 今日やったこと */}
                    <p className="text-sm font-bold text-gray-900">{zh ? e.themeZh : e.themeJa}</p>
                    {/* 2. できたこと（usage別・責めない） */}
                    <p className="text-xs text-gray-700 mt-1.5 flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
                      {e.usage === 'self' ? tn.didSelf(e.targetExpression) : e.usage === 'hint' ? tn.didHint(e.targetExpression) : tn.didTalk}
                    </p>
                    {/* 3. 言い直した表現（ある時だけ・「言い直し」であり間違いではない） */}
                    {e.retriedText && (
                      <p className="text-xs text-gray-700 mt-1 flex items-start gap-1.5">
                        <PenLine className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
                        {tn.retriedLabel}「{e.retriedText}」
                      </p>
                    )}
                    {/* 先生の一言（決定的・依存表現なし） */}
                    <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                      {e.teacher === 'shoko' ? tn.fromShoko : tn.fromYuto}: {tn.lines[e.lineKey]}
                    </p>
                    {/* 4. 次の復習（ある時だけ） */}
                    {e.nextReviewISO && (
                      <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" aria-hidden="true" />{tn.nextReview(e.nextReviewISO)}
                      </p>
                    )}
                    {/* 5. 詳細折り畳み */}
                    <button type="button" onClick={() => toggle(e.sessionId)} aria-expanded={open.has(e.sessionId)}
                      className="min-h-9 mt-1 text-[11px] text-blue-600 flex items-center gap-1 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                      {open.has(e.sessionId) ? t.report.hideDetails : t.report.seeDetails}
                      <ChevronDown className={`w-3 h-3 transition-transform ${open.has(e.sessionId) ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {open.has(e.sessionId) && (
                      <div className="mt-1 text-[11px] text-gray-500 space-y-0.5">
                        <p className="flex items-center gap-1"><Mic className="w-3 h-3" aria-hidden="true" />{tn.detailExpr}: {e.targetExpression}</p>
                        <p>{tn.detailTime}: {t.report.minutesValue(e.durationMin)}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
