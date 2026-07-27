// 教材レビュー結果ストア（Phase 2E-1 §15-§16・labPreview限定・sessionStorage）。
// 学習者進捗（ai_course_vocab_preview_v1）と完全分離。PII禁止。
// 重要: ここの「問題なし」は提案・確認記録であり、教材データのreviewStatusを自動でapprovedにしない（§16）。
export const VOCAB_REVIEW_STORAGE_KEY = 'ai_course_vocab_review_preview_v1';
export const REVIEW_SCHEMA_VERSION = 1;

export type ReviewDecision = 'ok' | 'fix' | 'hold';
export type ReviewIssueType =
  | 'zh_meaning' | 'example_ja' | 'example_zh' | 'reading' | 'furigana'
  | 'cognate' | 'level' | 'role' | 'image' | 'source' | 'other';

export interface ReviewEntry {
  itemId: string;
  senseId?: string;
  decision: ReviewDecision;
  issueTypes: ReviewIssueType[];
  note?: string;                 // 自由メモ（sessionStorage内のみ・analyticsへ送らない・§30）
  reviewedAt: string;
  reviewerMode: 'labPreview';
  dataVersion: string;           // レビュー時点の教材データ版（例 'phase-2e-1'）
}

export interface ReviewStore {
  schemaVersion: number;
  entries: Record<string, ReviewEntry>;   // itemId(+senseId)キー
  filter?: string;
  currentItemId?: string;
}

export interface ReviewProgress {
  total: number;
  reviewed: number;
  ok: number;
  fix: number;
  hold: number;
  unreviewed: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const empty = (): ReviewStore => ({ schemaVersion: REVIEW_SCHEMA_VERSION, entries: {} });

export interface VocabReviewRepository {
  getEntry(itemId: string): ReviewEntry | undefined;
  setDecision(itemId: string, decision: ReviewDecision, issueTypes: ReviewIssueType[], note?: string): void;
  clearDecision(itemId: string): void;
  getAll(): Record<string, ReviewEntry>;
  getProgress(allItemIds: string[]): ReviewProgress;
  setUiState(patch: { filter?: string; currentItemId?: string }): void;
  getUiState(): { filter?: string; currentItemId?: string };
  exportJson(): string;
  /** 不正JSONではfalseを返して何も壊さない（§29） */
  importJson(json: string): boolean;
  reset(): void;
}

export const DATA_VERSION = 'phase-2e-1';

export const createVocabReviewRepository = (storage: StorageLike): VocabReviewRepository => {
  const load = (): ReviewStore => {
    try {
      const raw = storage.getItem(VOCAB_REVIEW_STORAGE_KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw) as ReviewStore;
      if (parsed?.schemaVersion !== REVIEW_SCHEMA_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) return empty();
      return parsed;
    } catch { return empty(); }
  };
  const save = (st: ReviewStore) => { try { storage.setItem(VOCAB_REVIEW_STORAGE_KEY, JSON.stringify(st)); } catch { /* 容量超過は黙殺（試作） */ } };
  return {
    getEntry: (itemId) => load().entries[itemId],
    setDecision(itemId, decision, issueTypes, note) {
      const st = load();
      st.entries[itemId] = {
        itemId, decision, issueTypes, ...(note ? { note } : {}),
        reviewedAt: new Date().toISOString(), reviewerMode: 'labPreview', dataVersion: DATA_VERSION,
      };
      save(st);
    },
    clearDecision(itemId) { const st = load(); delete st.entries[itemId]; save(st); },
    getAll: () => load().entries,
    getProgress(allItemIds) {
      const st = load();
      let ok = 0, fix = 0, hold = 0;
      for (const id of allItemIds) {
        const d = st.entries[id]?.decision;
        if (d === 'ok') ok += 1; else if (d === 'fix') fix += 1; else if (d === 'hold') hold += 1;
      }
      const reviewed = ok + fix + hold;
      return { total: allItemIds.length, reviewed, ok, fix, hold, unreviewed: allItemIds.length - reviewed };
    },
    setUiState(patch) { const st = load(); if (patch.filter !== undefined) st.filter = patch.filter; if (patch.currentItemId !== undefined) st.currentItemId = patch.currentItemId; save(st); },
    getUiState() { const st = load(); return { filter: st.filter, currentItemId: st.currentItemId }; },
    exportJson() {
      const st = load();
      return JSON.stringify({ schemaVersion: st.schemaVersion, exportedAt: new Date().toISOString(), dataVersion: DATA_VERSION, entries: st.entries }, null, 2);
    },
    importJson(json) {
      try {
        const parsed = JSON.parse(json) as { schemaVersion?: number; entries?: Record<string, ReviewEntry> };
        if (parsed?.schemaVersion !== REVIEW_SCHEMA_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) return false;
        const st = load();
        for (const [k, v] of Object.entries(parsed.entries)) {
          if (!v || typeof v.itemId !== 'string' || !['ok', 'fix', 'hold'].includes(v.decision)) return false;
          st.entries[k] = v;
        }
        save(st);
        return true;
      } catch { return false; }
    },
    reset() { storage.removeItem(VOCAB_REVIEW_STORAGE_KEY); },
  };
};
