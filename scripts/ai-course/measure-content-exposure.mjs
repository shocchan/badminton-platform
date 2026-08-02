#!/usr/bin/env node
// ビルド成果物に教材本文がどれだけ含まれているかを実測する（§14 A）。
//
// なぜ必要か:
//   「教材をclient bundleから外した」は、コードを読んでも確かめられない。
//   静的importを1本消しても、別の経路から同じデータが入っていれば意味がない。
//   だから**成果物そのものを測る**。この数字が0になるまでP0は解決していない。
//
// 使い方:
//   npm run build:staging
//   node scripts/ai-course/measure-content-exposure.mjs [--json]
//
// 判定（v2で精緻化）:
//   1. **教材の本文サンプル**（各バンクから採った実文字列）を含む → 教材混入で FAIL
//   2. 教材データ固有の**キー名が1ファイルに10回以上** → データ規模の混入で FAIL
//      （キー名はUIコードの `reveal.explanationJa` のような参照にも現れるため、
//        少数の出現はコードとみなす。データファイルはキーが数十〜数百回現れる）
//   3. キー名が10回未満のファイルは情報表示のみ（コード参照・合否に含めない）

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = 'dist/assets';

/** 教材データにしか現れないキー */
const CONTENT_KEYS = [
  'explanationJa', 'explanationZh',   // 問題の解説
  'correctChoiceId',                  // 正解
  'passageJa',                        // 読解本文
  'scriptJa', 'transcriptJa',         // 聴解スクリプト
  'meaningZh',                        // 語彙の訳
  'whyWrongJa',                       // 誤答の理由
  // 会話ミッション本文（courseData）
  'openingQuestion', 'hintLevels', 'naturalExample', 'usageNotesJa',
  'commonMistakes', 'followUpQuestions', 'alternateScenes',
];

/** キー出現がこの回数以上なら「データ」とみなす */
const KEY_DATA_THRESHOLD = 10;

/**
 * 教材本文そのもの（各バンクから採った実文字列）。
 * 1件でも含まれていたら教材の混入で、キー数によらず FAIL。
 */
const CONTENT_SAMPLES = [
  // 文法（N3 unit生成問題・draft）
  'ことになりました',
  'この文脈には合いません',
  // 読解・聴解（設問・選択肢の実文）
  '資料を用意して持っていく',
  '会議の時間を変える',
  // 語彙（設問の定型）
  'という意味の言葉はどれですか',
  // N2文法draft
  '約束した（　）は、守らなければならない',
  // foundation単元本文（fr-teimasu の解説から）
  'これから住む予定のように聞こえる',
  // 会話コース（courseData の mission **本文**。目次のgloss/detect正規表現と重ならない文字列を選ぶ）
  'はじめまして。お名前を教えてください',
  'いっしょに「アンディといいます」',
  'しなければならないことを言ってみましょう',
];

const listAssets = () => {
  if (!existsSync(ASSETS)) {
    console.error(`${ASSETS} がありません。先に build を実行してください。`);
    process.exit(2);
  }
  return readdirSync(ASSETS).filter((f) => f.endsWith('.js') || f.endsWith('.js.map'));
};

/**
 * 「データ定義」の出現だけを数える: `key:"..."` / `key:\`...\`` の形（**中身が空でないもの**）。
 * `x.meaningZh`（参照）・`meaningZh:e.meaningZh`（変数詰め替え）・`openingQuestion:""`
 * （目次の空欄）はデータではないので数えない。
 * minifyでクォート形が変わっても拾えるよう、`"` `'` バッククォートの3種を見る。
 */
const countDataOccurrences = (text, key) => {
  const re = new RegExp(`${key}\\s*:\\s*([\`"'])(?!\\1)`, 'g');
  return (text.match(re) ?? []).length;
};

/**
 * 会話カリキュラムの**目次**チャンクの判定。
 * 目次（courseMissionIndex.generated）は目標表現＋一行gloss（meaningZh）だけを持つ
 * メタデータで、鍵付きステージの「身につく力」表示と同等の扱いとして許可する。
 * 条件は厳密に: 固有マーカー（targetExpressionReading）があり、
 * flaggedキーが meaningZh のみで、本文サンプルが0件のときだけ。
 * 会話の本文（openingQuestion等）が1つでも入れば通常どおり FAIL する。
 */
const isMissionIndexMetadata = (text, keyCounts, samples) =>
  text.includes('targetExpressionReading')
  && samples.length === 0
  && keyCounts.every((k) => k.key === 'meaningZh');

const scan = () => {
  const failures = [];
  const codeRefs = [];
  for (const name of listAssets()) {
    const path = join(ASSETS, name);
    const text = readFileSync(path, 'utf8');
    const samples = CONTENT_SAMPLES.filter((s) => text.includes(s));
    const keyCounts = CONTENT_KEYS
      .map((k) => ({ key: k, count: countDataOccurrences(text, k) }))
      .filter((k) => k.count > 0);
    const maxKeyCount = keyCounts.reduce((m, k) => Math.max(m, k.count), 0);
    const row = {
      file: name,
      bytes: statSync(path).size,
      isSourceMap: name.endsWith('.map'),
      keys: keyCounts.map((k) => `${k.key}x${k.count}`),
      samples,
    };
    if (samples.length > 0 || maxKeyCount >= KEY_DATA_THRESHOLD) {
      if (isMissionIndexMetadata(text, keyCounts, samples)) codeRefs.push({ ...row, metadataIndex: true });
      else failures.push(row);
    } else if (keyCounts.length > 0) codeRefs.push(row);
  }
  return {
    failures: failures.sort((a, b) => b.bytes - a.bytes),
    codeRefs: codeRefs.sort((a, b) => b.bytes - a.bytes),
  };
};

const { failures, codeRefs } = scan();
const total = failures.reduce((n, r) => n + r.bytes, 0);
const mapBytes = failures.filter((r) => r.isSourceMap).reduce((n, r) => n + r.bytes, 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    chunkCount: failures.length,
    totalBytes: total,
    sourceMapBytes: mapBytes,
    passed: failures.length === 0,
    rows: failures,
    codeRefs,
  }, null, 2));
} else {
  console.log('教材本文を含む公開アセット（§14 A）\n');
  if (failures.length === 0) {
    console.log('  なし。client bundle に教材は含まれていません。');
  } else {
    for (const r of failures) {
      console.log(
        `  ${String(r.bytes).padStart(9)}  ${r.file}` +
        `${r.isSourceMap ? '  [source map]' : ''}` +
        `\n              keys: ${r.keys.join(', ') || '-'}` +
        `${r.samples.length ? `  本文: ${r.samples.join(' / ')}` : ''}`,
      );
    }
    console.log(`\n  ${failures.length} ファイル / 合計 ${total.toLocaleString()} bytes`);
    if (mapBytes > 0) console.log(`  うち source map: ${mapBytes.toLocaleString()} bytes`);
    console.log('\n  ⚠️ P0 未解決。これらは認証なしで取得できます。');
  }
  if (codeRefs.length > 0) {
    console.log(`\n  ℹ️ キー名の少数出現（コードのproperty参照・合否に含めない）: ${codeRefs.length}件`);
    for (const r of codeRefs.slice(0, 6)) {
      console.log(`     ${r.file} — ${r.keys.join(', ')}`);
    }
  }
}

process.exit(failures.length === 0 ? 0 : 1);
