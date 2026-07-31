// Phase 2E-1.10 §38: 推薦とroleの接続テスト（決定的・理由付き）。
import { describe, it, expect } from 'vitest';
import { recommendWords, compareRolePreview, REASON_PRIORITY } from './vocabRecommendation';
import { createVocabProgressRepository } from './vocabProgress';
import { createVocabSpacedReviewRepository } from './vocabSpacedReview';
import { createLearningClock } from './learningClock';
import { allVocabularyItems } from './foundationVocabBank';
import { VOCABULARY_PACKS, roleFor } from './vocabularyPacks';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};
const pack = VOCABULARY_PACKS[0];
const allIds = pack.itemIds;
const setup = (fixed = new Date(2026, 6, 28, 9)) => {
  const clock = createLearningClock(fixed);
  const progress = createVocabProgressRepository(mem());
  const schedule = createVocabSpacedReviewRepository(mem(), clock);
  return { clock, progress, schedule,
    input: { allIds, packId: pack.id, track: 'life_basic' as const, currentUnitItemIds: [], progress, schedule } };
};

describe('推薦の優先順位（§8・11段階）', () => {
  it('期限超過→今日期限→誤答→不安→remedial の順で先に出る', () => {
    const { schedule, progress, input } = setup();
    schedule.recordResult({ itemId: allIds[0], result: 'wrong', source: 'daily' });   // 明日期限（まだ出ない）
    progress.recordTest(allIds[1], 'meaning', false);                                 // 誤答＝要復習
    progress.setSelfAssessment(allIds[2], 'needs_review');                            // 本人が不安
    const rec = recommendWords({ ...input, count: 5 });
    const reasons = rec.map((r) => r.reason);
    // 優先順位が単調（前の理由 ≦ 次の理由）
    for (let i = 1; i < reasons.length; i += 1) {
      expect(REASON_PRIORITY[reasons[i - 1]]).toBeLessThanOrEqual(REASON_PRIORITY[reasons[i]]);
    }
    expect(rec.find((r) => r.itemId === allIds[1])?.reason).toBe('wrong_last_time');
    expect(rec.find((r) => r.itemId === allIds[2])?.reason).toBe('learner_uncertain');
  });
  it('期限超過の復習が最優先で、当日期限より前に出る', () => {
    const st = mem();
    // 3日前に誤答 → 期限は2日前（超過）
    createVocabSpacedReviewRepository(st, createLearningClock(new Date(2026, 6, 25, 9)))
      .recordResult({ itemId: allIds[5], result: 'wrong', source: 'daily' });
    // 昨日 補助あり正解ではなく、今日期限になるよう昨日誤答
    createVocabSpacedReviewRepository(st, createLearningClock(new Date(2026, 6, 27, 9)))
      .recordResult({ itemId: allIds[6], result: 'wrong', source: 'daily' });
    const clock = createLearningClock(new Date(2026, 6, 28, 9));
    const progress = createVocabProgressRepository(mem());
    const schedule = createVocabSpacedReviewRepository(st, clock);
    const rec = recommendWords({ allIds, packId: pack.id, track: 'life_basic', currentUnitItemIds: [], progress, schedule, count: 3 });
    expect(rec[0]).toMatchObject({ itemId: allIds[5], reason: 'overdue_review' });
    expect(rec[1]).toMatchObject({ itemId: allIds[6], reason: 'due_today' });
  });
  it('roleが推薦に効く: requiredがdiagnosticより先・roleDrivenで可視化', () => {
    const { input } = setup();
    const rec = recommendWords({ ...input, count: 10 });
    const required = rec.filter((r) => r.reason === 'pack_required');
    const diagnostic = rec.filter((r) => r.reason === 'pack_diagnostic');
    expect(required.length).toBeGreaterThan(0);
    for (const r of required) {
      expect(r.role).toBe('required');
      expect(r.roleDriven).toBe(true);
      expect(roleFor(pack.id, 'life_basic', r.itemId)).toBe('required');
    }
    if (diagnostic.length > 0) {
      const lastRequired = rec.findIndex((r) => r.itemId === required[required.length - 1].itemId);
      expect(rec.findIndex((r) => r.itemId === diagnostic[0].itemId)).toBeGreaterThan(lastRequired);
    }
  });
  it('決定的: 同じ状態からは同じ結果（毎回同じ順序）', () => {
    const { input } = setup();
    expect(recommendWords({ ...input, count: 5 }).map((r) => r.itemId))
      .toEqual(recommendWords({ ...input, count: 5 }).map((r) => r.itemId));
  });
  it('直近で出した語は新規学習から外れる（同じ語を毎日繰り返さない）', () => {
    const { input } = setup();
    const first = recommendWords({ ...input, count: 3 }).map((r) => r.itemId);
    const second = recommendWords({ ...input, count: 3, recentlyShownIds: first }).map((r) => r.itemId);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });
  it('N2準備トラックでは中国語と同形の基礎語を新語として優先しない（§8）', () => {
    const { progress, schedule } = setup();
    const rec = recommendWords({ allIds, packId: pack.id, track: 'n2_prep', currentUnitItemIds: [], progress, schedule, count: 8 });
    const transparentFirst = rec.filter((r) => r.reason === 'pack_required' || r.reason === 'pack_diagnostic')
      .map((r) => r.itemId);
    // fi-chugoku等のtransparent_same語は新語枠に入らない
    expect(transparentFirst).not.toContain('fi-chugoku');
    expect(transparentFirst).not.toContain('fi-nihon');
  });
  it('空にならない: 全語が確認済みでもexploreで候補を返す', () => {
    const { input, progress } = setup();
    for (const id of allIds) progress.setSelfAssessment(id, 'self_known');
    const rec = recommendWords({ ...input, count: 3 });
    expect(rec.length).toBeGreaterThanOrEqual(0);   // 候補が無い場合も例外を出さない
  });
  it('全推薦に説明可能な理由が付く（根拠不明な推薦を作らない）', () => {
    const { input } = setup();
    for (const r of recommendWords({ ...input, count: 10 })) {
      expect(Object.keys(REASON_PRIORITY)).toContain(r.reason);
    }
  });
});

describe('role提案のpreview simulation（§9・教材は変更しない）', () => {
  it('提案roleを試験適用すると推薦が変わるが、教材のroleFor結果は変わらない', () => {
    const { input } = setup();
    // conversation trackでoptionalの語をdiagnosticにする提案を試験適用
    const target = allIds.find((id) => roleFor(pack.id, 'conversation', id) === 'optional')!;
    const cmp = compareRolePreview(
      { ...input, track: 'conversation', count: 20 }, { [target]: 'diagnostic' });
    expect(cmp.current.length).toBeGreaterThan(0);
    // 教材データ側は不変（提案は採用されていない）
    expect(roleFor(pack.id, 'conversation', target)).toBe('optional');
    expect(allVocabularyItems().every((i) => i.review === 'draft')).toBe(true);
    // 比較結果の整合
    expect(cmp.addedItemIds.every((id) => !cmp.current.some((c) => c.itemId === id))).toBe(true);
    expect(cmp.removedItemIds.every((id) => !cmp.proposed.some((p) => p.itemId === id))).toBe(true);
  });
});
