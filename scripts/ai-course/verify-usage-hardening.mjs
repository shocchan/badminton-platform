// ai_usage_daily 二層防御（2026-08-17 総監査P1）の実測検証。
//
// gate-remote-sync-e2e.mjs と同じ安全方針（.invalid合成fixture・前後件数一致・撤去）で、
// 加算専用RPC ai_record_usage と直接書き込み遮断を本番Supabaseに対して実測する。
//
// 実行:
//   node scripts/ai-course/verify-usage-hardening.mjs --confirm-remote --phase pre   # revoke前
//   node scripts/ai-course/verify-usage-hardening.mjs --confirm-remote --phase post  # revoke後
// pre:  RPCの加算・クランプ・本人限定と、直接upsertがまだ通る（=脆弱性の実在）ことを記録
// post: 直接insert/updateが42501で塞がれ、RPC・selectは引き続き動くことを確認
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const REF = 'jdkwijdphlkrcoiggfqw';
const SYNTH_DOMAIN = 'kawabado-usage-verify.invalid';
const ROOT = join(import.meta.dirname, '../..');

if (!process.argv.includes('--confirm-remote')) {
  console.error('refuse: --confirm-remote が必要（本番プロジェクトに合成fixtureを作成します）');
  process.exit(2);
}
const phaseIdx = process.argv.indexOf('--phase');
const PHASE = phaseIdx >= 0 ? process.argv[phaseIdx + 1] : '';
if (PHASE !== 'pre' && PHASE !== 'post') { console.error('usage: --phase pre|post'); process.exit(2); }

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
const ANON = envVal('VITE_SUPABASE_ANON_KEY');
if (!API || /localhost|127\.0\.0\.1/.test(API)) { console.error(`refuse: not remote: ${API}`); process.exit(2); }

const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!token) { console.error('refuse: no management token'); process.exit(2); }

const mgmtSql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`mgmt sql: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
});
const SERVICE = (await keysRes.json()).find(k => k.name === 'service_role')?.api_key;
if (!SERVICE) { console.error('refuse: service_role key unavailable'); process.exit(2); }
console.log('keys loaded (not displayed)');

const results = [];
const check = (id, desc, expected, actual) => {
  const e = String(expected), a = String(actual);
  results.push({ id, desc, expected: e, actual: a, pass: e === a });
  console.log(`${e === a ? 'PASS' : 'FAIL'}  ${id}  ${desc}  expected=${e} actual=${a}`);
};

// サーバ側と同じ「今日」（Asia/Tokyo）
const JST_TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

const fixture = {};
const PASSWORD = `usage-verify-${Math.random().toString(36).slice(2)}-Aa1!`;

const readRow = async (learnerId) => {
  const r = await mgmtSql(`select sessions_count::text s, seconds_used::text sec, estimated_cost_usd::text c
    from public.ai_usage_daily where learner_id='${learnerId}'::uuid and usage_date='${JST_TODAY}'`);
  return r[0] ? `${r[0].s}|${r[0].sec}|${r[0].c}` : '(no row)';
};

try {
  const before = await mgmtSql(`select 'learners' k, count(*)::text v from public.ai_learners
    union all select 'auth_users', count(*)::text from auth.users order by 1`);
  console.log(`before: ${before.map(r => `${r.k}=${r.v}`).join(' ')}`);

  // fixture: learnerあり1人 + learnerなし1人（no_learner経路の確認用）
  const mkUser = async (email) => {
    const r = await fetch(`${API}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, email_confirm: true,
        user_metadata: { temporary_qa: true, purpose: 'usage-hardening-verify' } }),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(`createUser: ${r.status} ${JSON.stringify(b).slice(0, 200)}`);
    return b.id;
  };
  const ts = Date.now();
  fixture.email = `usage-verify-${ts}@${SYNTH_DOMAIN}`;
  fixture.userId = await mkUser(fixture.email);
  fixture.email2 = `usage-verify-nolearner-${ts}@${SYNTH_DOMAIN}`;
  fixture.userId2 = await mkUser(fixture.email2);

  const lRes = await fetch(`${API}/rest/v1/ai_learners`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: fixture.userId, display_name: 'USAGE VERIFY', is_test: true }),
  });
  const lBody = await lRes.json();
  if (!lRes.ok) throw new Error(`mkLearner: ${lRes.status} ${JSON.stringify(lBody).slice(0, 200)}`);
  const L = lBody[0].id;
  fixture.learnerId = L;
  console.log(`fixture learner=${L.slice(0, 8)}***`);

  const signIn = async (email) => {
    const c = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`signIn: ${error.message}`);
    return c;
  };
  const c = await signIn(fixture.email);

  // ── 共通: RPCの基本動作（pre/post両方で成立すべき） ──
  const r1 = await c.rpc('ai_record_usage', { p_seconds: 120, p_cost_usd: 0.05 });
  check('U01', 'RPCで120秒/$0.05を記録できる', 'true|null', `${r1.data?.ok}|${r1.error?.code ?? null}`);
  check('U02', '行が加算される（sessions_countは触らない）', '0|120|0.05', await readRow(L));

  const r2 = await c.rpc('ai_record_usage', { p_seconds: 60, p_cost_usd: 0.01 });
  check('U03', '2回目のRPCも加算（上書きでない）', 'true', r2.data?.ok);
  check('U04', '120+60=180秒/$0.06', '0|180|0.06', await readRow(L));

  const r3 = await c.rpc('ai_record_usage', { p_seconds: 99999, p_cost_usd: 50 });
  check('U05', '桁違いの注入はクランプされる（+240秒/+$1が上限）', 'true', r3.data?.ok);
  check('U06', '180+240=420秒/$0.06+$1=$1.06', '0|420|1.06', await readRow(L));

  const r4 = await c.rpc('ai_record_usage', { p_seconds: -500, p_cost_usd: -5 });
  check('U07', '負値（減算の試み）はnoop', 'noop', r4.data?.code);
  check('U08', '減算されていない', '0|420|1.06', await readRow(L));

  const c2 = await signIn(fixture.email2);
  const r5 = await c2.rpc('ai_record_usage', { p_seconds: 120, p_cost_usd: 0.05 });
  check('U09', 'learner行が無いユーザーはno_learner', 'no_learner', r5.data?.code);

  // ── 直接書き込み（攻撃経路）: preでは通ってしまう=脆弱性の実在記録、postでは42501 ──
  const atk1 = await c.from('ai_usage_daily').upsert({
    learner_id: L, usage_date: JST_TODAY,
    sessions_count: 0, seconds_used: 0, estimated_cost_usd: 0,
  }, { onConflict: 'learner_id,usage_date' });
  const atk1Code = atk1.error?.code ?? 'ok';
  if (PHASE === 'pre') {
    check('A01', '【脆弱性の実在】直接upsertで利用量を0へ上書きできてしまう', 'ok|0|0|0',
      `${atk1Code}|${await readRow(L)}`);
    // 記録をRPCで積み直す（後続チェックの基準値）
    await c.rpc('ai_record_usage', { p_seconds: 120, p_cost_usd: 0.05 });
    check('A02', 'RPCで積み直し', '0|120|0.05', await readRow(L));
  } else {
    check('A01', '直接upsertは42501（grant層で遮断）', '42501', atk1Code);
    check('A02', '行は変わっていない', '0|420|1.06', await readRow(L));
    const atk2 = await c.from('ai_usage_daily').update({ seconds_used: 0 })
      .eq('learner_id', L).eq('usage_date', JST_TODAY);
    check('A03', '直接updateも42501', '42501', atk2.error?.code ?? 'ok');
    const sel = await c.from('ai_usage_daily').select('seconds_used')
      .eq('learner_id', L).eq('usage_date', JST_TODAY).maybeSingle();
    check('A04', '本人のselectは引き続き読める（残量表示用）', '420', sel.data?.seconds_used);
  }
} finally {
  console.log('\n--- cleanup ---');
  for (const uid of [fixture.userId, fixture.userId2]) {
    if (!uid) continue;
    const v = await mgmtSql(`select email from auth.users where id = '${uid}'::uuid`);
    if (v[0]?.email?.endsWith(`@${SYNTH_DOMAIN}`)) {
      const r = await fetch(`${API}/auth/v1/admin/users/${uid}`, {
        method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      console.log(`removed fixture ${uid.slice(0, 8)}*** → http:${r.status}`);
    } else { console.log(`SKIP cleanup ${String(uid).slice(0, 8)}***: email mismatch`); }
  }
  const after = await mgmtSql(`select 'learners' k, count(*)::text v from public.ai_learners
    union all select 'auth_users', count(*)::text from auth.users
    union all select 'usage_rows', count(*)::text from public.ai_usage_daily order by 1`);
  console.log(`after: ${after.map(r => `${r.k}=${r.v}`).join(' ')}`);
}

const fails = results.filter(r => !r.pass);
console.log(`\nTOTAL ${results.length}  PASS ${results.length - fails.length}  FAIL ${fails.length}`);
process.exit(fails.length ? 1 : 0);
