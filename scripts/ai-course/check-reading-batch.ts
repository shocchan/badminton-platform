// 新規読解バッチの自己検査（advReading.test.ts が見る条件を、書いた直後に確かめる）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/check-reading-batch.ts <モジュールパス> <export名>
import { stripRuby } from '../../src/components/ai-course/adventure/advRubySegment';
import type { ReadingSet } from '../../src/lib/aiLesson/course/adventure/reading/readingTypes';

const [modPath, exportName] = process.argv.slice(2);
const abs = modPath.startsWith('/') ? modPath : `${process.cwd()}/${modPath}`;
const mod: Record<string, unknown> = await import(/* @vite-ignore */ abs);
const sets = mod[exportName] as ReadingSet[];
if (!Array.isArray(sets)) { console.error('配列が見つからない:', exportName); process.exit(1); }

const KANA = /[ぁ-んァ-ヶ]/;
const norm = (s: string) => s.replace(/\n/g, '');
const errs: string[] = [];
const push = (id: string, msg: string) => errs.push(`${id}: ${msg}`);

for (const s of sets) {
  const correct = s.choices.find((c) => c.isCorrect);
  if (s.choices.length !== 4) push(s.setId, `選択肢が${s.choices.length}個`);
  if (s.choices.filter((c) => c.isCorrect).length !== 1) push(s.setId, '正解が1つでない');
  if (new Set(s.choices.map((c) => c.textJa)).size !== 4) push(s.setId, '選択肢が重複');
  if (!norm(s.passageJa).includes(norm(s.rationaleSpan))) push(s.setId, `rationaleSpanが本文に無い: "${s.rationaleSpan.slice(0, 24)}"`);
  if (correct && s.questionJa.includes(correct.textJa)) push(s.setId, '正解が設問に漏れている');
  for (const c of s.choices.filter((x) => !x.isCorrect)) {
    if (!c.whyWrongJa) push(s.setId, `${c.choiceId}: whyWrongJaが無い`);
    if (!c.whyWrongZh) push(s.setId, `${c.choiceId}: whyWrongZhが無い（N5/N4は必須）`);
    // 本テストは whyWrongZh については**引用も含めて**かなを許さない（advReading.test.ts）
    else if (KANA.test(c.whyWrongZh)) push(s.setId, `${c.choiceId}: whyWrongZhにかなが混入`);
  }
  const lens = s.choices.map((c) => c.textJa.length);
  const ratio = Math.max(...lens) / Math.min(...lens);
  if (ratio > 3.2) push(s.setId, `選択肢の長さ比 ${ratio.toFixed(2)} > 3.2`);
  if (/[A-Za-z]{3,}/.test(s.passageJa)) push(s.setId, '本文にラテン文字の語');
  // 「」内は日本語の引用として許される（読解の解説では原文を示す必要がある）
  const deq = (t: string) => t.replace(/「[^」]*」/g, '');
  if (KANA.test(deq(s.contextZh)) || KANA.test(deq(s.explanationZh))) push(s.setId, 'zh側にかなが混入（引用外）');
  // 本文との逐語一致（文字列照合で解けないこと）
  const p = norm(s.passageJa);
  const verbatim = s.choices.filter((c) => p.includes(norm(c.textJa)));
  if (correct && p.includes(norm(correct.textJa)) && verbatim.length < 2) {
    push(s.setId, '正解だけが本文に逐語一致（照合だけで解ける）');
  }
  // ルビ
  const ruby = (s as ReadingSet & { rubyJa?: string }).rubyJa;
  if (!ruby) push(s.setId, 'rubyJaが無い（N5/N4は必要）');
  else if (stripRuby(ruby) !== s.passageJa) {
    const a = stripRuby(ruby); const b = s.passageJa;
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    push(s.setId, `ルビを剥がすと本文と不一致（${i}文字目付近）\n    ruby側: ...${a.slice(Math.max(0, i - 12), i + 12)}\n    本文側: ...${b.slice(Math.max(0, i - 12), i + 12)}`);
  }
}

// 長さバイアス
const uniqueLongest = sets.filter((s) => {
  const l = s.choices.map((c) => c.textJa.length);
  const i = s.choices.findIndex((c) => c.isCorrect);
  return l[i] === Math.max(...l) && l.filter((x) => x === Math.max(...l)).length === 1;
}).length;
const uniqueShortest = sets.filter((s) => {
  const l = s.choices.map((c) => c.textJa.length);
  const i = s.choices.findIndex((c) => c.isCorrect);
  return l[i] === Math.min(...l) && l.filter((x) => x === Math.min(...l)).length === 1;
}).length;

console.log(`セット数: ${sets.length}`);
console.log(`唯一最長=正解: ${uniqueLongest}/${sets.length} (${Math.round(uniqueLongest / sets.length * 100)}%)`);
console.log(`唯一最短=正解: ${uniqueShortest}/${sets.length} (${Math.round(uniqueShortest / sets.length * 100)}%)`);
if (errs.length === 0) console.log('✅ 検査OK');
else { console.log(`❌ ${errs.length}件\n` + errs.map((e) => '  - ' + e).join('\n')); process.exit(1); }
