// 教材レビューの一覧・進捗・遷移（Task 3）。
// 守りたいこと: ①判定が無い＝未確認（暗黙に確認済みにしない）②IDが安定して重複しない
// ③「次の未確認へ」が末尾で行き止まらない ④絞り込みが状態と噛み合う
import { describe, it, expect } from 'vitest';
import {
  allReviewableItems, vocabReviewItems, n2GrammarReviewItems, listeningReviewItems,
  reviewProgressOf, filterReviewItems, nextUnreviewedIndex,
  CONTENT_KIND_LABELS, type ReviewableItem, type ReviewStatus,
} from './contentReviewQueue';

const mk = (kind: ReviewableItem['kind'], id: string, category = 'x'): ReviewableItem => ({
  kind, id, title: `t-${id}`, category, fields: [{ label: 'a', value: 'v' }],
  audioPath: null, imagePath: null, sourceState: 'draft',
});
const statuses = (pairs: [string, ReviewStatus][]): Map<string, ReviewStatus> => new Map(pairs);

describe('対象一覧', () => {
  const all = allReviewableItems();

  it('語彙・N2文法・聴解がすべて載る', () => {
    expect(vocabReviewItems().length).toBeGreaterThan(100);
    expect(n2GrammarReviewItems().length).toBeGreaterThan(150);
    expect(listeningReviewItems().length).toBeGreaterThan(20);
    expect(all.length).toBe(vocabReviewItems().length + n2GrammarReviewItems().length + listeningReviewItems().length);
  });

  it('**IDが重複しない**（判定が別の教材に紐づかない）', () => {
    const keys = all.map((i) => `${i.kind}:${i.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('並び順が毎回同じ（「次の未確認へ」が安定する）', () => {
    expect(allReviewableItems().map((i) => i.id)).toEqual(all.map((i) => i.id));
  });

  it('聴解は音声パスを持つ（音を聞いて確認できる）', () => {
    expect(listeningReviewItems().every((i) => !!i.audioPath)).toBe(true);
  });

  it('表示フィールドは空文字を含まない', () => {
    for (const i of all) for (const f of i.fields) expect(f.value.length).toBeGreaterThan(0);
  });

  it('種別ラベルが3種そろっている', () => {
    expect(Object.keys(CONTENT_KIND_LABELS).sort()).toEqual(['listening', 'n2grammar', 'vocab']);
  });
});

describe('進捗', () => {
  const items = [mk('vocab', 'a'), mk('vocab', 'b'), mk('vocab', 'c')];

  it('**判定が無い項目は未確認**として数える', () => {
    expect(reviewProgressOf(items, statuses([]))).toEqual({ total: 3, reviewed: 0, needsFix: 0, unreviewed: 3 });
  });

  it('確認済み・修正必要・未確認の合計が総数と一致する', () => {
    const p = reviewProgressOf(items, statuses([['vocab:a', 'reviewed'], ['vocab:b', 'needs_fix']]));
    expect(p).toEqual({ total: 3, reviewed: 1, needsFix: 1, unreviewed: 1 });
    expect(p.reviewed + p.needsFix + p.unreviewed).toBe(p.total);
  });
});

describe('絞り込み', () => {
  const items = [mk('vocab', 'a', 'noun'), mk('n2grammar', 'b', 'N2'), mk('listening', 'c', 'N5')];
  const st = statuses([['vocab:a', 'reviewed']]);

  it('種別で絞れる', () => {
    expect(filterReviewItems({ items, statuses: st, kind: 'vocab', category: '', status: '', query: '' }).map((i) => i.id)).toEqual(['a']);
  });

  it('分類で絞れる', () => {
    expect(filterReviewItems({ items, statuses: st, kind: '', category: 'N5', status: '', query: '' }).map((i) => i.id)).toEqual(['c']);
  });

  it('**未確認で絞ると、判定の無い項目が出る**', () => {
    const r = filterReviewItems({ items, statuses: st, kind: '', category: '', status: 'unreviewed', query: '' });
    expect(r.map((i) => i.id).sort()).toEqual(['b', 'c']);
  });

  it('確認済みで絞れる', () => {
    expect(filterReviewItems({ items, statuses: st, kind: '', category: '', status: 'reviewed', query: '' }).map((i) => i.id)).toEqual(['a']);
  });

  it('本文で検索できる', () => {
    const withText = [{ ...mk('vocab', 'x'), fields: [{ label: 'l', value: '大変です' }] }];
    expect(filterReviewItems({ items: withText, statuses: new Map(), kind: '', category: '', status: '', query: '大変' })).toHaveLength(1);
    expect(filterReviewItems({ items: withText, statuses: new Map(), kind: '', category: '', status: '', query: 'ありません' })).toHaveLength(0);
  });
});

describe('次の未確認へ', () => {
  const items = [mk('vocab', 'a'), mk('vocab', 'b'), mk('vocab', 'c')];

  it('現在地の後ろにある未確認へ進む', () => {
    expect(nextUnreviewedIndex(items, statuses([['vocab:a', 'reviewed']]), 0)).toBe(1);
  });

  it('**末尾まで来たら先頭へ戻る**（行き止まりにしない）', () => {
    expect(nextUnreviewedIndex(items, statuses([['vocab:b', 'reviewed'], ['vocab:c', 'reviewed']]), 2)).toBe(0);
  });

  it('全部確認済みなら -1（進む先が無い）', () => {
    const done = statuses([['vocab:a', 'reviewed'], ['vocab:b', 'reviewed'], ['vocab:c', 'reviewed']]);
    expect(nextUnreviewedIndex(items, done, 0)).toBe(-1);
  });

  it('修正必要は「未確認」ではない（もう一度見た項目へ戻さない）', () => {
    const st = statuses([['vocab:a', 'reviewed'], ['vocab:b', 'needs_fix']]);
    expect(nextUnreviewedIndex(items, st, 0)).toBe(2);
  });
});
