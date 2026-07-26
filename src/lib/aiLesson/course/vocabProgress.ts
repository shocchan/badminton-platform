// ことば図鑑 試作進捗Repository（Phase 2C+ §20-§22・§46）。
// sessionStorageのみ＝正式保存ではない。会話進捗・しくみラボ進捗とはキーを分離。
// 自己評価（selfAssessment）と検証状態（verifiedState）は別管理:
// 本人が「覚えた」にしてもretainedにはしない（§20絶対条件）。
import type { FoundationMasteryState } from './foundationTypes';
import { deriveMasteryState } from './foundationGrade';

export const VOCAB_STORAGE_KEY = 'ai_course_vocab_preview_v1';
const SCHEMA_VERSION = 1;

export type SelfAssessment = 'unseen' | 'seen' | 'learning' | 'self_known' | 'needs_review';
export type VerifiedState = 'not_tested' | 'guided' | 'independent' | 'retained_candidate';

export interface VocabTestRecord { dimension: 'reading' | 'meaning'; correct: boolean; attemptedAt: string }
export interface VocabEntry {
  selfAssessment: SelfAssessment;
  imageViewed: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  encounterCount: number;
  tests: VocabTestRecord[];
}
export type FuriganaSetting = 'always' | 'first_time' | 'hard_only' | 'off';
export interface VocabSettings { track: string; furigana: FuriganaSetting }
interface StoreShape {
  schemaVersion: number;
  entries: Record<string, VocabEntry>;
  dailyWords: { dateKey: string; itemIds: string[] } | null;
  settings?: VocabSettings;
}

export interface VocabStats {
  seenCount: number;          // 画像または詳細を開いた
  selfKnownCount: number;     // 本人が「覚えた」
  verifiedCount: number;      // 問題で自力正解（意味 or 読み）
  retainedCandidateCount: number; // 別日の再確認でも自力正解
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const emptyEntry = (): VocabEntry => ({ selfAssessment: 'unseen', imageViewed: false, firstSeenAt: null, lastSeenAt: null, encounterCount: 0, tests: [] });

export interface VocabProgressRepository {
  recordEncounter(itemId: string, opts?: { imageViewed?: boolean }, nowIso?: string): void;
  setSelfAssessment(itemId: string, sa: SelfAssessment): void;
  recordTest(itemId: string, dimension: 'reading' | 'meaning', correct: boolean, nowIso?: string): void;
  getEntry(itemId: string): VocabEntry;
  /** 検証状態（問題履歴からのみ導出・selfAssessmentを混ぜない） */
  getVerifiedState(itemId: string): VerifiedState;
  getStats(): VocabStats;
  /** 問題で間違えた・本人が復習したい語（復習候補・§7） */
  getReviewItemIds(): string[];
  getDailyWords(dateKey: string): string[] | null;
  setDailyWords(dateKey: string, itemIds: string[]): void;
  getSettings(): VocabSettings;
  setSettings(patch: Partial<VocabSettings>): void;
  reset(): void;
}

const toVerified = (state: FoundationMasteryState): VerifiedState => {
  if (state === 'retained') return 'retained_candidate';
  if (state === 'independent') return 'independent';
  if (state === 'guided') return 'guided';
  return 'not_tested';
};

export const createVocabProgressRepository = (storage: StorageLike): VocabProgressRepository => {
  const load = (): StoreShape => {
    try {
      const raw = storage.getItem(VOCAB_STORAGE_KEY);
      if (!raw) return { schemaVersion: SCHEMA_VERSION, entries: {}, dailyWords: null };
      const parsed = JSON.parse(raw) as StoreShape;
      if (parsed?.schemaVersion !== SCHEMA_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) {
        storage.removeItem(VOCAB_STORAGE_KEY);
        return { schemaVersion: SCHEMA_VERSION, entries: {}, dailyWords: null };
      }
      return parsed;
    } catch {
      storage.removeItem(VOCAB_STORAGE_KEY);
      return { schemaVersion: SCHEMA_VERSION, entries: {}, dailyWords: null };
    }
  };
  const save = (st: StoreShape) => { try { storage.setItem(VOCAB_STORAGE_KEY, JSON.stringify(st)); } catch { /* 容量超過等は黙殺（試作） */ } };
  const entryOf = (st: StoreShape, id: string): VocabEntry => { st.entries[id] = st.entries[id] ?? emptyEntry(); return st.entries[id]; };
  const verifiedOf = (e: VocabEntry): VerifiedState =>
    toVerified(deriveMasteryState(e.tests.map((t) => ({ correct: t.correct, attemptedAt: t.attemptedAt }))));

  return {
    recordEncounter(itemId, opts, nowIso) {
      const st = load(); const e = entryOf(st, itemId);
      const now = nowIso ?? new Date().toISOString();
      e.firstSeenAt = e.firstSeenAt ?? now;
      e.lastSeenAt = now;
      e.encounterCount += 1;
      if (opts?.imageViewed) e.imageViewed = true;
      if (e.selfAssessment === 'unseen') e.selfAssessment = 'seen';
      save(st);
    },
    setSelfAssessment(itemId, sa) {
      const st = load(); entryOf(st, itemId).selfAssessment = sa; save(st);
    },
    recordTest(itemId, dimension, correct, nowIso) {
      const st = load(); const e = entryOf(st, itemId);
      e.tests.push({ dimension, correct, attemptedAt: nowIso ?? new Date().toISOString() });
      save(st);
    },
    getEntry: (itemId) => load().entries[itemId] ?? emptyEntry(),
    getVerifiedState(itemId) { return verifiedOf(load().entries[itemId] ?? emptyEntry()); },
    getStats() {
      const st = load();
      const stats: VocabStats = { seenCount: 0, selfKnownCount: 0, verifiedCount: 0, retainedCandidateCount: 0 };
      for (const e of Object.values(st.entries)) {
        if (e.selfAssessment !== 'unseen') stats.seenCount += 1;
        if (e.selfAssessment === 'self_known') stats.selfKnownCount += 1;
        const v = verifiedOf(e);
        if (v === 'independent' || v === 'retained_candidate') stats.verifiedCount += 1;
        if (v === 'retained_candidate') stats.retainedCandidateCount += 1;
      }
      return stats;
    },
    getReviewItemIds() {
      const st = load();
      return Object.entries(st.entries)
        .filter(([, e]) => {
          const lastWrong = e.tests.length > 0 && !e.tests[e.tests.length - 1].correct;
          return e.selfAssessment === 'needs_review' || lastWrong;
        })
        .map(([id]) => id);
    },
    getDailyWords(dateKey) {
      const st = load();
      return st.dailyWords?.dateKey === dateKey ? st.dailyWords.itemIds : null;
    },
    setDailyWords(dateKey, itemIds) {
      const st = load(); st.dailyWords = { dateKey, itemIds }; save(st);
    },
    getSettings() {
      const st = load();
      // トラック初期値は基礎（推定根拠なしにN2等を確定しない・§35）。ふりがな初期値はトラック連動でUI側が解決
      return st.settings ?? { track: 'life_basic', furigana: 'always' };
    },
    setSettings(patch) {
      const st = load();
      st.settings = { ...(st.settings ?? { track: 'life_basic', furigana: 'always' }), ...patch };
      save(st);
    },
    reset() { storage.removeItem(VOCAB_STORAGE_KEY); },
  };
};

/**
 * 今日の3語の決定的選定（§25）。優先順位:
 * ①復習候補（誤答・まだ不安） ②途中（seen/learningで未self_known・未検証）
 * ③現在単元に関係する未着手 ④Core A未着手（バンク定義順）。
 * 同日は固定（dateKeyで保存）。架空のAI推薦理由は使わない。
 */
export const pickDailyWords = (
  allIds: string[],
  repo: VocabProgressRepository,
  currentUnitItemIds: string[],
  dateKey: string,
  count = 3,
  opts?: { deprioritizedIds?: string[] },  // N2/N3トラックのtransparent同源語等（弱点・復習なら通常どおり出る・§36）
): { itemIds: string[]; reasons: Record<string, 'review' | 'continue' | 'current_unit' | 'core_a'> } => {
  const fixed = repo.getDailyWords(dateKey);
  const reasons: Record<string, 'review' | 'continue' | 'current_unit' | 'core_a'> = {};
  const compute = (): string[] => {
    const picked: string[] = [];
    const push = (id: string, reason: 'review' | 'continue' | 'current_unit' | 'core_a') => {
      if (picked.length < count && !picked.includes(id)) { picked.push(id); reasons[id] = reason; }
    };
    for (const id of repo.getReviewItemIds()) push(id, 'review');
    for (const id of allIds) {
      const e = repo.getEntry(id);
      if ((e.selfAssessment === 'seen' || e.selfAssessment === 'learning') && repo.getVerifiedState(id) === 'not_tested') push(id, 'continue');
    }
    for (const id of currentUnitItemIds) if (repo.getEntry(id).selfAssessment === 'unseen') push(id, 'current_unit');
    const depri = new Set(opts?.deprioritizedIds ?? []);
    for (const id of allIds) if (!depri.has(id) && repo.getEntry(id).selfAssessment === 'unseen') push(id, 'core_a');
    // 後回し語は他が尽きた場合のみ（簡易確認ルートで通過・§40）
    for (const id of allIds) if (depri.has(id) && repo.getEntry(id).selfAssessment === 'unseen') push(id, 'core_a');
    return picked;
  };
  if (fixed) {
    // 固定分の理由を再計算（表示用・決定的）
    const ids = fixed;
    ids.forEach((id) => { reasons[id] = reasons[id] ?? (repo.getReviewItemIds().includes(id) ? 'review' : currentUnitItemIds.includes(id) ? 'current_unit' : 'core_a'); });
    return { itemIds: ids, reasons };
  }
  const ids = compute();
  repo.setDailyWords(dateKey, ids);
  return { itemIds: ids, reasons };
};
