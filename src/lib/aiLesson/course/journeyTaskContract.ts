// Journey Task Contract（Phase 2E-1.12 §4-§7）。
// 初回Journeyから診断・練習へ出て、完了・中断・失敗の結果を安全にJourneyへ戻すための契約。
// URL遷移やbrowser backだけで「完了」にしない（§5）。同じ完了を二重処理しない。
import { JOURNEY_TASK_KEY } from './courseStorageRegistry';
import type { DiagnosticSetQuestion } from './vocabDiagnostic';

// v2: 練習の再開位置（taskProgress）を追加。v1は「進行位置なし」として安全に読み込める。
const CONTRACT_SCHEMA_VERSION = 2;
const READABLE_SCHEMA_VERSIONS = [1, 2];

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
  /** 再開位置（2E-1.14 §3・確定した操作だけを記録する。未確定の選択は入れない） */
  taskProgress?: TaskProgress;
}

/**
 * 再開位置。**確定した操作だけ**を記録する。
 * 選んだだけで確定していない回答は含めない（再読込で確定扱いにしないため）。
 */
export interface TaskProgress {
  /** 何語目まで完了したか（0起点のindex＝次に取り組む語） */
  wordIndex: number;
  /** その語のどこまで進んだか */
  phase: 'card' | 'quiz' | 'assess';
  /** 完了した語のID（重複しない） */
  completedWordIds: string[];
  /** 診断の再開情報（診断タスクのときだけ入る） */
  diagnostic?: DiagnosticResume;
}

/**
 * 診断の再開情報。
 * 出題セットは学習記録から作られるため、回答が増えると作り直しでは別の問題になる。
 * そのため **確定した時点のセットそのもの** を持ち、途中再開でも同じ問題を続けられるようにする。
 */
export interface DiagnosticResume {
  /** 次に答える問題のindex（確定済みの数と一致する） */
  index: number;
  /** 出題セット（型は vocabDiagnostic 側の DiagnosticSetQuestion） */
  questions: DiagnosticSetQuestion[];
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
  /** 再開位置を記録する（確定した操作のときだけ呼ぶ） */
  saveProgress(progress: TaskProgress): JourneyTaskContract | null;
  /** Journeyのstepだけを修復した記録（完了処理は再実行しない） */
  markRecovered(): JourneyTaskContract | null;
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
      // 読める版なら受け入れる（v1には taskProgress が無いだけで、意味は失われない）
      if (!READABLE_SCHEMA_VERSIONS.includes(p?.schemaVersion)) return null;
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
    saveProgress(progress) {
      const c = read();
      if (!c || c.activeTaskStatus === 'completed') return c;   // 完了後は進行位置を動かさない
      return write({ ...c, schemaVersion: CONTRACT_SCHEMA_VERSION, taskProgress: progress });
    },
    markRecovered() {
      const c = read();
      if (!c) return null;
      return write({ ...c, activeTaskStatus: 'recovered' });
    },
    clear() { try { storage.removeItem(JOURNEY_TASK_KEY); } catch { saveFailed = true; } },
    lastSaveFailed: () => saveFailed,
  };
};
