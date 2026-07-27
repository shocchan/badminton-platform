// Phase 2E-1.7 データ層テスト: Human Decision Queue導出＋判断ドラフトストアv3。
// 判断ドラフトは正式承認ではない（教材review状態・v2レビューストアへ影響しないことを担保）。
import { describe, it, expect } from 'vitest';
import { buildDecisionQueue, decisionQueueSummary } from './vocabDecisionQueue';
import {
  createVocabDecisionRepository, VOCAB_DECISION_LOCAL_KEY, DECISION_SCHEMA_VERSION,
} from './vocabDecisionStore';
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
  it('fi-namaeの例文判断がP0として先頭に来る（自動採用しない・表示のみ）', () => {
    expect(q[0].decisionId).toBe('fi-namae:example');
    expect(q[0].priority).toBe('P0');
    expect(q[0].currentValueJa).toContain('名前は王です。');
    expect(q[0].proposedValueJa).toContain('王小明');
  });
  it('cognate不一致・meaningZh未採用・role提案・Sense未レビューが判断事項として含まれる', () => {
    const types = new Set(q.map((d) => d.decisionType));
    expect(types).toContain('cognate');
    expect(types).toContain('meaning_zh');
    expect(types).toContain('role');
    expect(types).toContain('sense');
    // 代表例: AI不一致のcognate（採用済みの提案はキューに乗らない）
    expect(q.some((d) => d.decisionId === 'fi-nihongo:cognate')).toBe(true);
    expect(q.some((d) => d.decisionId === 'fi-komaru:meaning_zh')).toBe(true);
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
    expect(s.byPriority.P0).toBeGreaterThanOrEqual(1);
    expect(s.byType.example + s.byType.cognate + s.byType.meaning_zh + s.byType.role + s.byType.sense).toBe(s.itemCount);
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
    // 検証エラー: 未知ID・不正status・重複・壊れたJSON
    expect(repo2.previewImport(json.replace('fi-namae:example', 'fi-unknown:example'), valid).ok).toBe(false);
    expect(repo2.previewImport(json.replaceAll('keep_current', 'approved'), valid).ok).toBe(false);
    expect(repo2.previewImport('{{{', valid).ok).toBe(false);
    expect(Object.keys(repo2.getAll())).toEqual(['fi-namae:example']);   // 失敗時は変更なし
  });
});
