// 判断ドラフトストア（Phase 2E-1.7 目的B・localStorage v3）。
// ここに保存されるのは「CEO用ローカル判断ドラフト」であり、
// human_reviewed／approved／教材本体への反映／Supabase保存／本番公開承認とは別物（§0）。
// レビューストアv2（ai_course_vocab_review_local_v2）とはキーを分離し、v2を一切変更しない。
export const VOCAB_DECISION_LOCAL_KEY = 'ai_course_vocab_decision_draft_v3';
export const DECISION_SCHEMA_VERSION = 3;
export const DECISION_DATASET_VERSION = 'phase-2e-1.5';   // 判断対象の教材データ版

export type DecisionDraftStatus =
  | 'pending' | 'needs_context' | 'keep_current' | 'accept_proposal_as_draft'
  | 'reject_proposal' | 'deferred' | 'superseded';
export const DECISION_STATUSES: DecisionDraftStatus[] = [
  'pending', 'needs_context', 'keep_current', 'accept_proposal_as_draft', 'reject_proposal', 'deferred', 'superseded',
];

export interface DecisionHistoryEntry { status: DecisionDraftStatus; at: string }

export interface DecisionDraftEntry {
  decisionId: string;
  status: DecisionDraftStatus;
  reviewerNote?: string;            // 端末内のみ・analyticsへ送らない
  decidedAt?: string;
  updatedAt: string;
  history: DecisionHistoryEntry[];  // 判断変更履歴（最低限・§5）
  /** 不明フィールドは破棄せず保持（前方互換・§5） */
  [k: string]: unknown;
}

interface DecisionStore {
  schemaVersion: number;
  sourceDatasetVersion: string;
  entries: Record<string, DecisionDraftEntry>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const empty = (): DecisionStore => ({ schemaVersion: DECISION_SCHEMA_VERSION, sourceDatasetVersion: DECISION_DATASET_VERSION, entries: {} });

export interface ImportPreview {
  ok: boolean;
  errorJa?: string;
  addCount?: number;
  overwriteCount?: number;
  datasetVersion?: string;
  entries?: Record<string, DecisionDraftEntry>;
}

export interface VocabDecisionRepository {
  getEntry(decisionId: string): DecisionDraftEntry | undefined;
  /** 判断ドラフトの保存（正式承認ではない）。同じstatusの再設定でも履歴は追加する */
  setStatus(decisionId: string, status: DecisionDraftStatus, reviewerNote?: string): void;
  /** pendingへ戻す（reopen・履歴保持・§5） */
  reopen(decisionId: string): void;
  getAll(): Record<string, DecisionDraftEntry>;
  exportJson(validDecisionIds: string[]): string;
  /** importの事前検証（§6: parse/schema/重複/実在ID/status確認）。ここでは保存しない */
  previewImport(json: string, validDecisionIds: Set<string>): ImportPreview;
  /** preview済みentriesを反映。mode=mergeは既存優先で追記、replaceは全置換（呼び出し側で確認necessary） */
  applyImport(preview: ImportPreview, mode: 'merge' | 'replace'): boolean;
  lastSaveFailed(): boolean;
  reset(): void;
}

export const createVocabDecisionRepository = (storage: StorageLike): VocabDecisionRepository => {
  let saveFailed = false;
  const load = (): DecisionStore => {
    try {
      const raw = storage.getItem(VOCAB_DECISION_LOCAL_KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw) as DecisionStore;
      // 不正データでも画面をクラッシュさせない（§5）。schema不一致は既存を破壊せず空扱い
      if (parsed?.schemaVersion !== DECISION_SCHEMA_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) return empty();
      return parsed;
    } catch { return empty(); }
  };
  const save = (st: DecisionStore) => {
    try { storage.setItem(VOCAB_DECISION_LOCAL_KEY, JSON.stringify(st)); saveFailed = false; }
    catch { saveFailed = true; }
  };
  return {
    getEntry: (id) => load().entries[id],
    setStatus(id, status, reviewerNote) {
      const st = load();
      const now = new Date().toISOString();
      const prev = st.entries[id];
      st.entries[id] = {
        ...(prev ?? {}), decisionId: id, status,
        ...(reviewerNote !== undefined ? { reviewerNote } : {}),
        updatedAt: now,
        decidedAt: status === 'pending' ? undefined : now,
        history: [...(prev?.history ?? []), { status, at: now }],
      };
      save(st);
    },
    reopen(id) { this.setStatus(id, 'pending'); },
    getAll: () => load().entries,
    exportJson(validDecisionIds) {
      const st = load();
      const entries = Object.fromEntries(Object.entries(st.entries).filter(([k]) => validDecisionIds.includes(k)));
      const counts: Record<string, number> = {};
      for (const e of Object.values(entries)) counts[e.status] = (counts[e.status] ?? 0) + 1;
      return JSON.stringify({
        exportedAt: new Date().toISOString(), schemaVersion: DECISION_SCHEMA_VERSION,
        sourceDatasetVersion: st.sourceDatasetVersion, summaryCounts: counts, entries,
      }, null, 2);
    },
    previewImport(json, validDecisionIds) {
      try {
        const parsed = JSON.parse(json) as { schemaVersion?: number; sourceDatasetVersion?: string; entries?: Record<string, DecisionDraftEntry> };
        if (parsed?.schemaVersion !== DECISION_SCHEMA_VERSION) return { ok: false, errorJa: `schemaVersionが${DECISION_SCHEMA_VERSION}ではありません` };
        if (typeof parsed.entries !== 'object' || parsed.entries === null) return { ok: false, errorJa: 'entriesがありません' };
        const seen = new Set<string>();
        for (const [k, v] of Object.entries(parsed.entries)) {
          if (seen.has(k)) return { ok: false, errorJa: `decisionId重複: ${k}` };
          seen.add(k);
          if (!v || v.decisionId !== k) return { ok: false, errorJa: `decisionId不一致: ${k}` };
          if (!validDecisionIds.has(k)) return { ok: false, errorJa: `存在しない判断ID: ${k}` };
          if (!DECISION_STATUSES.includes(v.status)) return { ok: false, errorJa: `不正なstatus: ${String(v.status)}` };
        }
        const existing = load().entries;
        const overwriteCount = Object.keys(parsed.entries).filter((k) => existing[k]).length;
        return {
          ok: true, addCount: Object.keys(parsed.entries).length - overwriteCount, overwriteCount,
          datasetVersion: parsed.sourceDatasetVersion, entries: parsed.entries,
        };
      } catch { return { ok: false, errorJa: 'JSONを解析できません' }; }
    },
    applyImport(preview, mode) {
      if (!preview.ok || !preview.entries) return false;
      const st = mode === 'replace' ? empty() : load();
      for (const [k, v] of Object.entries(preview.entries)) st.entries[k] = v;   // mergeは新しい方で上書き
      save(st);
      return true;
    },
    lastSaveFailed: () => saveFailed,
    reset() { storage.removeItem(VOCAB_DECISION_LOCAL_KEY); },
  };
};
