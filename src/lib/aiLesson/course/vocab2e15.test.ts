// Phase 2E-1.5 テスト（§37）: 二重AIレビュー・レビュー永続化・N3診断次元・関連語。
import { describe, it, expect } from 'vitest';
import { createVocabReviewRepository, VOCAB_REVIEW_STORAGE_KEY, VOCAB_REVIEW_LOCAL_KEY, REVIEW_SCHEMA_VERSION, DATA_VERSION } from './vocabReviewStore';
import { buildReviewComparisons, dualReviewSummary, claudeReviewOf } from './vocabDualReview';
import { CHATGPT_REVIEWS } from './vocabChatgptReview';
import { buildDiagnosticSet, diagnosticCountFor } from './vocabDiagnostic';
import { createVocabProgressRepository } from './vocabProgress';
import { VOCABULARY_PACKS } from './vocabularyPacks';
import { allVocabularyItems } from './foundationVocabBank';
import { VOCABULARY_RELATIONS, relationsForItem } from './vocabRelations';
import { requiresKeyboard } from './foundationTypes';

const items = allVocabularyItems();
const itemById = new Map(items.map((i) => [i.id, i]));
const n3pack = VOCABULARY_PACKS[1];

const makeStorage = (failing = false) => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { if (failing) throw new Error('QuotaExceededError'); m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
};

describe('レビュー保存の永続化（§11-§12）', () => {
  it('localStorage相当へv2で保存され、旧sessionStorage v1から移行される', () => {
    const local = makeStorage();
    const session = makeStorage();
    session.setItem(VOCAB_REVIEW_STORAGE_KEY, JSON.stringify({
      schemaVersion: REVIEW_SCHEMA_VERSION,
      entries: { 'fi-iku': { itemId: 'fi-iku', decision: 'ok', issueTypes: [], reviewedAt: 'x', reviewerMode: 'labPreview', dataVersion: 'phase-2e-1' } },
    }));
    const repo = createVocabReviewRepository(local, session);
    expect(repo.getEntry('fi-iku')?.decision).toBe('ok');          // 移行済み
    repo.setDecision('fi-sumu', 'fix', ['reading']);
    const raw = JSON.parse(local.getItem(VOCAB_REVIEW_LOCAL_KEY)!);
    expect(raw.schemaVersion).toBe(2);
    expect(Object.keys(raw.entries).length).toBe(2);
    // reload相当（新Repository）でも保持される
    const repo2 = createVocabReviewRepository(local, session);
    expect(repo2.getEntry('fi-sumu')?.decision).toBe('fix');
  });
  it('容量超過で保存に失敗してもクラッシュせず、lastSaveFailedで警告できる', () => {
    const repo = createVocabReviewRepository(makeStorage(true));
    repo.setDecision('fi-iku', 'ok', []);
    expect(repo.lastSaveFailed()).toBe(true);
  });
  it('dataVersion不一致のimportは取り込めるが警告フラグが立つ・不正JSONは拒否', () => {
    const repo = createVocabReviewRepository(makeStorage());
    const ok = repo.importJson(JSON.stringify({
      schemaVersion: REVIEW_SCHEMA_VERSION, dataVersion: 'phase-old',
      entries: { 'fi-iku': { itemId: 'fi-iku', decision: 'hold', issueTypes: [], reviewedAt: 'x', reviewerMode: 'labPreview', dataVersion: 'phase-old' } },
    }));
    expect(ok).toBe(true);
    expect(repo.importedVersionMismatch()).toBe(true);
    expect(repo.importJson('{{{')).toBe(false);
    expect(DATA_VERSION).toBe('phase-2e-1.5');
  });
  it('reset（全削除）で新旧キーとも消える・学習進捗キーへは触れない', () => {
    const local = makeStorage();
    local.setItem('ai_course_vocab_preview_v1', '{"schemaVersion":2,"entries":{}}'); // 学習進捗（別物）
    const repo = createVocabReviewRepository(local);
    repo.setDecision('fi-iku', 'ok', []);
    repo.reset();
    expect(local.getItem(VOCAB_REVIEW_LOCAL_KEY)).toBeNull();
    expect(local.getItem('ai_course_vocab_preview_v1')).not.toBeNull();
  });
});

describe('二重AIレビュー比較（§2・§7）', () => {
  it('全140語の比較が生成され、状態は定義済みenumのみ・approvedにならない', () => {
    const cs = buildReviewComparisons();
    expect(cs.length).toBe(items.length);
    for (const c of cs) {
      expect(['claude_reviewed', 'chatgpt_reviewed', 'ai_consensus', 'ai_disagreement', 'human_review_required']).toContain(c.aiReviewState);
      expect(['P0', 'P1', 'P2', 'P3']).toContain(c.humanReviewPriority);
    }
    // AIレビューは教材のreview状態を変えない（§2）
    expect(items.every((i) => i.review === 'draft')).toBe(true);
  });
  it('cognate未レビュー語のClaude評価はuncertain（断定しない）＋human review required', () => {
    const r = claudeReviewOf('fi-kaku', true);
    expect(r.cognateStatus).toBe('uncertain');
    expect(r.requiresHumanReview).toBe(true);
  });
  it('サマリーは単一関数から（chatgptReviewed件数はCHATGPT_REVIEWSと一致）', () => {
    const s = dualReviewSummary();
    expect(s.total).toBe(items.length);
    expect(s.chatgptReviewed).toBe(buildReviewComparisons().filter((c) => !!c.chatgpt).length);
    expect(s.chatgptReviewed).toBe(Object.keys(CHATGPT_REVIEWS).filter((id) => itemById.has(id)).length);
    expect(s.byPriority.P0 + s.byPriority.P1 + s.byPriority.P2 + s.byPriority.P3).toBe(s.total);
  });
  it('CHATGPT_REVIEWSのitemIdはすべて実在する', () => {
    for (const id of Object.keys(CHATGPT_REVIEWS)) expect(itemById.has(id), id).toBe(true);
  });
});

describe('N3診断の次元構成（§21）', () => {
  it('12〜18問・タップ式・同一Item最大2問・決定的', () => {
    const repo = createVocabProgressRepository(makeStorage());
    const set = buildDiagnosticSet(n3pack, 'n3_prep', itemById, repo, items);
    expect(set.length).toBeGreaterThanOrEqual(12);
    expect(set.length).toBeLessThanOrEqual(18);
    expect(diagnosticCountFor(n3pack)).toBe(set.length);
    const perItem = new Map<string, number>();
    for (const x of set) {
      perItem.set(x.itemId, (perItem.get(x.itemId) ?? 0) + 1);
      expect(requiresKeyboard(x.q.type)).toBe(false);
    }
    for (const [, n] of perItem) expect(n).toBeLessThanOrEqual(2);
    expect(set.map((x) => x.q.id)).toEqual(buildDiagnosticSet(n3pack, 'n3_prep', itemById, repo, items).map((x) => x.q.id));
  });
  it('reading/meaning/usage/collocation/particle/conjugation・自他・false friendを含む', () => {
    const repo = createVocabProgressRepository(makeStorage());
    const set = buildDiagnosticSet(n3pack, 'n3_prep', itemById, repo, items);
    const dims = new Set(set.map((x) => x.vocabDimension));
    for (const d of ['reading', 'meaning', 'usage', 'collocation', 'particle', 'conjugation'] as const) expect(dims.has(d), d).toBe(true);
    // 自他（決まる/変わる）・false friend（都合）のprobeが入っている（roleは変えない）
    const ids = set.map((x) => x.itemId);
    expect(ids).toContain('fi-kimaru');
    expect(ids).toContain('fi-kawaru');
    expect(ids).toContain('fi-tsugou');
  });
  it('probeで回答済みの次元は再出題されない', () => {
    const storage = makeStorage();
    const repo = createVocabProgressRepository(storage);
    repo.recordDiagnosticDimension(n3pack.id, 'fi-kimaru', 'usage', 'confirmed');
    const set = buildDiagnosticSet(n3pack, 'n3_prep', itemById, repo, items);
    expect(set.some((x) => x.itemId === 'fi-kimaru' && x.vocabDimension === 'usage')).toBe(false);
  });
});

describe('語彙の関連（§24）', () => {
  it('関係の両端Itemが実在・self relationなし・重複ペアなし', () => {
    const seen = new Set<string>();
    for (const rel of VOCABULARY_RELATIONS) {
      expect(itemById.has(rel.itemId), rel.itemId).toBe(true);
      expect(itemById.has(rel.relatedItemId), rel.relatedItemId).toBe(true);
      expect(rel.itemId).not.toBe(rel.relatedItemId);
      const key = [rel.itemId, rel.relatedItemId].sort().join('|');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      expect(rel.explanationJa.length).toBeGreaterThan(0);
      expect(rel.explanationZh.length).toBeGreaterThan(0);
    }
  });
  it('表示はhigh confidence draftのみ・対称に引ける', () => {
    for (const rel of relationsForItem('fi-kimeru')) expect(rel.confidence).toBe('high');
    expect(relationsForItem('fi-kimeru').length).toBeGreaterThanOrEqual(1); // 決まる→決める側からも引ける
    const lows = VOCABULARY_RELATIONS.filter((r) => r.confidence !== 'high');
    for (const rel of lows) {
      expect(relationsForItem(rel.itemId).includes(rel)).toBe(false); // low/mediumは非表示
    }
  });
});
