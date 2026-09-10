/**
 * 「表記|読み」→ wordId の索引（2026-09-10 Phase 3）。
 * 台帳の語彙問題キーは `vocab:表記:読み:観点` で、wordId を持たない。
 * 知識項目IDへ戻すためにここで引く。バンクは不変なのでモジュール内で1回だけ作る。
 */
import { ALL_VOCAB_CONTENT } from '../adventure/vocab/content/vocabContentBank';

let cache: Map<string, string> | null = null;

export const vocabIdIndex = (): ReadonlyMap<string, string> => {
  if (!cache) {
    cache = new Map();
    for (const c of ALL_VOCAB_CONTENT) cache.set(`${c.surface}|${c.reading}`, c.wordId);
  }
  return cache;
};
