// 過去にレッスンを受けてくれた人へ配る、個人専用URL（/learn/CODE）を発行する。2026-09-10。
//
// ■ なぜメールを使わないか
//   本番の Supabase は**カスタムSMTP未設定**で `rate_limit_email_sent = 2`（2通/時）。
//   招待リンク（?invite= → メール＋6桁OTP）経由では 1時間に2人しか通らない。
//   qq.com / 163.com への到達も期待できない。
//   人数が読める相手には、メールを一切使わない /learn/CODE がいちばん確実。
//
// ■ 7日間はいつ始まるか
//   **初回ログインのとき。** ここでは受講権（ai_course_access）を作らない。
//   signup_grant に free-7d / 7日 を積んでおくと、本人が初めて入って learner 行が
//   できた瞬間に ai_learners_provision_access トリガーが受講権を作る。
//   先に作ってしまうと、渡す前から7日が減っていく。
//
// ■ 安全装置（create-student-login.mjs と同じ作法）
//   - dry-run 既定。--confirm を付けたときだけ発行する
//   - project ref を照合してから動く
//   - **前提のトリガーが無ければ発行しない**（受講権が付かないまま配ると全員が入口で止まる）
//   - service_role キーは Management API から都度取得し、標準出力へ出さない
//   - パスワードは乱数で作って**表示しない**（入口はURLだけ。無くしたら再発行する）
//   - 台帳の label に人名を入れない（ai_learning_codes は用途を書く運用）
//
// 使い方:
//   node scripts/ai-course/issue-alumni-code.mjs --count 15
//   node scripts/ai-course/issue-alumni-code.mjs --count 15 --confirm
//   --prefix alumni   # ログインIDの接頭辞（既定 alumni。alumni01, alumni02, ...）
//   --days 7          # 受講権の日数（既定7）
//   --list            # 発行済みの一覧（平文コードは出ない。再発行が要る）
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

const REF = 'jdkwijdphlkrcoiggfqw';
const SUPA_URL = `https://${REF}.supabase.co`;
const ID_DOMAIN = 'id.badminton-platform.pages.dev';
/** 生徒が実際に開くドメイン（WeChatが *.pages.dev を弾くため study. を使う） */
const SITE = 'https://study.kawabado.com';
const PLAN = 'free-7d';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (n) => argv.includes(n);

const ROOT = join(import.meta.dirname, '../..');
const linked = existsSync(join(ROOT, 'supabase/.temp/project-ref'))
  ? readFileSync(join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim() : '';
if (linked !== REF) {
  console.error(`refuse: linked project ref mismatch (linked="${linked}" expected="${REF}")`);
  process.exit(2);
}

const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!token) { console.error('refuse: no access token'); process.exit(2); }

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) { console.error(`SQL失敗: ${r.status} ${await r.text()}`); process.exit(1); }
  return await r.json();
};

const learnUrl = (code, lang = 'zh') => `${SITE}/${lang}/learn/${code}`;

/**
 * 学習コードを作る。文字集合・桁数・ハッシュの取り方は
 * public.ai_generate_learning_code() / ai_admin_issue_learning_code と同じにする
 * （紛らわしい 0O1IL U を含まない30文字・12桁・正規化後の sha256 hex）。
 *
 * 240 以上のバイトを捨てるのは剰余の偏りを消すため（240 = 30*8）。
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const newLearningCode = () => {
  let out = '';
  while (out.length < 12) {
    for (const b of randomBytes(32)) {
      if (out.length >= 12) break;
      if (b < 240) out += CODE_ALPHABET[b % 30];
    }
  }
  return out;
};
const codeHash = (code) => createHash('sha256').update(code).digest('hex');

if (flag('--list')) {
  const rows = await sql(`
    select c.code_prefix, c.label, c.issued_at::date::text as issued,
           c.use_count, coalesce(c.revoked_at::text, '') as revoked,
           coalesce(u.raw_user_meta_data->>'login_id', '?') as login_id,
           case when a.user_id is null then '未ログイン'
                else a.valid_until::date::text end as until
      from public.ai_learning_codes c
      join auth.users u on u.id = c.user_id
      left join public.ai_course_access a on a.user_id = c.user_id
     where c.label like 'alumni%'
     order by c.issued_at desc limit 100`);
  if (rows.length === 0) { console.log('（まだ発行していません）'); process.exit(0); }
  for (const r of rows) {
    console.log(`${r.login_id.padEnd(10)} ${r.code_prefix}***  使用${r.use_count}回  期限:${r.until}  ${r.revoked ? '(失効)' : ''}`);
  }
  console.log('\n※ 平文コードは台帳に残らない。無くした人には再発行する');
  process.exit(0);
}

const count = Number(arg('--count') ?? 1);
const prefix = (arg('--prefix') ?? 'alumni').trim().toLowerCase();
const days = Number(arg('--days') ?? 7);

if (!Number.isInteger(count) || count < 1 || count > 50) { console.error('refuse: --count は 1〜50'); process.exit(2); }
if (!/^[a-z][a-z0-9]{1,12}$/.test(prefix)) { console.error('refuse: --prefix は英小文字はじまり・英小文字数字のみ'); process.exit(2); }
if (!Number.isInteger(days) || days < 1 || days > 60) { console.error('refuse: --days は 1〜60'); process.exit(2); }

// ── 前提の確認 ───────────────────────────────────────────────────
// トリガーが無い状態で配ると、全員が初回ログイン直後に「コースが開通していません」で止まる
const [{ has_trigger }] = await sql(
  `select exists (select 1 from pg_trigger where tgname = 'ai_learners_provision_access'
     and not tgisinternal) as has_trigger`);
if (!has_trigger) {
  console.error('refuse: トリガー ai_learners_provision_access がありません。');
  console.error('        supabase/migrations/20260910100000_ai_free_trial_invites.sql を先に適用してください。');
  console.error('        （無いまま配ると、全員が初回ログイン直後に「コースが開通していません」で止まります）');
  process.exit(2);
}
const [{ has_plan_col }] = await sql(
  `select exists (select 1 from information_schema.columns
     where table_schema='public' and table_name='ai_course_signup_grants'
       and column_name='plan_id') as has_plan_col`);
if (!has_plan_col) {
  console.error('refuse: ai_course_signup_grants.plan_id がありません（同じ migration が未適用）');
  process.exit(2);
}

// 既に使っている番号の次から採番する（何度か回しても衝突しない）
const [{ next_n }] = await sql(`
  select coalesce(max((regexp_replace(raw_user_meta_data->>'login_id', '^${prefix}', ''))::int), 0) + 1 as next_n
    from auth.users
   where raw_user_meta_data->>'login_id' ~ '^${prefix}[0-9]+$'`);
const start = Number(next_n) || 1;
const ids = Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(2, '0')}`);

if (!flag('--confirm')) {
  console.log('DRY RUN: 発行しません');
  console.log(`  発行数    : ${count}人ぶん（${ids[0]} 〜 ${ids[ids.length - 1]}）`);
  console.log(`  プラン    : ${PLAN}（AI会話0回・冒険は最初の3地域まで）`);
  console.log(`  受講権    : ${days}日 — **初回ログインから**数え始めます`);
  console.log(`  渡すもの  : ${SITE}/zh/learn/<12桁コード>（踏むだけで入れます）`);
  console.log('--confirm を付けると発行します');
  process.exit(0);
}

// service_role キーを Management API から取得（ローカル保存しない）
const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!keysRes.ok) { console.error(`refuse: api-keys取得失敗 (${keysRes.status})`); process.exit(1); }
const serviceKey = (await keysRes.json()).find((k) => k.name === 'service_role')?.api_key;
if (!serviceKey) { console.error('refuse: service_role キーが見つからない'); process.exit(1); }

const issued = [];
for (const id of ids) {
  const email = `${id}@${ID_DOMAIN}`;

  // パスワードは作るが表示しない。入口はURLだけ（無くしたら再発行）
  const createRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email, password: randomBytes(24).toString('base64url'), email_confirm: true,
      user_metadata: { login_id: id, provisioned_by: 'issue-alumni-code', provisioned_at: new Date().toISOString() },
    }),
  });
  if (!createRes.ok) { console.error(`失敗(${id}): ${createRes.status} ${await createRes.text()}`); process.exit(1); }
  const user = await createRes.json();

  // learner作成のRLS（ai_learners_insert）は grant の行を要求する。
  // ここに plan_id / access_days を積むことで、初回ログイン時に受講権が作られる
  await sql(`
    insert into public.ai_course_signup_grants
      (email, invite_id, expires_at, is_test, plan_id, access_days, channel)
    values ('${email}', null, now() + interval '2 years', false, '${PLAN}', ${days}, 'lesson_alumni')
    on conflict (email) do update
      set expires_at = excluded.expires_at, consumed_at = null,
          plan_id = excluded.plan_id, access_days = excluded.access_days,
          channel = excluded.channel`);

  // 平文はここ（発行時の標準出力）にしか出ない。台帳にはハッシュしか残らない
  const code = newLearningCode();
  await sql(`
    insert into public.ai_learning_codes (user_id, code_hash, code_prefix, label, issued_by, is_test)
    values ('${user.id}', '${codeHash(code)}', '${code.slice(0, 3)}',
            'alumni / ${id}', 'issue-alumni-code', false)`);

  issued.push({ id, code });
}

console.log(`✅ ${issued.length}人ぶん発行しました（${PLAN} / ${days}日・初回ログインから）\n`);
for (const { id, code } of issued) {
  console.log(`  ${id}  ${learnUrl(code)}`);
}
console.log('\n配り方: 1人に1本ずつ、微信でそのまま貼る。踏むだけで入れます（コード入力なし）');
console.log('注意  : 同じURLを2人に渡すと同じアカウントに入ります。誰に渡したかを手元に控えてください');
