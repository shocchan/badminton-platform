// 中国語フィールドの文言だけを、対応表どおりに差し替える（2026-08-22）。
//
// 使い方:
//   node scripts/ai-course/zh-text-locate.mjs <todo.json>                    … 場所の統計だけ出す
//   node scripts/ai-course/zh-text-locate.mjs <todo.json> --map <map.json> [--write]
//
// **中国語フィールドの行だけ**を書き換える。単純な全文検索置換にすると、
// 同じ文字列が日本語フィールドにもあるときにそちらまで書き換わる
// （2026-08-22 実際に起きた事故: 「こんにちは」→「「こんにちは」」、
//  meaningJa の「一概に言えない」が中国語に化けた）。
// 行の**キー名**を見て、zh 側だと分かる行だけを対象にする。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [todoPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const mapIdx = process.argv.indexOf('--map');
const mapPath = mapIdx >= 0 ? process.argv[mapIdx + 1] : null;
const WRITE = process.argv.includes('--write');

/**
 * 中国語として表示されるフィールド名（advLanguageCollect の locale='zh' と一致させる）。
 * ここに無いキーの行は**触らない**。日本語フィールドを壊さないための唯一の防波堤なので、
 * 増やすときは collect 側で本当に zh 扱いかを確かめること。
 */
const ZH_KEYS = new Set([
  'explanationZh', 'usageScene', 'nuance', 'commonMistakesZh', 'learnerFocus',
  'promptZh', 'whyWrongZh', 'whyCorrectZh', 'meaningZh', 'exampleZh', 'starterZh',
  'titleZh', 'bodyZh', 'nameZh', 'labelZh', 'descriptionZh', 'themeZh', 'summaryZh',
  'noteZh', 'questionZh', 'answerZh', 'hintZh', 'tipZh', 'feedbackZh', 'npcLineZh',
  'storyPurposeZh', 'learningThemeZh', 'goalZh', 'letterZh', 'greetZh',
]);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
};

const files = walk('src').filter((p) => !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'));
const contents = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

/** その行が「中国語フィールドの値」を持つ行か。前の行から続く連結文字列も許す */
const zhLineIndex = (lines) => {
  const flags = new Array(lines.length).fill(false);
  let carry = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const keyM = /(?:^|[\s{,])(?:'([A-Za-z0-9.]+)'|([A-Za-z0-9]+))\s*:\s*['"`]/.exec(line);
    if (keyM) {
      const key = keyM[1] ?? keyM[2];
      carry = ZH_KEYS.has(key);
    }
    flags[i] = carry;
    // 行末が閉じ括弧・カンマで終わっていれば、その値はそこで終わり
    if (carry && /['"`]\s*[,)}\]]*\s*$/.test(line) && !/\+\s*$/.test(line)) carry = false;
  }
  return flags;
};

const todo = JSON.parse(readFileSync(todoPath, 'utf8'));
const map = mapPath ? JSON.parse(readFileSync(mapPath, 'utf8')) : null;

if (!map) {
  const found = [];
  const missing = [];
  for (const row of todo) {
    const hits = files.filter((f) => contents.get(f).includes(row.text));
    if (hits.length > 0) found.push({ ...row, hits }); else missing.push(row);
  }
  console.log(`ソースに見つかった: ${found.length} / 見つからない（テンプレート等）: ${missing.length}`);
  const byFile = new Map();
  for (const r of found) for (const h of r.hits) byFile.set(h, (byFile.get(h) ?? 0) + 1);
  for (const [k, v] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(v).padStart(5), k);
  console.log('--- 見つからない例 ---');
  for (const m of missing.slice(0, 10)) console.log(`[${m.field}] ${m.itemId}: ${m.text.slice(0, 60)}`);
  process.exit(0);
}

const entries = Object.entries(map).filter(([a, b]) => a !== b)
  // 長い文から先に置換する（短い文が長い文の一部だったときに壊さない）
  .sort((a, b) => b[0].length - a[0].length);

let replaced = 0;
const changed = new Set();
const hitCount = new Map();
for (const f of files) {
  const src = contents.get(f);
  if (!entries.some(([oldText]) => src.includes(oldText))) continue;
  const lines = src.split('\n');
  const zh = zhLineIndex(lines);
  let touched = false;
  for (let i = 0; i < lines.length; i++) {
    if (!zh[i]) continue;
    for (const [oldText, newText] of entries) {
      if (!lines[i].includes(oldText)) continue;
      lines[i] = lines[i].split(oldText).join(newText);
      hitCount.set(oldText, (hitCount.get(oldText) ?? 0) + 1);
      touched = true;
    }
  }
  if (touched) { contents.set(f, lines.join('\n')); changed.add(f); }
}
replaced = hitCount.size;
if (WRITE) for (const f of changed) writeFileSync(f, contents.get(f));
console.log(`${WRITE ? '書き換え' : 'dry-run'}: ${replaced} 文 / ${changed.size} ファイル`);
const notHit = entries.filter(([o]) => !hitCount.has(o)).map(([o]) => o);
if (notHit.length > 0) {
  console.log(`中国語フィールドの行で見つからなかった: ${notHit.length}`);
  for (const t of notHit.slice(0, 12)) console.log('  -', t.slice(0, 70));
}
