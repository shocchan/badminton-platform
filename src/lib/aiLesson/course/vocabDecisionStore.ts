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
  /** 判断時点の対象スナップショット（stale検出用・2E-1.8 §5） */
  snapshotCurrentValueJa?: string;
  snapshotProposedValueJa?: string;
  datasetVersion?: string;
  /** 不明フィールドは破棄せず保持（前方互換・§5） */
  [k: string]: unknown;
}

/**
 * 判断ドラフトの鮮度分類（2E-1.8 §5）。
 * current=有効／stale=判断後に対象の値が変わった／orphaned=判断IDが現キューに存在しない／
 * incompatible=別版教材データへの判断。stale/orphaned/incompatibleは自動削除・自動移行しない。
 */
export type DraftFreshness = 'current' | 'stale' | 'orphaned' | 'incompatible';
export const classifyDraftEntry = (
  entry: DecisionDraftEntry,
  queueItem: { currentValueJa: string; proposedValueJa: string } | undefined,
  currentDatasetVersion = DECISION_DATASET_VERSION,
): DraftFreshness => {
  if (!queueItem) return 'orphaned';
  if (entry.datasetVersion && entry.datasetVersion !== currentDatasetVersion) return 'incompatible';
  if ((entry.snapshotCurrentValueJa !== undefined && entry.snapshotCurrentValueJa !== queueItem.currentValueJa)
    || (entry.snapshotProposedValueJa !== undefined && entry.snapshotProposedValueJa !== queueItem.proposedValueJa)) return 'stale';
  return 'current';
};

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
  /** 取り込み内容のうちstale/orphaned/別版の件数（§13・警告表示用） */
  staleCount?: number;
  orphanedCount?: number;
  incompatibleCount?: number;
  exportedAt?: string;
  datasetVersion?: string;
  entries?: Record<string, DecisionDraftEntry>;
}

export interface VocabDecisionRepository {
  getEntry(decisionId: string): DecisionDraftEntry | undefined;
  /** 判断ドラフトの保存（正式承認ではない）。snapshotはstale検出用（§5） */
  setStatus(decisionId: string, status: DecisionDraftStatus, reviewerNote?: string,
    snapshot?: { currentValueJa: string; proposedValueJa: string }): void;
  /** pendingへ戻す（reopen・履歴保持・§5） */
  reopen(decisionId: string): void;
  getAll(): Record<string, DecisionDraftEntry>;
  exportJson(validDecisionIds: string[]): string;
  /** importの事前検証（§6: parse/schema/重複/実在ID/status確認）。ここでは保存しない。
   *  queueByIdを渡すとstale/orphaned件数も算出（§13） */
  previewImport(json: string, validDecisionIds: Set<string>,
    queueById?: Map<string, { currentValueJa: string; proposedValueJa: string }>): ImportPreview;
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
    setStatus(id, status, reviewerNote, snapshot) {
      const st = load();
      const now = new Date().toISOString();
      const prev = st.entries[id];
      st.entries[id] = {
        ...(prev ?? {}), decisionId: id, status,
        ...(reviewerNote !== undefined ? { reviewerNote } : {}),
        ...(snapshot ? {
          snapshotCurrentValueJa: snapshot.currentValueJa,
          snapshotProposedValueJa: snapshot.proposedValueJa,
          datasetVersion: DECISION_DATASET_VERSION,
        } : {}),
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
    previewImport(json, validDecisionIds, queueById) {
      try {
        const parsed = JSON.parse(json) as { schemaVersion?: number; exportedAt?: string; sourceDatasetVersion?: string; entries?: Record<string, DecisionDraftEntry> };
        if (parsed?.schemaVersion !== DECISION_SCHEMA_VERSION) return { ok: false, errorJa: `schemaVersionが${DECISION_SCHEMA_VERSION}ではありません` };
        if (typeof parsed.entries !== 'object' || parsed.entries === null) return { ok: false, errorJa: 'entriesがありません' };
        const seen = new Set<string>();
        let stale = 0, orphaned = 0, incompatible = 0;
        for (const [k, v] of Object.entries(parsed.entries)) {
          if (seen.has(k)) return { ok: false, errorJa: `decisionId重複: ${k}` };
          seen.add(k);
          if (!v || v.decisionId !== k) return { ok: false, errorJa: `decisionId不一致: ${k}` };
          // 現キューに無いIDはエラーにせずorphanedとして警告（判断履歴を失わせない・§5）
          if (!validDecisionIds.has(k)) { orphaned += 1; continue; }
          if (!DECISION_STATUSES.includes(v.status)) return { ok: false, errorJa: `不正なstatus: ${String(v.status)}` };
          if (queueById) {
            const f = classifyDraftEntry(v, queueById.get(k));
            if (f === 'stale') stale += 1; else if (f === 'incompatible') incompatible += 1;
          }
        }
        const existing = load().entries;
        const overwriteCount = Object.keys(parsed.entries).filter((k) => existing[k]).length;
        return {
          ok: true, addCount: Object.keys(parsed.entries).length - overwriteCount, overwriteCount,
          staleCount: stale, orphanedCount: orphaned, incompatibleCount: incompatible,
          exportedAt: parsed.exportedAt, datasetVersion: parsed.sourceDatasetVersion, entries: parsed.entries,
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
