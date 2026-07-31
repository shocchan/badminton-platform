#!/usr/bin/env node
// 自律ループ: 完了報告の数値自動収集＋ChatGPT分析用bundle生成（§67-§69）。
// 手入力を避け、git/dist/ソースから決定的に数値を取る。テスト/lint件数はログファイルから読む
// （このスクリプト自身はテストを実行しない。実行済みログのパスを引数で渡す）。
// usage: node scripts/generate-ai-course-completion-report.mjs <phaseId> [--since <commit>] [--vitest-log f] [--lint-log f]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const phaseId = args[0];
if (!phaseId) { console.error('usage: generate-ai-course-completion-report.mjs <phaseId> [--since c] [--vitest-log f] [--lint-log f] [--out dir]'); process.exit(2); }
const opt = (name, dflt = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const since = opt('--since');
const outDir = opt('--out', 'docs/ai-course/autonomous-loop');
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

// ── git ──
const branch = sh('git branch --show-current');
const latestCommit = sh('git log -1 --format=%h');
const range = since ? `${since}..HEAD` : '-10';
const commits = sh(`git log ${since ? since + '..HEAD' : '-10'} --format="%h %s"`).split('\n').filter(Boolean);
const changedFiles = since ? sh(`git diff --name-only ${since}..HEAD`).split('\n').filter(Boolean) : [];

// ── コンテンツ数（ソースから決定的に） ──
const C = 'src/lib/aiLesson/course/';
const read = (f) => readFileSync(C + f, 'utf8');
const count = (s, re) => (s.match(re) || []).length;
const basicsIds = ['foundationUnit1.ts', 'foundationItemBank.ts', 'foundationVocabBank.ts']
  .reduce((n, f) => n + count(read(f), /id: 'fi-[a-z0-9-]+'/g), 0);
const n3Ids = count(read('foundationVocabN3.ts'), /\bv\('fi-[a-z0-9-]+'/g);
const senses = count(read('foundationVocabN3.ts'), /withSenses\(/g) + count(read('vocabContentMeta.ts'), /senseId: '/g) / 2;
const levelMeta = read('vocabularyLevelMeta.ts');
const unreviewedNote = '未登録語はunreviewed扱い（levelMetaOfのフォールバック）';
const cognateExplicit = count(levelMeta, /'fi-[a-z0-9-]+': (f|a|n3)\(/g);
const chatgptReviews = count(read('vocabChatgptReview.ts'), /itemId: 'fi-/g);
const autoFixed = count(read('vocabChatgptReview.ts').split('AUTO_FIXED_ITEM_IDS')[1] || '', /'fi-[a-z0-9-]+'/g);
const manifest = read('visualAssetManifest.ts');
const importedImages = count(manifest, /\.webp'/g) / 2 || count(manifest, /filePath: '/g);

// ── bundle（dist/から） ──
let bundle = { main: null, gzipNote: 'gzipはbuildログ参照', chunks: [] };
try {
  const assets = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
  for (const f of assets) {
    const kb = Math.round(statSync(join('dist/assets', f)).size / 102.4) / 10;
    if (f.startsWith('index-')) bundle.main = `${kb}KB (${f})`;
    else if (/Vocab|vocab|Review/.test(f)) bundle.chunks.push(`${f}: ${kb}KB`);
  }
} catch { bundle = { main: 'dist未生成（npm run build後に再実行）', chunks: [] }; }

// ── テスト/lint（実行済みログから） ──
const grab = (file, re, dflt) => { try { const m = readFileSync(file, 'utf8').match(re); return m ? m[1] : dflt; } catch { return dflt; } };
const vitestLog = opt('--vitest-log');
const lintLog = opt('--lint-log');
const testCount = vitestLog ? grab(vitestLog, /Tests\s+(\d+ passed \(\d+\))/, '取得失敗') : '（--vitest-log未指定）';
const lintSummary = lintLog ? grab(lintLog, /(✖ \d+ problems \(\d+ errors?, \d+ warnings?\))/, 'lint出力にproblems行なし=0件か要確認') : '（--lint-log未指定）';

// ── Secret/PII scan（bundle対象テキストへ） ──
const scanTargets = [];
const summary = {
  phaseId, generatedAt: new Date().toISOString(), branch, latestCommit,
  commits, changedFilesCount: changedFiles.length, changedFiles: changedFiles.slice(0, 60),
  content: { basicsItems: basicsIds, n3Items: n3Ids, totalItems: basicsIds + n3Ids, cognateExplicit, unreviewedNote, chatgptReviews, autoFixedIds: autoFixed, importedImages },
  tests: testCount, lint: lintSummary, bundle,
};
const secretRe = /(sk-[a-zA-Z0-9]{16,}|eyJ[a-zA-Z0-9_-]{20,}|SUPABASE_[A-Z_]*KEY\s*=|password\s*[:=]|Bearer\s+[a-zA-Z0-9_.-]{20,})/;
const piiRe = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/;
const text = JSON.stringify(summary);
const scan = { secret: secretRe.test(text), pii: piiRe.test(text) };
if (scan.secret || scan.pii) {
  console.error('SCAN FAILED — ChatGPTへ送信禁止:', JSON.stringify(scan));
  process.exit(1);
}

// ── 出力 ──
mkdirSync(outDir, { recursive: true });
const pkgDir = opt('--pkg', null);
writeFileSync(join(outDir, `${phaseId}-report-data.json`), JSON.stringify(summary, null, 1));
if (pkgDir) {
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'build-summary.json'), JSON.stringify({ bundle, tests: testCount, lint: lintSummary }, null, 1));
  writeFileSync(join(pkgDir, 'content-summary.json'), JSON.stringify(summary.content, null, 1));
  writeFileSync(join(pkgDir, 'test-summary.json'), JSON.stringify({ tests: testCount }, null, 1));
}
console.log(JSON.stringify({ ok: true, out: join(outDir, `${phaseId}-report-data.json`), scan }, null, 1));
