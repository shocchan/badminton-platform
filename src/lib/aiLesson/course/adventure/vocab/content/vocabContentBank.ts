// 層Cコンテンツの集約点。バッチを足すたびにここへ追加する（§6）。
import type { VocabOriginalContent } from '../vocabContent';
import { CORE_BATCH_01 } from './coreBatch01';

export const ALL_VOCAB_CONTENT: VocabOriginalContent[] = [...CORE_BATCH_01];

export const contentBySurfaceReading = (): Map<string, VocabOriginalContent> => {
  const m = new Map<string, VocabOriginalContent>();
  for (const c of ALL_VOCAB_CONTENT) m.set(`${c.surface}|${c.reading}`, c);
  return m;
};

export const contentForLevel = (level: 'N2' | 'N3'): VocabOriginalContent[] => {
  const scope = level === 'N3' ? ['N5', 'N4', 'N3'] : ['N5', 'N4', 'N3', 'N2'];
  return ALL_VOCAB_CONTENT.filter((c) => scope.includes(c.level));
};
