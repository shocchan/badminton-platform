// 語彙の間隔反復（Phase 2E-1.10 §3-§4・preview専用Repository）。
// sessionStorageのみ＝正式保存ではない（正式DB保存は本番前ブロッカーとしてdocsへ記録）。
// 重要（§3）: retained_previewは「定着を確認中」の暫定状態であり、正式な習得・マスターではない。
// 利用者向け表現は「翌日もう一度／3日後に確認／7日後に定着確認／定着を確認中」に限定する。
// 日付判定は LearningClock 経由のみ（ローカル日付・テストで固定注入可能）。
import type { LearningClock } from './learningClock';
import type { VocabQuestionDimension } from './vocabProgress';

export const VOCAB_REVIEW_SCHEDULE_KEY = 'ai_course_vocab_schedule_preview_v1';
const SCHEDULE_SCHEMA_VERSION = 1;

/** 出題結果の種別（§4）。誤答→翌日／補助あり正解→3日後／自力正解→7日後 */
export type ReviewResult = 'wrong' | 'supported' | 'independent';
/** 予定の段階。retained_previewは正式な定着ではない（表示文言で担保） */
export type ReviewStage = 'day1' | 'day3' | 'day7' | 'retention_candidate' | 'retained_preview';
/** 予定の発生源（分析・表示用。PIIなし） */
export type ReviewSource = 'diagnostic' | 'daily' | 'quick_review' | 'practice' | 'self_assessment';

export interface ScheduledReview {
  itemId: string;
  senseId?: string;
  /** 弱点次元（重複なし・出題形式の選択に使う・§7） */
  weakDimensions: VocabQuestionDimension[];
  lastAttemptAt: string;          // ISO
  lastAttemptDay: string;         // ローカル日付キー
  nextReviewAt: string;           // ローカル日付キー（この日から対象）
  reviewStage: ReviewStage;
  /** 別の日に自力正解できた連続回数（同日の複数正解は加算しない・§4） */
  consecutiveIndependent: number;
  lastResult: ReviewResult;
  source: ReviewSource;
  updatedAt: string;
  /** 本人が「まだ不安」を押した（優先度を上げる。スケジュールは消さない・§4） */
  learnerUncertain?: boolean;
}

interface ScheduleStore {
  schemaVersion: number;
  entries: Record<string, ScheduledReview>;   // key = itemId または `${itemId}#${senseId}`
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const scheduleKeyOf = (itemId: string, senseId?: string) => (senseId ? `${itemId}#${senseId}` : itemId);

/** 結果→次回間隔（§4・同日の再正解では段階を進めない） */
const nextStageOf = (result: ReviewResult, prev: ScheduledReview | undefined, sameDay: boolean): { stage: ReviewStage; days: number } => {
  if (result === 'wrong') return { stage: 'day1', days: 1 };
  if (result === 'supported') return { stage: 'day3', days: 3 };
  // independent
  const prevIndependentOtherDay = prev?.lastResult === 'independent' && !sameDay;
  if (prevIndependentOtherDay) {
    // 別の日に2回目の自力正解＝定着候補（正式な習得ではない）
    return { stage: 'retention_candidate', days: 14 };
  }
  return { stage: 'day7', days: 7 };
};

export interface DueReview extends ScheduledReview {
  /** 期限からの経過日数（0=今日・1以上=期限超過） */
  overdueDays: number;
}

export interface DueSummary {
  total: number;
  overdue: number;
  today: number;
  byStage: Record<ReviewStage, number>;
  /** 先の予定（今日以降・表示用。日付を並べすぎない・§17） */
  upcoming: { tomorrow: number; inThreeDays: number; inSevenDays: number };
}

export interface VocabSpacedReviewRepository {
  /** 出題結果を記録して次回予定を更新（同日の正解だけでretained扱いにしない・§4） */
  recordResult(input: {
    itemId: string; senseId?: string; result: ReviewResult;
    dimension?: VocabQuestionDimension; source: ReviewSource;
  }): ScheduledReview;
  /** 本人の「まだ不安」（優先度を上げるがスケジュールは消さない・§4） */
  markUncertain(itemId: string, senseId?: string): void;
  /** 本人の「覚えたと思う」（スケジュールを消さない・§4） */
  markSelfKnown(itemId: string, senseId?: string): void;
  get(itemId: string, senseId?: string): ScheduledReview | undefined;
  getAll(): ScheduledReview[];
  /** 今日以前が期限の予定（期限超過→今日の順・決定的） */
  getDue(): DueReview[];
  getDueSummary(): DueSummary;
  reset(): void;
}

export const createVocabSpacedReviewRepository = (
  storage: StorageLike, clock: LearningClock,
): VocabSpacedReviewRepository => {
  const load = (): ScheduleStore => {
    try {
      const raw = storage.getItem(VOCAB_REVIEW_SCHEDULE_KEY);
      if (!raw) return { schemaVersion: SCHEDULE_SCHEMA_VERSION, entries: {} };
      const parsed = JSON.parse(raw) as ScheduleStore;
      if (parsed?.schemaVersion !== SCHEDULE_SCHEMA_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) {
        return { schemaVersion: SCHEDULE_SCHEMA_VERSION, entries: {} };   // 壊れたデータで画面を落とさない
      }
      return parsed;
    } catch { return { schemaVersion: SCHEDULE_SCHEMA_VERSION, entries: {} }; }
  };
  const save = (st: ScheduleStore) => {
    try { storage.setItem(VOCAB_REVIEW_SCHEDULE_KEY, JSON.stringify(st)); } catch { /* 容量超過でも学習を止めない */ }
  };
  const patch = (itemId: string, senseId: string | undefined, fn: (prev: ScheduledReview | undefined) => ScheduledReview) => {
    const st = load();
    const key = scheduleKeyOf(itemId, senseId);
    st.entries[key] = fn(st.entries[key]);
    save(st);
    return st.entries[key];
  };

  return {
    recordResult({ itemId, senseId, result, dimension, source }) {
      const nowIso = clock.now().toISOString();
      const today = clock.localDateKey();
      return patch(itemId, senseId, (prev) => {
        const sameDay = prev?.lastAttemptDay === today;
        const { stage, days } = nextStageOf(result, prev, sameDay);
        // 弱点次元: 誤答/補助ありは追加、自力正解なら該当次元を外す（重複なし）
        const weak = new Set(prev?.weakDimensions ?? []);
        if (dimension) { if (result === 'independent') weak.delete(dimension); else weak.add(dimension); }
        const consecutive = result === 'independent'
          ? (sameDay ? (prev?.consecutiveIndependent ?? 1) : (prev?.consecutiveIndependent ?? 0) + 1)
          : 0;
        return {
          itemId, ...(senseId ? { senseId } : {}),
          weakDimensions: [...weak],
          lastAttemptAt: nowIso,
          lastAttemptDay: today,
          nextReviewAt: clock.addDays(today, days),
          reviewStage: stage,
          consecutiveIndependent: consecutive,
          lastResult: result,
          source,
          updatedAt: nowIso,
          // 自力正解できたら「まだ不安」フラグは解除（本人の再判断を尊重）
          ...(result === 'independent' ? {} : { learnerUncertain: prev?.learnerUncertain }),
        };
      });
    },
    markUncertain(itemId, senseId) {
      const today = clock.localDateKey();
      const nowIso = clock.now().toISOString();
      patch(itemId, senseId, (prev) => prev
        ? { ...prev, learnerUncertain: true, updatedAt: nowIso }
        // 未出題でも「まだ不安」だけで翌日の予定を作る（自己申告→スケジュール・§4）
        : {
            itemId, ...(senseId ? { senseId } : {}), weakDimensions: [],
            lastAttemptAt: nowIso, lastAttemptDay: today, nextReviewAt: clock.addDays(today, 1),
            reviewStage: 'day1', consecutiveIndependent: 0, lastResult: 'supported',
            source: 'self_assessment', updatedAt: nowIso, learnerUncertain: true,
          });
    },
    markSelfKnown(itemId, senseId) {
      const st = load();
      const key = scheduleKeyOf(itemId, senseId);
      const prev = st.entries[key];
      if (!prev) return;                                   // 予定が無ければ何もしない（作らない）
      st.entries[key] = { ...prev, learnerUncertain: false, updatedAt: clock.now().toISOString() };
      save(st);                                            // nextReviewAt/stageは変えない（§4絶対条件）
    },
    get: (itemId, senseId) => load().entries[scheduleKeyOf(itemId, senseId)],
    getAll: () => Object.values(load().entries).sort((a, b) => scheduleKeyOf(a.itemId, a.senseId).localeCompare(scheduleKeyOf(b.itemId, b.senseId))),
    getDue() {
      const today = clock.localDateKey();
      return Object.values(load().entries)
        .filter((e) => !clock.isBefore(today, e.nextReviewAt))    // nextReviewAt <= today
        .map((e) => ({ ...e, overdueDays: clock.diffDays(today, e.nextReviewAt) }))
        // 期限超過が先→同順は「まだ不安」→段階（day1が先）→ID順で決定的
        .sort((a, b) => b.overdueDays - a.overdueDays
          || Number(!!b.learnerUncertain) - Number(!!a.learnerUncertain)
          || a.reviewStage.localeCompare(b.reviewStage)
          || scheduleKeyOf(a.itemId, a.senseId).localeCompare(scheduleKeyOf(b.itemId, b.senseId)));
    },
    getDueSummary() {
      const due = this.getDue();
      const today = clock.localDateKey();
      const byStage: Record<ReviewStage, number> = { day1: 0, day3: 0, day7: 0, retention_candidate: 0, retained_preview: 0 };
      for (const d of due) byStage[d.reviewStage] += 1;
      const all = Object.values(load().entries);
      const count = (dayKey: string) => all.filter((e) => e.nextReviewAt === dayKey).length;
      return {
        total: due.length,
        overdue: due.filter((d) => d.overdueDays > 0).length,
        today: due.filter((d) => d.overdueDays === 0).length,
        byStage,
        upcoming: {
          tomorrow: count(clock.addDays(today, 1)),
          inThreeDays: count(clock.addDays(today, 3)),
          inSevenDays: count(clock.addDays(today, 7)),
        },
      };
    },
    reset() { storage.removeItem(VOCAB_REVIEW_SCHEDULE_KEY); },
  };
};
