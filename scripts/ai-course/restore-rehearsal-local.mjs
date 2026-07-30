// GATE⑤ 全量restore rehearsal（隔離local DB・本番非接触）。
//
// pilot-operations.md §1 に書いた正準の復元手順:
//   insert into public.<t> select * from jsonb_populate_recordset(null::public.<t>, $tag$<JSON>$tag$::jsonb)
// を、実際の日次backup JSON（~/ai-company/backups/kawabado/<date>/）に対して**そのまま実行**し、
// row countがbackupと一致することを確認する。
//
// 対象: AIコース系の全テーブル＋auth.users（backupに含まれる範囲＝id/email/meta/created_at）。
// バドミントン側テーブルは、local環境がfresh chain適用不能（R1既知問題）のためスキーマが無く
// 対象外。**その事実は結果に明示する**（隠さない）。
//
// 実行: node scripts/ai-course/restore-rehearsal-local.mjs <YYYY-MM-DD>
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const date = process.argv[2];
if (!date) { console.error('usage: node restore-rehearsal-local.mjs <YYYY-MM-DD>'); process.exit(2); }
const DIR = join(homedir(), 'ai-company/backups/kawabado', date);
if (!existsSync(DIR)) { console.error(`no backup dir: ${DIR}`); process.exit(2); }

const CONTAINER = 'supabase_db_badminton-platform';
const psql = (sql) => execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-q'],
  { input: sql, encoding: 'utf8' }).trim();

// 誤って本番に向かない: docker local containerのみを対象にする（URL接続を一切使わない）
const who = psql('select current_database()');
if (who !== 'postgres') { console.error(`refuse: unexpected db ${who}`); process.exit(2); }

// FK依存順（親→子）。backupに在ってもlocalに無い表はskipとして明示する
const ORDER = [
  'ai_config', 'ai_course_invites', 'ai_learners', 'ai_course_signup_grants',
  'ai_learning_sessions', 'ai_session_utterances', 'ai_item_progress',
  'ai_growth_snapshots', 'ai_usage_daily', 'ai_feedback', 'ai_issue_reports',
  'ai_otp_throttle', 'ai_notification_queue',
  'ai_course_entitlements', 'ai_course_unit_progress',
  'ai_course_vocab_item_progress', 'ai_course_vocab_pack_progress', 'ai_course_vocab_diagnostic_attempts',
];

const results = [];
const rec = (table, status, detail) => { results.push({ table, status, detail }); console.log(`${status.padEnd(6)} ${table}  ${detail}`); };

// ── 0) auth.users（FK先）を先に復元。backupは id/email/meta/created_at のみ＝partial by design ──
const authRows = JSON.parse(readFileSync(join(DIR, 'auth_users.json'), 'utf8'));
psql('truncate auth.users cascade;');
for (const u of authRows) {
  psql(`insert into auth.users (id, email, raw_user_meta_data, created_at, instance_id, aud, role, encrypted_password, email_confirmed_at)
    values ('${u.id}'::uuid, '${u.email.replace(/'/g, "''")}', $meta$${JSON.stringify(u.meta ?? {})}$meta$::jsonb,
      '${u.created_at}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now());`);
}
const authCount = Number(psql('select count(*) from auth.users'));
rec('auth.users', authCount === authRows.length ? 'PASS' : 'FAIL',
  `restored=${authCount}/backup=${authRows.length}（password hash等はbackup対象外＝partial by design）`);

// ── 1) 各テーブル: truncate → jsonb_populate_recordset で復元 → count照合 ──
const backupFiles = new Set(readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
for (const t of ORDER) {
  if (!backupFiles.has(t)) { rec(t, 'SKIP', 'backupに無い'); continue; }
  const exists = psql(`select count(*) from pg_tables where schemaname='public' and tablename='${t}'`) === '1';
  if (!exists) { rec(t, 'SKIP', 'local schemaに無い（R1既知: fresh chain適用不能の範囲）'); continue; }
  const rows = JSON.parse(readFileSync(join(DIR, `${t}.json`), 'utf8'));
  psql(`truncate public.${t} cascade;`);
  if (rows.length > 0) {
    // 正準手順そのもの（ドル引用符タグ・バックスラッシュなし）。
    // identity列（GENERATED ALWAYS）を持つ表は OVERRIDING SYSTEM VALUE が必須
    // （2026-07-30リハーサルで ai_session_utterances が実際に失敗して発覚 → runbookにも反映）
    const hasIdentity = psql(`select count(*) from information_schema.columns
      where table_schema='public' and table_name='${t}' and is_identity='YES' and identity_generation='ALWAYS'`) !== '0';
    const overriding = hasIdentity ? ' overriding system value' : '';
    const json = JSON.stringify(rows).replace(/\$restore\$/g, '');
    const tmp = join(tmpdir(), `restore-${t}.sql`);
    writeFileSync(tmp, `insert into public.${t}${overriding} select * from jsonb_populate_recordset(null::public.${t}, $restore$${json}$restore$::jsonb);`);
    try {
      execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
        { input: readFileSync(tmp, 'utf8'), encoding: 'utf8' });
    } catch (e) {
      rec(t, 'FAIL', `restore error: ${String(e.stderr ?? e.message).slice(0, 160)}`);
      continue;
    }
  }
  const got = Number(psql(`select count(*) from public.${t}`));
  rec(t, got === rows.length ? 'PASS' : 'FAIL', `restored=${got}/backup=${rows.length}`);
}

// ── 2) 復元後のapp必須objectの健全性（catalog） ──
const cat = psql(`select
  (select count(*) from pg_policies where schemaname='public' and (tablename like 'ai_course_vocab%' or tablename in ('ai_course_entitlements','ai_course_unit_progress')))
  || '/' || (select count(*) from pg_trigger where tgname='ai_learners_protect_admin_overrides')
  || '/' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ai_upsert_unit_progress')`);
rec('catalog(policies/trigger/rpc)', cat === '11/1/1' ? 'PASS' : 'FAIL', `actual=${cat} expected=11/1/1`);

// ── 3) restore smoke: 復元したlearnerの実データが読めて意味が通る ──
const smoke = psql(`select count(*) from public.ai_learning_sessions s join public.ai_learners l on l.id = s.learner_id`);
rec('smoke(join integrity)', Number(smoke) > 0 ? 'PASS' : 'FAIL', `joined sessions=${smoke}`);

const fails = results.filter(r => r.status === 'FAIL');
const skips = results.filter(r => r.status === 'SKIP');
console.log(`\nRESTORE REHEARSAL: PASS ${results.length - fails.length - skips.length} / SKIP ${skips.length} / FAIL ${fails.length}`);
process.exit(fails.length ? 1 : 0);
