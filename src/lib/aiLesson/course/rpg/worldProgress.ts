// World Mapの現在地・エリア進捗の導出（read only・FOREST FIRST §7）。
// N3単元のローカル保存（localUnitStorage）から「完了かどうか」だけを読む。
// ここから学習状態を書き換えない。壊れた保存値は「未完了」として扱う（行き止まりにしない）。
import { WORLD_AREAS, type WorldArea } from './worldAtlas';
import { localUnitStorageKey } from '../n3unit/localUnitStorage';

type ReadableStore = Pick<Storage, 'getItem'>;

/** 単元がこの端末で完了(result)しているか。読めない値はfalse */
export const unitCompletedLocally = (store: ReadableStore, unitId: string): boolean => {
  try {
    const raw = store.getItem(localUnitStorageKey(unitId));
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      && (parsed as { phase?: unknown }).phase === 'result';
  } catch {
    return false;
  }
};

export interface AreaProgress { done: number; total: number; complete: boolean }

export const areaProgress = (store: ReadableStore, area: WorldArea): AreaProgress => {
  const done = area.unitIds.filter(id => unitCompletedLocally(store, id)).length;
  return { done, total: area.unitIds.length, complete: area.unitIds.length > 0 && done === area.unitIds.length };
};

/**
 * 主人公の現在地: 未完了の単元が残る最初のn3areaエリア。
 * 全n3areaが完了していればソラノ塔（N2）を現在地とする。
 */
export const deriveCurrentAreaId = (store: ReadableStore): string => {
  const ordered = [...WORLD_AREAS].sort((a, b) => a.order - b.order);
  for (const area of ordered) {
    if (area.destination.kind !== 'n3area') continue;
    if (!areaProgress(store, area).complete) return area.areaId;
  }
  return 'area08-sorano';
};
