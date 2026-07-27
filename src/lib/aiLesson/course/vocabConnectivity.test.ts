// Phase 2E-1.9: Learning Connectivity Graphの完全性テスト（read-only監査・自動接続なし）。
import { describe, it, expect } from 'vitest';
import { buildConnectivityGraph, connectivitySummary, auditDiagnosticCoverage, SURFACE_KEYS } from './vocabConnectivity';
import { allVocabularyItems } from './foundationVocabBank';
import { conversationCoreItemIds } from './vocabDiagnosticPool';

describe('接続グラフの完全性（§2・§7）', () => {
  const g = buildConnectivityGraph();
  const s = connectivitySummary(g);
  it('総語数140=基礎78+N3 62・edge=語数×4surface・duplicate 0・invalid参照0', () => {
    expect(s.totalWords).toBe(140);
    expect(s.basics).toBe(78);
    expect(s.n3).toBe(62);
    expect(g.edgeCount).toBe(140 * SURFACE_KEYS.length);
    expect(g.duplicateEdgeCount).toBe(0);
    expect(g.invalidReferences).toEqual([]);
    expect(g.labOnly).toBe(true);   // ことば図鑑全体は一般受講生に対して意図的隔離
  });
  it('surface別恒等式: 各surfaceの状態合計=140（軸を合算して140にしない）', () => {
    for (const k of SURFACE_KEYS) {
      const c = s.byStatusPerSurface[k];
      expect(c.connected + c.partial + c.orphaned + c.unverified + c.intentionally_isolated).toBe(140);
    }
    expect(Object.values(s.overallByStatus).reduce((a, b) => a + b, 0)).toBe(140);
    expect(Object.values(s.byLevelOverall.basics).reduce((a, b) => a + b, 0)).toBe(78);
    expect(Object.values(s.byLevelOverall.n3).reduce((a, b) => a + b, 0)).toBe(62);
  });
  it('期待値スナップショット（Phase 2E-1.10で学習ループを閉鎖・変更時は意図的に更新）', () => {
    expect(s.byStatusPerSurface.vocabScreen).toMatchObject({ connected: 140 });
    // 2E-1.10 §10: 会話コア11語へ確認問題を追加し、診断の未接続を解消（129+11partial → 140）
    expect(s.byStatusPerSurface.diagnostic).toMatchObject({ connected: 140 });
    expect(s.byStatusPerSurface.diagnostic.partial).toBe(0);
    // 2E-1.10 §11: fi-senseiの練習を追加（12 → 13）。残りは一般導線のみ＝unverified
    expect(s.byStatusPerSurface.conversation).toMatchObject({ connected: 13, unverified: 127 });
    // 2E-1.10 §3: 間隔反復の実装で復習の構造的ギャップを解消（140partial → 140connected）
    expect(s.byStatusPerSurface.review).toMatchObject({ connected: 140 });
    expect(s.overallByStatus.orphaned).toBe(0);   // 完全孤立語はない
  });
  it('接続品質を分けて集計する（§26・generic接続を完成扱いしない）', () => {
    expect(s.qualityTotals.none).toBe(0);
    // 会話の127語は「AI会話への一般導線のみ」＝genericであり、完成した接続ではない
    expect(s.byQualityPerSurface.conversation.generic).toBe(127);
    expect(s.byQualityPerSurface.conversation.contextual).toBe(13);
    expect(s.byQualityPerSurface.vocabScreen.verified).toBe(140);
    expect(s.byQualityPerSurface.review.verified).toBe(140);
    // 品質の合計はedge数と一致
    const total = Object.values(s.qualityTotals).reduce((a, b) => a + b, 0);
    expect(total).toBe(140 * SURFACE_KEYS.length);
  });
  it('全edgeにreasonとevidence（ファイル/export名）がある・決定的（再導出で同一）', () => {
    for (const w of g.words) for (const k of SURFACE_KEYS) {
      expect(w.surfaces[k].reasonJa.length).toBeGreaterThan(0);
      expect(w.surfaces[k].evidence).toMatch(/[A-Za-z]/);
      expect(['direct', 'derived']).toContain(w.surfaces[k].verification);
    }
    const g2 = buildConnectivityGraph();
    expect(g2.words.map((w) => w.itemId + w.overall)).toEqual(g.words.map((w) => w.itemId + w.overall));
  });
  it('会話接続は明示参照のみconnected（推測でconnectedにしない・§5）', () => {
    const conn = g.words.filter((w) => w.surfaces.conversation.status === 'connected');
    expect(conn.length).toBe(13);   // vocabConversationPracticeの明示itemId参照数
    for (const w of conn) {
      expect(w.surfaces.conversation.verification).toBe('direct');
      expect(w.surfaces.conversation.quality).toBe('contextual');
    }
    // 明示参照が無い語はunverified/generic（AI会話への一般導線のみ）
    const namae = g.words.find((w) => w.itemId === 'fi-namae')!;
    expect(namae.surfaces.conversation.status).toBe('unverified');
    expect(namae.surfaces.conversation.quality).toBe('generic');
  });
  it('会話コア語は診断・会話の両方へ接続済み（2E-1.10 §10-§11のRelease Minimum）', () => {
    const coreIds = conversationCoreItemIds();
    expect(coreIds.length).toBe(11);
    for (const id of coreIds) {
      const w = g.words.find((x) => x.itemId === id);
      expect(w, id).toBeTruthy();
      expect(w!.surfaces.diagnostic.status, id).toBe('connected');
      expect(w!.surfaces.conversation.status, id).toBe('connected');   // 対象語別の練習がある
    }
  });
});

describe('診断カバレッジ監査（§7）', () => {
  const d = auditDiagnosticCoverage();
  it('プール参照は全て実在ID・問題ID重複なし・N3診断適格率100%', () => {
    expect(d.invalidWordIds).toBe(0);
    expect(d.duplicateQuestionIds).toBe(0);
    expect(d.poolQuestionTotal).toBe(33);
    expect(d.uniqueWordRefs).toBe(29);
    expect(d.basicsWordRefs + d.n3WordRefs).toBe(d.uniqueWordRefs);
    expect(d.n3DiagnosticEligible).toBe(62);
    expect(d.n3CoveragePct).toBe(100);
  });
  it('教材本体はdraftのまま（read-only監査・書き込みなし）', () => {
    expect(allVocabularyItems().every((i) => i.review === 'draft')).toBe(true);
  });
});
