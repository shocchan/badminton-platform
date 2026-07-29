// H1: local Supabase に対する RLS / entitlement の JWT matrix 実測（Data API経由）。
// ⚠️ local専用。リモートURLを与えても実行しないよう 127.0.0.1 以外を拒否する。
// 実行: node scripts/ai-course/h1-local-rls-matrix.mjs <local-status.json>
//   local-status.json = `supabase status -o json` の出力
//
// 出力: 標準出力に matrix（PASS/FAIL）。FAILが1件でもあれば exit 1。
import { readFileSync } from 'node:fs';

const statusFile = process.argv[2];
if (!statusFile) { console.error('usage: node h1-local-rls-matrix.mjs <status.json>'); process.exit(2); }
const st = JSON.parse(readFileSync(statusFile, 'utf8'));
const API = st.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) {
  console.error(`refuse: not a local URL: ${API}`); process.exit(2);
}
const ANON = st.ANON_KEY;
const SERVICE = st.SERVICE_ROLE_KEY;

const results = [];
const record = (id, desc, expected, actual) => {
  const pass = expected === actual;
  results.push({ id, desc, expected, actual, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}  expected=${expected} actual=${actual}`);
};

/** REST呼び出し。戻りは 'rows:N' | 'http:XXX(code)' に正規化 */
const rest = async (path, { token, method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const code = data && typeof data === 'object' && 'code' in data ? data.code : '';
    return `http:${res.status}(${code})`;
  }
  if (Array.isArray(data)) return `rows:${data.length}`;
  return 'ok';
};

const auth = async (path, { token, method = 'POST', body } = {}) => {
  const res = await fetch(`${API}/auth/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

// ── fixtures: user A / B と learner A / B（service_roleで作成）──
const mkUser = async (email) => {
  const r = await auth('admin/users', { token: SERVICE, body: { email, password: 'h1-local-pass-123', email_confirm: true } });
  if (r.status !== 200 && r.status !== 201) throw new Error(`createUser ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.id;
};
const signIn = async (email) => {
  const r = await auth('token?grant_type=password', { body: { email, password: 'h1-local-pass-123' } });
  if (r.status !== 200) throw new Error(`signIn ${email}: ${r.status}`);
  return r.data.access_token;
};

const run = async () => {
  const ts = Date.now();
  const emailA = `h1-a-${ts}@local.test`;
  const emailB = `h1-b-${ts}@local.test`;
  const userA = await mkUser(emailA);
  const userB = await mkUser(emailB);

  // learners（fixtureはservice_roleで直接投入。RLS検証対象はこの後の操作）
  const mkLearner = async (userId, name) => {
    const res = await fetch(`${API}/rest/v1/ai_learners`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, display_name: name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`mkLearner: ${res.status} ${JSON.stringify(data)}`);
    return data[0].id;
  };
  const learnerA = await mkLearner(userA, 'H1 A');
  const learnerB = await mkLearner(userB, 'H1 B');
  const jwtA = await signIn(emailA);
  const jwtB = await signIn(emailB);
  console.log(`fixtures: learnerA=${learnerA} learnerB=${learnerB}`);

  // ── matrix ──
  // 1) anon はコース表を読めない
  record('M01', 'anon: ai_learners select (旧テーブルはanonにselect grantが残るがRLSで0行)', 'rows:0', await rest('ai_learners?select=id', {}));
  record('M02', 'anon: ai_course_unit_progress select', 'http:401(42501)', await rest('ai_course_unit_progress?select=unit_id', {}));
  // 2) learner本人: 自分のai_learnersは見える・他人は見えない（0行）
  record('M03', 'A: own ai_learners row', 'rows:1', await rest(`ai_learners?select=id&id=eq.${learnerA}`, { token: jwtA }));
  record('M04', 'A: B ai_learners row', 'rows:0', await rest(`ai_learners?select=id&id=eq.${learnerB}`, { token: jwtA }));
  // 3) entitlements: 本人select可（0行）・insert/update不可（grantなし=401/42501）
  record('M05', 'A: own entitlements select', 'rows:0', await rest(`ai_course_entitlements?select=lab_preview&learner_id=eq.${learnerA}`, { token: jwtA }));
  record('M06', 'A: entitlements insert denied', 'http:403(42501)', await rest('ai_course_entitlements', { token: jwtA, method: 'POST', body: { learner_id: learnerA, lab_preview: true } }));
  record('M07', 'A: entitlements update denied', 'http:403(42501)', await rest(`ai_course_entitlements?learner_id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { lab_preview: true } }));
  // 4) admin_overrides の列保護（entitlements草案のtrigger）
  record('M08', 'A: own display_name update ok', 'ok', await rest(`ai_learners?id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { display_name: 'H1 A2' } }));
  record('M09', 'A: own admin_overrides update denied', 'http:400(P0001)', await rest(`ai_learners?id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { admin_overrides: { labPreview: true } } }));
  // 5) unit progress: 直接のtable書き込みはgrantなしで拒否（書き込みはRPCのみ）
  record('M10', 'A: unit_progress direct insert denied', 'http:403(42501)', await rest('ai_course_unit_progress', { token: jwtA, method: 'POST', body: { learner_id: learnerA, unit_id: 'u1', state: {} } }));
  // 6) unit progress RPC: 本人OK・他人はdenied
  const rpc = (token, body) => rest('rpc/ai_upsert_unit_progress', { token, method: 'POST', body });
  record('M11', 'A: rpc upsert own', 'ok', await rpc(jwtA, { p_learner_id: learnerA, p_unit_id: 'n3u-01-self', p_state: { v: 1 }, p_expected_row_version: 0, p_mutation_id: 'm-1' }));
  record('M12', 'A: rpc upsert for B denied', 'http:403(42501)', await rpc(jwtA, { p_learner_id: learnerB, p_unit_id: 'n3u-01-self', p_state: { v: 1 }, p_expected_row_version: 0, p_mutation_id: 'm-2' }));
  // 7) select分離: Aの行はBから見えない
  record('M13', 'A: own unit_progress select', 'rows:1', await rest(`ai_course_unit_progress?select=unit_id&learner_id=eq.${learnerA}`, { token: jwtA }));
  record('M14', 'B: A unit_progress select', 'rows:0', await rest(`ai_course_unit_progress?select=unit_id&learner_id=eq.${learnerA}`, { token: jwtB }));
  // 8) 楽観ロック: stale row_versionはP0409
  record('M15', 'A: rpc stale version conflict (PostgRESTはカスタムSQLSTATEを500に写像)', 'http:500(P0409)', await rpc(jwtA, { p_learner_id: learnerA, p_unit_id: 'n3u-01-self', p_state: { v: 2 }, p_expected_row_version: 99, p_mutation_id: 'm-3' }));
  // 9) 冪等: 同じmutationIdはno-op成功
  record('M16', 'A: rpc idempotent replay', 'ok', await rpc(jwtA, { p_learner_id: learnerA, p_unit_id: 'n3u-01-self', p_state: { v: 1 }, p_expected_row_version: 0, p_mutation_id: 'm-1' }));
  // 10) service_role: 全読可・admin_overrides変更可否（entitlements草案の検証注記の実測）
  record('M17', 'service: all learners visible', 'rows:2', await rest(`ai_learners?select=id&id=in.(${learnerA},${learnerB})`, { token: SERVICE }));
  const svcOverride = await rest(`ai_learners?id=eq.${learnerA}`, { token: SERVICE, method: 'PATCH', body: { admin_overrides: { labPreview: false } } });
  console.log(`INFO  M18  service_role admin_overrides update actual=${svcOverride}（草案注記の実測値。okなら運用可・deniedなら適用手順で直接続が必要）`);

  // vocab persistence 3表のRLS（同一パターン）
  record('M19', 'A: vocab_item_progress own select', 'rows:0', await rest(`ai_course_vocab_item_progress?select=item_id&learner_id=eq.${learnerA}`, { token: jwtA }));
  record('M20', 'B→A: vocab_item_progress cross select', 'rows:0', await rest(`ai_course_vocab_item_progress?select=item_id&learner_id=eq.${learnerA}`, { token: jwtB }));
  record('M21', 'anon: entitlements select', 'http:401(42501)', await rest('ai_course_entitlements?select=learner_id', {}));

  const fails = results.filter(r => !r.pass);
  console.log(`\nTOTAL ${results.length}  PASS ${results.length - fails.length}  FAIL ${fails.length}`);
  process.exit(fails.length ? 1 : 0);
};

run().catch(e => { console.error('harness error:', e.message); process.exit(2); });
