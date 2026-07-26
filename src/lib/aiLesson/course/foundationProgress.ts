// しくみラボ 試作進捗Repository（Phase 2B §14）。
// sessionStorageのみ＝正式保存ではない。キー・保存内容に email/userId/ニックネーム/自由入力本文を含めない。
// 会話進捗（current_week/masteryState/XP）とは完全分離。
import type { FoundationDimension, FoundationMasteryState } from './foundationTypes';
import { deriveMasteryState } from './foundationGrade';

export const FOUNDATION_STORAGE_KEY = 'ai_course_foundation_preview_v1';
const SCHEMA_VERSION = 1;

export interface FoundationAnswerRecord {
  questionId: string;
  targetId: string;
  dimension: FoundationDimension;
  correct: boolean;
  hintUsed?: boolean;
  errorTag: string;
  attemptedAt: string; // ISO
}

export interface FoundationAttemptRecord {
  attemptId: string;
  unitId: string;
  attemptNumber: number;
  attemptSeed: number;      // シャッフル用。PIIを含まない連番由来
  startedAt: string;
  completedAt: string | null;
  locale: 'ja' | 'zh';
  answers: FoundationAnswerRecord[];
}

export interface FoundationUnitSummary {
  unitId: string;
  attemptCount: number;
  completedCount: number;
  inProgress: boolean;
  lastCompletedAt: string | null;
  lastScore: { correct: number; total: number } | null;
}

export interface FoundationReviewEntry {
  targetId: string;
  dimension: FoundationDimension;
  errorTag: string;
  unitId: string;
  candidateState: 'due_day1' | 'due_day3' | 'confirm_day7' | 'retained';
  suggestedInterval: 'day1' | 'day3' | 'day7' | null;
  dueAt: string | null;     // retainedはnull
  isDue: boolean;           // now基準（日付偽装なし・保存時刻から算出）
}

export interface FoundationProgressRepository {
  startAttempt(unitId: string, locale: 'ja' | 'zh', nowIso?: string): FoundationAttemptRecord;
  recordAnswer(attemptId: string, answer: FoundationAnswerRecord): void;
  completeAttempt(attemptId: string, nowIso?: string): void;
  getAttempts(): FoundationAttemptRecord[];
  getUnitSummary(unitId: string): FoundationUnitSummary;
  getMasteryStates(): Record<string, Partial<Record<FoundationDimension, FoundationMasteryState>>>;
  getReviewQueue(nowIso: string): FoundationReviewEntry[];
  reset(): void;
}

interface StoreShape { schemaVersion: number; attempts: FoundationAttemptRecord[] }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const DAY_MS = 24 * 60 * 60 * 1000;
const intervalDays = { day1: 1, day3: 3, day7: 7 } as const;

export const createFoundationProgressRepository = (storage: StorageLike): FoundationProgressRepository => {
  const load = (): StoreShape => {
    try {
      const raw = storage.getItem(FOUNDATION_STORAGE_KEY);
      if (!raw) return { schemaVersion: SCHEMA_VERSION, attempts: [] };
      const parsed = JSON.parse(raw) as StoreShape;
      // schemaVersion不一致・構造不正は黙って破棄（試作データのため移行しない・§14）
      if (parsed?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.attempts)) {
        storage.removeItem(FOUNDATION_STORAGE_KEY);
        return { schemaVersion: SCHEMA_VERSION, attempts: [] };
      }
      return parsed;
    } catch {
      storage.removeItem(FOUNDATION_STORAGE_KEY);
      return { schemaVersion: SCHEMA_VERSION, attempts: [] };
    }
  };
  const save = (st: StoreShape) => { try { storage.setItem(FOUNDATION_STORAGE_KEY, JSON.stringify(st)); } catch { /* 容量超過等は黙殺（試作） */ } };

  const allAnswersFor = (st: StoreShape) => {
    const map = new Map<string, { unitId: string; records: FoundationAnswerRecord[] }>();
    for (const a of st.attempts) for (const ans of a.answers) {
      const key = `${ans.targetId}:${ans.dimension}`;
      const cur = map.get(key) ?? { unitId: a.unitId, records: [] };
      cur.records.push(ans);
      map.set(key, cur);
    }
    return map;
  };

  return {
    startAttempt(unitId, locale, nowIso) {
      const st = load();
      const now = nowIso ?? new Date().toISOString();
      const existing = st.attempts.find((a) => a.unitId === unitId && a.completedAt === null);
      if (existing) return existing; // リロード・中断からの再開（§8）
      const attemptNumber = st.attempts.filter((a) => a.unitId === unitId).length + 1;
      const attempt: FoundationAttemptRecord = {
        attemptId: `${unitId}:${attemptNumber}`,
        unitId, attemptNumber,
        attemptSeed: st.attempts.length + attemptNumber, // 決定的・非個人情報
        startedAt: now, completedAt: null, locale, answers: [],
      };
      st.attempts.push(attempt);
      save(st);
      return attempt;
    },
    recordAnswer(attemptId, answer) {
      const st = load();
      const a = st.attempts.find((x) => x.attemptId === attemptId);
      if (!a || a.completedAt !== null) return;
      if (a.answers.some((x) => x.questionId === answer.questionId)) return; // 二重記録防止
      a.answers.push(answer);
      save(st);
    },
    completeAttempt(attemptId, nowIso) {
      const st = load();
      const a = st.attempts.find((x) => x.attemptId === attemptId);
      if (!a || a.completedAt !== null) return;
      a.completedAt = nowIso ?? new Date().toISOString();
      save(st);
    },
    getAttempts: () => load().attempts,
    getUnitSummary(unitId) {
      const st = load();
      const of = st.attempts.filter((a) => a.unitId === unitId);
      const completed = of.filter((a) => a.completedAt !== null);
      const last = completed[completed.length - 1] ?? null;
      return {
        unitId,
        attemptCount: of.length,
        completedCount: completed.length,
        inProgress: of.some((a) => a.completedAt === null),
        lastCompletedAt: last?.completedAt ?? null,
        lastScore: last ? { correct: last.answers.filter((x) => x.correct).length, total: last.answers.length } : null,
      };
    },
    getMasteryStates() {
      const out: Record<string, Partial<Record<FoundationDimension, FoundationMasteryState>>> = {};
      for (const [key, { records }] of allAnswersFor(load())) {
        const [targetId, dimension] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1) as FoundationDimension];
        out[targetId] = out[targetId] ?? {};
        out[targetId][dimension] = deriveMasteryState(records);
      }
      return out;
    },
    getReviewQueue(nowIso) {
      const out: FoundationReviewEntry[] = [];
      for (const [key, { unitId, records }] of allAnswersFor(load())) {
        const targetId = key.slice(0, key.lastIndexOf(':'));
        const dimension = key.slice(key.lastIndexOf(':') + 1) as FoundationDimension;
        const sorted = [...records].sort((a, b) => a.attemptedAt.localeCompare(b.attemptedAt));
        const last = sorted[sorted.length - 1];
        const state = deriveMasteryState(sorted);
        let candidateState: FoundationReviewEntry['candidateState'];
        let interval: FoundationReviewEntry['suggestedInterval'];
        if (state === 'retained') { candidateState = 'retained'; interval = null; }
        else if (!last.correct) { candidateState = 'due_day1'; interval = 'day1'; }
        else if (last.hintUsed) { candidateState = 'due_day3'; interval = 'day3'; }
        else { candidateState = 'confirm_day7'; interval = 'day7'; }
        const dueAt = interval ? new Date(new Date(last.attemptedAt).getTime() + intervalDays[interval] * DAY_MS).toISOString() : null;
        out.push({ targetId, dimension, errorTag: last.errorTag, unitId, candidateState, suggestedInterval: interval, dueAt, isDue: !!dueAt && dueAt <= nowIso });
      }
      // due→confirm→retainedの順・同分類は期限昇順
      const rank = { due_day1: 0, due_day3: 1, confirm_day7: 2, retained: 3 } as const;
      return out.sort((a, b) => rank[a.candidateState] - rank[b.candidateState] || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
    },
    reset() { storage.removeItem(FOUNDATION_STORAGE_KEY); }, // foundation専用キーのみ削除（§21）
  };
};
