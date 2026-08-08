// 「学習記録」ビュー（§6）: 復習候補→最近の単元→分野別の状態→過去の結果 の順で1画面に統合。
// 技術用語（day1/errorTag/candidateState等）は利用者へ見せない（§16/§17）。
import { useState } from 'react';
import type { FoundationUnitMeta, FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository } from '../../../lib/aiLesson/course/foundationProgress';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  bundles: Record<string, FoundationUnitBundle>;
  repo: FoundationProgressRepository;
  onOpenUnit: (id: string) => void;
  onReset: () => void;
}

export const FoundationRecordsView = ({ t, meta, bundles, repo, onOpenUnit, onReset }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const [confirming, setConfirming] = useState(false);
  const queue = repo.getReviewQueue(new Date().toISOString());
  const candidates = queue.filter((e) => e.candidateState !== 'retained');
  const states = repo.getMasteryStates();
  const attempts = repo.getAttempts().filter((a) => a.completedAt !== null).slice().reverse();

  const labelOf = (targetId: string, unitId: string): string => {
    const b = bundles[unitId];
    const it = b?.items.find((i) => i.id === targetId);
    if (it) return it.displayForm;
    const r = b?.rules.find((x) => x.id === targetId);
    return r ? (zh ? r.titleZh : r.titleJa) : targetId;
  };
  const unitTitle = (id: string) => { const m = meta.find((x) => x.id === id); return m ? (zh ? m.titleZh : m.titleJa) : id; };

  // 分野別サマリ（挑戦済み対象の状態を集計・数値の羅列を避け言葉で）
  const dimSummary: Record<string, { done: number; total: number }> = {};
  for (const dims of Object.values(states)) {
    for (const [d, st] of Object.entries(dims)) {
      dimSummary[d] = dimSummary[d] ?? { done: 0, total: 0 };
      dimSummary[d].total += 1;
      if (st === 'independent' || st === 'retained') dimSummary[d].done += 1;
    }
  }

  return (
    <div>
      {/* ① 今日復習したい内容（最優先の復習は「今日」の第一CTAにも出る・§6） */}
      <p className="text-xs font-bold text-gray-500 mb-2">{tl.recordsReviewHeading}</p>
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 bg-white border border-gray-100 rounded-xl p-4 mb-4">{tl.emptyReview}</p>
      ) : (
        <div className="space-y-2 mb-4">
          {candidates.slice(0, 6).map((e) => (
            <div key={`${e.targetId}-${e.dimension}`} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-900">{labelOf(e.targetId, e.unitId)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{tl.dims[e.dimension]}</span>
                {e.isDue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{tl.dueNow}</span>}
              </div>
              <p className="text-[11px] text-gray-600 mt-0.5">{tl.reviewReasons[e.candidateState]}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-gray-400">{unitTitle(e.unitId)}</span>
                <button type="button" onClick={() => onOpenUnit(e.unitId)} className="min-h-10 px-3 text-xs font-bold text-indigo-700 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tl.retryUnit}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ② 最近学んだ単元 */}
      <p className="text-xs font-bold text-gray-500 mb-2">{tl.recordsRecentHeading}</p>
      {attempts.length === 0 ? (
        <p className="text-sm text-gray-400 bg-white border border-gray-100 rounded-xl p-4 mb-4">{tl.emptyHistory}</p>
      ) : (
        <div className="space-y-2 mb-4">
          {attempts.slice(0, 3).map((a) => {
            const correct = a.answers.filter((x) => x.correct).length;
            return (
              <div key={a.attemptId} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900 flex-1">{unitTitle(a.unitId)}</span>
                <span className="text-sm font-bold text-gray-800">{correct} / {a.answers.length}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ③ 分野別の状態（詳細は展開式・§14） */}
      {Object.keys(dimSummary).length > 0 && (
        <details className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <summary className="text-xs font-bold text-gray-500 cursor-pointer min-h-6">{tl.recordsDimsHeading}</summary>
          <div className="mt-2 space-y-1">
            {Object.entries(dimSummary).map(([d, v]) => (
              <p key={d} className="text-sm text-gray-800 flex justify-between">
                <span>{tl.dims[d as keyof typeof tl.dims]}</span>
                <span className="text-gray-500">{tl.dimsOk(v.done, v.total)}</span>
              </p>
            ))}
          </div>
        </details>
      )}

      {/* ④ 過去の結果（全attempt・展開式） */}
      {attempts.length > 3 && (
        <details className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <summary className="text-xs font-bold text-gray-500 cursor-pointer min-h-6">{tl.recordsPastHeading}</summary>
          <div className="mt-2 space-y-1.5">
            {attempts.slice(3).map((a) => (
              <p key={a.attemptId} className="text-xs text-gray-600 flex justify-between">
                <span>{unitTitle(a.unitId)}（{tl.attemptN(a.attemptNumber)}）</span>
                <span>{a.answers.filter((x) => x.correct).length} / {a.answers.length}</span>
              </p>
            ))}
          </div>
        </details>
      )}

      <p className="text-[11px] text-gray-400 mb-4">{tl.reviewNote}</p>
      <div className="border-t border-gray-100 pt-4">
        {confirming ? (
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-xs text-gray-800 mb-2">{tl.resetConfirm}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 min-h-11 text-sm border border-gray-200 rounded-xl action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tl.resetNo}</button>
              <button type="button" onClick={() => { onReset(); setConfirming(false); }} className="flex-1 min-h-11 text-sm font-bold text-white bg-amber-600 rounded-xl action-raised action-amber touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tl.resetYes}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-xs text-gray-500 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tl.resetButton}</button>
        )}
      </div>
    </div>
  );
};
