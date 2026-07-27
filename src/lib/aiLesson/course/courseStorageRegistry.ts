// ローカル状態のキー登録簿と安全なreset（Phase 2E-1.12 §11-§12・R9再発防止）。
// 目的: 「どのキーが誰のものか」「消してよいのはどれか」をコード上で固定し、
// Journeyのreset・Recovery・検証操作が学習進捗を巻き込んで消すことを構造的に防ぐ。
//
// 絶対規則（テストで担保）:
//   - storage.clear() は使わない
//   - prefix/正規表現による広範囲削除をしない
//   - 削除は必ず allowlist の明示キーのみ
import { VOCAB_STORAGE_KEY } from './vocabProgress';
import { VOCAB_REVIEW_SCHEDULE_KEY } from './vocabSpacedReview';
import { VOCAB_REVIEW_LOCAL_KEY, VOCAB_REVIEW_STORAGE_KEY } from './vocabReviewStore';
import { VOCAB_DECISION_LOCAL_KEY } from './vocabDecisionStore';
import { FIRST_RUN_STORAGE_KEY } from './firstRunJourney';

/** 誰のためのデータか（消してよいかの判断根拠） */
export type StorageOwner = 'learner_progress' | 'learner_journey' | 'lab_review' | 'lab_ui';
export type StorageKind = 'session' | 'local';

export interface StorageKeyInfo {
  key: string;
  owner: StorageOwner;
  storage: StorageKind;
  schemaVersion: number;
  /** このキーを消したとき学習者に何が起きるか（消してよいかの判断材料） */
  learnerImpactJa: string;
  /** Journeyのreset・Recoveryで消してよいか */
  journeyResettable: boolean;
  labOnly: boolean;
}

/** Journey契約（2E-1.12 §4）。Journey側から診断・練習へ渡す一時的な契約 */
export const JOURNEY_TASK_KEY = 'ai_course_journey_task_v1';
/** 初回Journeyの検証用サンドボックス（§13・通常キーを読まない/書かない） */
export const JOURNEY_SANDBOX_KEY = 'ai_course_journey_sandbox_v1';

/** キー登録簿（新しいキーを足すときはここへ必ず登録する） */
export const STORAGE_KEY_REGISTRY: StorageKeyInfo[] = [
  {
    key: VOCAB_STORAGE_KEY, owner: 'learner_progress', storage: 'session', schemaVersion: 2,
    learnerImpactJa: '学習した語・自己評価・問題結果が失われる', journeyResettable: false, labOnly: true,
  },
  {
    key: VOCAB_REVIEW_SCHEDULE_KEY, owner: 'learner_progress', storage: 'session', schemaVersion: 1,
    learnerImpactJa: '翌日/3日後/7日後の復習予定が失われる', journeyResettable: false, labOnly: true,
  },
  {
    key: FIRST_RUN_STORAGE_KEY, owner: 'learner_journey', storage: 'session', schemaVersion: 1,
    learnerImpactJa: '初回の案内をもう一度最初から受けることになる（学習記録は残る）', journeyResettable: true, labOnly: true,
  },
  {
    key: JOURNEY_TASK_KEY, owner: 'learner_journey', storage: 'session', schemaVersion: 1,
    learnerImpactJa: '進行中の初回タスクの往復情報が失われる（学習記録は残る）', journeyResettable: true, labOnly: true,
  },
  {
    key: JOURNEY_SANDBOX_KEY, owner: 'learner_journey', storage: 'session', schemaVersion: 1,
    learnerImpactJa: '検証用の一時状態のみ（通常の学習には影響しない）', journeyResettable: true, labOnly: true,
  },
  {
    key: VOCAB_REVIEW_LOCAL_KEY, owner: 'lab_review', storage: 'local', schemaVersion: 2,
    learnerImpactJa: '教材レビューの判定が失われる（学習者には影響しない）', journeyResettable: false, labOnly: true,
  },
  {
    key: VOCAB_REVIEW_STORAGE_KEY, owner: 'lab_review', storage: 'session', schemaVersion: 1,
    learnerImpactJa: '旧版の教材レビュー（移行元）', journeyResettable: false, labOnly: true,
  },
  {
    key: VOCAB_DECISION_LOCAL_KEY, owner: 'lab_review', storage: 'local', schemaVersion: 3,
    learnerImpactJa: 'CEOの判断ドラフトが失われる（学習者には影響しない）', journeyResettable: false, labOnly: true,
  },
  {
    key: 'ai_course_decision_console_ui_v1', owner: 'lab_ui', storage: 'session', schemaVersion: 1,
    learnerImpactJa: '判断キューのフィルター表示位置だけが戻る', journeyResettable: false, labOnly: true,
  },
];

/** Journeyのreset・Recoveryで消してよいキー（これ以外は絶対に消さない・§12） */
export const JOURNEY_RESET_ALLOWLIST: string[] =
  STORAGE_KEY_REGISTRY.filter((k) => k.journeyResettable).map((k) => k.key);

/** 学習進捗キー（どのresetでも消さない） */
export const LEARNER_PROGRESS_KEYS: string[] =
  STORAGE_KEY_REGISTRY.filter((k) => k.owner === 'learner_progress').map((k) => k.key);

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface SafeResetResult {
  removed: string[];
  /** allowlistに無いため削除を拒否したキー（呼び出し側のバグ検出用） */
  refused: string[];
}

/**
 * allowlistに載っているキーだけを消す（§12）。
 * storage.clear() も prefix一致削除も使わない。allowlist外は refused として拒否する。
 */
export const safeResetKeys = (storage: StorageLike, keys: string[]): SafeResetResult => {
  const removed: string[] = [];
  const refused: string[] = [];
  for (const k of keys) {
    if (!JOURNEY_RESET_ALLOWLIST.includes(k)) { refused.push(k); continue; }
    try { storage.removeItem(k); removed.push(k); } catch { refused.push(k); }
  }
  return { removed, refused };
};

/** 初回Journeyのreset（Journey用キーのみ・学習進捗には触れない） */
export const resetJourneyState = (storage: StorageLike): SafeResetResult =>
  safeResetKeys(storage, JOURNEY_RESET_ALLOWLIST);

/**
 * 検証用サンドボックス（§13）。
 * 通常キーを読まず・書かず、sandbox用の名前空間だけを使うStorageラッパを返す。
 * 終了時は sandbox キーだけを消す（通常状態は退避も削除もしない＝R9の再発を構造的に防ぐ）。
 */
export interface JourneySandbox {
  storage: StorageLike;
  active: boolean;
  end(): SafeResetResult;
}

export const createJourneySandbox = (base: StorageLike): JourneySandbox => {
  const read = (): Record<string, string> => {
    try { return JSON.parse(base.getItem(JOURNEY_SANDBOX_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  };
  const write = (m: Record<string, string>) => {
    try { base.setItem(JOURNEY_SANDBOX_KEY, JSON.stringify(m)); } catch { /* 保存できなくても検証は続く */ }
  };
  return {
    active: true,
    storage: {
      getItem: (k) => read()[k] ?? null,
      setItem: (k, v) => { const m = read(); m[k] = v; write(m); },
      removeItem: (k) => { const m = read(); delete m[k]; write(m); },
    },
    end: () => safeResetKeys(base, [JOURNEY_SANDBOX_KEY]),
  };
};

/**
 * サンドボックスが動作中か（2E-1.14 §7）。
 * sandboxキーの存在そのものを目印にする。新しいキーを増やさず、再読込をまたいでも判定でき、
 * `end()` で目印ごと消える。通常キーは一切読まない。
 */
export const isJourneySandboxActive = (base: StorageLike): boolean => {
  try { return base.getItem(JOURNEY_SANDBOX_KEY) !== null; } catch { return false; }
};

/** サンドボックスを開始する（空の名前空間を作るだけ。通常キーには触れない） */
export const beginJourneySandbox = (base: StorageLike): JourneySandbox => {
  try { if (base.getItem(JOURNEY_SANDBOX_KEY) === null) base.setItem(JOURNEY_SANDBOX_KEY, '{}'); }
  catch { /* 保存できなくてもラッパは返す（検証を止めない） */ }
  return createJourneySandbox(base);
};
