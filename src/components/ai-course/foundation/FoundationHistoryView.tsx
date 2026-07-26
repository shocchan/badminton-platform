// 「履歴」ビュー: この試作セッション内の履歴のみ＋リセット（§7-5/§21）
import { useState } from 'react';
import type { FoundationUnitMeta } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository } from '../../../lib/aiLesson/course/foundationProgress';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  repo: FoundationProgressRepository;
  onReset: () => void;
}

export const FoundationHistoryView = ({ t, meta, repo, onReset }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const [confirming, setConfirming] = useState(false);
  const attempts = repo.getAttempts().filter((a) => a.completedAt !== null).slice().reverse();
  const unitTitle = (id: string) => { const m = meta.find((x) => x.id === id); return m ? (zh ? m.titleZh : m.titleJa) : id; };

  return (
    <div>
      <p className="text-[11px] text-gray-500 mb-3">{tl.historyNote}</p>
      {attempts.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{tl.emptyHistory}</p>}
      <div className="space-y-2">
        {attempts.map((a) => {
          const correct = a.answers.filter((x) => x.correct).length;
          const wrong = a.answers.filter((x) => !x.correct);
          const dims = new Map<string, { c: number; t: number }>();
          a.answers.forEach((x) => { const d = dims.get(x.dimension) ?? { c: 0, t: 0 }; d.t += 1; if (x.correct) d.c += 1; dims.set(x.dimension, d); });
          return (
            <div key={a.attemptId} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-900">{unitTitle(a.unitId)}</span>
                <span className="text-[10px] text-gray-400">{tl.attemptN(a.attemptNumber)}</span>
                <span className="ml-auto text-sm font-bold text-gray-800">{correct} / {a.answers.length}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {[...dims.entries()].map(([d, v]) => `${tl.dims[d as keyof typeof tl.dims]} ${v.c}/${v.t}`).join('・')}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{a.completedAt ? new Date(a.completedAt).toLocaleString() : ''}</p>
              {wrong.length > 0 && <p className="text-[11px] text-amber-700 mt-0.5">{tl.weakTitle}: {wrong.length}</p>}
            </div>
          );
        })}
      </div>
      <div className="mt-6 border-t border-gray-100 pt-4">
        {confirming ? (
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-xs text-gray-800 mb-2">{tl.resetConfirm}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 min-h-11 text-sm border border-gray-200 rounded-xl">{tl.resetNo}</button>
              <button type="button" onClick={() => { onReset(); setConfirming(false); }} className="flex-1 min-h-11 text-sm font-bold text-white bg-amber-600 rounded-xl">{tl.resetYes}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-11 text-xs text-gray-500 underline">{tl.resetButton}</button>
        )}
      </div>
    </div>
  );
};
