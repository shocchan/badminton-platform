// N3 Unit進行のlocal保存アダプタ（StoragePort実装）。
//
// 正式DBのRepositoryへ差し替えられるよう、UIはこのportにしか依存しない。
// 現時点はlocalのみなので「保存済み」とは表示せず、UI側は保存失敗を検知できる。
import type { StoragePort, UnitRunState } from './unitRuntime';

const KEY_PREFIX = 'kawabado.aiCourse.v1.n3unit.';

export const createLocalUnitStorage = (store: Storage): StoragePort => ({
  async load(unitId) {
    try {
      const raw = store.getItem(KEY_PREFIX + unitId);
      return raw ? (JSON.parse(raw) as UnitRunState) : null;
    } catch { return null; }
  },
  async save(state) {
    try {
      store.setItem(KEY_PREFIX + state.unitId, JSON.stringify(state));
      return { ok: true };
    } catch {
      // 容量超過・プライベートモード等。learnerには技術用語を出さず、UI側でcodeを扱う
      return { ok: false, code: 'SAVE_FAILED' };
    }
  },
});

export const localUnitStorageKey = (unitId: string) => KEY_PREFIX + unitId;
