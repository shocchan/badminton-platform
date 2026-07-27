// 初回学習Journeyの状態（Phase 2E-1.11 §3・§6）。
// 判定はここ一箇所に集約し、決定的に導出する。
// ローカル状態のみを見る（正式DB・learnerデータは参照しない）。
// 内部状態名は学習者画面へ表示しない（UI側の文言で担保）。
import type { VocabProgressRepository } from './vocabProgress';
import type { VocabSpacedReviewRepository } from './vocabSpacedReview';

export const FIRST_RUN_STORAGE_KEY = 'ai_course_first_run_v1';
const FIRST_RUN_SCHEMA_VERSION = 1;

/** 学習の目的（§4 Step1・既存トラックへ対応させる。新しい正式トラックは追加しない） */
export type LearningGoal = 'daily_conversation' | 'life_in_japan' | 'jlpt_n3' | 'work';
export const LEARNING_GOALS: LearningGoal[] = ['daily_conversation', 'life_in_japan', 'jlpt_n3', 'work'];

/** 目的→既存の語彙トラック（正式トラックを新設しない・§4） */
export const trackForGoal = (goal: LearningGoal): string => {
  switch (goal) {
    case 'jlpt_n3': return 'n3_prep';
    case 'work': return 'business';
    case 'daily_conversation': return 'conversation';
    case 'life_in_japan': return 'life_basic';
  }
};

export type JourneyStep = 'goal' | 'check' | 'practice' | 'done';
export const JOURNEY_STEPS: JourneyStep[] = ['goal', 'check', 'practice', 'done'];

/** 初回判定の状態（§3・6状態を区別） */
export type FirstRunState =
  | 'true_first_run'          // 何も履歴がない
  | 'onboarding_in_progress'  // 初回Journeyの途中
  | 'onboarding_completed'    // 初回Journeyを終えた
  | 'returning_learner'       // 初回Journeyは未経験だが学習履歴がある（初回へ戻さない）
  | 'corrupted_onboarding'    // 初回Journeyの保存データが壊れている
  | 'incompatible_schema';    // 別バージョンの保存データ

export interface FirstRunRecord {
  schemaVersion: number;
  step: JourneyStep;
  goal: LearningGoal | null;
  /** 初回の短い確認を終えたか（診断の回答自体は既存Repositoryが持つ） */
  checkDone: boolean;
  /** 初回の最初の練習を終えたか */
  practiceDone: boolean;
  /** 完了を記録した日時（同じ初回完了を複数回記録しない・§6） */
  completedAt: string | null;
  startedAt: string;
  updatedAt: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface FirstRunLoadResult {
  state: FirstRunState;
  record: FirstRunRecord | null;
  /** 保存が失敗している（quota等・UIで通知して学習は続ける・§7） */
  saveFailed: boolean;
}

const isStep = (v: unknown): v is JourneyStep => JOURNEY_STEPS.includes(v as JourneyStep);
const isGoal = (v: unknown): v is LearningGoal => LEARNING_GOALS.includes(v as LearningGoal);

/** 保存データの妥当性（壊れているかどうかを厳密に見る・推測で直さない） */
const parseRecord = (raw: string): { record: FirstRunRecord | null; state: FirstRunState | null } => {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { record: null, state: 'corrupted_onboarding' }; }
  if (typeof parsed !== 'object' || parsed === null) return { record: null, state: 'corrupted_onboarding' };
  const r = parsed as Partial<FirstRunRecord>;
  if (typeof r.schemaVersion !== 'number') return { record: null, state: 'corrupted_onboarding' };
  if (r.schemaVersion !== FIRST_RUN_SCHEMA_VERSION) return { record: null, state: 'incompatible_schema' };
  if (!isStep(r.step) || (r.goal !== null && !isGoal(r.goal))) return { record: null, state: 'corrupted_onboarding' };
  return {
    record: {
      schemaVersion: FIRST_RUN_SCHEMA_VERSION,
      step: r.step, goal: r.goal ?? null,
      checkDone: !!r.checkDone, practiceDone: !!r.practiceDone,
      completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
      startedAt: typeof r.startedAt === 'string' ? r.startedAt : '',
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
    },
    state: null,
  };
};

/**
 * 初回判定（§3・決定的）。
 * 既に学習履歴・復習予定がある人を初回Journeyへ戻さない（returning_learner）。
 * 重い全教材走査はしない（Repositoryの軽い集計のみ・§15）。
 */
export const detectFirstRunState = (
  storage: StorageLike, progress: VocabProgressRepository, schedule: VocabSpacedReviewRepository,
): FirstRunLoadResult => {
  let raw: string | null;
  try { raw = storage.getItem(FIRST_RUN_STORAGE_KEY); } catch { return { state: 'corrupted_onboarding', record: null, saveFailed: true }; }
  if (raw) {
    const { record, state } = parseRecord(raw);
    if (state) return { state, record: null, saveFailed: false };
    if (record) {
      if (record.completedAt) return { state: 'onboarding_completed', record, saveFailed: false };
      return { state: 'onboarding_in_progress', record, saveFailed: false };
    }
  }
  // 初回記録がない場合、既存の学習履歴の有無で判定（履歴があれば初回へ戻さない）
  const stats = progress.getStats();
  const hasHistory = stats.seenCount > 0 || stats.selfKnownCount > 0 || stats.verifiedCount > 0;
  const hasSchedule = schedule.getAll().length > 0;
  return { state: hasHistory || hasSchedule ? 'returning_learner' : 'true_first_run', record: null, saveFailed: false };
};

export interface FirstRunRepository {
  load(): FirstRunLoadResult;
  /** Journeyを開始（既存の学習進捗には触れない） */
  start(): FirstRunRecord;
  setGoal(goal: LearningGoal): FirstRunRecord;
  /** 短い確認を終えた（診断の回答自体は既存Repositoryが保持） */
  completeCheck(): FirstRunRecord;
  completePractice(): FirstRunRecord;
  /**
   * stepだけを安全に修復する（2E-1.14 §5）。
   * 契約が完了しているのにstepが前に残っている状態を直すためだけに使う。
   * 完了フラグ・completedAt・目的には触れない。同じstepを渡しても何も変わらない。
   */
  repairStep(step: JourneyStep): FirstRunRecord;
  /** 初回完了。既に完了済みなら completedAt を上書きしない（重複記録しない・§6） */
  complete(): FirstRunRecord;
  /** 前のステップへ戻る（回答は消さない・§5） */
  goBack(): FirstRunRecord | null;
  /** 壊れた/非互換の初回状態だけを作り直す（既存の学習進捗は消さない・§7） */
  resetOnboardingOnly(): void;
  lastSaveFailed(): boolean;
}

export const createFirstRunRepository = (
  storage: StorageLike, progress: VocabProgressRepository, schedule: VocabSpacedReviewRepository,
  now: () => Date = () => new Date(),
): FirstRunRepository => {
  let saveFailed = false;
  const read = (): FirstRunRecord | null => {
    try {
      const raw = storage.getItem(FIRST_RUN_STORAGE_KEY);
      if (!raw) return null;
      return parseRecord(raw).record;
    } catch { return null; }
  };
  const write = (r: FirstRunRecord): FirstRunRecord => {
    try { storage.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify(r)); saveFailed = false; }
    catch { saveFailed = true; }   // 保存できなくても学習は継続する（§7）
    return r;
  };
  const patch = (fn: (prev: FirstRunRecord) => FirstRunRecord): FirstRunRecord => {
    const nowIso = now().toISOString();
    const prev = read() ?? {
      schemaVersion: FIRST_RUN_SCHEMA_VERSION, step: 'goal' as JourneyStep, goal: null,
      checkDone: false, practiceDone: false, completedAt: null, startedAt: nowIso, updatedAt: nowIso,
    };
    return write({ ...fn(prev), updatedAt: nowIso });
  };
  return {
    load: () => detectFirstRunState(storage, progress, schedule),
    start: () => patch((p) => p),
    setGoal: (goal) => patch((p) => ({ ...p, goal, step: 'check' })),
    completeCheck: () => patch((p) => ({ ...p, checkDone: true, step: 'practice' })),
    completePractice: () => patch((p) => ({ ...p, practiceDone: true, step: 'done' })),
    repairStep: (step) => patch((p) => (p.step === step ? p : { ...p, step })),
    complete: () => patch((p) => (p.completedAt ? p : { ...p, completedAt: now().toISOString(), step: 'done' })),
    goBack() {
      const cur = read();
      if (!cur) return null;
      const i = JOURNEY_STEPS.indexOf(cur.step);
      if (i <= 0) return cur;
      // 完了後は戻さない（完了処理の再実行を防ぐ・§9）
      if (cur.completedAt) return cur;
      return patch((p) => ({ ...p, step: JOURNEY_STEPS[i - 1] }));   // 回答（goal/checkDone）は消さない
    },
    resetOnboardingOnly() {
      try { storage.removeItem(FIRST_RUN_STORAGE_KEY); } catch { saveFailed = true; }
      // 語彙進捗・復習予定・教材レビューには触れない（§7の絶対条件）
    },
    lastSaveFailed: () => saveFailed,
  };
};

/** 進捗表示用（§5・現在のステップ番号と総数） */
export const stepIndexOf = (step: JourneyStep): number => JOURNEY_STEPS.indexOf(step) + 1;
export const TOTAL_STEPS = JOURNEY_STEPS.length;
