// 「単元を選ぶ」ビュー（§5）: 学習順が分かる6単元カード。検索・フィルターは出さない。
// ことば・しくみの全件一覧は下部の補助導線から（§7）。
import { useState } from 'react';
import type { FoundationUnitMeta, FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository, FoundationUnitSummary } from '../../../lib/aiLesson/course/foundationProgress';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { FoundationVocabularyView } from './FoundationVocabularyView';
import { FoundationRulesView } from './FoundationRulesView';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  bundles: Record<string, FoundationUnitBundle>;
  summaries: Record<string, FoundationUnitSummary>;
  repo: FoundationProgressRepository;
  onOpenUnit: (id: string) => void;
}

type Browse = null | 'words' | 'rules';

export const FoundationUnitsView = ({ t, meta, bundles, summaries, repo, onOpenUnit }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const [browse, setBrowse] = useState<Browse>(null);
  const due = new Set(repo.getReviewQueue(new Date().toISOString()).filter((e) => e.isDue).map((e) => e.unitId));

  if (browse) {
    return (
      <div>
        <button type="button" onClick={() => setBrowse(null)}
          className="min-h-11 mb-2 text-sm font-bold text-indigo-700">← {tl.backToUnits}</button>
        {browse === 'words'
          ? <FoundationVocabularyView t={t} meta={meta} bundles={bundles} repo={repo} />
          : <FoundationRulesView t={t} meta={meta} bundles={bundles} onOpenUnit={onOpenUnit} />}
      </div>
    );
  }

  const statusOf = (m: FoundationUnitMeta): string => {
    const s = summaries[m.id];
    if (due.has(m.id)) return tl.statusReview;
    if (s?.inProgress) return tl.statusInProgress;
    if ((s?.completedCount ?? 0) > 0) return tl.statusDone;
    return tl.statusNotStarted;
  };

  return (
    <div>
      <div className="space-y-2">
        {meta.map((m, idx) => {
          const b = bundles[m.id];
          const s = summaries[m.id];
          const canDo = b ? (zh ? b.unit.canDoZh[0] : b.unit.canDoJa[0]) : '';
          const prereqUnmet = m.prerequisiteUnitIds.filter((p) => (summaries[p]?.completedCount ?? 0) === 0);
          const cta = s?.inProgress ? tl.ctaResume : tl.ctaStart;
          return (
            <button key={m.id} type="button" onClick={() => onOpenUnit(m.id)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 min-h-11">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400 shrink-0">{idx + 1}</span>
                <span className="text-sm font-bold text-gray-900 flex-1">{zh ? m.titleZh : m.titleJa}</span>
                <span className="text-[11px] text-gray-500 shrink-0">{statusOf(m)}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{canDo}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-gray-400">{tl.aboutMinutes(m.estimatedMinutes)}</span>
                <span className="text-xs font-bold text-indigo-700">{cta} →</span>
              </div>
              {prereqUnmet.length > 0 && (
                <p className="text-[11px] text-sky-700 mt-1">
                  {tl.prereqShort(prereqUnmet.map((p) => { const pm = meta.find((x) => x.id === p); return pm ? (zh ? pm.titleZh : pm.titleJa) : p; }).join('・'))}
                </p>
              )}
            </button>
          );
        })}
      </div>
      {/* 補助導線: 全語彙・全規則は必要な人だけが開く（§7） */}
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => setBrowse('words')} className="flex-1 min-h-11 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl">{tl.browseWords}</button>
        <button type="button" onClick={() => setBrowse('rules')} className="flex-1 min-h-11 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl">{tl.browseRules}</button>
      </div>
    </div>
  );
};
