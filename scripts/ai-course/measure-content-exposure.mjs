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
// 判定は「教材データ固有のキー」で行う。最小化しても**データのキー名は残る**ため、
// コードの識別子と違って圧縮で消えない。

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = 'dist/assets';

/**
 * 教材データにしか現れないキー。
 * コンポーネントのpropsや型名と重ならないものを選ぶ（誤検出を避ける）。
 */
const CONTENT_KEYS = [
  'explanationJa', 'explanationZh',   // 問題の解説
  'correctChoiceId',                  // 正解
  'passageJa',                        // 読解本文
  'scriptJa',                         // 聴解スクリプト
  'meaningZh',                        // 語彙の訳
];

/** 教材本文そのもの。キーではなく中身が入っていないかを見る */
const CONTENT_SAMPLES = [
  'ことになりました',
  'なければならない',
];

const listAssets = () => {
  if (!existsSync(ASSETS)) {
    console.error(`${ASSETS} がありません。先に build を実行してください。`);
    process.exit(2);
  }
  return readdirSync(ASSETS).filter((f) => f.endsWith('.js') || f.endsWith('.js.map'));
};

const scan = () => {
  const rows = [];
  for (const name of listAssets()) {
    const path = join(ASSETS, name);
    const text = readFileSync(path, 'utf8');
    const hits = CONTENT_KEYS.filter((k) => text.includes(`"${k}"`) || text.includes(`${k}:`));
    const samples = CONTENT_SAMPLES.filter((s) => text.includes(s));
    if (hits.length === 0 && samples.length === 0) continue;
    rows.push({
      file: name,
      bytes: statSync(path).size,
      isSourceMap: name.endsWith('.map'),
      keys: hits,
      samples,
    });
  }
  return rows.sort((a, b) => b.bytes - a.bytes);
};

const rows = scan();
const total = rows.reduce((n, r) => n + r.bytes, 0);
const mapBytes = rows.filter((r) => r.isSourceMap).reduce((n, r) => n + r.bytes, 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    chunkCount: rows.length,
    totalBytes: total,
    sourceMapBytes: mapBytes,
    passed: rows.length === 0,
    rows,
  }, null, 2));
} else {
  console.log('教材本文を含む公開アセット（§14 A）\n');
  if (rows.length === 0) {
    console.log('  なし。client bundle に教材は含まれていません。');
  } else {
    for (const r of rows) {
      console.log(
        `  ${String(r.bytes).padStart(9)}  ${r.file}` +
        `${r.isSourceMap ? '  [source map]' : ''}` +
        `\n              keys: ${r.keys.join(', ') || '-'}` +
        `${r.samples.length ? `  本文: ${r.samples.join(', ')}` : ''}`,
      );
    }
    console.log(`\n  ${rows.length} ファイル / 合計 ${total.toLocaleString()} bytes`);
    if (mapBytes > 0) console.log(`  うち source map: ${mapBytes.toLocaleString()} bytes`);
    console.log('\n  ⚠️ P0 未解決。これらは認証なしで取得できます。');
  }
}

// 0 でなければ非ゼロ終了。CIやビルド後の確認で気づけるようにする
process.exit(rows.length === 0 ? 0 : 1);
