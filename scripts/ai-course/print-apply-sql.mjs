// 承認（APPLY_SHARED_SUPABASE_MIGRATIONS）後に、ダッシュボードSQL Editorへ「貼るだけ」のSQLを出力する。
// 実ファイルから読むので内容の二重管理・drift が起きない。
// 実行: node scripts/ai-course/print-apply-sql.mjs <1|2|3|history|verify>
//
// ⚠️ このスクリプトはremoteへ接続しない。標準出力に貼り付け用SQLを出すだけ。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const STEPS = {
  1: 'supabase/migrations/20260728000000_ai_course_vocab_persistence.sql',
  2: 'supabase/migrations/20260728010000_ai_course_entitlements.sql',
  3: 'supabase/migrations/20260729000000_ai_course_unit_progress.sql',
};
const FROZEN = {
  1: '50cb55ae59bc13a3999cc3ee80c6be21394c67b30ac64588a9b6270486f8b405',
  2: 'e8d2f37c0cd292b948f2be079f169e55854c037e6ccac41ac184078ec7fb5e79',
  3: '92a5606de2efd07760e4b7fa5fe11f93b03a769c2d04666f0536c5fc383a6ee0',
};

const step = process.argv[2];
if (step === 'history') {
  console.log(`-- 3本すべて成功したあとに1回だけ実行（CLIの db push を今後も使わないための履歴記録）
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260728000000','ai_course_vocab_persistence'),
  ('20260728010000','ai_course_entitlements'),
  ('20260729000000','ai_course_unit_progress')
on conflict (version) do nothing;`);
  process.exit(0);
}
if (step === 'verify') {
  console.log(readFileSync('scripts/ai-course/post-apply-verify-dashboard.sql', 'utf8'));
  process.exit(0);
}
const file = STEPS[step];
if (!file) { console.error('usage: node print-apply-sql.mjs <1|2|3|history|verify>'); process.exit(2); }

const raw = readFileSync(file, 'utf8');
const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
if (sha !== FROZEN[step]) {
  console.error(`STOP: checksum不一致\n  file=${file}\n  frozen=${FROZEN[step]}\n  actual=${sha}`);
  process.exit(1);
}
console.log(`-- ===== STEP ${step} / 3 : ${file.split('/').pop()} =====
-- sha256 ${sha}
-- 1トランザクションで実行する。エラーが出たら commit せず rollback; を実行して中止すること。
begin;

${raw.trimEnd()}

commit;`);
