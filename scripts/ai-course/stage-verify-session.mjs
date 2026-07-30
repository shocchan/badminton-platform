// staging実画面検証用の合成learnerセッション（gate-remote-rls-matrix.mjs と同じ安全方針）。
//
// - fixtureは .invalid ドメインの合成アカウント1件のみ（実在メールへ誤配信し得ない）
// - 目的: staging実画面のlearner画面（章・単元）をAIが自分で検証するための一時ログイン
// - 検証後は必ず --cleanup <userId> で撤去する（email再確認つき・cascadeでlearnerも消える）
// - セッションJSONは標準出力に出さず、scratchpadのファイルへ書く
//
// 実行:
//   node scripts/ai-course/stage-verify-session.mjs --create --out <path.json>
//   node scripts/ai-course/stage-verify-session.mjs --cleanup <userId>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REF = 'jdkwijdphlkrcoiggfqw';
const SYNTH_DOMAIN = 'kawabado-stage-verify.invalid';
const ROOT = join(import.meta.dirname, '../..');

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
const ANON = envVal('VITE_SUPABASE_ANON_KEY');
const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!API || !ANON || !token) { console.error('refuse: missing env/token'); process.exit(2); }

const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
});
const SERVICE = (await keysRes.json()).find(k => k.name === 'service_role')?.api_key;
if (!SERVICE) { console.error('refuse: no service key'); process.exit(2); }

const mgmtSql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return r.json();
};

if (process.argv.includes('--cleanup')) {
  const userId = process.argv[process.argv.indexOf('--cleanup') + 1];
  if (!/^[0-9a-f-]{36}$/.test(userId ?? '')) { console.error('refuse: invalid userId'); process.exit(2); }
  const v = await mgmtSql(`select email from auth.users where id = '${userId}'::uuid`);
  if (v[0]?.email?.endsWith(`@${SYNTH_DOMAIN}`)) {
    const r = await fetch(`${API}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    console.log(`cleanup ${userId.slice(0, 8)}*** → http:${r.status}`);
  } else {
    console.log('SKIP: 合成ドメインでないため削除しない');
  }
  const after = await mgmtSql(`select 'learners' k, count(*)::text v from public.ai_learners
    union all select 'auth_users', count(*)::text from auth.users order by 1`);
  console.log(after.map(r => `${r.k}=${r.v}`).join(' '));
  process.exit(0);
}

const outIdx = process.argv.indexOf('--out');
if (!process.argv.includes('--create') || outIdx < 0) {
  console.error('usage: --create --out <path.json> | --cleanup <userId>'); process.exit(2);
}
const outPath = process.argv[outIdx + 1];

const email = `stage-verify-${Date.now()}@${SYNTH_DOMAIN}`;
const password = `stage-${Math.random().toString(36).slice(2)}-Aa1!`;
const uRes = await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const uBody = await uRes.json();
if (!uRes.ok) { console.error(`createUser: ${uRes.status}`); process.exit(1); }

// learner行（is_test=true・ヒアリング済み扱いにして章検証へ直行できるようにする）
const lRes = await fetch(`${API}/rest/v1/ai_learners`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({
    user_id: uBody.id, display_name: 'STAGE VERIFY', is_test: true,
    estimated_level: 'N4', hearing: { done: true, source: 'stage-verify' },
  }),
});
const lBody = await lRes.json();
if (!lRes.ok) { console.error(`mkLearner: ${lRes.status} ${JSON.stringify(lBody).slice(0, 200)}`); process.exit(1); }

const sRes = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const session = await sRes.json();
if (!sRes.ok) { console.error(`signIn: ${sRes.status}`); process.exit(1); }

writeFileSync(outPath, JSON.stringify({
  storageKey: `sb-${REF}-auth-token`,
  session,
  userId: uBody.id,
  learnerId: lBody[0].id,
}, null, 1));
console.log(`created fixture user=${uBody.id.slice(0, 8)}*** learner=${lBody[0].id.slice(0, 8)}***`);
console.log(`session written to: ${outPath}（token非表示）`);
console.log(`cleanup: node scripts/ai-course/stage-verify-session.mjs --cleanup ${uBody.id}`);
