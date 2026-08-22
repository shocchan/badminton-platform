// N5/N4の設問・選択肢・聴解にふりがなが全部付くかを見る点検スクリプト。
// テスト（advRubyAuto.test.ts）と同じ判定を、辞書を書き足すときに手早く回すためのもの。
//
// 使い方: ./node_modules/.bin/vite-node scripts/ai-course/check-ruby-coverage.ts
import { ALL_LISTENING_SETS } from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';
import { ALL_READING_SETS } from '../../src/lib/aiLesson/course/adventure/reading/readingBank';
import { annotateRuby, missingRuns } from '../../src/lib/aiLesson/course/adventure/advRubyAuto';

const KANJI = /[一-鿿々]/;
type Row = { setId: string; field: string; text: string };
const rows: Row[] = [];
const push = (setId: string, field: string, text: string) => {
  if (text && KANJI.test(text)) rows.push({ setId, field, text });
};
for (const s of ALL_LISTENING_SETS) {
  if (s.sourceLevel !== 'N5' && s.sourceLevel !== 'N4') continue;
  push(s.setId, 'question', s.questionJa);
  push(s.setId, 'situation', s.situationJa);
  push(s.setId, 'transcript', s.transcriptJa);
  s.choices.forEach((c, i) => push(s.setId, `choice${i}`, c.textJa));
}
for (const s of ALL_READING_SETS) {
  if (s.sourceLevel !== 'N5' && s.sourceLevel !== 'N4') continue;
  push(s.setId, 'question', s.questionJa);
  s.choices.forEach((c, i) => push(s.setId, `choice${i}`, c.textJa));
}

const missing = new Map<string, { count: number; example: string }>();
let ok = 0;
for (const r of rows) {
  if (annotateRuby(r.text) !== null) { ok++; continue; }
  for (const run of missingRuns(r.text)) {
    const cur = missing.get(run);
    missing.set(run, { count: (cur?.count ?? 0) + 1, example: cur?.example ?? `${r.setId} ${r.field}: ${r.text}` });
  }
}
console.log(`ふりがなが付いた: ${ok} / ${rows.length}`);
if (missing.size === 0) { console.log('辞書に足りない連なりはありません'); process.exit(0); }
console.log(`\n辞書に無い連なり ${missing.size}種:`);
for (const [run, v] of [...missing.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${run}\t(${v.count})\t${v.example.slice(0, 80)}`);
}
process.exit(1)
