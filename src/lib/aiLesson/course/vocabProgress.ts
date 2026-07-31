// ことば図鑑 試作進捗Repository（Phase 2C+ §20-§22・§46／Phase 2E-1 §4-§6 次元別診断）。
// sessionStorageのみ＝正式保存ではない。会話進捗・しくみラボ進捗・教材レビューとはキーを分離。
// 自己評価（selfAssessment）と検証状態（verifiedState）は別管理:
// 本人が「覚えた」にしてもretainedにはしない（§20絶対条件）。
// 診断は次元別（reading/meaning/usage/collocation/particle/conjugation）に記録し、
// 1回の正解でItem全体を「習得済み」にしない（§4）。
import type { FoundationMasteryState } from './foundationTypes';
import { deriveMasteryState } from './foundationGrade';

export const VOCAB_STORAGE_KEY = 'ai_course_vocab_preview_v1';
const SCHEMA_VERSION = 2;

export type SelfAssessment = 'unseen' | 'seen' | 'learning' | 'self_known' | 'needs_review';
export type VerifiedState = 'not_tested' | 'guided' | 'independent' | 'retained_candidate';

/** 問題・診断の確認次元（§4）。collocation/conjugationは進捗上の次元で、表示上はusage/formに束ねてよい */
export type VocabQuestionDimension = 'reading' | 'meaning' | 'usage' | 'collocation' | 'particle' | 'conjugation';
/** 次元別状態（not_testedはエントリ不存在で表現） */
export type VocabDimensionState = 'supported' | 'confirmed' | 'needs_review';
/** diagnostic Itemの全体結果（§6・次元別状態から導出） */
export type DiagnosticOutcome = 'diagnostic' | 'basic_confirmed' | 'partially_confirmed' | 'remedial';

export interface VocabTestRecord { dimension: VocabQuestionDimension; correct: boolean; attemptedAt: string }
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

/** 診断エントリ（v2）。legacyはv1（次元不明の単一confirmed/remedial）からの正直な移行 */
export interface DiagnosticEntry {
  dims: Partial<Record<VocabQuestionDimension, VocabDimensionState>>;
  legacy?: 'confirmed' | 'remedial';
}

interface StoreShapeV2 {
  schemaVersion: number;
  entries: Record<string, VocabEntry>;
  dailyWords: { dateKey: string; itemIds: string[] } | null;
  settings?: VocabSettings;
  /** パック開始診断の次元別結果（packId→itemId→エントリ。自己申告でなく問題結果からのみ設定・§6） */
  diagnostics?: Record<string, Record<string, DiagnosticEntry>>;
}
/** v1（Phase 2D）の診断は 'confirmed' | 'remedial' の文字列だった */
interface StoreShapeV1 extends Omit<StoreShapeV2, 'diagnostics'> {
  diagnostics?: Record<string, Record<string, string>>;
}

export interface VocabStats {
  seenCount: number;          // 画像または詳細を開いた
  selfKnownCount: number;     // 本人が「覚えた」
  verifiedCount: number;      // 問題で自力正解（意味 or 読み）
  retainedCandidateCount: number; // 別日の再確認でも自力正解
}

/** 成長画面向けの次元別サマリー（Itemの最新結果ベース・断定表現に使わない・§25） */
export interface VocabDimensionStats {
  confirmedByDimension: Record<VocabQuestionDimension, number>;
  needsReviewCount: number;   // いずれかの次元で最新結果が誤答のItem数
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const emptyEntry = (): VocabEntry => ({ selfAssessment: 'unseen', imageViewed: false, firstSeenAt: null, lastSeenAt: null, encounterCount: 0, tests: [] });

/**
 * 次元別状態→Item全体の診断結果（§6）:
 * いずれか誤答=remedial／reading+meaning確認=basic_confirmed／一部のみ=partially_confirmed。
 * v1のlegacy confirmedは「どの次元かは不明のまま一部確認」としてpartially_confirmed（偽装しない）。
 */
export const deriveDiagnosticOutcome = (e: DiagnosticEntry | undefined): DiagnosticOutcome => {
  if (!e) return 'diagnostic';
  const states = Object.values(e.dims);
  if (states.includes('needs_review') || e.legacy === 'remedial') return 'remedial';
  const ok = (d: VocabQuestionDimension) => e.dims[d] === 'confirmed' || e.dims[d] === 'supported';
  if (e.dims.reading === 'confirmed' && e.dims.meaning === 'confirmed') return 'basic_confirmed';
  if (states.length > 0 || e.legacy === 'confirmed') return (ok('reading') || ok('meaning') || ok('usage') || ok('collocation') || ok('particle') || ok('conjugation') || e.legacy === 'confirmed') ? 'partially_confirmed' : 'diagnostic';
  return 'diagnostic';
};

export interface VocabProgressRepository {
  recordEncounter(itemId: string, opts?: { imageViewed?: boolean }, nowIso?: string): void;
  setSelfAssessment(itemId: string, sa: SelfAssessment): void;
  recordTest(itemId: string, dimension: VocabQuestionDimension, correct: boolean, nowIso?: string): void;
  getEntry(itemId: string): VocabEntry;
  /** 検証状態（問題履歴からのみ導出・selfAssessmentを混ぜない） */
  getVerifiedState(itemId: string): VerifiedState;
  getStats(): VocabStats;
  getDimensionStats(itemIds: string[]): VocabDimensionStats;
  /** 問題で間違えた・本人が復習したい語（復習候補・§7） */
  getReviewItemIds(): string[];
  getDailyWords(dateKey: string): string[] | null;
  setDailyWords(dateKey: string, itemIds: string[]): void;
  getSettings(): VocabSettings;
  setSettings(patch: Partial<VocabSettings>): void;
  /** 診断の次元別結果を記録（正解=confirmed/補助あり=supported/誤答=needs_review・§5） */
  recordDiagnosticDimension(packId: string, itemId: string, dimension: VocabQuestionDimension, state: VocabDimensionState): void;
  getDiagnosticEntry(packId: string, itemId: string): DiagnosticEntry | undefined;
  /** packId→itemId→全体結果（§6。未出題Itemは含まれない） */
  getDiagnosticOutcomes(packId: string): Record<string, DiagnosticOutcome>;
  reset(): void;
}

const toVerified = (state: FoundationMasteryState): VerifiedState => {
  if (state === 'retained') return 'retained_candidate';
  if (state === 'independent') return 'independent';
  if (state === 'guided') return 'guided';
  return 'not_tested';
};

/** v1→v2移行: 診断の文字列結果をlegacyとして保持（次元をでっち上げない・§16） */
const migrateV1 = (v1: StoreShapeV1): StoreShapeV2 => {
  const diagnostics: StoreShapeV2['diagnostics'] = {};
  for (const [packId, m] of Object.entries(v1.diagnostics ?? {})) {
    diagnostics[packId] = {};
    for (const [itemId, st] of Object.entries(m)) {
      if (st === 'confirmed' || st === 'remedial') diagnostics[packId][itemId] = { dims: {}, legacy: st };
    }
  }
  return { ...v1, schemaVersion: SCHEMA_VERSION, diagnostics };
};

export const createVocabProgressRepository = (storage: StorageLike): VocabProgressRepository => {
  const load = (): StoreShapeV2 => {
    try {
      const raw = storage.getItem(VOCAB_STORAGE_KEY);
      if (!raw) return { schemaVersion: SCHEMA_VERSION, entries: {}, dailyWords: null };
      const parsed = JSON.parse(raw) as StoreShapeV2;
      if (typeof parsed?.entries !== 'object' || parsed.entries === null) {
        storage.removeItem(VOCAB_STORAGE_KEY);
        return { schemaVersion: SCHEMA_VERSION, entries: {}, dailyWords: null };
      }
      if (parsed.schemaVersion === 1) return migrateV1(parsed as unknown as StoreShapeV1);
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        storage.removeItem(VOCAB_STORAGE_KEY);
        return { schemaVersion: SCHEMA_VERSION, entries: {}, dailyWords: null };
      }
      return parsed;
    } catch {
      storage.removeItem(VOCAB_STORAGE_KEY);
      return { schemaVersion: SCHEMA_VERSION, entries: {}, dailyWords: null };
    }
  };
  const save = (st: StoreShapeV2) => { try { storage.setItem(VOCAB_STORAGE_KEY, JSON.stringify(st)); } catch { /* 容量超過等は黙殺（試作） */ } };
  const entryOf = (st: StoreShapeV2, id: string): VocabEntry => { st.entries[id] = st.entries[id] ?? emptyEntry(); return st.entries[id]; };
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
    getDimensionStats(itemIds) {
      const st = load();
      const confirmedByDimension: Record<VocabQuestionDimension, number> = { reading: 0, meaning: 0, usage: 0, collocation: 0, particle: 0, conjugation: 0 };
      let needsReviewCount = 0;
      for (const id of itemIds) {
        const e = st.entries[id];
        if (!e || e.tests.length === 0) continue;
        let anyWrong = false;
        for (const dim of Object.keys(confirmedByDimension) as VocabQuestionDimension[]) {
          const inDim = e.tests.filter((t) => t.dimension === dim);
          if (inDim.length === 0) continue;
          if (inDim[inDim.length - 1].correct) confirmedByDimension[dim] += 1;
          else anyWrong = true;
        }
        if (anyWrong) needsReviewCount += 1;
      }
      return { confirmedByDimension, needsReviewCount };
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
    recordDiagnosticDimension(packId, itemId, dimension, state) {
      const st = load();
      st.diagnostics = st.diagnostics ?? {};
      st.diagnostics[packId] = st.diagnostics[packId] ?? {};
      const e = st.diagnostics[packId][itemId] ?? { dims: {} };
      e.dims = { ...e.dims, [dimension]: state };
      st.diagnostics[packId][itemId] = e;
      save(st);
    },
    getDiagnosticEntry(packId, itemId) { return load().diagnostics?.[packId]?.[itemId]; },
    getDiagnosticOutcomes(packId) {
      const m = load().diagnostics?.[packId] ?? {};
      const out: Record<string, DiagnosticOutcome> = {};
      for (const [itemId, e] of Object.entries(m)) out[itemId] = deriveDiagnosticOutcome(e);
      return out;
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
