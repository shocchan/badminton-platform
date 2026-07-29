// オモイデ庭園・冒険の記録の集計（read only・FOREST FIRST §13-§14）。
// localStorageの学習記録から件数だけを導出する。ここから書き込みはしない。
// 壊れた値は0件として扱う（表示が止まらないことを優先）。
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { WORLD_AREAS } from './worldAtlas';
import { localUnitStorageKey } from '../n3unit/localUnitStorage';
import { N2_QUEST_KEY_PREFIX } from '../n2quest/n2QuestProgress';
import { areaProgress } from './worldProgress';

type ReadableStore = Pick<Storage, 'getItem'>;
type IterableStore = Pick<Storage, 'getItem' | 'key' | 'length'>;

const parseUnitState = (store: ReadableStore, unitId: string): Record<string, unknown> | null => {
  try {
    const raw = store.getItem(localUnitStorageKey(unitId));
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** N3単元で復習予定に入った語の数（重複語は1つに数える） */
export const n3ScheduledReviewCount = (store: ReadableStore): number => {
  const ids = new Set<string>();
  for (const spec of N3_UNIT_SPECS) {
    const st = parseUnitState(store, spec.unitId);
    const list = st?.reviewScheduledItemIds;
    if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') ids.add(id);
  }
  return ids.size;
};

/** N3単元の完了数（result到達） */
export const n3UnitsDoneCount = (store: ReadableStore): number =>
  N3_UNIT_SPECS.filter(spec => parseUnitState(store, spec.unitId)?.phase === 'result').length;

/** 完了したn3areaエリア数と総数 */
export const areasDoneCount = (store: ReadableStore): { done: number; total: number } => {
  const areas = WORLD_AREAS.filter(a => a.destination.kind === 'n3area');
  return { done: areas.filter(a => areaProgress(store, a).complete).length, total: areas.length };
};

/** N2で学習済み（確認◯＋使用練習）の文型数 */
export const n2LearnedCount = (store: IterableStore): number => {
  let count = 0;
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || !key.startsWith(N2_QUEST_KEY_PREFIX)) continue;
      try {
        const p: unknown = JSON.parse(store.getItem(key) ?? 'null');
        if (typeof p === 'object' && p !== null
          && typeof (p as Record<string, unknown>).recognizedAtMs === 'number'
          && typeof (p as Record<string, unknown>).producedAtMs === 'number') count++;
      } catch { /* 壊れた1件は数えない */ }
    }
  } catch { /* storeが読めない環境では0 */ }
  return count;
};
