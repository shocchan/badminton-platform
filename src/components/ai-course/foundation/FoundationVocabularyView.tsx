// 「ことば」ビュー: 全単元の語彙一覧（検索・品詞絞り込み・学習状態）。正解一覧は露出しない（§7-2）。
import { useMemo, useState } from 'react';
import type { FoundationUnitMeta, FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationProgressRepository } from '../../../lib/aiLesson/course/foundationProgress';
import type { FoundationItem, FoundationMasteryState } from '../../../lib/aiLesson/course/foundationTypes';
import type { AiCourseDict } from '../../../locales/aiCourse';

interface Props {
  t: AiCourseDict; meta: FoundationUnitMeta[];
  bundles: Record<string, FoundationUnitBundle>;
  repo: FoundationProgressRepository;
}

export const FoundationVocabularyView = ({ t, meta, bundles, repo }: Props) => {
  const tl = t.lab; const zh = t.locale === 'zh';
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<string>('all');
  const states = repo.getMasteryStates();

  const { items, unitsOf } = useMemo(() => {
    const map = new Map<string, FoundationItem>();
    const units = new Map<string, string[]>();
    for (const m of meta) {
      const b = bundles[m.id];
      if (!b) continue;
      for (const it of b.items) {
        if (!map.has(it.id)) map.set(it.id, it);
        units.set(it.id, [...(units.get(it.id) ?? []), m.id]);
      }
    }
    return { items: [...map.values()], unitsOf: units };
  }, [meta, bundles]);

  // 状態バッジ: 挑戦済み次元の中で最も進んでいない状態（過大評価しない）
  const stateOf = (id: string): FoundationMasteryState => {
    const dims = states[id];
    if (!dims) return 'not_seen';
    const order: FoundationMasteryState[] = ['familiar', 'guided', 'independent', 'retained'];
    const vals = Object.values(dims).filter((v): v is FoundationMasteryState => !!v && v !== 'not_seen');
    if (vals.length === 0) return 'not_seen';
    return vals.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  };

  const posKeys = ['all', 'noun', 'verb', 'naAdj', 'iAdj', 'expression'];
  const filtered = items.filter((it) =>
    (pos === 'all' || it.partOfSpeech === pos) &&
    (query.trim() === '' || it.lemma.includes(query.trim()) || it.readingKana.includes(query.trim()) || it.meaningZh.includes(query.trim())));

  return (
    <div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tl.searchWords}
        aria-label={tl.searchWords} className="w-full min-h-11 px-4 py-2.5 border border-gray-200 rounded-xl text-sm mb-2" />
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {posKeys.map((k) => (
          <button key={k} type="button" onClick={() => setPos(k)}
            aria-pressed={pos === k}
            className={`min-h-10 px-3 py-1 text-xs rounded-full whitespace-nowrap action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${pos === k ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {k === 'all' ? tl.filterAll : tl.pos[k as keyof typeof tl.pos]}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{tl.emptyWords}</p>}
      <div className="space-y-2">
        {filtered.map((it) => (
          <div key={it.id} className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-base font-bold text-gray-900">{it.displayForm}</span>
              <span className="text-xs text-gray-500">{it.readingKana}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{tl.pos[it.partOfSpeech]}</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tl.states[stateOf(it.id)]}</span>
            </div>
            <p className="text-xs text-gray-700 mt-0.5">{it.meaningZh}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {(unitsOf.get(it.id) ?? []).map((uid) => { const m = meta.find((x) => x.id === uid); return m ? (zh ? m.titleZh : m.titleJa) : uid; }).join('・')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
