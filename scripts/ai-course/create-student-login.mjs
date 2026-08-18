// 生徒のID＋パスワードアカウントを発行する（先生専用・自己登録経路なし）。
//
// 仕組み: ID `li` → 内部メール `li@id.badminton-platform.pages.dev` として
// Supabase Auth にパスワードつきユーザーを作成する（メールは一切送信されない）。
// learner行はアプリが初回ログイン時に作る（名前入力→冒険の準備の通常フロー）。
//
// 安全装置:
//   - dry-run 既定。--confirm を付けたときだけ作成
//   - ID形式を強制（英小文字はじまり・英小文字数字のみ・3〜20字）
//   - パスワードは8文字以上
//   - service_role キーは Management API から都度取得し、標準出力へ出さない
//   - `.invalid` ドメインは使わない（QA fixture専用の目印）
//
// 使い方:
//   node scripts/ai-course/create-student-login.mjs --id li --password <8文字以上>            # dry-run
//   node scripts/ai-course/create-student-login.mjs --id li --password <8文字以上> --confirm  # 作成
//   node scripts/ai-course/create-student-login.mjs --id li --password <新PW> --reset --confirm  # パスワード再設定
//   --until 2026-11-30  # 利用期限を指定（省略時は発行から6ヶ月）
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REF = 'jdkwijdphlkrcoiggfqw';
const SUPA_URL = `https://${REF}.supabase.co`;
const ID_DOMAIN = 'id.badminton-platform.pages.dev';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const id = (arg('--id') ?? '').trim().toLowerCase();
const password = arg('--password') ?? '';
const confirm = argv.includes('--confirm');
const reset = argv.includes('--reset');
// 利用期間の期限（2026-08-18 CEO指示: 発行時に必ず期間を付ける）。省略時は発行から6ヶ月
const until = arg('--until') ?? null;
if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) { console.error('refuse: --until は YYYY-MM-DD'); process.exit(2); }

if (!id || !password) {
  console.error('usage: --id <英小文字3-20> --password <8文字以上> [--confirm] [--reset]');
  process.exit(2);
}
if (!/^[a-z][a-z0-9]{1,19}$/.test(id)) { console.error('refuse: id は英小文字はじまり・英小文字数字のみ・2〜20字'); process.exit(2); }
if (password.length < 8) { console.error('refuse: パスワードは8文字以上'); process.exit(2); }

const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!token) { console.error('refuse: no access token (env SUPABASE_ACCESS_TOKEN or ~/.supabase_backup_token)'); process.exit(2); }

const email = `${id}@${ID_DOMAIN}`;

// service_role キーを Management API から取得（ローカル保存しない）
const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!keysRes.ok) { console.error(`refuse: api-keys取得失敗 (${keysRes.status})`); process.exit(1); }
const keys = await keysRes.json();
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
if (!serviceKey) { console.error('refuse: service_role キーが見つからない'); process.exit(1); }

const admin = (path, init = {}) => fetch(`${SUPA_URL}/auth/v1${path}`, {
  ...init,
  headers: {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json', ...(init.headers ?? {}),
  },
});

// 既存確認
const listRes = await admin(`/admin/users?page=1&per_page=1&filter=${encodeURIComponent(email)}`);
const listed = listRes.ok ? await listRes.json() : { users: [] };
const existing = (listed.users ?? []).find((u) => u.email === email) ?? null;

if (reset) {
  if (!existing) { console.error(`refuse: ID "${id}" のアカウントが存在しません（--reset は既存アカウント専用）`); process.exit(2); }
  if (!confirm) {
    console.log(`DRY RUN(reset): id=${id} email=${email} user_id=${existing.id} → パスワードを再設定します`);
    console.log('--confirm を付けると実行します');
    process.exit(0);
  }
  const r = await admin(`/admin/users/${existing.id}`, { method: 'PUT', body: JSON.stringify({ password }) });
  if (!r.ok) { console.error(`失敗: ${r.status} ${await r.text()}`); process.exit(1); }
  console.log(`✅ パスワード再設定: id=${id}（新しいパスワードは本人へ個別に送る）`);
  process.exit(0);
}

if (existing) { console.error(`refuse: ID "${id}" は既に存在します（再設定は --reset）`); process.exit(2); }
if (!confirm) {
  console.log(`DRY RUN: id=${id} email=${email}（内部用・メール送信なし）→ パスワードつきアカウントを作成します`);
  console.log('learner行は本人の初回ログイン時にアプリが作成（名前入力→冒険の準備）');
  console.log('--confirm を付けると作成します');
  process.exit(0);
}

// learner作成のRLS（ai_learners_insert）は signup_grants の行を要求するため、必ずセットで作る
const grantSql = `insert into public.ai_course_signup_grants (email, invite_id, expires_at, is_test)
  values ('${email}', null, now() + interval '2 years', false)
  on conflict (email) do update set expires_at = excluded.expires_at, consumed_at = null;`;
const runSql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`SQL失敗: ${r.status} ${await r.text()}`);
};

const createRes = await admin('/admin/users', {
  method: 'POST',
  body: JSON.stringify({
    email, password, email_confirm: true,
    user_metadata: { login_id: id, provisioned_by: 'create-student-login', provisioned_at: new Date().toISOString() },
  }),
});
if (!createRes.ok) { console.error(`失敗: ${createRes.status} ${await createRes.text()}`); process.exit(1); }
const user = await createRes.json();
await runSql(grantSql);
// 受講権（利用期間）。ここで付けないと、入金した生徒がID発行直後に案内画面で止まる
const untilTs = until ? `'${until}T23:59:59+09:00'::timestamptz` : `now() + interval '6 months'`;
await runSql(`insert into public.ai_course_access (user_id, valid_from, valid_until, note, granted_by)
  values ('${user.id}', now(), ${untilTs}, 'ID発行時に自動付与', 'create-student-login')
  on conflict (user_id) do update set valid_until = excluded.valid_until, updated_at = now();`);
console.log(`✅ 作成: id=${id} user_id=${user.id}（signup grant + 利用期間 ${until ?? '6ヶ月'} 付与済み）`);
console.log('本人への案内: ログイン画面で「ログインID」と初期パスワードを入力 → ログイン後に設定からパスワード変更');
