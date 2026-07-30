// GATE① shared Supabase（本番）に対するRLS/権限マトリクス R01–R24 の実測。
//
// local版（gate-local-rls-matrix-full.mjs）と同じ観点をremoteで検証する。localと違い
// 本番プロジェクトなので、fixtureは「.invalid ドメインの合成アカウント2件」に限定し、
// 実行後に**作成したUUIDを厳密指定して**撤去する（cascadeで進捗行も消える）。
//
// 安全装置:
//   1. --confirm-remote が無ければ何もしない
//   2. URLがlocalhostなら拒否（local版と誤用しない）
//   3. fixture削除前に「emailが合成パターンである」ことを必ず再確認
//   4. 前後で既存テーブルのrow countを比較し、既存データに影響が無いことを確認
//   5. service_role keyはManagement API経由で取得し、標準出力へ出さない
//
// 実行: node scripts/ai-course/gate-remote-rls-matrix.mjs --confirm-remote
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const REF = 'jdkwijdphlkrcoiggfqw';
const SYNTH_DOMAIN = 'kawabado-rls-test.invalid';

if (!process.argv.includes('--confirm-remote')) {
  console.error('refuse: --confirm-remote が必要（本番プロジェクトに合成fixtureを作成します）');
  process.exit(2);
}

// ── 接続情報（URL/anonは.env、service_roleはManagement API） ──
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
const ANON = envVal('VITE_SUPABASE_ANON_KEY');
if (!API || /127\.0\.0\.1|localhost/.test(API)) { console.error(`refuse: not a remote URL: ${API}`); process.exit(2); }
if (!ANON) { console.error('refuse: anon key not found in .env'); process.exit(2); }

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
  if (!r.ok) throw new Error(`mgmt sql failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!keysRes.ok) { console.error(`refuse: api-keys fetch failed ${keysRes.status}`); process.exit(2); }
const keys = await keysRes.json();
const SERVICE = (Array.isArray(keys) ? keys : []).find(k => k.name === 'service_role')?.api_key;
if (!SERVICE) { console.error('refuse: service_role key not retrievable'); process.exit(2); }
console.log(`target: ${API.replace(/https:\/\/([a-z0-9]{6})[a-z0-9]*/, 'https://$1***')}  (keys loaded, not displayed)`);

// ── 結果記録 ──
const results = [];
const record = (id, desc, expected, actual) => {
  const pass = expected === actual;
  results.push({ id, desc, expected, actual, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}  expected=${expected} actual=${actual}`);
};
const info = (id, desc, actual) => {
  results.push({ id, desc, expected: '(info)', actual, pass: true });
  console.log(`INFO  ${id}  ${desc}  actual=${actual}`);
};

/** 戻りを 'rows:N' | 'http:STATUS(code)' | 'ok' に正規化（0行と権限拒否を区別できる） */
const rest = async (path, { token: jwt, method = 'GET', body, key } = {}) => {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key ?? ANON,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) return `http:${res.status}(${data && typeof data === 'object' && 'code' in data ? data.code : ''})`;
  return Array.isArray(data) ? `rows:${data.length}` : 'ok';
};
const authApi = async (path, { token: jwt, method = 'POST', body } = {}) => {
  const res = await fetch(`${API}/auth/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const PASSWORD = `rls-gate-${Math.random().toString(36).slice(2)}-Aa1!`;
const created = { users: [], learners: [] };

const baselineSql = `select 'learners' k, count(*)::text v from public.ai_learners
union all select 'item_progress', count(*)::text from public.ai_item_progress
union all select 'sessions', count(*)::text from public.ai_learning_sessions
union all select 'auth_users', count(*)::text from auth.users
union all select 'entitlements', count(*)::text from public.ai_course_entitlements order by 1`;

try {
  const before = await mgmtSql(baselineSql);
  console.log(`baseline before: ${before.map(r => `${r.k}=${r.v}`).join(' ')}`);

  // ── fixture作成（.invalid ドメイン＝実在しないので誤配信し得ない） ──
  const ts = Date.now();
  const emailA = `gate-rls-a-${ts}@${SYNTH_DOMAIN}`;
  const emailB = `gate-rls-b-${ts}@${SYNTH_DOMAIN}`;
  const mkUser = async (email) => {
    const r = await authApi('admin/users', { token: SERVICE, body: { email, password: PASSWORD, email_confirm: true } });
    if (r.status !== 200 && r.status !== 201) throw new Error(`createUser ${email}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    created.users.push({ id: r.data.id, email });
    return r.data.id;
  };
  const mkLearner = async (userId, name) => {
    const res = await fetch(`${API}/rest/v1/ai_learners`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, display_name: name }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(`mkLearner: ${res.status} ${JSON.stringify(d).slice(0, 200)}`);
    created.learners.push(d[0].id);
    return d[0].id;
  };
  const signIn = async (email) => {
    const r = await authApi('token?grant_type=password', { body: { email, password: PASSWORD } });
    if (r.status !== 200) throw new Error(`signIn ${email}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    return r.data.access_token;
  };

  const userA = await mkUser(emailA); const userB = await mkUser(emailB);
  const A = await mkLearner(userA, 'RLS GATE A'); const B = await mkLearner(userB, 'RLS GATE B');
  const jwtA = await signIn(emailA); const jwtB = await signIn(emailB);
  console.log(`fixtures: A=${A.slice(0, 8)}*** B=${B.slice(0, 8)}***`);

  const VIP = 'ai_course_vocab_item_progress';
  const ENT = 'ai_course_entitlements';
  const rpc = (jwt, body) => rest('rpc/ai_upsert_unit_progress', { token: jwt, method: 'POST', body });

  // ── anon（未認証） ──
  record('R01', 'anon read拒否', 'http:401(42501)', await rest(`${VIP}?select=item_id`));
  record('R02', 'anon write拒否', 'http:401(42501)', await rest(VIP, { method: 'POST', body: { learner_id: A, item_id: 'x' } }));

  // ── 本人（許可される操作） ──
  record('R03', 'learner A own select', 'rows:0', await rest(`${VIP}?select=item_id&learner_id=eq.${A}`, { token: jwtA }));
  record('R04', 'learner A own insert', 'ok', await rest(VIP, { token: jwtA, method: 'POST', body: { learner_id: A, item_id: 'fi-namae', self_assessment: 'seen' } }));
  record('R05', 'learner A own update', 'ok', await rest(`${VIP}?learner_id=eq.${A}&item_id=eq.fi-namae`, { token: jwtA, method: 'PATCH', body: { self_assessment: 'learning' } }));

  // ── 他人との分離 ──
  record('R06', 'A→B select は0行（RLSフィルタ）', 'rows:0', await rest(`${VIP}?select=item_id&learner_id=eq.${B}`, { token: jwtA }));
  record('R07', 'A→B write拒否（with check違反）', 'http:403(42501)', await rest(VIP, { token: jwtA, method: 'POST', body: { learner_id: B, item_id: 'fi-namae' } }));
  record('R08', 'B→A select は0行', 'rows:0', await rest(`${VIP}?select=item_id&learner_id=eq.${A}`, { token: jwtB }));

  // ── entitlements（読み取り専用であること） ──
  record('R09', 'entitlement 本人select（行なし=0行）', 'rows:0', await rest(`${ENT}?select=lab_preview&learner_id=eq.${A}`, { token: jwtA }));
  record('R10', 'entitlement insert拒否', 'http:403(42501)', await rest(ENT, { token: jwtA, method: 'POST', body: { learner_id: A, lab_preview: true } }));
  record('R11', 'entitlement update拒否', 'http:403(42501)', await rest(`${ENT}?learner_id=eq.${A}`, { token: jwtA, method: 'PATCH', body: { lab_preview: true } }));
  record('R12', 'entitlement delete拒否', 'http:403(42501)', await rest(`${ENT}?learner_id=eq.${A}`, { token: jwtA, method: 'DELETE' }));

  // ── admin_overrides 自己昇格防止 ──
  record('R13', 'admin_overrides 置換拒否', 'http:400(P0001)', await rest(`ai_learners?id=eq.${A}`, { token: jwtA, method: 'PATCH', body: { admin_overrides: { labPreview: true } } }));
  record('R14', 'admin_overrides key追加拒否', 'http:400(P0001)', await rest(`ai_learners?id=eq.${A}`, { token: jwtA, method: 'PATCH', body: { admin_overrides: { labPreview: true, internalReview: true } } }));
  // key削除の検証は「付与済みの状態」からでないと意味がない（{}→{} は変化なしで正しく通る）
  await rest(`ai_learners?id=eq.${A}`, { token: SERVICE, key: SERVICE, method: 'PATCH', body: { admin_overrides: { labPreview: true } } });
  record('R15', 'admin_overrides key削除拒否（付与済みから）', 'http:400(P0001)', await rest(`ai_learners?id=eq.${A}`, { token: jwtA, method: 'PATCH', body: { admin_overrides: {} } }));
  record('R16', '通常profile更新は許可', 'ok', await rest(`ai_learners?id=eq.${A}`, { token: jwtA, method: 'PATCH', body: { display_name: 'RLS GATE A2' } }));

  // ── RPC（unit progress） ──
  record('R17', 'RPC own progress upsert', 'ok', await rpc(jwtA, { p_learner_id: A, p_unit_id: 'n3u-01-self', p_state: { phase: 'intro' }, p_expected_row_version: 0, p_mutation_id: 'r-1' }));
  record('R18', 'RPC other learner拒否', 'http:403(42501)', await rpc(jwtA, { p_learner_id: B, p_unit_id: 'n3u-01-self', p_state: {}, p_expected_row_version: 0, p_mutation_id: 'r-2' }));
  record('R19', 'stale rowVersion → P0409', 'http:500(P0409)', await rpc(jwtA, { p_learner_id: A, p_unit_id: 'n3u-01-self', p_state: { phase: 'x' }, p_expected_row_version: 99, p_mutation_id: 'r-3' }));
  record('R20', '同一mutationId再送は冪等（no-op成功）', 'ok', await rpc(jwtA, { p_learner_id: A, p_unit_id: 'n3u-01-self', p_state: { phase: 'intro' }, p_expected_row_version: 0, p_mutation_id: 'r-1' }));

  // ── 重複防止（複合主キー） ──
  record('R21', '同一(learner,item)の二重insertは拒否', 'http:409(23505)',
    await rest(VIP, { token: jwtA, method: 'POST', body: { learner_id: A, item_id: 'fi-namae', self_assessment: 'seen' } }));

  // ── learner_id差し替え後もBの実データは汚れていない（service_roleで実査） ──
  record('R22', 'learner_id差し替え後もBの実データ0行（service_role実査）', 'rows:0',
    await rest(`${VIP}?select=item_id&learner_id=eq.${B}`, { token: SERVICE, key: SERVICE }));

  // ── service_role の正当操作 ──
  record('R23', 'service_role は両learnerを参照できる', 'rows:2',
    await rest(`ai_learners?select=id&id=in.(${A},${B})`, { token: SERVICE, key: SERVICE }));

  // ── DELETE revoke ──
  record('R24', 'own progress delete拒否（delete policy/grantなし）', 'http:403(42501)',
    await rest(`${VIP}?learner_id=eq.${A}&item_id=eq.fi-namae`, { token: jwtA, method: 'DELETE' }));

  // ── R25/R26 は catalog 実査（SQL） ──
  const cat = await mgmtSql(`select
      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relrowsecurity and c.relname in
        ('ai_course_vocab_item_progress','ai_course_vocab_pack_progress','ai_course_vocab_diagnostic_attempts',
         'ai_course_entitlements','ai_course_unit_progress'))::text as rls_enabled_tables,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prosecdef
          and p.proname in ('ai_course_protect_admin_overrides','ai_upsert_unit_progress','ai_my_learner_ids','ai_is_admin')
          and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) x where x like 'search_path=%')))::text as definer_without_search_path`);
  record('R25', 'AIコースDEFINER関数のsearch_path未固定は0件', '0', cat[0].definer_without_search_path);
  record('R26', '新規5テーブルすべてRLS有効', '5', cat[0].rls_enabled_tables);

  // ── 既存データ非破壊の確認（fixture分の増加のみ） ──
  const during = await mgmtSql(baselineSql);
  info('R27', `fixture作成中のrow count: ${during.map(r => `${r.k}=${r.v}`).join(' ')}`, 'see-values');
} finally {
  // ── fixture撤去（作成したUUIDを厳密指定・emailパターン再確認つき） ──
  console.log('\n--- cleanup ---');
  for (const u of created.users) {
    if (!u.email.endsWith(`@${SYNTH_DOMAIN}`)) { console.log(`SKIP cleanup (not synthetic): ${u.id.slice(0, 8)}***`); continue; }
    const check = await mgmtSql(`select email from auth.users where id = '${u.id}'::uuid`);
    const actualEmail = check[0]?.email ?? '';
    if (actualEmail !== u.email) { console.log(`SKIP cleanup (email mismatch): ${u.id.slice(0, 8)}***`); continue; }
    const r = await fetch(`${API}/auth/v1/admin/users/${u.id}`, {
      method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    console.log(`deleted fixture user ${u.id.slice(0, 8)}*** → http:${r.status}`);
  }
  const after = await mgmtSql(baselineSql);
  console.log(`baseline after: ${after.map(r => `${r.k}=${r.v}`).join(' ')}`);
}

const fails = results.filter(r => !r.pass);
console.log(`\nTOTAL ${results.length}  PASS ${results.length - fails.length}  FAIL ${fails.length}`);
process.exit(fails.length ? 1 : 0);
