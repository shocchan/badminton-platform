// 学習進捗の正式Repository（§14）。
//
// 約束:
// 1. 「保存しました」はサーバ確定後だけ。localのみ成功なら「未同期」として扱う。
// 2. 楽観ロック（rowVersion）。stale更新はサーバが拒否し、決定的なmerge policyで解決する。
// 3. 送信は冪等（同じmutationIdを二度送っても二重登録しない）。
// 4. オフライン時はoutboxに貯め、復帰時に順序どおり流す。部分失敗は残す。
// 5. 「新しい方」「多い方」を勝手に採用しない。mergeは下記の明示ルールのみ。
import type { UnitRunState } from '../n3unit/unitRuntime';

export interface StoredProgress {
  learnerId: string;
  unitId: string;
  state: UnitRunState;
  rowVersion: number;
  updatedAtMs: number;
}

export type ServerError =
  | { kind: 'conflict'; server: StoredProgress }
  | { kind: 'denied' }        // RLS/entitlement
  | { kind: 'unavailable' }   // ネットワーク・サーバ障害
  | { kind: 'auth_expired' };

export type ServerResult<T> = { ok: true; value: T } | { ok: false; error: ServerError };

/** サーバ側の最小契約（Supabase実装でもin-memory実装でも満たせる） */
export interface ProgressServerPort {
  fetch(learnerId: string, unitId: string): Promise<ServerResult<StoredProgress | null>>;
  /** mutationIdで冪等。expectedRowVersionが一致しなければ conflict を返す */
  upsert(input: {
    learnerId: string; unitId: string; state: UnitRunState;
    expectedRowVersion: number; mutationId: string; nowMs: number;
  }): Promise<ServerResult<StoredProgress>>;
}

export interface OutboxEntry {
  mutationId: string;
  learnerId: string;
  unitId: string;
  state: UnitRunState;
  expectedRowVersion: number;
  queuedAtMs: number;
  attempts: number;
}

export interface LocalCachePort {
  read(learnerId: string, unitId: string): StoredProgress | null;
  write(p: StoredProgress): void;
  readOutbox(): OutboxEntry[];
  writeOutbox(entries: OutboxEntry[]): void;
  clear(learnerId: string): void;
}

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'denied' | 'auth_expired';

export interface SaveOutcome {
  /** サーバ確定したか。falseなら「保存しました」と表示してはいけない */
  persisted: boolean;
  status: SyncStatus;
  progress: StoredProgress;
  /** conflict時のサーバ側の値（UIが選択肢を出すために必要） */
  serverProgress?: StoredProgress;
}

/**
 * 決定的マージ方針（§14）。
 * 「新しい方」「多い方」を自動採用しない。以下の順序でのみ決める:
 *   1. 完了済み(result)は未完了に負けない。両方完了なら先に完了した方（completedAtMs小）を採る
 *   2. フェーズが進んでいる方（PHASE_RANKが大きい方）を採る
 *   3. それも同じなら、正解した問題IDの和集合を採る（学習の消失を防ぐ）
 * どの分岐でも learner の解答実績（clearedQuestionIds・attempts）は失わない。
 */
const PHASE_RANK: Record<UnitRunState['phase'], number> = {
  intro: 0, diagnostic: 1, stage1: 2, stage2: 3, stage3: 4, mission: 5, result: 6,
};

export const mergeProgress = (a: UnitRunState, b: UnitRunState): UnitRunState => {
  const unionCleared = [...new Set([...a.clearedQuestionIds, ...b.clearedQuestionIds])];
  const unionReview = [...new Set([...a.reviewScheduledItemIds, ...b.reviewScheduledItemIds])];
  const unionSkipped = [...new Set([...a.diagnosticSkippedItemIds, ...b.diagnosticSkippedItemIds])];
  const attempts = { ...a.attempts };
  for (const [id, at] of Object.entries(b.attempts)) {
    const cur = attempts[id];
    attempts[id] = cur
      ? { itemId: id,
          correctCount: Math.max(cur.correctCount, at.correctCount),
          wrongCount: Math.max(cur.wrongCount, at.wrongCount),
          lastCorrectAtMs: Math.max(cur.lastCorrectAtMs ?? 0, at.lastCorrectAtMs ?? 0) || null }
      : at;
  }
  const aDone = a.phase === 'result', bDone = b.phase === 'result';
  let base: UnitRunState;
  if (aDone !== bDone) base = aDone ? a : b;                                  // 1) 完了を優先
  else if (aDone && bDone) base = (a.completedAtMs ?? 0) <= (b.completedAtMs ?? 0) ? a : b;
  else base = PHASE_RANK[a.phase] >= PHASE_RANK[b.phase] ? a : b;             // 2) 進んでいる方
  return {                                                                    // 3) 実績は和集合
    ...base,
    clearedQuestionIds: unionCleared,
    reviewScheduledItemIds: unionReview,
    diagnosticSkippedItemIds: unionSkipped,
    attempts,
    missionCleared: a.missionCleared || b.missionCleared,
  };
};

export interface RepositoryDeps {
  server: ProgressServerPort;
  cache: LocalCachePort;
  /** mutationIdの生成（テストでは決定的に差し替える） */
  newMutationId: () => string;
  now: () => number;
}

export const createUnitProgressRepository = ({ server, cache, newMutationId, now }: RepositoryDeps) => {
  const statusOf = (e: ServerError): SyncStatus =>
    e.kind === 'conflict' ? 'conflict' : e.kind === 'denied' ? 'denied'
      : e.kind === 'auth_expired' ? 'auth_expired' : 'pending';

  return {
    /** サーバ優先で読む。落ちていればlocalで学習を継続できるようにする */
    async load(learnerId: string, unitId: string): Promise<{ progress: StoredProgress | null; status: SyncStatus }> {
      const r = await server.fetch(learnerId, unitId);
      if (r.ok) {
        if (r.value) cache.write(r.value);
        return { progress: r.value ?? cache.read(learnerId, unitId), status: 'synced' };
      }
      return { progress: cache.read(learnerId, unitId), status: statusOf(r.error) };
    },

    /**
     * 保存。サーバ確定で persisted=true。失敗時はoutboxへ積み、learnerには未同期として見せる。
     * conflictはmerge policyで解決し、解決結果を再送する（黙って上書きしない）。
     */
    async save(learnerId: string, state: UnitRunState): Promise<SaveOutcome> {
      const local = cache.read(learnerId, state.unitId);
      const expectedRowVersion = local?.rowVersion ?? 0;
      const mutationId = newMutationId();
      const nowMs = now();

      const attempt = async (st: UnitRunState, expected: number): Promise<SaveOutcome> => {
        const r = await server.upsert({ learnerId, unitId: st.unitId, state: st, expectedRowVersion: expected, mutationId, nowMs });
        if (r.ok) {
          cache.write(r.value);
          return { persisted: true, status: 'synced', progress: r.value };
        }
        if (r.error.kind === 'conflict') {
          const serverProgress = r.error.server;
          const merged = mergeProgress(st, serverProgress.state);
          const retry = await server.upsert({
            learnerId, unitId: st.unitId, state: merged,
            expectedRowVersion: serverProgress.rowVersion, mutationId: mutationId + ':merged', nowMs,
          });
          if (retry.ok) {
            cache.write(retry.value);
            return { persisted: true, status: 'synced', progress: retry.value, serverProgress };
          }
          const pending: StoredProgress = { learnerId, unitId: st.unitId, state: merged, rowVersion: expected, updatedAtMs: nowMs };
          cache.write(pending);
          cache.writeOutbox([...cache.readOutbox(), {
            mutationId, learnerId, unitId: st.unitId, state: merged,
            expectedRowVersion: serverProgress.rowVersion, queuedAtMs: nowMs, attempts: 1,
          }]);
          return { persisted: false, status: 'conflict', progress: pending, serverProgress };
        }
        // 通信不能・権限エラー: localは保持しつつ「保存済み」とは言わない
        const pending: StoredProgress = { learnerId, unitId: st.unitId, state: st, rowVersion: expected, updatedAtMs: nowMs };
        cache.write(pending);
        if (r.error.kind === 'unavailable') {
          cache.writeOutbox([...cache.readOutbox(), {
            mutationId, learnerId, unitId: st.unitId, state: st,
            expectedRowVersion: expected, queuedAtMs: nowMs, attempts: 1,
          }]);
        }
        return { persisted: false, status: statusOf(r.error), progress: pending };
      };

      return attempt(state, expectedRowVersion);
    },

    /** 接続回復時のoutbox送信。成功分だけ取り除き、失敗分は順序を保って残す */
    async flushOutbox(): Promise<{ sent: number; remaining: number; lastStatus: SyncStatus }> {
      const queue = cache.readOutbox();
      const remaining: OutboxEntry[] = [];
      let sent = 0;
      let lastStatus: SyncStatus = 'synced';
      for (const entry of queue) {
        if (remaining.length > 0) { remaining.push(entry); continue; } // 順序保持: 一度詰まったら以降は送らない
        const r = await server.upsert({
          learnerId: entry.learnerId, unitId: entry.unitId, state: entry.state,
          expectedRowVersion: entry.expectedRowVersion, mutationId: entry.mutationId, nowMs: now(),
        });
        if (r.ok) { cache.write(r.value); sent++; continue; }
        if (r.error.kind === 'conflict') {
          const merged = mergeProgress(entry.state, r.error.server.state);
          const retry = await server.upsert({
            learnerId: entry.learnerId, unitId: entry.unitId, state: merged,
            expectedRowVersion: r.error.server.rowVersion, mutationId: entry.mutationId + ':merged', nowMs: now(),
          });
          if (retry.ok) { cache.write(retry.value); sent++; continue; }
        }
        lastStatus = statusOf(r.error);
        remaining.push({ ...entry, attempts: entry.attempts + 1 });
      }
      cache.writeOutbox(remaining);
      return { sent, remaining: remaining.length, lastStatus };
    },

    /** ログアウト前チェック。未同期があれば警告できるようにする */
    pendingCount(): number { return cache.readOutbox().length; },

    /** ログアウト時: 端末に他人の学習記録を残さない */
    onLogout(learnerId: string): { discardedPending: number } {
      const pending = cache.readOutbox().filter(e => e.learnerId === learnerId).length;
      cache.clear(learnerId);
      return { discardedPending: pending };
    },
  };
};

export type UnitProgressRepository = ReturnType<typeof createUnitProgressRepository>;
