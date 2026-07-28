// Phase 2E-1.7 データ層テスト: Human Decision Queue導出＋判断ドラフトストアv3。
// 判断ドラフトは正式承認ではない（教材review状態・v2レビューストアへ影響しないことを担保）。
import { describe, it, expect } from 'vitest';
import { buildDecisionQueue, decisionQueueSummary, auditDecisionQueue, decisionBadgeForWord } from './vocabDecisionQueue';
import {
  createVocabDecisionRepository, VOCAB_DECISION_LOCAL_KEY, DECISION_SCHEMA_VERSION,
  classifyDraftEntry, DECISION_DATASET_VERSION,
} from './vocabDecisionStore';
import type { DecisionDraftEntry } from './vocabDecisionStore';
import { VOCAB_REVIEW_LOCAL_KEY } from './vocabReviewStore';
import { allVocabularyItems } from './foundationVocabBank';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    dump: () => m,
  };
};

describe('Human Decision Queue（§2 目的A）', () => {
  const q = buildDecisionQueue();
  const ids = new Set(allVocabularyItems().map((i) => i.id));
  it('決定的・decisionId重複なし・実在itemIdのみ・判断事項単位', () => {
    expect(q.length).toBeGreaterThan(0);
    expect(new Set(q.map((d) => d.decisionId)).size).toBe(q.length);
    for (const d of q) {
      expect(ids.has(d.itemId), d.itemId).toBe(true);
      expect(d.decisionId).toBe(`${d.itemId}:${d.decisionType}`);
    }
    expect(buildDecisionQueue().map((d) => d.decisionId)).toEqual(q.map((d) => d.decisionId));   // 決定的
  });
  it('CEO判断済みfield（2026-07-28・14件）はキューに再掲されない', () => {
    // fi-namaeの例文・訳、cognate 11件はCEOがfield単位で確定済み（vocabFieldReviewDecisions）
    expect(q.some((d) => d.decisionId === 'fi-namae:example')).toBe(false);
    expect(q.some((d) => d.decisionId === 'fi-namae:meaning_zh')).toBe(false);
    expect(q.some((d) => d.decisionId === 'fi-komaru:meaning_zh')).toBe(false);
    expect(q.some((d) => d.decisionType === 'cognate')).toBe(false);
    const a = auditDecisionQueue();
    // 14件 = CEO除外11 + 「CEO確定値がChatGPT提案と一致し反映済み」扱い3（kaishain/nihongo/tomodachi）
    expect(a.excludedCeoDecided).toBe(11);
  });
  it('meaningZh未採用・role提案・Sense未レビューが判断事項として含まれる（cognateはCEO確定で0）', () => {
    const types = new Set(q.map((d) => d.decisionType));
    expect(types).toContain('meaning_zh');
    expect(types).toContain('role');
    expect(types).toContain('sense');
    expect(q.some((d) => d.decisionId === 'fi-taihen:sense')).toBe(true);
    expect(q.some((d) => d.decisionId === 'fi-jouhou:cognate')).toBe(false);   // 採用済み提案は判断不要
  });
  it('同一語に複数の判断事項を持てる（語単位で潰さない）', () => {
    const byWord = new Map<string, number>();
    for (const d of q) byWord.set(d.itemId, (byWord.get(d.itemId) ?? 0) + 1);
    expect([...byWord.values()].some((n) => n >= 2)).toBe(true);
  });
  it('集計は語数と判断事項数を分けて返す（§7）', () => {
    const s = decisionQueueSummary(q);
    expect(s.itemCount).toBe(q.length);
    expect(s.wordCount).toBeLessThan(s.itemCount);
    expect(s.byType.example + s.byType.cognate + s.byType.meaning_zh + s.byType.role + s.byType.sense).toBe(s.itemCount);
    expect(s.independentPriorityCount + s.inheritedPriorityCount).toBe(s.itemCount);
  });
});

describe('導出の完全性監査（2E-1.8 §2）', () => {
  const audit = auditDecisionQueue();
  const q = buildDecisionQueue();
  it('候補=レビュー対象に選定+反映済み除外+対象外除外・重複0・件数の恒等式がtype別にも成立', () => {
    // §20: queuedForReview は「レビュー対象に選定した数」であり、教材採用・公開承認ではない
    expect(audit.duplicates).toBe(0);
    expect(audit.queuedForReview).toBe(q.length);
    expect(audit.sourceCandidates).toBe(audit.queuedForReview + audit.excludedAlreadyApplied + audit.excludedNotApplicable + audit.excludedCeoDecided);
    for (const k of Object.keys(audit.byType) as (keyof typeof audit.byType)[]) {
      const b = audit.byType[k];
      expect(b.candidates).toBe(b.queuedForReview + b.excludedAlreadyApplied + b.excludedNotApplicable + b.excludedCeoDecided);
    }
  });
  it('期待値スナップショット（教材データ更新時は意図的にこの数値を更新すること）', () => {
    // 2026-07-27 phase-2e-1.5データ時点の実数。変わった場合は auto-fix や教材変更に由来するはず。
    // 注: 2E-1.7完了報告の「meaning_zh 17・role 60」は誤集計で、実数はこの監査が正
    //（本テスト導入時に検出・完了報告に差異を記載済み）。
    // 2026-07-28 CEO判断14件反映後の実数（91→77件。cognate/example/meaning_zh計14件がキュー外へ）
    const s = decisionQueueSummary(q);
    expect(s.itemCount).toBe(77);
    expect(s.byType).toEqual({ example: 0, cognate: 0, meaning_zh: 18, role: 57, sense: 2 });
    expect(s.byPriority).toEqual({ P0: 1, P1: 8, P2: 67, P3: 1 });   // 表示priorityは語単位の継承値
    // 監査カウンタ（候補218 = 選定77 + 反映済み111 + 対象外19 + CEO判断済み11）
    const a = auditDecisionQueue();
    expect(a.sourceCandidates).toBe(218);
    expect(a.excludedAlreadyApplied).toBe(111);
    expect(a.excludedNotApplicable).toBe(19);
    expect(a.excludedCeoDecided).toBe(11);
  });
});

describe('リリース分類と根本問題（2E-1.10 §18-§20）', () => {
  const q = buildDecisionQueue();
  const s = decisionQueueSummary(q);
  it('91件すべてをリリースブロッカーにしない（分類の合計は総数と一致）', () => {
    const sum = s.byReleaseClass.release_blocker + s.byReleaseClass.before_beta_recommended + s.byReleaseClass.can_defer;
    expect(sum).toBe(s.itemCount);
    expect(s.byReleaseClass.release_blocker).toBeLessThan(s.itemCount);
    // severityモデル修正（CEO決定 2026-07-28）: blockerは「その項目自体がP0/P1」だけ。
    // CEO判断14件の反映後、残る77件はP2/P3のみ＝blocker 0
    expect(s.byReleaseClass.release_blocker).toBe(0);
    expect(s.byReleaseClass.before_beta_recommended).toBe(59);
    expect(s.byReleaseClass.can_defer).toBe(18);
  });
  it('root P0/P1は「その項目自体が重大」なものだけ（CEO判断反映後は0・§19）', () => {
    expect(s.rootP0Count).toBe(0);   // fi-namae:example はCEO判断で解決（キュー外）
    expect(s.rootP1Count).toBe(0);
    expect(q.filter((d) => d.localSeverity === 'P0')).toHaveLength(0);
    expect(q.filter((d) => d.localSeverity === 'P1')).toHaveLength(0);
    // 継承でP0/P1に見える項目は localSeverity が P0/P1 ではない
    const inherited = q.filter((d) => d.severitySource === 'inherited' && (d.priority === 'P0' || d.priority === 'P1'));
    expect(inherited.length).toBeGreaterThan(0);
    for (const d of inherited) expect(['P2', 'P3']).toContain(d.localSeverity);
  });
  it('Release Gateで同じ根本問題を重複カウントしない（rootIssueId単位）', () => {
    const blockers = q.filter((d) => d.releaseClass === 'release_blocker');
    expect(s.rootBlockerCount).toBe(new Set(blockers.map((d) => d.rootIssueId)).size);
    expect(s.rootBlockerCount).toBeLessThanOrEqual(blockers.length);
  });
  it('P0/P1は必ずリリースブロッカー（後回しにしない・§18）', () => {
    for (const d of q) {
      if (d.localSeverity === 'P0' || d.localSeverity === 'P1') expect(d.releaseClass).toBe('release_blocker');
    }
  });
});

describe('priority由来（2E-1.8 §3: 独立P0と語からの継承を区別・decisionPriorityは変えない）', () => {
  const q = buildDecisionQueue();
  const byId = new Map(q.map((d) => [d.decisionId, d]));
  it('fi-namae: roleは語のP0を継承（example/meaning_zhはCEO判断でキュー外）', () => {
    expect(byId.has('fi-namae:example')).toBe(false);
    expect(byId.has('fi-namae:meaning_zh')).toBe(false);
    expect(byId.get('fi-namae:role')!.provenance.priorityInheritedFromWord).toBe(true);
    // 表示priority自体は従来どおり語単位（人間判断なしに意味を変えない）
    expect(byId.get('fi-namae:role')!.priority).toBe('P0');
    expect(byId.get('fi-namae:role')!.localSeverity).toBe('P2');
  });
  it('provenanceは既存データ由来のフィールドのみ（推測生成しない・datasetVersion付与）', () => {
    for (const d of q) {
      expect(d.provenance.datasetVersion).toBe(DECISION_DATASET_VERSION);
      expect(['chatgpt', 'claude']).toContain(d.provenance.sourceReview);
      expect(d.provenance.derivationRule.length).toBeGreaterThan(0);
    }
  });
});

describe('stale/orphaned検出（2E-1.8 §5・自動削除・自動確定しない）', () => {
  const entry = (over: Partial<DecisionDraftEntry>): DecisionDraftEntry => ({
    decisionId: 'fi-x:cognate', status: 'keep_current', updatedAt: 'now', history: [], ...over,
  });
  it('classifyDraftEntry: current/stale/orphaned/incompatible', () => {
    const item = { currentValueJa: 'A', proposedValueJa: 'B' };
    expect(classifyDraftEntry(entry({ snapshotCurrentValueJa: 'A', snapshotProposedValueJa: 'B', datasetVersion: DECISION_DATASET_VERSION }), item)).toBe('current');
    expect(classifyDraftEntry(entry({ snapshotCurrentValueJa: 'OLD', snapshotProposedValueJa: 'B', datasetVersion: DECISION_DATASET_VERSION }), item)).toBe('stale');
    expect(classifyDraftEntry(entry({}), undefined)).toBe('orphaned');
    expect(classifyDraftEntry(entry({ datasetVersion: 'phase-old' }), item)).toBe('incompatible');
    // snapshot無し（旧ドラフト）はcurrent扱い（誤ってstale表示しない）
    expect(classifyDraftEntry(entry({}), item)).toBe('current');
  });
  it('setStatusのsnapshot保存→教材値が変わるとpreviewImportがstaleを警告・履歴は維持', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
    const repo = createVocabDecisionRepository(st);
    repo.setStatus('fi-a:cognate', 'keep_current', 'メモ', { currentValueJa: 'unreviewed', proposedValueJa: 'false_friend' });
    const json = repo.exportJson(['fi-a:cognate']);
    // 教材側の値が変わった想定のキューでプレビュー
    const pv = repo.previewImport(json, new Set(['fi-a:cognate']),
      new Map([['fi-a:cognate', { currentValueJa: 'partial_overlap', proposedValueJa: 'false_friend' }]]));
    expect(pv.ok).toBe(true);
    expect(pv.staleCount).toBe(1);
    expect(pv.exportedAt).toBeTruthy();
    const e = repo.getEntry('fi-a:cognate')!;
    expect(e.history.length).toBe(1);
    expect(e.reviewerNote).toBe('メモ');
  });
});

describe('語ごとの判断バッジ集計（2E-1.8 §6.2）', () => {
  it('未処理・P0・保留を分けて数える（判断済みはpendingから除外）', () => {
    const q = buildDecisionQueue();
    // 2026-07-28: fi-namaeのexample/meaning_zhはCEO判断でキュー外→残るのはroleの1件
    const b0 = decisionBadgeForWord('fi-namae', () => undefined, q);
    expect(b0.total).toBe(1);
    expect(b0.pending).toBe(1);
    expect(b0.p0).toBe(1);   // 表示priorityは語単位の継承値（localSeverityはP2）
    const b1 = decisionBadgeForWord('fi-namae', (id) => (id === 'fi-namae:role' ? 'keep_current' : undefined), q);
    expect(b1.pending).toBe(0);
    const none = decisionBadgeForWord('fi-sensei', () => undefined, q);   // 判断事項なしの語
    expect(none.total).toBe(0);
  });
});

describe('判断ドラフトストアv3（§5-§6・正式承認ではない）', () => {
  it('保存・履歴・reopen・v2キー非接触', () => {
    const st = mem();
    const repo = createVocabDecisionRepository(st);
    repo.setStatus('fi-namae:example', 'needs_context', '王の読み確認待ち');
    repo.setStatus('fi-namae:example', 'accept_proposal_as_draft');
    const e = repo.getEntry('fi-namae:example')!;
    expect(e.status).toBe('accept_proposal_as_draft');
    expect(e.history.length).toBe(2);
    expect(e.reviewerNote).toBe('王の読み確認待ち');   // note維持
    repo.reopen('fi-namae:example');
    expect(repo.getEntry('fi-namae:example')!.status).toBe('pending');
    expect(repo.getEntry('fi-namae:example')!.history.length).toBe(3);
    // v2レビューストアには一切書かない
    expect(st.dump().has(VOCAB_REVIEW_LOCAL_KEY)).toBe(false);
    expect(st.dump().has(VOCAB_DECISION_LOCAL_KEY)).toBe(true);
    // 教材本体は draft のまま（自動反映なし）
    expect(allVocabularyItems().every((i) => i.review === 'draft')).toBe(true);
  });
  it('不正localStorageでもクラッシュせず空扱い・既存rawを破壊しない', () => {
    const st = mem();
    st.setItem(VOCAB_DECISION_LOCAL_KEY, '{{{broken');
    const repo = createVocabDecisionRepository(st);
    expect(repo.getAll()).toEqual({});
    expect(st.dump().get(VOCAB_DECISION_LOCAL_KEY)).toBe('{{{broken');   // 読み込みだけでは上書きしない
  });
  it('export→previewImport→applyImport(merge/replace)・検証エラーで何も変更しない', () => {
    const st = mem();
    const repo = createVocabDecisionRepository(st);
    const valid = new Set(['fi-namae:example', 'fi-nihongo:cognate']);
    repo.setStatus('fi-namae:example', 'keep_current');
    const json = repo.exportJson([...valid]);
    expect(JSON.parse(json).schemaVersion).toBe(DECISION_SCHEMA_VERSION);
    // 別端末想定でimport
    const st2 = mem();
    const repo2 = createVocabDecisionRepository(st2);
    repo2.setStatus('fi-nihongo:cognate', 'deferred');
    const pv = repo2.previewImport(json, valid);
    expect(pv.ok).toBe(true);
    expect(pv.addCount).toBe(1);
    expect(repo2.applyImport(pv, 'merge')).toBe(true);
    expect(Object.keys(repo2.getAll()).sort()).toEqual(['fi-namae:example', 'fi-nihongo:cognate']);
    // replaceは全置換
    expect(repo2.applyImport(pv, 'replace')).toBe(true);
    expect(Object.keys(repo2.getAll())).toEqual(['fi-namae:example']);
    // 検証: 未知IDはエラーではなくorphaned警告（判断履歴を失わせない・2E-1.8 §5）
    const pvOrphan = repo2.previewImport(json.replaceAll('fi-namae:example', 'fi-unknown:example'), valid);
    expect(pvOrphan.ok).toBe(true);
    expect(pvOrphan.orphanedCount).toBe(1);
    // 検証エラー: 不正status・壊れたJSON
    expect(repo2.previewImport(json.replaceAll('keep_current', 'approved'), valid).ok).toBe(false);
    expect(repo2.previewImport('{{{', valid).ok).toBe(false);
    expect(Object.keys(repo2.getAll())).toEqual(['fi-namae:example']);   // 失敗時は変更なし
  });
});
