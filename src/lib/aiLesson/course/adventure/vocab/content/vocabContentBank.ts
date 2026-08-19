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
// 2026-08-17 増補: N3 +782語 / N2 +400語（合格に必要な語彙量に足りていなかった）。
// バッチ間で重複していた18語は、先に書かれた側を残して後の側から削除済み
import { CORE_BATCH_21 } from './coreBatch21';
import { CORE_BATCH_22 } from './coreBatch22';
import { CORE_BATCH_23 } from './coreBatch23';
import { CORE_BATCH_24 } from './coreBatch24';
import { CORE_BATCH_25 } from './coreBatch25';
import { CORE_BATCH_26 } from './coreBatch26';
import { CORE_BATCH_27 } from './coreBatch27';
import { CORE_BATCH_28 } from './coreBatch28';
import { CORE_BATCH_29 } from './coreBatch29';
import { CORE_BATCH_30 } from './coreBatch30';
import { CORE_BATCH_31 } from './coreBatch31';
import { CORE_BATCH_32 } from './coreBatch32';
// 2026-08-19 増補: N2 +880語（8バッチ・batchNo 33〜40）。テーマ別に
// 社会・ニュース／仕事／生活・住まい／健康・体・感情／学び・言語／
// 移動・旅行・自然／動詞・形容詞・副詞中心／カタカナ語・時事語。
import { N2_VOCAB_BATCH_01 } from './n2VocabBatch01';
import { N2_VOCAB_BATCH_02 } from './n2VocabBatch02';
import { N2_VOCAB_BATCH_03 } from './n2VocabBatch03';
import { N2_VOCAB_BATCH_04 } from './n2VocabBatch04';
import { N2_VOCAB_BATCH_05 } from './n2VocabBatch05';
import { N2_VOCAB_BATCH_06 } from './n2VocabBatch06';
import { N2_VOCAB_BATCH_07 } from './n2VocabBatch07';
import { N2_VOCAB_BATCH_08 } from './n2VocabBatch08';

export const ALL_VOCAB_CONTENT: VocabOriginalContent[] = [
  ...CORE_BATCH_01, ...CORE_BATCH_02, ...CORE_BATCH_03,
  ...CORE_BATCH_04, ...CORE_BATCH_05, ...CORE_BATCH_06, ...CORE_BATCH_07, ...CORE_BATCH_08, ...CORE_BATCH_09, ...CORE_BATCH_10,
  ...CORE_BATCH_21, ...CORE_BATCH_22, ...CORE_BATCH_23, ...CORE_BATCH_24, ...CORE_BATCH_25, ...CORE_BATCH_26,
  ...CORE_BATCH_27, ...CORE_BATCH_28, ...CORE_BATCH_29, ...CORE_BATCH_30, ...CORE_BATCH_31, ...CORE_BATCH_32,
  ...N2_VOCAB_BATCH_01, ...N2_VOCAB_BATCH_02, ...N2_VOCAB_BATCH_03, ...N2_VOCAB_BATCH_04,
  ...N2_VOCAB_BATCH_05, ...N2_VOCAB_BATCH_06, ...N2_VOCAB_BATCH_07, ...N2_VOCAB_BATCH_08,
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
