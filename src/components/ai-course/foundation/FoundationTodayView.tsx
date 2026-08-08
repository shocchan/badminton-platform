// 「今日」ビュー（UX再設計版・§4）: 迷わず一つの行動を開始する。
// ファーストビュー=①今日の大きな学習カード ②進み具合 ③単元を選ぶ導線 の3ブロックのみ。
import { Compass } from 'lucide-react';
import type { FoundationUnitMeta } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository, FoundationUnitSummary } from '../../../lib/aiLesson/course/foundationProgress';
import { recommendToday } from '../../../lib/aiLesson/course/foundationRecommend';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  summaries: Record<string, FoundationUnitSummary>;
  repo: FoundationProgressRepository;
  onOpenUnit: (id: string) => void;
  onGoUnits: () => void;
  onGoRecords: () => void;
}

export const FoundationTodayView = ({ t, meta, summaries, repo, onOpenUnit, onGoUnits, onGoRecords }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const dueCount = repo.getReviewQueue(new Date().toISOString()).filter((e) => e.isDue).length;
  const rec = recommendToday(meta, summaries, dueCount);
  const recUnit = rec.unitId ? meta.find((m) => m.id === rec.unitId) : null;
  const titleOf = (m: FoundationUnitMeta) => (zh ? m.titleZh : m.titleJa);
  const doneCount = meta.filter((m) => (summaries[m.id]?.completedCount ?? 0) > 0).length;

  // 第一CTAは状態から決定的に一つだけ（§4）
  const isReview = rec.kind === 'review_due' || rec.kind === 'all_done_review';
  const isResume = rec.kind === 'resume_unit';
  const cardTitle = isReview ? tl.todayReviewTitle : tl.todayCardTitle;
  const cardBody = isReview
    ? tl.recReview(rec.dueCount)
    : recUnit ? tl.todayBody(titleOf(recUnit)) : tl.recAllDone;
  const cta = isReview ? tl.ctaReview : isResume ? tl.ctaResume : tl.ctaStart;

  return (
    <div>
      {/* ① 今日の大きな学習カード（主要CTAは一つ） */}
      <div className="bg-indigo-600 text-white rounded-2xl p-5 mb-4">
        <p className="text-xs font-bold text-indigo-200 flex items-center gap-1.5 mb-1"><Compass className="w-4 h-4" />{cardTitle}</p>
        <p className="text-base font-bold leading-snug">{cardBody}</p>
        <p className="text-xs text-indigo-200 mt-1">{tl.aboutMinutes(rec.estimatedMinutes)}</p>
        <button type="button"
          onClick={() => (isReview ? onGoRecords() : rec.unitId && onOpenUnit(rec.unitId))}
          className="w-full min-h-12 py-3 mt-4 bg-white text-indigo-700 text-base font-bold rounded-xl action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{cta}</button>
      </div>

      {/* ② 進み具合（数値を並べすぎない） */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <p className="text-xs font-bold text-gray-500 mb-1.5">{tl.progressHeading}</p>
        <p className="text-sm text-gray-800 font-bold mb-2">{tl.unitsDone(doneCount, meta.length)}</p>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="img" aria-label={tl.unitsDone(doneCount, meta.length)}>
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round((doneCount / meta.length) * 100)}%` }} />
        </div>
      </div>

      {/* ③ 単元を選ぶ導線（小さく一つ） */}
      <button type="button" onClick={onGoUnits}
        className="w-full min-h-11 py-2.5 text-sm font-bold text-indigo-700 border border-indigo-200 rounded-xl action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tl.chooseUnit}</button>
      <p className="text-[11px] text-gray-400 mt-3">{tl.notSaved}</p>
    </div>
  );
};
