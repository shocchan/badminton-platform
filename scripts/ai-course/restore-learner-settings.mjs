// 学習者1人分の settings をバックアップから復元する（事故対応の正準手順）。
//
// 想定事故: 「1人のlearnerの settings（adventureV2＝診断・進捗・答案用紙・面接特訓の全部）だけが
// 消えた・壊れた」。全量リストアは大げさで、手書きUPDATEは二次事故のもと（2026-08-15 監査P2）。
//
// 使い方:
//   node scripts/ai-course/restore-learner-settings.mjs --email li@id.badminton-platform.pages.dev --from 2026-08-15            # dry-run（内容確認）
//   node scripts/ai-course/restore-learner-settings.mjs --email li@id.badminton-platform.pages.dev --from 2026-08-15 --confirm  # 実行
//
// バックアップ元: ~/ai-company/backups/kawabado/<YYYY-MM-DD>/{ai_learners,auth_users}.json
// 実行経路: remote-sql.mjs --write（監査ログ・保護リスト・事前スナップショットが自動で効く。
//           実在生徒への書き込みなので --allow-protected を内部で付与する）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const confirm = argv.includes('--confirm');

const email = (arg('--email') ?? '').trim().toLowerCase();
const from = (arg('--from') ?? '').trim();
if (!email || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  console.error('usage: --email <addr> --from <YYYY-MM-DD> [--confirm]');
  process.exit(2);
}

const dir = join(homedir(), 'ai-company/backups/kawabado', from);
for (const f of ['ai_learners.json', 'auth_users.json']) {
  if (!existsSync(join(dir, f))) { console.error(`refuse: ${join(dir, f)} がありません`); process.exit(2); }
}

const users = JSON.parse(readFileSync(join(dir, 'auth_users.json'), 'utf8'));
const user = users.find((u) => (u.email ?? '').toLowerCase() === email);
if (!user) { console.error(`refuse: ${from} のバックアップに ${email} のauthユーザーが見つかりません`); process.exit(2); }

const learners = JSON.parse(readFileSync(join(dir, 'ai_learners.json'), 'utf8'));
const learner = learners.find((l) => l.user_id === user.id);
if (!learner) { console.error(`refuse: ${from} のバックアップに user_id=${user.id} の学習行がありません（その日はまだ未作成だった可能性）`); process.exit(2); }

const adv = learner.settings?.adventureV2;
console.log(`# 復元対象: ${learner.display_name}（${email} / user_id=${user.id}）`);
console.log(`# バックアップ日: ${from}  行のupdated_at: ${learner.updated_at}`);
console.log(`# adventureV2: ${adv ? `あり（mastery ${Object.keys(adv.mastery ?? {}).length}件・questLog ${Array.isArray(adv.questLog) ? adv.questLog.length : 0}件・答案用紙 ${Array.isArray(adv.answerSheets) ? adv.answerSheets.length : 0}枚）` : 'なし'}`);

if (!confirm) {
  console.log('\n# dry-run: 上記の settings で現在の行を上書きします。実行するには --confirm を付けてください');
  console.log('# 注意: 復元は「バックアップ時点へ巻き戻し」です。バックアップ以降の学習分は消えます');
  process.exit(0);
}

// settings を一時SQLファイル経由で流し込む（インラインだとエスケープ事故のもと）
const sqlPath = join(ROOT, 'scripts/ai-course/data', `restore-${from}-${email.split('@')[0]}.sql`);
const settingsJson = JSON.stringify(learner.settings).replace(/'/g, "''");
writeFileSync(sqlPath, [
  `update ai_learners set settings = '${settingsJson}'::jsonb, updated_at = now()`,
  `  where user_id = '${user.id}';`,
  `select display_name, updated_at, (settings->'adventureV2') is not null as has_v2 from ai_learners where user_id = '${user.id}';`,
].join('\n'));

const out = execFileSync('node', [join(ROOT, 'scripts/ai-course/remote-sql.mjs'),
  '--write', '--allow-protected', '--file', sqlPath,
  '--label', `restore-learner-settings: ${email} を ${from} のバックアップから復元`],
{ encoding: 'utf8' });
console.log(out);
console.log('✅ 復元完了。本人に再ログイン（またはリロード）してもらってください');
