// 層C（独自コンテンツ）の作成対象を250語ずつ切り出す（EXAM COVERAGE CLOSURE §5・§6）。
//
// 一括生成はしない。バッチ単位で 生成 → validation → 意味レビュー → active_beta → staging smoke を回す。
// 並び順は決定的（レベル → 自社教材出現数 → 読み）。元リストの順番は使わない。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/select-core-batch.ts [batchNo]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { CanonicalVocabWord } from '../../src/lib/aiLesson/course/adventure/vocab/vocabTypes';
import { ALL_VOCAB_CONTENT } from '../../src/lib/aiLesson/course/adventure/vocab/content/vocabContentBank';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';

const OUT = 'docs/ai-course/adventure-v2/generated';
const BATCH_SIZE = 250;
const LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'];

const run = () => {
  const batchNo = Number(process.argv[2] ?? '1');
  const p = `${OUT}/vocab-canonical.json`;
  if (!existsSync(p)) { console.error('run build-canonical-vocab.ts first'); process.exit(2); }
  const bank = JSON.parse(readFileSync(p, 'utf8')) as { words: CanonicalVocabWord[] };

  // すでに独自コンテンツを持つ語（自社の既存語彙バンク＋層Cバッチ）は対象外
  const covered = new Set<string>();
  for (const v of allVocabularyItems() as unknown as Record<string, unknown>[]) {
    covered.add(`${String(v.lemma ?? '')}|${String(v.readingKana ?? '')}`);
  }
  for (const c of ALL_VOCAB_CONTENT) covered.add(`${c.surface}|${c.reading}`);

  // 助詞・助動詞・指示詞・接続詞・感動詞は語彙bankではなく文法bankの担当。
  // 語彙の独自コンテンツ（訳・例文・コロケーション）を作る対象から外し、別集計にする。
  const FUNCTION_POS = new Set([
    'prt', 'aux', 'aux-v', 'aux-adj', 'cop', 'cop-da', 'conj', 'int', 'pn',
    'adj-pn', 'pref', 'suf', 'ctr', 'unc', 'exp',
  ]);
  const isContentWord = (w: CanonicalVocabWord) => {
    const pos = w.senses[0]?.partOfSpeech ?? [];
    if (pos.length === 0) return true;   // 品詞不明は内容語として扱い、レビューで弾く
    return pos.some((t) => !FUNCTION_POS.has(t));
  };
  const functionWords = bank.words
    .filter((w) => w.priority === 'core' && !covered.has(`${w.canonicalSurface}|${w.reading}`))
    .filter((w) => !isContentWord(w));

  const pending = bank.words
    .filter((w) => w.priority === 'core')
    .filter((w) => !covered.has(`${w.canonicalSurface}|${w.reading}`))
    .filter(isContentWord)
    .sort((a, b) => {
      const la = LEVEL_ORDER.indexOf(a.independentlyAssignedLevel);
      const lb = LEVEL_ORDER.indexOf(b.independentlyAssignedLevel);
      if (la !== lb) return la - lb;
      if (b.internalOccurrences !== a.internalOccurrences) return b.internalOccurrences - a.internalOccurrences;
      return a.reading.localeCompare(b.reading, 'ja');
    });

  // 完了済みバッチの語は `covered` で既に除外されている。
  // したがって「次のバッチ」は常に pending の先頭であり、batchNo でオフセットしてはいけない
  // （オフセットすると完了済みの分だけ語が飛ばされ、埋まらない穴ができる）。
  // --offset は「まだ取り込んでいないバッチを先に切り出しておきたい」ときだけ使う。
  const offArg = process.argv.find((a) => a.startsWith('--offset='));
  const start = offArg ? Number(offArg.slice('--offset='.length)) : 0;
  const batch = pending.slice(start, start + BATCH_SIZE);

  const rows = batch.map((w) => ({
    wordId: w.wordId,
    surface: w.canonicalSurface,
    reading: w.reading,
    level: w.independentlyAssignedLevel,
    pos: w.senses[0]?.partOfSpeech ?? [],
    senseCount: w.senses.length,
    internalOccurrences: w.internalOccurrences,
    sourceFamilyCount: w.sourceFamilyCount,
  }));

  writeFileSync(`${OUT}/core-batch-${String(batchNo).padStart(2, '0')}.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    batchNo, batchSize: BATCH_SIZE,
    totalCorePending: pending.length,
    alreadyCovered: covered.size,
    functionWordsRoutedToGrammar: functionWords.length,
    functionWordSample: functionWords.slice(0, 40).map((w) => w.canonicalSurface),
    words: rows,
  }, null, 1));

  console.log(`core pending=${pending.length} covered=${covered.size} functionWords=${functionWords.length} batch${batchNo}=${batch.length}`);
  console.log(rows.map((r) => `${r.surface}(${r.reading})[${r.level}]`).join(' '));
};

run();
