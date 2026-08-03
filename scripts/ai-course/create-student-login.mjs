#!/usr/bin/env node
// 生徒のログインアカウントを作る（PAID STUDENT PILOT §7・§10）。
//
//   node scripts/ai-course/create-student-login.mjs \
//     --email <メール> --name <登録名> --purpose owner_pilot_test [--login-id MN-4K7Q]
//
// やること:
//   1. Supabase Auth にユーザーを作る（パスワードは6文字英数字を自動生成）
//   2. ai_course_logins に ログインID↔ユーザー の対応を入れる
//   3. ai_learners に学習者を作る
//
// **メールアドレス・登録名・パスワードは標準出力に出さない。**
// 生徒へ渡す情報は --out で指定したファイルにだけ書く（既定は ~/ 直下・600）。
// これらを commit・ログ・報告書へ載せないための決まりごと。

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generatePasswordSecure, generateLoginId, canonicalLoginId } from '../../src/lib/aiLesson/course/auth/loginCredentials.ts';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const email = arg('email');
const name = arg('name');
const purpose = arg('purpose', 'paid_student');
const wantedId = arg('login-id');
const outPath = arg('out', join(homedir(), '.ai-course-student-credentials.txt'));
const projectRef = arg('project-ref', 'zerilgowbfruzunjuhsd');
const level = arg('level', 'N3');

if (!email || !name) {
  console.error('必須: --email <メール> --name <登録名>');
  console.error('任意: --purpose owner_pilot_test|paid_student / --login-id MN-4K7Q / --out <ファイル>');
  process.exit(2);
}
if (projectRef === 'jdkwijdphlkrcoiggfqw') {
  console.error('⛔ 本番プロジェクトが指定されています。停止します。');
  process.exit(2);
}

const sbToken = readFileSync(join(homedir(), '.supabase_staging_token'), 'utf8').trim();
const SUPA = `https://${projectRef}.supabase.co`;

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
  headers: { Authorization: `Bearer ${sbToken}` },
})).json();
const service = keys.find((k) => k.name === 'service_role')?.api_key;
if (!service) { console.error('service_role キーを取得できません'); process.exit(1); }

const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const sql = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sbToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, text: await res.text() };
};

// ── 1. Auth ユーザー（メールは送らない。パスワードは配布用に生成） ──
const password = generatePasswordSecure();
const loginId = canonicalLoginId(wantedId ?? generateLoginId((max) => {
  const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % max;
}));

const existing = await (await fetch(
  `${SUPA}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, { headers: admin },
)).json();
let userId = (existing.users ?? []).find((u) => u.email === email)?.id;

if (userId) {
  const upd = await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, {
    method: 'PUT', headers: admin,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!upd.ok) { console.error('既存ユーザーの更新に失敗:', upd.status); process.exit(1); }
  console.log('既存ユーザーのパスワードを再設定しました');
} else {
  const created = await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: 'POST', headers: admin,
    body: JSON.stringify({ password, email_confirm: true, email }),
  });
  if (!created.ok) {
    console.error('ユーザー作成に失敗:', created.status, (await created.text()).slice(0, 200));
    process.exit(1);
  }
  userId = (await created.json()).id;
  console.log('Authユーザーを作成しました');
}

// ── 2. ログインID の対応 ──
const esc = (v) => String(v).replace(/'/g, "''");
const r1 = await sql(`
  insert into public.ai_course_logins (login_id, user_id, email, account_purpose, is_active)
  values ('${esc(loginId)}', '${esc(userId)}', '${esc(email)}', '${esc(purpose)}', true)
  on conflict (login_id) do update
    set user_id = excluded.user_id, email = excluded.email,
        account_purpose = excluded.account_purpose, is_active = true, updated_at = now();
`);
if (!r1.ok) { console.error('ログインID登録に失敗:', r1.text.slice(0, 300)); process.exit(1); }
console.log('ログインIDを登録しました');

// ── 3. 学習者 ──
const r2 = await sql(`
  insert into public.ai_learners (user_id, display_name, preferred_language, estimated_level,
                                  difficulty_level, current_week, is_active, hearing, settings, admin_overrides)
  values ('${esc(userId)}', '${esc(name)}', 'ja', '${esc(level)}', 2, 1, true, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
  on conflict (user_id) do update set display_name = excluded.display_name, is_active = true;
`);
if (!r2.ok) { console.error('学習者作成に失敗:', r2.text.slice(0, 300)); process.exit(1); }
console.log('学習者レコードを作成しました');

// ── 4. 配布物はファイルへ（画面には出さない） ──
const origin = arg('origin', 'https://ai-course-staging.pages.dev');
writeFileSync(outPath, [
  '# AI日本語コース ログイン情報（この内容は本人にだけ渡す・commitしない）',
  `# 生成: ${new Date().toISOString()}`,
  `# 用途: ${purpose}`,
  '',
  `ログインURL: ${origin}/ja/ai-course/login`,
  `ログインID : ${loginId}`,
  `パスワード : ${password}`,
  '',
  '※パスワードは半角英数字6文字。大文字小文字は区別しません。',
  '※忘れたときはログイン画面の「パスワードを忘れた方」から再設定できます。',
  '',
].join('\n'), { mode: 0o600 });

console.log(`\n✅ 作成しました。配布情報は ${outPath} に書きました（画面には出していません）。`);
console.log(`   ログインID: ${loginId}`);
console.log('   パスワード: （ファイルを確認してください）');
