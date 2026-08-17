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
//   - 2026-08-15 監査P1: CTE（with d as (delete ...)）・merge・call・do・書き込みRPCの
//     select呼び出しが素通りしていた穴を塞ぐ。文頭 with は保守的に write 扱い
//     （既存のread運用はすべて select 始まりであることを確認済み）
const stripped = sqlText.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  .replace(/'(?:[^']|'')*'/g, "''");
const WRITE_RE = /(^|;)\s*(insert|update|delete|drop|create|alter|grant|revoke|truncate|merge|call|do|with|comment\s+on)\b/i;
// select経由でも実体は書き込みのRPC（denylist方式・関数を増やしたらここへ追記）
const WRITE_RPC_RE = /\b(ai_admin_delete_utterances|ai_delete_my_utterances|ai_save_learner_settings|ai_purge_expired_utterances|ai_record_usage)\s*\(/i;
const isWrite = WRITE_RE.test(stripped) || WRITE_RPC_RE.test(stripped);
if (isWrite && !flag('--write')) {
  console.error('refuse: write statement detected but --write not given');
  console.error(`  matched: ${(stripped.match(WRITE_RE) ?? stripped.match(WRITE_RPC_RE))[0]}`);
  process.exit(2);
}

// 実在生徒の保護（2026-08-15 監査P1）: 書き込みSQLに保護対象の識別子が含まれる場合、
// --allow-protected を明示しない限り拒否する（QA掃除のemail取り違え・like一括削除の事故防止）。
// 保護リスト: scripts/ai-course/data/protected-learners.json
const PROTECTED_FILE = join(ROOT, 'scripts/ai-course/data/protected-learners.json');
if (isWrite && existsSync(PROTECTED_FILE)) {
  const prot = JSON.parse(readFileSync(PROTECTED_FILE, 'utf8'));
  const lower = sqlText.toLowerCase();
  const hit = (prot.identifiers ?? []).find((id) => lower.includes(String(id).toLowerCase()));
  // ドメイン一括パターン（like '%@id....'等）は生徒全員に当たり得るので保護対象
  const domainHit = (prot.bulkPatterns ?? []).find((p) => lower.includes(String(p).toLowerCase()));
  if ((hit || domainHit) && !flag('--allow-protected')) {
    console.error('refuse: SQL touches PROTECTED learner identifiers (real students)');
    console.error(`  matched: ${hit ?? domainHit}`);
    console.error('  再確認のうえ実行する場合のみ --allow-protected を付けてください（監査ログに記録されます）');
    process.exit(2);
  }
}

const sha = createHash('sha256').update(sqlText).digest('hex');
const label = arg('--label') ?? '(no label)';

// 事前スナップショット（2026-08-15 監査P1）: ai_learners に書くSQLは、実行前に
// 全行を退避する（1〜数行の小テーブル。事故直後に「書く直前の状態」へ戻せる）
if (isWrite && /\bai_learners\b/i.test(stripped)) {
  const snapDir = join(ROOT, 'scripts/ai-course/data/prewrite-snapshots');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(snapDir, { recursive: true });
  const snapRes = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select * from ai_learners' }),
  });
  if (!snapRes.ok) {
    console.error(`refuse: prewrite snapshot failed (http ${snapRes.status}) — ai_learnersへの書き込みは退避成功が前提`);
    process.exit(2);
  }
  const snapPath = join(snapDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-ai_learners.json`);
  writeFileSync(snapPath, await snapRes.text());
  console.error(`# prewrite snapshot: ${snapPath}`);
}

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
