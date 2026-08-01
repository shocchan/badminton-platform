// 層Cコンテンツの機械検査＋独立した意味レビュー（EXAM COVERAGE CLOSURE §6）。
//
// 手順（バッチごとに繰り返す）:
//   1. 機械検査   … 言語混入・重複・例文に見出し語が含まれるか・訳の形式・コピー疑い
//   2. 意味レビュー … JMdictの品詞・語義数・漢字と突き合わせ、疑わしいものは needs_human_review
//   3. active_beta … 両方を通ったものだけ出題対象へ昇格
//
// このスクリプトは**判定結果をレポートに書く**。昇格の反映はコンテンツ側の state を書き換えて行う。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/validate-vocab-content.ts [batchNo]
//       batchNo を省略すると、bank にある**全バッチ**を検査する（npm run validate:ai-course から呼ぶ形）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ALL_VOCAB_CONTENT } from '../../src/lib/aiLesson/course/adventure/vocab/content/vocabContentBank';
import type { VocabOriginalContent } from '../../src/lib/aiLesson/course/adventure/vocab/vocabContent';

const OUT = 'docs/ai-course/adventure-v2/generated';

interface JmEntry { surface: string; reading: string; pos: string[]; senseCount: number; common: boolean; aliases: string[] }

/** 中国語・日本語以外の文字が混ざっていないか（言語混入の防止） */
const FOREIGN = /[\p{Script=Cyrillic}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Hebrew}\p{Script=Greek}]/u;
const LATIN_RUN = /[A-Za-z]{3,}/;
// 「・」「ー」はカタカナブロックにあるが記号なので、かな混入の判定から外す
const KANA = /[぀-ゟ゠-ヺ]/;

interface Finding { wordId: string; surface: string; kind: string; detail: string; blocking: boolean }

const runBatch = (batchNo: number) => {
  const items = (ALL_VOCAB_CONTENT as VocabOriginalContent[]).filter((c) => c.batchNo === batchNo);
  if (items.length === 0) { console.error(`batch ${batchNo} is empty`); process.exit(2); }

  const jm: Record<string, JmEntry> = existsSync(`${OUT}/vocab-jmdict-index.json`)
    ? JSON.parse(readFileSync(`${OUT}/vocab-jmdict-index.json`, 'utf8')).entries : {};

  const findings: Finding[] = [];
  const add = (c: VocabOriginalContent, kind: string, detail: string, blocking = true) =>
    findings.push({ wordId: c.wordId, surface: c.surface, kind, detail, blocking });

  // ── 1. 機械検査 ──
  const keys = new Set<string>();
  for (const c of items) {
    const key = `${c.surface}|${c.reading}`;
    if (keys.has(key)) add(c, 'duplicate_entry', `${key} が重複`);
    keys.add(key);

    if (!c.glossZh.trim()) add(c, 'empty_gloss', '中国語訳が空');
    if (!c.exampleJa.trim() || !c.exampleZh.trim()) add(c, 'empty_example', '例文が空');

    // 例文には見出し語が入っていること（活用形・かな書きも可）
    const stem = c.surface.replace(/[うくぐすつぬぶむるいだ]$/, '');
    const readingStem = c.reading.replace(/[うくぐすつぬぶむるいだ]$/, '');
    const inExample = c.exampleJa.includes(c.surface)
      || (stem.length >= 1 && c.exampleJa.includes(stem))
      || c.exampleJa.includes(c.reading)
      || (readingStem.length >= 2 && c.exampleJa.includes(readingStem));
    if (!inExample) add(c, 'example_missing_headword', `例文に「${c.surface}」が出てこない`);

    // 言語混入（§ language integrity）: 日本語例文にラテン文字の連なりや第三言語を入れない
    if (FOREIGN.test(c.exampleJa) || FOREIGN.test(c.exampleZh) || FOREIGN.test(c.glossZh)) {
      add(c, 'foreign_script', '第三言語の文字が混入');
    }
    if (LATIN_RUN.test(c.exampleJa)) add(c, 'latin_in_japanese', `日本語例文にラテン文字: ${c.exampleJa}`);
    if (LATIN_RUN.test(c.glossZh)) add(c, 'latin_in_gloss', `訳にラテン文字: ${c.glossZh}`);

    // 中国語訳に日本語のかなが混ざっていないか（訳文が日本語のままになっていない）
    if (KANA.test(c.glossZh)) add(c, 'kana_in_gloss', `訳にかな: ${c.glossZh}`);

    // 中国語例文にかなが残っていないか（引用の「」内は許容）
    const zhWithoutQuotes = c.exampleZh.replace(/「[^」]*」/g, '');
    if (KANA.test(zhWithoutQuotes)) add(c, 'kana_in_example_zh', `中国語訳にかな: ${c.exampleZh}`, false);

    // 例文が日本語として最低限成立しているか（句点で終わる・長すぎない）
    if (!/[。？！]$/.test(c.exampleJa)) add(c, 'example_no_period', '例文が句点で終わっていない', false);
    if ([...c.exampleJa].length > 40) add(c, 'example_too_long', `例文が長い(${[...c.exampleJa].length}字)`, false);

    // 紛らわしい語に自分自身を入れない
    if (c.confusableSurfaces.includes(c.surface)) add(c, 'self_confusable', '自分自身を紛らわしい語にしている');
  }

  // ── 2. 独立した意味レビュー（辞書との突き合わせ） ──
  // 訳文そのものは他ソースから取っていないので、ここで照合するのは
  // 「品詞」「読み」「漢字の存在」といった構造情報だけ。
  // かな書きの語はJMdict索引で漢字見出しに寄っているため、読みでも引けるようにする
  const byReading = new Map<string, JmEntry>();
  for (const [key, e] of Object.entries(jm)) {
    if (!byReading.has(e.reading)) byReading.set(e.reading, e);
    const [surface] = key.split('|');
    if (!byReading.has(surface)) byReading.set(surface, e);
  }

  const reviewed: Finding[] = [];
  for (const c of items) {
    const entry = jm[`${c.surface}|${c.reading}`] ?? byReading.get(c.reading);
    if (!entry) {
      reviewed.push({
        wordId: c.wordId, surface: c.surface, kind: 'no_dictionary_entry',
        detail: `${c.surface}|${c.reading} が辞書索引に無い（読みか表記の確認が必要）`, blocking: true,
      });
      continue;
    }
    // 品詞の食い違い。辞書のほうが広い（n に加えて vs も持つ等）のは矛盾ではない。
    // **こちらが主張した品詞を辞書が持っていない**ときだけ矛盾として扱う。
    const declaredVerb = c.pos.some((p) => /^v/.test(p));
    const dictVerb = entry.pos.some((p) => /^v/.test(p));
    if (declaredVerb && !dictVerb) {
      reviewed.push({
        wordId: c.wordId, surface: c.surface, kind: 'pos_mismatch',
        detail: `動詞と書いたが辞書に動詞タグが無い（宣言=${c.pos.join('/')} 辞書=${entry.pos.slice(0, 4).join('/')}）`, blocking: true,
      });
    }
    if (c.pos.includes('adj-i') && !entry.pos.includes('adj-i')) {
      reviewed.push({
        wordId: c.wordId, surface: c.surface, kind: 'adj_type_mismatch',
        detail: `い形容詞と書いたが辞書はそうなっていない（辞書=${entry.pos.slice(0, 4).join('/')}）`, blocking: true,
      });
    }
    if (c.pos.includes('adj-na') && !entry.pos.some((p) => p === 'adj-na' || p === 'adj-no')) {
      reviewed.push({
        wordId: c.wordId, surface: c.surface, kind: 'adj_type_mismatch',
        detail: `な形容詞と書いたが辞書はそうなっていない（辞書=${entry.pos.slice(0, 4).join('/')}）`, blocking: true,
      });
    }
    // 多義語なのに senseNoteZh が無い＝どの語義の訳か分からない
    if (entry.senseCount >= 3 && !c.senseNoteZh) {
      reviewed.push({
        wordId: c.wordId, surface: c.surface, kind: 'ambiguous_sense_unmarked',
        detail: `辞書に${entry.senseCount}語義あるが senseNoteZh が無い`, blocking: false,
      });
    }
  }

  const blocking = [...findings, ...reviewed].filter((f) => f.blocking);
  const warnings = [...findings, ...reviewed].filter((f) => !f.blocking);
  const blockedIds = new Set(blocking.map((f) => f.wordId));

  const report = {
    generatedAt: new Date().toISOString(),
    batchNo,
    words: items.length,
    machineCheck: {
      findings: findings.length,
      blocking: findings.filter((f) => f.blocking).length,
      byKind: findings.reduce<Record<string, number>>((a, f) => { a[f.kind] = (a[f.kind] ?? 0) + 1; return a; }, {}),
    },
    semanticReview: {
      findings: reviewed.length,
      blocking: reviewed.filter((f) => f.blocking).length,
      byKind: reviewed.reduce<Record<string, number>>((a, f) => { a[f.kind] = (a[f.kind] ?? 0) + 1; return a; }, {}),
    },
    eligibleForActiveBeta: items.length - blockedIds.size,
    needsHumanReview: [...blockedIds],
    blocking,
    warnings,
    note: 'blocking が1件でもある語は active_beta へ昇格させない（§6）',
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/vocab-content-validation-${String(batchNo).padStart(2, '0')}.json`, JSON.stringify(report, null, 1));

  console.log(`batch${batchNo} words=${items.length} blocking=${blocking.length} warnings=${warnings.length} eligible=${report.eligibleForActiveBeta}`);
  console.log('machine', report.machineCheck.byKind);
  console.log('semantic', report.semanticReview.byKind);
  for (const f of blocking.slice(0, 40)) console.log(`  BLOCK ${f.surface} [${f.kind}] ${f.detail}`);
};

const run = () => {
  const arg = process.argv[2];
  if (arg && Number.isFinite(Number(arg))) { runBatch(Number(arg)); return; }
  // 引数なし＝bankにある全バッチ。バッチを足したのに検査から漏れる事故を防ぐ
  const batches = [...new Set((ALL_VOCAB_CONTENT as VocabOriginalContent[]).map((c) => c.batchNo))]
    .sort((a, b) => a - b);
  if (batches.length === 0) { console.error('no vocab content'); process.exit(2); }
  for (const b of batches) runBatch(b);
};

run();
