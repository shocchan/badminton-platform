// N3/N2 単元進捗の「同期つき StoragePort」（H2準備・§14）。
//
// 方針（CEO承認前でも安全に配線できる形）:
// - ai_course_unit_progress テーブルが存在する時だけ同期を有効化する（起動時に1回probe）。
//   remote未適用の現在は probe が false になり、従来どおり端末内保存のみ＝挙動不変。
// - 有効時も一次保存は従来の localUnitStorage（庭園・冒険の記録の集計互換を壊さない）。
//   サーバへは unitProgressRepository（楽観ロック・決定的merge・outbox）経由で送る。
// - 同期前から端末にある進捗は、サーバ側が空なら初回loadで自動的に引き上げる（学習を失わない）。
// - 「保存しました（同期済み）」等のUI文言変更は migration 適用後の H2#4 で行う。ここでは変えない。
import type { StoragePort, UnitRunState } from '../n3unit/unitRuntime';
import { createLocalUnitStorage } from '../n3unit/localUnitStorage';
import {
  createUnitProgressRepository, type UnitProgressRepository,
} from './unitProgressRepository';
import { createSupabaseProgressServer, type SupabaseLike } from './supabaseUnitProgressServer';
import { createLocalStorageCachePort } from './localStorageCachePort';

/** probe対象。軽いGET selectで「テーブルが存在し読めるか」を見る */
export interface ProbeClient {
  from(table: string): {
    select(columns: string): {
      limit(n: number): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
    };
  };
}

/**
 * ai_course_unit_progress が使える状態かを調べる。
 * - 存在しない（PGRST205/42P01等）→ false（純local運用）
 * - 権限やネットワークの一時エラー → false（誤って半同期にしない。次回起動で再判定）
 * ⚠️ head:true のHEAD probeは使わない: supabase-jsはテーブルが無くても 204/error:null を
 *    返すことをstaging実測で確認（2026-07-29）。必ずGETで判定する。
 */
export const probeUnitProgressTable = async (client: ProbeClient): Promise<boolean> => {
  try {
    const { data, error } = await client.from('ai_course_unit_progress')
      .select('unit_id').limit(1);
    return !error && Array.isArray(data);
  } catch {
    return false;
  }
};

export interface SyncedUnitStorageDeps {
  learnerId: string;
  supabase: SupabaseLike;
  localStore: Storage;
  /** テストで差し替える。省略時は crypto.randomUUID */
  newMutationId?: () => string;
  now?: () => number;
}

export interface SyncedUnitStorage extends StoragePort {
  /** 接続回復・起動時の未送信分の送出 */
  flushOutbox(): Promise<{ sent: number; remaining: number }>;
  /** 内部repository（テスト・診断用） */
  repository: UnitProgressRepository;
}

/**
 * 同期つきStoragePort。UI（N3UnitPanel等）からは従来のStoragePortと同じに見える。
 * save: local保存が成功すれば ok（サーバ失敗はoutboxに残り、後で流れる）。
 * load: サーバ優先。サーバが空でlocalに進捗があれば引き上げてから返す。
 */
export const createSyncedUnitStorage = (deps: SyncedUnitStorageDeps): SyncedUnitStorage => {
  const local = createLocalUnitStorage(deps.localStore);
  const repository = createUnitProgressRepository({
    server: createSupabaseProgressServer(deps.supabase),
    cache: createLocalStorageCachePort(deps.localStore),
    newMutationId: deps.newMutationId ?? (() => (globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random()}`)),
    now: deps.now ?? (() => Date.now()),
  });

  return {
    repository,
    async load(unitId) {
      const r = await repository.load(deps.learnerId, unitId);
      if (r.progress) {
        await local.save(r.progress.state); // 集計互換のため従来キーへミラー
        return r.progress.state;
      }
      const legacy = await local.load(unitId);
      if (legacy && r.status === 'synced') {
        // サーバは空・端末に既存進捗 → 学習を失わないよう引き上げる（結果は待つが失敗しても学習は継続）
        await repository.save(deps.learnerId, legacy);
      }
      return legacy;
    },
    async save(state: UnitRunState) {
      const localResult = await local.save(state);
      const outcome = await repository.save(deps.learnerId, state);
      // 端末保存が成功していれば学習は続けられる。サーバ未確定はoutboxが持つ
      if (localResult.ok || outcome.persisted) return { ok: true as const };
      return { ok: false as const, code: 'SAVE_FAILED' };
    },
    flushOutbox: async () => {
      const r = await repository.flushOutbox();
      return { sent: r.sent, remaining: r.remaining };
    },
  };
};
