import { describe, it, expect } from 'vitest';
import { loadRecentN2, pushRecentN2, recommendN2 } from './n2Recent';
import type { KVStorage } from './n2Recent';

// メモリ上の擬似 localStorage（テスト用）
const memStorage = (initial: Record<string, string> = {}): KVStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
};

const KEY = 'kawabado.aiCourse.v1.n2Recent';

describe('n2Recent（続きからストア）', () => {
  it('保存が無ければ空', () => {
    expect(loadRecentN2(memStorage())).toEqual([]);
  });

  it('storageが無くても落ちない', () => {
    expect(loadRecentN2(null)).toEqual([]);
    expect(pushRecentN2('n2g-001', null)).toEqual(['n2g-001']);
  });

  it('壊れた保存値は空扱い', () => {
    expect(loadRecentN2(memStorage({ [KEY]: '{broken' }))).toEqual([]);
    expect(loadRecentN2(memStorage({ [KEY]: '"not-array"' }))).toEqual([]);
    // 配列でも文字列以外は除外
    expect(loadRecentN2(memStorage({ [KEY]: '[1, "n2g-002", null]' }))).toEqual(['n2g-002']);
  });

  it('先頭追加・重複除去・最大5件', () => {
    const s = memStorage();
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id) => pushRecentN2(id, s));
    expect(loadRecentN2(s)).toEqual(['f', 'e', 'd', 'c', 'b']); // 6件目で 'a' が落ちる
    pushRecentN2('d', s); // 既存を再閲覧 → 先頭へ
    expect(loadRecentN2(s)).toEqual(['d', 'f', 'e', 'c', 'b']);
  });

  it('おすすめ = 本文ありで未閲覧の最初の1件', () => {
    const idx = [
      { grammarId: 'g1', hasContent: false },
      { grammarId: 'g2', hasContent: true },
      { grammarId: 'g3', hasContent: true },
    ];
    expect(recommendN2(idx, [])).toBe('g2');
    expect(recommendN2(idx, ['g2'])).toBe('g3');
    expect(recommendN2(idx, ['g2', 'g3'])).toBeNull();
    expect(recommendN2([], [])).toBeNull();
  });
});
