// N2文法「続きから」導線用の最近見た項目ストア（端末ローカル・DB変更なし）。
// 180件一覧の先頭に「最近見た数件＋おすすめ1件」を出し、圧倒されずに再開できるようにする。

const KEY = 'kawabado.aiCourse.v1.n2Recent';
const MAX = 5;

/** テストで差し替えられる最小ストレージ型 */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage = (): KVStorage | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** 最近見た grammarId（新しい順・最大5件）。壊れた保存値は空扱い */
export const loadRecentN2 = (storage: KVStorage | null = defaultStorage()): string[] => {
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch { return []; }
};

/** 閲覧を記録（先頭へ・重複除去・最大5件）。private mode 等の失敗は無視 */
export const pushRecentN2 = (grammarId: string, storage: KVStorage | null = defaultStorage()): string[] => {
  const next = [grammarId, ...loadRecentN2(storage).filter((id) => id !== grammarId)].slice(0, MAX);
  try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
  return next;
};

/**
 * 「おすすめ」1件: 本文がある項目のうち、まだ最近見ていない最初の1件。
 * 決定的（並び順どおり）で、学習履歴DBに依存しない。
 */
export const recommendN2 = (
  index: { grammarId: string; hasContent: boolean }[],
  recent: string[],
): string | null => {
  const seen = new Set(recent);
  return index.find((g) => g.hasContent && !seen.has(g.grammarId))?.grammarId ?? null;
};
