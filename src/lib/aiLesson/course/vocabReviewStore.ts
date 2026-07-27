// 教材レビュー結果ストア（Phase 2E-1 §15-§16／2E-1.5 §11-§12: localStorageへ永続化）。
// 学習者進捗（ai_course_vocab_preview_v1・sessionStorage）と完全分離。PII禁止。
// タブ・ブラウザを閉じてもレビュー結果を保持する（共有DBは使わない）。
// 重要: ここの「問題なし」は提案・確認記録であり、教材データのreviewStatusを自動でapprovedにしない（§16）。
export const VOCAB_REVIEW_STORAGE_KEY = 'ai_course_vocab_review_preview_v1';   // 旧: sessionStorage v1（移行元）
export const VOCAB_REVIEW_LOCAL_KEY = 'ai_course_vocab_review_local_v2';       // 新: localStorage v2
export const REVIEW_SCHEMA_VERSION = 1;   // export/import形式（互換維持）
export const REVIEW_LOCAL_SCHEMA_VERSION = 2;

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
  /** import由来のレビュー版（dataVersion不一致の警告用・§12） */
  importedReviewVersion?: string;
  /** 容量超過等で最後の保存が失敗したか（UIで警告表示・§12） */
  lastSaveFailed?: boolean;
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

const empty = (): ReviewStore => ({ schemaVersion: REVIEW_LOCAL_SCHEMA_VERSION, entries: {} });

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
  /** 直近の保存が容量超過等で失敗したか（UI警告用・§12） */
  lastSaveFailed(): boolean;
  /** import時のdataVersion（教材版）不一致か（§12） */
  importedVersionMismatch(): boolean;
  reset(): void;
}

export const DATA_VERSION = 'phase-2e-1.5';

/**
 * レビューRepository（2E-1.5: localStorageで永続化・§11）。
 * legacySessionを渡すと旧sessionStorage v1から一度だけ移行する（既存決定を失わない）。
 */
export const createVocabReviewRepository = (storage: StorageLike, legacySession?: StorageLike): VocabReviewRepository => {
  let saveFailed = false;
  const load = (): ReviewStore => {
    try {
      const raw = storage.getItem(VOCAB_REVIEW_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ReviewStore;
        if (parsed?.schemaVersion === REVIEW_LOCAL_SCHEMA_VERSION && typeof parsed.entries === 'object' && parsed.entries !== null) return parsed;
        return empty();
      }
      // 旧v1（同一storage内 or sessionStorage）からの移行（§11）
      const legacyRaw = storage.getItem(VOCAB_REVIEW_STORAGE_KEY) ?? legacySession?.getItem(VOCAB_REVIEW_STORAGE_KEY) ?? null;
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as ReviewStore;
        if (legacy?.schemaVersion === REVIEW_SCHEMA_VERSION && typeof legacy.entries === 'object' && legacy.entries !== null) {
          const migrated: ReviewStore = { ...legacy, schemaVersion: REVIEW_LOCAL_SCHEMA_VERSION };
          try { storage.setItem(VOCAB_REVIEW_LOCAL_KEY, JSON.stringify(migrated)); } catch { /* 容量超過時はメモリ上のみ */ }
          return migrated;
        }
      }
      return empty();
    } catch { return empty(); }
  };
  const save = (st: ReviewStore) => {
    try { storage.setItem(VOCAB_REVIEW_LOCAL_KEY, JSON.stringify(st)); saveFailed = false; }
    catch { saveFailed = true; /* 容量超過: 破壊せずフラグでUI警告（§12） */ }
  };
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
      // export形式はv1固定（Claude Code取り込み・過去exportとの互換・§12）
      return JSON.stringify({ schemaVersion: REVIEW_SCHEMA_VERSION, exportedAt: new Date().toISOString(), dataVersion: DATA_VERSION, entries: st.entries }, null, 2);
    },
    importJson(json) {
      try {
        const parsed = JSON.parse(json) as { schemaVersion?: number; dataVersion?: string; entries?: Record<string, ReviewEntry> };
        if (parsed?.schemaVersion !== REVIEW_SCHEMA_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) return false;
        const st = load();
        for (const [k, v] of Object.entries(parsed.entries)) {
          if (!v || typeof v.itemId !== 'string' || !['ok', 'fix', 'hold'].includes(v.decision)) return false;
          st.entries[k] = v;   // 重複キーは新しい方で上書き（§12）
        }
        st.importedReviewVersion = parsed.dataVersion ?? 'unknown';
        save(st);
        return true;
      } catch { return false; }
    },
    lastSaveFailed: () => saveFailed,
    importedVersionMismatch() {
      const v = load().importedReviewVersion;
      return !!v && v !== DATA_VERSION;
    },
    reset() { storage.removeItem(VOCAB_REVIEW_LOCAL_KEY); storage.removeItem(VOCAB_REVIEW_STORAGE_KEY); legacySession?.removeItem(VOCAB_REVIEW_STORAGE_KEY); },
  };
};
