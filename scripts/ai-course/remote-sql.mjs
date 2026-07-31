// shared Supabase（本番）へSQLを実行するための唯一の入口。
//
// 経緯: `supabase db push` は本リポジトリでは使用禁止（rollback-backup.md R1:
// schema_migrations の version が主キーで、日付だけのversion重複によりhistoryが壊れる）。
// CLIのDBパスワードも手元に無いため、Management API の database/query を正準経路とする。
//
// 安全装置:
//   1. project ref は supabase/.temp/project-ref と一致必須（別プロジェクトへ誤射しない）
//   2. 既定はread-only。書き込み系キーワードを含むSQLは --write を明示しない限り拒否
//   3. --write 実行は必ず監査ログへ記録（SQLのsha256・label・時刻・結果件数）
//   4. tokenは環境変数または ~/.supabase_backup_token から読み、標準出力へ出さない
//
// 使い方:
//   node scripts/ai-course/remote-sql.mjs --file path/to.sql --label "preflight"
//   node scripts/ai-course/remote-sql.mjs --sql "select 1" --label smoke
//   node scripts/ai-course/remote-sql.mjs --file mig.sql --write --label "apply vocab"
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const EXPECTED_REF = 'jdkwijdphlkrcoiggfqw';
const AUDIT = join(ROOT, 'docs/ai-course/production/remote-apply-audit.log');

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (name) => argv.includes(name);

const linkedRef = existsSync(join(ROOT, 'supabase/.temp/project-ref'))
  ? readFileSync(join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim() : '';
if (linkedRef !== EXPECTED_REF) {
  console.error(`refuse: linked project ref mismatch (linked="${linkedRef}" expected="${EXPECTED_REF}")`);
  process.exit(2);
}

const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!token) { console.error('refuse: no access token (env SUPABASE_ACCESS_TOKEN or ~/.supabase_backup_token)'); process.exit(2); }

const file = arg('--file');
const sqlText = file ? readFileSync(file.startsWith('/') ? file : join(ROOT, file), 'utf8') : arg('--sql');
if (!sqlText) { console.error('usage: --file <path> | --sql "<sql>"  [--write] [--label <text>]'); process.exit(2); }

// write判定は「文の先頭にwriteキーワードがあるか」で見る。
//   - コメント行は除く（コメント内のdropで誤検知しない）
//   - 文字列リテラルは除く（privilege_type in ('INSERT',...) のような読み取りSQLを誤検知しない）
const stripped = sqlText.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  .replace(/'(?:[^']|'')*'/g, "''");
const WRITE_RE = /(^|;)\s*(insert|update|delete|drop|create|alter|grant|revoke|truncate|comment\s+on)\b/i;
const isWrite = WRITE_RE.test(stripped);
if (isWrite && !flag('--write')) {
  console.error('refuse: write statement detected but --write not given');
  console.error(`  matched: ${stripped.match(WRITE_RE)[0]}`);
  process.exit(2);
}

const sha = createHash('sha256').update(sqlText).digest('hex');
const label = arg('--label') ?? '(no label)';

const res = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sqlText }),
});
const bodyText = await res.text();
let parsed = null;
try { parsed = JSON.parse(bodyText); } catch { /* not json */ }

const ok = res.ok;
const rowCount = Array.isArray(parsed) ? parsed.length : null;

if (isWrite) {
  appendFileSync(AUDIT, [
    new Date().toISOString(), ok ? 'OK' : `HTTP_${res.status}`, label,
    file ?? '(inline)', `sha256=${sha.slice(0, 16)}`, `rows=${rowCount ?? '-'}`,
  ].join('\t') + '\n');
}

console.log(`# ${ok ? 'OK' : `FAIL http:${res.status}`}  label="${label}"  sha256=${sha.slice(0, 16)}  write=${isWrite}`);
if (parsed !== null) console.log(JSON.stringify(parsed, null, 1));
else console.log(bodyText.slice(0, 4000));
process.exit(ok ? 0 : 1);
