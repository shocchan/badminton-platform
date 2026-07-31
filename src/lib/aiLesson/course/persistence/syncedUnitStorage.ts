// N3/N2 単元進捗の「同期つき StoragePort」（H2準備・§14）。
//
// 方針（CEO承認前でも安全に配線できる形）:
// - ai_course_unit_progress テーブルが存在する時だけ同期を有効化する（起動時に1回probe）。
//   remote未適用の現在は probe が false になり、従来どおり端末内保存のみ＝挙動不変。
// - 有効時も一次保存は従来の localUnitStorage（庭園・冒険の記録の集計互換を壊さない）。
//   サーバへは unitProgressRepository（楽観ロック・決定的merge・outbox）経由で送る。
// - 同期前から端末にある進捗は、サーバ側が空なら初回loadで自動的に引き上げる（学習を失わない）。
// - 「保存しました（同期済み）」等のUI文言変更は migration 適用後の H2#4 で行う。ここでは変えない。
import { SCHEMA_VERSION, type StoragePort, type UnitRunState } from '../n3unit/unitRuntime';
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

/** 完全probe（table＋列＋RLS＋RPC＋schema version）で使うclient */
export interface FullProbeClient extends ProbeClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

/**
 * 学習記録の保存先として、いま実際に何が起きているかの表示用状態。
 *   local_only … 同期が無効（テーブル未適用・列不足・RPCなし等）。端末内保存のみ
 *   synced     … サーバ確定済み。別端末でも続けられる
 *   pending    … 端末には保存済みだが未送信が残っている（オフライン等）
 * 「同期済み」は実際にサーバ確定した場合だけ使う（見込みで表示しない）。
 */
export type UnitSyncMode = 'local_only' | 'synced' | 'pending';

export interface SyncProbeResult {
  enabled: boolean;
  checks: { table: boolean; columns: boolean; rls: boolean; rpc: boolean; version: boolean };
  /** 無効化した理由（enabled=falseのときのみ）。UI表示・診断用 */
  reason?: string;
}

/** repositoryが実際に読む列。1つでも欠けたら同期を有効化しない */
const REQUIRED_COLUMNS = 'learner_id, unit_id, state, row_version, last_mutation_id, updated_at';
/** RPC probe用の予約unit_id。expected_row_version=-1 は「行なし」分岐で必ずP0409になり書き込まない */
const PROBE_UNIT_ID = '__sync_probe__';

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

/**
 * 完全probe（2026-07-30 GATE①）。「テーブルがあるだけ」で同期を有効化しない。
 *
 * 確認するもの:
 *   table    … 読める（存在する）
 *   columns  … repositoryが読む列がすべて存在する（1つ欠けてもPostgRESTが42703を返す）
 *   rls      … 返る行が自分のlearner_idのみ（他人の行が見えたら無効化する）
 *   rpc      … ai_upsert_unit_progress が存在し楽観ロックが効く（P0409）。**書き込まない**
 *   version  … サーバ上のstateが自分のSCHEMA_VERSIONより新しくない（新しければ触らない）
 *
 * どれか1つでも満たさなければ enabled=false → 端末内保存のみで従来どおり動く（学習は止めない）。
 * 0行のときの rls/version は「反例が無い」ことしか言えないため、trueとして扱う（reasonに残さない）。
 */
export const probeUnitProgressSync = async (
  client: FullProbeClient, learnerId: string,
): Promise<SyncProbeResult> => {
  const checks = { table: false, columns: false, rls: false, rpc: false, version: false };
  const fail = (reason: string): SyncProbeResult => ({ enabled: false, checks, reason });
  try {
    const { data, error } = await client.from('ai_course_unit_progress')
      .select(REQUIRED_COLUMNS).limit(5);
    if (error) {
      // 42P01/PGRST205=テーブル無し、42703=列不足。どちらも「未適用」として静かにlocal運用
      return fail(`select:${error.code ?? 'unknown'}`);
    }
    if (!Array.isArray(data)) return fail('select:not-array');
    checks.table = true;
    checks.columns = true;

    const rows = data as { learner_id?: string; state?: { version?: number } }[];
    const foreign = rows.filter(r => r.learner_id && r.learner_id !== learnerId);
    if (foreign.length > 0) return fail('rls:foreign-rows-visible');
    checks.rls = true;

    const newer = rows.filter(r => typeof r.state?.version === 'number' && r.state.version > SCHEMA_VERSION);
    if (newer.length > 0) return fail('version:server-newer');
    checks.version = true;

    // RPC probe: 行が無い状態で expected=-1（≠0）→ P0409。insertには入らないので副作用なし
    const { error: rpcError } = await client.rpc('ai_upsert_unit_progress', {
      p_learner_id: learnerId,
      p_unit_id: PROBE_UNIT_ID,
      p_state: {},
      p_expected_row_version: -1,
      p_mutation_id: 'sync-probe',
    });
    // P0409（conflict）= 期待どおり関数が存在し検証も効いている。
    // 関数が無い場合は PGRST202 / 42883 が返る → 同期を有効化しない
    if (rpcError && rpcError.code !== 'P0409') return fail(`rpc:${rpcError.code ?? 'unknown'}`);
    checks.rpc = true;

    return { enabled: true, checks };
  } catch {
    return fail('exception');
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
