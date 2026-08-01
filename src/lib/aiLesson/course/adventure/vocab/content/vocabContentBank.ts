// 層Cコンテンツの集約点。バッチを足すたびにここへ追加する（§6）。
import type { VocabOriginalContent } from '../vocabContent';
import { CORE_BATCH_01 } from './coreBatch01';
import { CORE_BATCH_02 } from './coreBatch02';
import { CORE_BATCH_03 } from './coreBatch03';
import { CORE_BATCH_04 } from './coreBatch04';
import { CORE_BATCH_05 } from './coreBatch05';
import { CORE_BATCH_06 } from './coreBatch06';
import { CORE_BATCH_07 } from './coreBatch07';
import { CORE_BATCH_08 } from './coreBatch08';
import { CORE_BATCH_09 } from './coreBatch09';
import { CORE_BATCH_10 } from './coreBatch10';

export const ALL_VOCAB_CONTENT: VocabOriginalContent[] = [
  ...CORE_BATCH_01, ...CORE_BATCH_02, ...CORE_BATCH_03,
  ...CORE_BATCH_04, ...CORE_BATCH_05, ...CORE_BATCH_06, ...CORE_BATCH_07, ...CORE_BATCH_08, ...CORE_BATCH_09, ...CORE_BATCH_10,
];

export const contentBySurfaceReading = (): Map<string, VocabOriginalContent> => {
  const m = new Map<string, VocabOriginalContent>();
  for (const c of ALL_VOCAB_CONTENT) m.set(`${c.surface}|${c.reading}`, c);
  return m;
};

export const contentForLevel = (level: 'N2' | 'N3'): VocabOriginalContent[] => {
  const scope = level === 'N3' ? ['N5', 'N4', 'N3'] : ['N5', 'N4', 'N3', 'N2'];
  return ALL_VOCAB_CONTENT.filter((c) => scope.includes(c.level));
};
