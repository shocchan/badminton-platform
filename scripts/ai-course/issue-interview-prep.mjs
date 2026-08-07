// 帰化面接の表現特訓を learner へ発行する（CEO運用スクリプト）。
//
// 発行＝ settings.adventureV2.interviewPrep.enabledAt を立てるだけ。
// 問答バンクはアプリに内蔵（CEO自作素材）なので、答案用紙と違いJSONの用意は不要。
//
// 使い方:
//   node scripts/ai-course/issue-interview-prep.mjs --email learner@example.com --confirm
// 取り消し（本人の書いた答えは消さない。画面から見えなくなるだけ）:
//   node scripts/ai-course/issue-interview-prep.mjs --email learner@example.com --revoke --confirm
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '../..');
const RUNNER = join(ROOT, 'scripts/ai-course/remote-sql.mjs');

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const email = arg('--email');
const revoke = argv.includes('--revoke');
const confirm = argv.includes('--confirm');

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('usage: --email <addr> [--revoke] [--confirm]');
  process.exit(2);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = (query, opts = []) => {
  const tmp = join(tmpdir(), `interview-${Date.now()}.sql`);
  writeFileSync(tmp, query);
  return execFileSync('node', [RUNNER, '--file', tmp, ...opts], { encoding: 'utf8' });
};

const current = sql(`
select l.id,
       l.settings->'adventureV2'->'interviewPrep'->>'enabledAt' as enabled_at
from ai_learners l join auth.users u on u.id = l.user_id
where u.email = ${q(email)};
`);
console.log('── 対象learner ──');
console.log(current.trim());
if (!current.includes('|') || /\(0 rows\)/.test(current)) {
  console.error(`refuse: ${email} のlearnerが見つからない`);
  process.exit(1);
}

// enabledAt の付け替えだけを行い、notes/worksheet（本人の書いた答え）には触れない
const value = revoke ? 'null' : q(new Date().toISOString());
const update = `
update ai_learners l set settings = jsonb_set(
  jsonb_set(
    jsonb_set(l.settings, '{adventureV2}', coalesce(l.settings->'adventureV2', '{}'::jsonb)),
    '{adventureV2,interviewPrep}', coalesce(l.settings->'adventureV2'->'interviewPrep', '{}'::jsonb)),
  '{adventureV2,interviewPrep,enabledAt}', ${revoke ? "'null'::jsonb" : `to_jsonb(${value}::text)`})
from auth.users u where u.id = l.user_id and u.email = ${q(email)};
select '${revoke ? 'revoked' : 'issued'}' as result;
`;
if (!confirm) { console.log('\n[dry-run] --confirm で実行:'); console.log(update); process.exit(0); }
console.log(sql(update, ['--write', '--label', `interview-prep-${revoke ? 'revoke' : 'issue'}`]).trim());
console.log(revoke
  ? '\n✅ 取り消しました（本人の書いた答えは残っています。再発行すれば戻ります）。'
  : '\n✅ 発行しました。本人の成長マップに「帰化面接の表現特訓」が出ます。');
