// 「今日」ビュー: 決定的推薦＋単元一覧（架空AI分析なし・§7-1/§20）
import { Compass } from 'lucide-react';
import type { FoundationUnitMeta } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository, FoundationUnitSummary } from '../../../lib/aiLesson/course/foundationProgress';
import { recommendToday } from '../../../lib/aiLesson/course/foundationRecommend';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  summaries: Record<string, FoundationUnitSummary>;
  repo: FoundationProgressRepository;
  onOpenUnit: (id: string) => void; onGoReview: () => void;
}

export const FoundationTodayView = ({ t, meta, summaries, repo, onOpenUnit, onGoReview }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const dueCount = repo.getReviewQueue(new Date().toISOString()).filter((e) => e.isDue).length;
  const rec = recommendToday(meta, summaries, dueCount);
  const recUnit = rec.unitId ? meta.find((m) => m.id === rec.unitId) : null;
  const titleOf = (m: FoundationUnitMeta) => (zh ? m.titleZh : m.titleJa);
  const statusOf = (s: FoundationUnitSummary) => (s.inProgress ? tl.statusInProgress : s.completedCount > 0 ? tl.statusDone : tl.statusNotStarted);

  return (
    <div>
      <div className="bg-indigo-50 rounded-2xl p-4 mb-4">
        <p className="text-xs font-bold text-indigo-800 flex items-center gap-1.5 mb-1"><Compass className="w-4 h-4" />{tl.todayHeading}</p>
        <p className="text-sm text-gray-800">
          {rec.kind === 'review_due' && tl.recReview(rec.dueCount)}
          {rec.kind === 'resume_unit' && recUnit && tl.recResume(titleOf(recUnit))}
          {(rec.kind === 'next_unit' || rec.kind === 'first_unit') && recUnit && tl.recNext(titleOf(recUnit))}
          {rec.kind === 'all_done_review' && tl.recAllDone}
        </p>
        <p className="text-[11px] text-gray-500 mt-1">{tl.aboutMinutes(rec.estimatedMinutes)}</p>
        <button type="button"
          onClick={() => (rec.kind === 'review_due' || rec.kind === 'all_done_review' ? onGoReview() : rec.unitId && onOpenUnit(rec.unitId))}
          className="w-full min-h-11 py-2.5 mt-3 bg-indigo-600 text-white text-sm font-bold rounded-xl">{tl.todayStart}</button>
      </div>

      <p className="text-xs font-bold text-gray-500 mb-2">{tl.unitListHeading}</p>
      <div className="space-y-2">
        {meta.map((m) => {
          const s = summaries[m.id];
          const prereqUnmet = m.prerequisiteUnitIds.filter((p) => (summaries[p]?.completedCount ?? 0) === 0);
          return (
            <button key={m.id} type="button" onClick={() => onOpenUnit(m.id)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 p-3 min-h-11">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-900">{titleOf(m)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{m.level}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">draft</span>
                <span className="ml-auto text-[11px] text-gray-500">{statusOf(s)}</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{tl.aboutMinutes(m.estimatedMinutes)}</p>
              {prereqUnmet.length > 0 && (
                <p className="text-[11px] text-sky-700 mt-0.5">
                  {tl.prereqHint(prereqUnmet.map((p) => { const pm = meta.find((x) => x.id === p); return pm ? titleOf(pm) : p; }).join('・'))}
                </p>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">{tl.notSaved}</p>
    </div>
  );
};
