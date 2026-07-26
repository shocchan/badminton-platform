// 「復習」ビュー: 試作attemptからの復習候補（正式保存済みとは表示しない・§7-4）
import type { FoundationUnitMeta, FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository } from '../../../lib/aiLesson/course/foundationProgress';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  bundles: Record<string, FoundationUnitBundle>;
  repo: FoundationProgressRepository;
  onOpenUnit: (id: string) => void;
}

export const FoundationReviewView = ({ t, meta, bundles, repo, onOpenUnit }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const queue = repo.getReviewQueue(new Date().toISOString());
  const labelOf = (targetId: string, unitId: string): string => {
    const b = bundles[unitId];
    const it = b?.items.find((i) => i.id === targetId);
    if (it) return it.displayForm;
    const r = b?.rules.find((x) => x.id === targetId);
    return r ? (zh ? r.titleZh : r.titleJa) : targetId;
  };
  const unitTitle = (id: string) => { const m = meta.find((x) => x.id === id); return m ? (zh ? m.titleZh : m.titleJa) : id; };
  const candidates = queue.filter((e) => e.candidateState !== 'retained');
  const retained = queue.filter((e) => e.candidateState === 'retained');

  return (
    <div>
      <p className="text-[11px] text-gray-500 mb-3">{tl.reviewNote}</p>
      {candidates.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{tl.emptyReview}</p>}
      <div className="space-y-2">
        {candidates.map((e) => (
          <div key={`${e.targetId}-${e.dimension}`} className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{labelOf(e.targetId, e.unitId)}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{tl.dims[e.dimension]}</span>
              {e.isDue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{tl.dueNow}</span>}
            </div>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {tl.reviewReasons[e.candidateState]}{e.suggestedInterval ? `（${tl.intervals[e.suggestedInterval]}）` : ''}
            </p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-gray-400">{unitTitle(e.unitId)}</span>
              <button type="button" onClick={() => onOpenUnit(e.unitId)} className="min-h-10 px-3 text-xs font-bold text-indigo-700 underline">{tl.retryUnit}</button>
            </div>
          </div>
        ))}
      </div>
      {retained.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-500 mb-1">{tl.retainedHeading}</p>
          {retained.map((e) => (
            <p key={`${e.targetId}-${e.dimension}`} className="text-xs text-gray-600">・{labelOf(e.targetId, e.unitId)}（{tl.dims[e.dimension]}）</p>
          ))}
        </div>
      )}
    </div>
  );
};
