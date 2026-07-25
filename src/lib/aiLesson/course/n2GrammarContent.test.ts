// N2文法 教材draft（Batch 1: n2g-001〜010）と問題の品質検査。
// 自動検査に通っても人間レビュー済みとは扱わない（learner非公開・approved=0）。
import { describe, it, expect } from 'vitest';
import { N2_GRAMMAR_CONTENT } from './n2GrammarContent';
import { N2_GRAMMAR_ITEMS } from './n2GrammarData';
import { mergeN2Content, learnerVisible, allQuizzes } from './courseN2Grammar';

const merged = mergeN2Content(N2_GRAMMAR_ITEMS, N2_GRAMMAR_CONTENT);
const batchIds = Object.keys(N2_GRAMMAR_CONTENT);

describe('教材draft（Batch 1）', () => {
  it('Batch 1 は10項目で、原本と同じ grammarId を指す', () => {
    expect(batchIds.length).toBe(10);
    for (const id of batchIds) expect(N2_GRAMMAR_ITEMS.some((g) => g.grammarId === id)).toBe(true);
  });
  it('合成後、Batch項目は draft で意味・中国語・接続・ニュアンスを持つ', () => {
    for (const id of batchIds) {
      const g = merged.find((x) => x.grammarId === id)!;
      expect(g.reviewStatus).toBe('draft');
      expect((g.meaningJa || '').length).toBeGreaterThan(0);
      expect((g.meaningZh || '').length).toBeGreaterThan(0);
      expect((g.connection || '').length).toBeGreaterThan(0);
      expect((g.nuanceJa || '').length).toBeGreaterThan(0);
    }
  });
  it('原本の例文を保持し、追加会話例と区別している', () => {
    for (const id of batchIds) {
      const g = merged.find((x) => x.grammarId === id)!;
      expect(g.examples.length).toBeGreaterThan(0);             // 原本
      expect((g.conversationExamples || []).length).toBeGreaterThanOrEqual(2); // 追加
      expect((g.readingExamples || []).length).toBeGreaterThanOrEqual(1);
      expect((g.listeningExamples || []).length).toBeGreaterThanOrEqual(1);
    }
  });
  it('中国語説明に日本語かなを不必要に混ぜない（「」内の文法用語は許可）', () => {
    // 方針: 文法表現・例文は日本語のままで良い（「以上は」等の引用は許可）。
    // それ以外の地の文にかなが混入していないかを確認する。
    for (const id of batchIds) {
      const g = merged.find((x) => x.grammarId === id)!;
      const stripped = (g.meaningZh || '').replace(/「[^」]*」/g, ''); // 引用した日本語文法用語を除外
      expect(/[ぁ-んァ-ヶ]/.test(stripped), `${id}: ${g.meaningZh}`).toBe(false);
    }
  });
  it('学習者には依然 approved のみ（0）。自動draftを公開しない', () => {
    expect(learnerVisible(merged).length).toBe(0);
  });
});

describe('問題（quiz）の品質検査', () => {
  const quizzes = allQuizzes(merged);
  it('Batch 1 で最低30問（10項目×3）', () => {
    expect(quizzes.length).toBeGreaterThanOrEqual(30);
  });
  it('questionId が一意', () => {
    expect(new Set(quizzes.map((q) => q.questionId)).size).toBe(quizzes.length);
  });
  it('正解indexが選択肢の範囲内・選択肢に重複がない・説明あり', () => {
    for (const q of quizzes) {
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
      expect(q.correctAnswer).toBeLessThan(q.choices.length);
      expect(new Set(q.choices).size).toBe(q.choices.length); // 重複なし
      expect(q.explanationJa.length).toBeGreaterThan(0);
      expect(q.explanationZh.length).toBeGreaterThan(0);
    }
  });
  it('全問 draft（自動生成をapprovedにしない）', () => {
    expect(quizzes.every((q) => q.reviewStatus === 'draft')).toBe(true);
  });
});

describe('類似文法リンクの整合性（自己参照・不存在なし）', () => {
  it('similarGrammarIds は実在IDを指し、自己参照しない', () => {
    const ids = new Set(N2_GRAMMAR_ITEMS.map((g) => g.grammarId));
    for (const id of batchIds) {
      const g = merged.find((x) => x.grammarId === id)!;
      for (const sid of g.similarGrammarIds || []) {
        expect(ids.has(sid)).toBe(true);
        expect(sid).not.toBe(g.grammarId);
      }
    }
  });
});
