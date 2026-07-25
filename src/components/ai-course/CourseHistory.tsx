// 学習記録（復習ドリブン）。単なる履歴一覧ではなく「今日の復習」＋目的別タブ＋
// 各カードから復習ノートへ進める設計。復習対象は buildReviewPlan（既存データ）で計算。

import { useState } from 'react';
import { ArrowLeft, Sparkles, ArrowRight, CalendarDays, CheckCircle2, Lightbulb, RefreshCw, BookOpen, ChevronRight } from 'lucide-react';
import { ShokoAvatar } from './ShokoAvatar';
import { buildReviewPlan } from '../../lib/aiLesson/course/courseReviewPlan';
import type { ReviewItem, ReviewPlan } from '../../lib/aiLesson/course/courseReviewPlan';
import { atLeast } from '../../lib/aiLesson/course/courseEngine';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseSessionRecord, ItemProgress } from '../../lib/aiLesson/course/types';

type TabKey = 'today' | 'waiting' | 'recent' | 'again' | 'all';

interface Props {
  t: AiCourseDict;
  sessions: CourseSessionRecord[];
  progress: ItemProgress[];
  practiceAgainIds: string[];
  onOpenNote: (item: ReviewItem) => void;
  onBack: () => void;
}

const usageText = (t: AiCourseDict, it: ReviewItem): string => {
  const r = t.records;
  if (it.reasons.includes('overdue') || it.reasons.includes('due')) return r.reviewToday;
  if (it.usage === 'self') return r.usageSelf;
  if (it.usage === 'hint') return r.usageHint;
  return r.usageNone;
};

const Card = ({ t, it, onOpen }: { t: AiCourseDict; it: ReviewItem; onOpen: () => void }) => {
  const zh = t.locale === 'zh';
  const r = t.records;
  const retained = atLeast(it.masteryState, 'retained_day7');
  const due = it.reasons.includes('overdue') || it.reasons.includes('due');
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left bg-white border border-gray-100 rounded-2xl p-4 hover:bg-gray-50 hover:border-blue-100 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${due ? 'bg-amber-50' : retained ? 'bg-emerald-50' : 'bg-blue-50'}`}>
          {due ? <RefreshCw className="w-4 h-4 text-amber-600" /> : retained ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <BookOpen className="w-4 h-4 text-blue-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 leading-snug break-words">{it.targetExpression}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{zh ? it.themeZh : it.themeJa}</p>
          <p className={`text-xs mt-1.5 flex items-center gap-1 ${due ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
            {it.usage === 'self' && !due && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            {it.usage === 'hint' && !due && <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            {usageText(t, it)}
          </p>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-gray-400">
            {it.dateISO && <span>{r.learnedOn(it.dateISO)}</span>}
            {it.nextReviewISO && <span className="flex items-center gap-0.5"><CalendarDays className="w-3 h-3" />{r.nextReviewOn(it.nextReviewISO)}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0 self-center">
          <span className="text-[11px] text-blue-600 font-medium flex items-center gap-0.5">{r.seeReviewNote}<ChevronRight className="w-3.5 h-3.5" /></span>
        </div>
      </div>
    </button>
  );
};

export const CourseHistory = ({ t, sessions, progress, practiceAgainIds, onOpenNote, onBack }: Props) => {
  const r = t.records;
  const plan: ReviewPlan = buildReviewPlan(progress, sessions, practiceAgainIds);
  const hasReview = plan.today.length > 0;
  const [tab, setTab] = useState<TabKey>(hasReview ? 'today' : 'recent');

  const tabItems: Record<TabKey, ReviewItem[]> = {
    today: plan.today, waiting: plan.waiting, recent: plan.recent, again: plan.practiceAgain, all: plan.all,
  };
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'today', label: r.tabs.today, count: plan.today.length },
    { key: 'waiting', label: r.tabs.waiting, count: plan.waiting.length },
    { key: 'recent', label: r.tabs.recent, count: plan.recent.length },
    { key: 'again', label: r.tabs.again, count: plan.practiceAgain.length },
    { key: 'all', label: r.tabs.all, count: plan.all.length },
  ];
  const items = tabItems[tab];

  return (
    <div className="max-w-md lg:max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={r.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{r.title}</h1>
          <p className="text-[11px] text-gray-400">{r.subtitle}</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">{r.empty}</p>
      ) : (
        <>
          {/* 今日の復習（最上部・主役） */}
          <div className={`rounded-2xl p-5 mb-4 ${hasReview ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white' : 'bg-white border border-gray-100'}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className={`w-4 h-4 ${hasReview ? 'text-amber-100' : 'text-amber-400'}`} />
              <p className={`text-sm font-bold ${hasReview ? 'text-white' : 'text-gray-900'}`}>{r.todayReviewTitle}</p>
            </div>
            {hasReview ? (
              <>
                <p className="text-sm text-amber-50">{r.todayReviewCount(plan.today.length)}</p>
                <p className="text-xs text-amber-100 mb-3">{r.todayReviewMinutes(plan.estMinutes)}</p>
                <button type="button" onClick={() => onOpenNote(plan.today[0])}
                  className="w-full min-h-11 py-3 bg-white text-amber-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-amber-50">
                  {r.startTodayReview}<ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">{r.noReviewToday}</p>
                <button type="button" onClick={() => { setTab('recent'); }}
                  className="text-sm text-blue-600 font-medium flex items-center gap-1 hover:text-blue-700">
                  {r.seeRecent}<ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* タブ（目的別） */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
            {tabs.map((tb) => (
              <button key={tb.key} type="button" onClick={() => setTab(tb.key)}
                className={`shrink-0 min-h-9 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === tb.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {tb.label}{tb.count > 0 && <span className={tab === tb.key ? 'text-blue-100' : 'text-gray-400'}> {tb.count}</span>}
              </button>
            ))}
          </div>

          {/* カード一覧 */}
          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{r.tabEmpty}</p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {items.map((it, i) => <Card key={`${it.missionId}-${it.sessionId ?? i}`} t={t} it={it} onOpen={() => onOpenNote(it)} />)}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-4 text-[11px] text-gray-400 justify-center">
            <ShokoAvatar size={16} />{r.totalSessions(plan.all.length)}
          </div>
        </>
      )}
    </div>
  );
};
