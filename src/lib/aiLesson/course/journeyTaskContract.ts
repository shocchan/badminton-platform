// Journey Task Contract（Phase 2E-1.12 §4-§7）。
// 初回Journeyから診断・練習へ出て、完了・中断・失敗の結果を安全にJourneyへ戻すための契約。
// URL遷移やbrowser backだけで「完了」にしない（§5）。同じ完了を二重処理しない。
import { JOURNEY_TASK_KEY } from './courseStorageRegistry';

const CONTRACT_SCHEMA_VERSION = 1;

export type JourneyTaskType = 'diagnostic' | 'practice';
export type JourneyTaskStatus = 'not_started' | 'in_progress' | 'completed' | 'interrupted' | 'failed' | 'recovered';

export interface JourneyTaskContract {
  schemaVersion: number;
  journeyId: string;
  activeTaskType: JourneyTaskType;
  activeTaskId: string;
  activeTaskStatus: JourneyTaskStatus;
  taskStartedAt: string;
  taskCompletedAt: string | null;
  /** 戻り先（Journeyのどのステップへ戻すか） */
  returnStep: 'practice' | 'done';
  /** 使い捨ての完了トークン（再利用を拒否して二重完了を防ぐ・§5） */
  completionToken: string;
  /** 使用済みトークン（再提示されても完了処理をしない） */
  usedTokens: string[];
  /** 完了済みタスクID（同じタスクを二重に完了させない） */
  completedTaskIds: string[];
  /** 学習者へ見せる結果（内部state名を含めない・§8） */
  completionSnapshot: JourneyResultSnapshot | null;
}

/** Step4へ渡す結果（実際に確定した値だけ。欠けた値は null のままにして0と断定しない・§8） */
export interface JourneyResultSnapshot {
  checkedCount: number | null;
  independentCount: number | null;
  supportedCount: number | null;
  needsReviewCount: number | null;
  /** 一部の結果を取得できなかった（学習者へ簡潔に伝える） */
  partial: boolean;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface StartTaskInput {
  journeyId: string;
  taskType: JourneyTaskType;
  taskId: string;
  returnStep: 'practice' | 'done';
}

export interface CompleteTaskInput {
  journeyId: string;
  taskId: string;
  token: string;
  snapshot: JourneyResultSnapshot;
}

export type CompleteResult =
  | { ok: true; contract: JourneyTaskContract }
  | { ok: false; reason: 'no_contract' | 'journey_mismatch' | 'task_mismatch' | 'token_used' | 'already_completed' | 'save_failed' };

export interface JourneyTaskRepository {
  get(): JourneyTaskContract | null;
  /** タスク開始（新しい使い捨てトークンを発行） */
  startTask(input: StartTaskInput): JourneyTaskContract;
  /** 完了（§5の信頼条件をすべて満たす場合のみ true） */
  completeTask(input: CompleteTaskInput): CompleteResult;
  /** 中断として記録（完了にはしない） */
  markInterrupted(): JourneyTaskContract | null;
  /** 結果を取得できなかった（完了を偽らない・§6） */
  markFailed(): JourneyTaskContract | null;
  clear(): void;
  lastSaveFailed(): boolean;
}

/** 決定的でないIDが必要なので crypto を使う（テストからは差し替え可能） */
const defaultIdGen = () => `t_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

export const createJourneyTaskRepository = (
  storage: StorageLike,
  now: () => Date = () => new Date(),
  genId: () => string = defaultIdGen,
): JourneyTaskRepository => {
  let saveFailed = false;
  const read = (): JourneyTaskContract | null => {
    try {
      const raw = storage.getItem(JOURNEY_TASK_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as JourneyTaskContract;
      if (p?.schemaVersion !== CONTRACT_SCHEMA_VERSION) return null;   // 別版は無視（壊さない）
      return p;
    } catch { return null; }
  };
  const write = (c: JourneyTaskContract): JourneyTaskContract => {
    try { storage.setItem(JOURNEY_TASK_KEY, JSON.stringify(c)); saveFailed = false; }
    catch { saveFailed = true; }
    return c;
  };
  return {
    get: read,
    startTask({ journeyId, taskType, taskId, returnStep }) {
      const prev = read();
      const nowIso = now().toISOString();
      return write({
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        journeyId, activeTaskType: taskType, activeTaskId: taskId,
        activeTaskStatus: 'in_progress',
        taskStartedAt: nowIso, taskCompletedAt: null,
        returnStep,
        completionToken: genId(),
        usedTokens: prev?.usedTokens ?? [],
        completedTaskIds: prev?.completedTaskIds ?? [],
        completionSnapshot: null,
      });
    },
    completeTask({ journeyId, taskId, token, snapshot }) {
      const c = read();
      if (!c) return { ok: false, reason: 'no_contract' };
      if (c.journeyId !== journeyId) return { ok: false, reason: 'journey_mismatch' };
      if (c.activeTaskId !== taskId) return { ok: false, reason: 'task_mismatch' };
      if (c.usedTokens.includes(token) || c.completionToken !== token) return { ok: false, reason: 'token_used' };
      if (c.completedTaskIds.includes(taskId)) return { ok: false, reason: 'already_completed' };
      const updated = write({
        ...c,
        activeTaskStatus: 'completed',
        taskCompletedAt: now().toISOString(),
        usedTokens: [...c.usedTokens, token],
        completedTaskIds: [...c.completedTaskIds, taskId],
        completionSnapshot: snapshot,
      });
      if (saveFailed) return { ok: false, reason: 'save_failed' };   // 保存成功を偽らない（§15）
      return { ok: true, contract: updated };
    },
    markInterrupted() {
      const c = read();
      if (!c || c.activeTaskStatus === 'completed') return c;   // 完了済みを中断に戻さない
      return write({ ...c, activeTaskStatus: 'interrupted' });
    },
    markFailed() {
      const c = read();
      if (!c || c.activeTaskStatus === 'completed') return c;
      return write({ ...c, activeTaskStatus: 'failed' });
    },
    clear() { try { storage.removeItem(JOURNEY_TASK_KEY); } catch { saveFailed = true; } },
    lastSaveFailed: () => saveFailed,
  };
};
