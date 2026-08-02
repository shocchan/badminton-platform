/**
 * ビルド後に dist/index.html を読み取り、worker/ を esbuild で束ねて dist/_worker.js を作る。
 *
 * 以前はテンプレート文字列で Worker を組み立てていたが、教材配信エンドポイントを
 * 足すにあたって実ファイル（worker/index.ts）へ移した。
 * 文字列の中のロジックには型もテストも効かず、機密を扱う経路には向かない。
 *
 * index.html は build 後にしか決まらないので、生成モジュールへ書き出してから束ねる。
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { build } from 'esbuild';

const indexHtml = readFileSync('dist/index.html', 'utf8');

// 生成モジュール（gitignore）。JSON.stringify で安全にエスケープする
mkdirSync('worker/generated', { recursive: true });
writeFileSync(
  'worker/generated/indexHtml.ts',
  '// 自動生成（scripts/generate-worker.mjs）。編集しない。\n' +
    `export const INDEX_HTML = ${JSON.stringify(indexHtml)};\n`,
);

await build({
  entryPoints: ['worker/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: 'dist/_worker.js',
  // minify しても安全性は上がらない（Worker は公開配信されない）。
  // 障害調査のしやすさを優先する
  minify: false,
  legalComments: 'none',
});

const bytes = statSync('dist/_worker.js').size;

// 教材が Worker bundle へ紛れ込んでいないことを生成のたびに確かめる。
// Worker は公開されないが、ここに 12MB の教材が入ると script size 上限に当たる。
//
// **キー名では判定しない。** `explanationZh:` のようなキー名は toDeliverable の
// コードそのものにも出るため、正常なビルドを落としてしまう。
// 教材の**本文**にしか出ない文字列で見る。
const workerSrc = readFileSync('dist/_worker.js', 'utf8');
const contentMarkers = ['ことになりました', 'なければならない', 'という意味の言葉はどれですか'];
const leaked = contentMarkers.filter((m) => workerSrc.includes(m));

console.log(`✅ dist/_worker.js を生成しました（${bytes.toLocaleString()} bytes）`);
if (bytes > 900_000) {
  console.warn(`⚠️ Worker が大きくなっています（${bytes.toLocaleString()} bytes）。教材の混入を確認してください`);
}
if (leaked.length > 0) {
  console.error(`❌ Worker bundle に教材データの痕跡: ${leaked.join(', ')}`);
  process.exit(1);
}
