// 「しくみ」ビュー: 規則一覧→関連単元へ（§7-3）
import type { FoundationUnitMeta, FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  bundles: Record<string, FoundationUnitBundle>;
  onOpenUnit: (id: string) => void;
}

export const FoundationRulesView = ({ t, meta, bundles, onOpenUnit }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  return (
    <div className="space-y-2">
      {meta.flatMap((m) => (bundles[m.id]?.rules ?? []).map((r) => (
        <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-bold text-gray-900">{zh ? r.titleZh : r.titleJa}</p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{zh ? r.explanationZh : r.explanationJa}</p>
          <button type="button" onClick={() => onOpenUnit(m.id)}
            className="min-h-10 mt-1.5 text-xs font-bold text-indigo-700 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tl.toUnit(zh ? m.titleZh : m.titleJa)}</button>
        </div>
      )))}
    </div>
  );
};
