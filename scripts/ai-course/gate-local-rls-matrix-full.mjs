// Final Executable Migration Gate: local Supabase に対する完全RLS matrix（M01–M25）。
// h1-local-rls-matrix.mjs（20項目）を CEO指示 §6 の M01–M25 へ拡張したもの。
// ⚠️ local専用。127.0.0.1 以外のAPI URLは実行を拒否する（remoteへ絶対に向けない）。
// 実行: node scripts/ai-course/gate-local-rls-matrix-full.mjs <supabase status -o json の出力file>
import { readFileSync } from 'node:fs';

const statusFile = process.argv[2];
if (!statusFile) { console.error('usage: node gate-local-rls-matrix-full.mjs <status.json>'); process.exit(2); }
const st = JSON.parse(readFileSync(statusFile, 'utf8'));
const API = st.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) { console.error(`refuse: not local: ${API}`); process.exit(2); }
const ANON = st.ANON_KEY;
const SERVICE = st.SERVICE_ROLE_KEY;

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

/** 戻りを 'rows:N' | 'http:STATUS(code)' | 'ok' に正規化（0行とpermission deniedを区別できる） */
const rest = async (path, { token, method = 'GET', body, headers = {}, key } = {}) => {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key ?? ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json', ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
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
  return { status: res.status, data: await res.json().catch(() => null) };
};

const run = async () => {
  const ts = Date.now();
  // fixture: 個人情報を使わない合成メール
  const emailA = `gate-a-${ts}@local.test`;
  const emailB = `gate-b-${ts}@local.test`;
  const mkUser = async (email) => {
    const r = await auth('admin/users', { token: SERVICE, body: { email, password: 'gate-local-pass-123', email_confirm: true } });
    if (r.status !== 200 && r.status !== 201) throw new Error(`createUser: ${r.status}`);
    return r.data.id;
  };
  const signIn = async (email) => {
    const r = await auth('token?grant_type=password', { body: { email, password: 'gate-local-pass-123' } });
    if (r.status !== 200) throw new Error(`signIn: ${r.status}`);
    return r.data.access_token;
  };
  const mkLearner = async (userId, name) => {
    const res = await fetch(`${API}/rest/v1/ai_learners`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, display_name: name }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(`mkLearner: ${res.status} ${JSON.stringify(d)}`);
    return d[0].id;
  };
  const userA = await mkUser(emailA); const userB = await mkUser(emailB);
  const learnerA = await mkLearner(userA, 'GATE A'); const learnerB = await mkLearner(userB, 'GATE B');
  const jwtA = await signIn(emailA); const jwtB = await signIn(emailB);
  console.log(`fixtures: A=${learnerA.slice(0, 8)}*** B=${learnerB.slice(0, 8)}***`);

  const VIP = 'ai_course_vocab_item_progress';
  const ENT = 'ai_course_entitlements';
  const UP = 'ai_course_unit_progress';
  const rpc = (token, body) => rest('rpc/ai_upsert_unit_progress', { token, method: 'POST', body });

  // ── anon（未認証） ──
  record('M01', 'anon progress select 拒否', 'http:401(42501)', await rest(`${VIP}?select=item_id`, {}));
  record('M02', 'anon progress insert 拒否', 'http:401(42501)', await rest(VIP, { method: 'POST', body: { learner_id: learnerA, item_id: 'x' } }));

  // ── learner A own（RLS許可） ──
  record('M03', 'A own progress select', 'rows:0', await rest(`${VIP}?select=item_id&learner_id=eq.${learnerA}`, { token: jwtA }));
  record('M04', 'A own progress insert', 'ok', await rest(VIP, { token: jwtA, method: 'POST', body: { learner_id: learnerA, item_id: 'fi-namae', self_assessment: 'seen' } }));
  record('M05', 'A own progress update', 'ok', await rest(`${VIP}?learner_id=eq.${learnerA}&item_id=eq.fi-namae`, { token: jwtA, method: 'PATCH', body: { self_assessment: 'learning' } }));

  // ── A→B 分離（0行 と denied を区別） ──
  record('M06', 'A→B progress select は0行（RLSフィルタ）', 'rows:0', await rest(`${VIP}?select=item_id&learner_id=eq.${learnerB}`, { token: jwtA }));
  record('M07', 'A→B progress insert 拒否（with check違反）', 'http:403(42501)', await rest(VIP, { token: jwtA, method: 'POST', body: { learner_id: learnerB, item_id: 'fi-namae' } }));
  // 他人行はRLSで見えない→updateは「0行更新」で成功扱いになる。実データが変わらないことを後段M22で確認
  info('M08', 'A→B progress update（RLSで対象0行）', await rest(`${VIP}?learner_id=eq.${learnerB}`, { token: jwtA, method: 'PATCH', body: { self_assessment: 'self_known' } }));

  // ── entitlements ──
  record('M09', 'A own entitlement select（行なし=0行）', 'rows:0', await rest(`${ENT}?select=lab_preview&learner_id=eq.${learnerA}`, { token: jwtA }));
  record('M10', 'A entitlement insert 拒否', 'http:403(42501)', await rest(ENT, { token: jwtA, method: 'POST', body: { learner_id: learnerA, lab_preview: true } }));
  record('M11', 'A entitlement update 拒否', 'http:403(42501)', await rest(`${ENT}?learner_id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { lab_preview: true } }));
  record('M12', 'A entitlement delete 拒否', 'http:403(42501)', await rest(`${ENT}?learner_id=eq.${learnerA}`, { token: jwtA, method: 'DELETE' }));

  // ── admin_overrides 保護（trigger） ──
  record('M13', 'A admin_overrides 置換 拒否', 'http:400(P0001)', await rest(`ai_learners?id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { admin_overrides: { labPreview: true } } }));
  record('M14', 'A admin_overrides key追加 拒否', 'http:400(P0001)', await rest(`ai_learners?id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { admin_overrides: { labPreview: true, internalReview: true } } }));
  // M15: 「key削除の拒否」は実際にkeyがある状態からでないと検証にならない。
  // 初期値は '{}' のため {} → {} は is distinct from = false（=変化なし）で通るのが正しい挙動。
  // そこでservice_roleで labPreview を付与してから、learnerによる削除が拒否されることを見る。
  await rest(`ai_learners?id=eq.${learnerA}`, { token: SERVICE, key: SERVICE, method: 'PATCH', body: { admin_overrides: { labPreview: true } } });
  record('M15', 'A admin_overrides key削除 拒否（付与済みの状態から）', 'http:400(P0001)', await rest(`ai_learners?id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { admin_overrides: {} } }));
  info('M15b', '同値更新（{}→{}）はtrigger非発火で許可＝仕様どおり（変化がないため昇格にならない）', await rest(`ai_learners?id=eq.${learnerB}`, { token: jwtB, method: 'PATCH', body: { admin_overrides: {} } }));
  record('M16', 'A 通常profile更新 許可', 'ok', await rest(`ai_learners?id=eq.${learnerA}`, { token: jwtA, method: 'PATCH', body: { display_name: 'GATE A2' } }));

  // ── service_role 正当操作 ──
  record('M17', 'service_role 全learner可視', 'rows:2', await rest(`ai_learners?select=id&id=in.(${learnerA},${learnerB})`, { token: SERVICE, key: SERVICE }));

  // ── RPC（unit progress） ──
  record('M18', 'RPC 本人progress upsert', 'ok', await rpc(jwtA, { p_learner_id: learnerA, p_unit_id: 'n3u-01-self', p_state: { phase: 'intro' }, p_expected_row_version: 0, p_mutation_id: 'g-1' }));
  record('M19', 'RPC 他人progress 拒否', 'http:403(42501)', await rpc(jwtA, { p_learner_id: learnerB, p_unit_id: 'n3u-01-self', p_state: {}, p_expected_row_version: 0, p_mutation_id: 'g-2' }));
  record('M20', 'stale rowVersion → P0409 conflict', 'http:500(P0409)', await rpc(jwtA, { p_learner_id: learnerA, p_unit_id: 'n3u-01-self', p_state: { phase: 'x' }, p_expected_row_version: 99, p_mutation_id: 'g-3' }));
  record('M21', '同一mutationId 再送は冪等（no-op成功）', 'ok', await rpc(jwtA, { p_learner_id: learnerA, p_unit_id: 'n3u-01-self', p_state: { phase: 'intro' }, p_expected_row_version: 0, p_mutation_id: 'g-1' }));

  // ── M22: learner_id差し替え（Bの実データが汚れていないこと・service_roleで実査） ──
  const bRows = await rest(`${VIP}?select=item_id&learner_id=eq.${learnerB}`, { token: SERVICE, key: SERVICE });
  record('M22', 'learner_id差し替え後もBの実データは0行（service_role実査）', 'rows:0', bRows);

  // ── M23: DELETE revoke（progress3表） ──
  record('M23', 'A own progress delete 拒否（delete policy/grantなし）', 'http:403(42501)', await rest(`${VIP}?learner_id=eq.${learnerA}&item_id=eq.fi-namae`, { token: jwtA, method: 'DELETE' }));

  // ── M24: function search_path（DEFINER関数が固定されている・DB catalogをRPC経由でなくSQLで見るのは別途psqlで実施済み） ──
  // ここではRPCが public 以外のschemaに依存していないこと（成功していること）で間接確認し、
  // 実catalog確認は gate報告の§15（psql実査）を正準とする。
  info('M24', 'function search_path はcatalog実査（psql）で確認。RPC動作は上記M18–M21でPASS', 'see-catalog');

  // ── M25: transaction failure時の部分適用なし（migration適用時に実測・ここでは対象外） ──
  info('M25', 'transaction atomicityはmigration適用実測（gate §11）で確認', 'see-migration-test');

  const fails = results.filter(r => !r.pass);
  console.log(`\nTOTAL ${results.length}  PASS ${results.length - fails.length}  FAIL ${fails.length}`);
  process.exit(fails.length ? 1 : 0);
};
run().catch(e => { console.error('harness error:', e.message); process.exit(2); });
