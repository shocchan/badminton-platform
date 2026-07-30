// GATE① shared Supabase migration の適用実行（承認 APPLY_SHARED_SUPABASE_MIGRATIONS を前提）。
//
// print-apply-sql.mjs（貼り付け用出力）と同じ凍結checksumを共有し、
// ここでは Management API 経由で1トランザクションとして実際に適用する。
// remoteのトランザクション尊重は 2026-07-30 に失敗注入で実測済み（部分適用0）。
//
// 実行:
//   node scripts/ai-course/apply-remote-migration.mjs <1|2|3> --confirm
//   node scripts/ai-course/apply-remote-migration.mjs history --confirm
//
// 安全装置:
//   - 凍結sha256と不一致なら実行しない
//   - --confirm が無ければSQLを表示するだけ（dry run）
//   - 適用は begin; ... commit; で包む（エラー時は全体rollback）
//   - remote-sql.mjs（project ref検証・監査ログ）を経由する
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '../..');
const STEPS = {
  1: { file: 'supabase/migrations/20260728000000_ai_course_vocab_persistence.sql', version: '20260728000000', name: 'ai_course_vocab_persistence' },
  2: { file: 'supabase/migrations/20260728010000_ai_course_entitlements.sql', version: '20260728010000', name: 'ai_course_entitlements' },
  3: { file: 'supabase/migrations/20260729000000_ai_course_unit_progress.sql', version: '20260729000000', name: 'ai_course_unit_progress' },
};
const FROZEN = {
  1: '50cb55ae59bc13a3999cc3ee80c6be21394c67b30ac64588a9b6270486f8b405',
  2: 'e8d2f37c0cd292b948f2be079f169e55854c037e6ccac41ac184078ec7fb5e79',
  3: '92a5606de2efd07760e4b7fa5fe11f93b03a769c2d04666f0536c5fc383a6ee0',
};

const step = process.argv[2];
const confirm = process.argv.includes('--confirm');

let sql, label;
if (step === 'history') {
  // 履歴記録は「3本すべて成功した後」に1回だけ。db push を今後使わないための整合記録。
  sql = `insert into supabase_migrations.schema_migrations (version, name) values
  ('20260728000000','ai_course_vocab_persistence'),
  ('20260728010000','ai_course_entitlements'),
  ('20260729000000','ai_course_unit_progress')
on conflict (version) do nothing;`;
  label = 'GATE1 history record';
} else {
  const s = STEPS[step];
  if (!s) { console.error('usage: node apply-remote-migration.mjs <1|2|3|history> [--confirm]'); process.exit(2); }
  const buf = readFileSync(join(ROOT, s.file));
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== FROZEN[step]) {
    console.error(`STOP: checksum不一致\n  file=${s.file}\n  frozen=${FROZEN[step]}\n  actual=${sha}`);
    process.exit(1);
  }
  console.log(`checksum OK: ${s.file} sha256=${sha}`);
  sql = `begin;\n\n${buf.toString('utf8').trimEnd()}\n\ncommit;`;
  label = `GATE1 apply step ${step} (${s.name})`;
}

if (!confirm) {
  console.log(`--- DRY RUN (--confirm を付けると実行) --- label="${label}"`);
  console.log(sql.slice(0, 600) + (sql.length > 600 ? `\n... (${sql.length} bytes)` : ''));
  process.exit(0);
}

const tmp = join(tmpdir(), `apply-step-${step}-${Date.now()}.sql`);
writeFileSync(tmp, sql);
try {
  const out = execFileSync('node', [join(ROOT, 'scripts/ai-course/remote-sql.mjs'), '--file', tmp, '--write', '--label', label], { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error('APPLY FAILED (transaction rolled back):');
  console.error(e.stdout ?? '');
  console.error(e.stderr ?? '');
  process.exit(1);
}
