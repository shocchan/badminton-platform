// unitProgressRepository の LocalCachePort を localStorage で実装する（H2準備・§14）。
//
// 役割: サーバ確定値のミラーと outbox（未送信キュー）の永続化。
// 学習の一次保存は従来どおり localUnitStorage（kawabado.aiCourse.v1.n3unit.*）が持ち、
// ここは「同期の帳簿」だけを扱う。壊れた値は握りつぶして空扱い（表示を止めない）。
import type { LocalCachePort, OutboxEntry, StoredProgress } from './unitProgressRepository';

const ROW_PREFIX = 'kawabado.aiCourse.v1.unitSync.row.';
const OUTBOX_KEY = 'kawabado.aiCourse.v1.unitSync.outbox';

const rowKey = (learnerId: string, unitId: string) => `${ROW_PREFIX}${learnerId}.${unitId}`;

export const createLocalStorageCachePort = (store: Storage): LocalCachePort => ({
  read(learnerId, unitId) {
    try {
      const raw = store.getItem(rowKey(learnerId, unitId));
      return raw ? (JSON.parse(raw) as StoredProgress) : null;
    } catch { return null; }
  },
  write(p) {
    try { store.setItem(rowKey(p.learnerId, p.unitId), JSON.stringify(p)); } catch { /* 容量超過等は無視 */ }
  },
  readOutbox() {
    try {
      const raw = store.getItem(OUTBOX_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
    } catch { return []; }
  },
  writeOutbox(entries) {
    try { store.setItem(OUTBOX_KEY, JSON.stringify(entries)); } catch { /* 同上 */ }
  },
  clear(learnerId) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(`${ROW_PREFIX}${learnerId}.`)) doomed.push(k);
      }
      for (const k of doomed) store.removeItem(k);
      const rest = this.readOutbox().filter(e => e.learnerId !== learnerId);
      store.setItem(OUTBOX_KEY, JSON.stringify(rest));
    } catch { /* 同上 */ }
  },
});
