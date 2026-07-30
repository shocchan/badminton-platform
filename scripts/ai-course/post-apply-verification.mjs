// Remote適用「直後」に実行するRLS/entitlement/unit-progress検証matrix（2026-07-30 Preflight）。
// H1 local実測（h1-local-rls-matrix.mjs・20項目）のremote版。承認後に適用とワンセットで実行する。
//
// 実行: node scripts/ai-course/post-apply-verification.mjs <env.json>
//   env.json = {
//     "url": "https://<ref>.supabase.co",
//     "anonKey": "...",                    // 公開anon
//     "serviceRoleKey": "...",             // SQL Editor相当の管理作業（結果はredactedで記録）
//     "learnerAJwt": "...",                // shocchan検証learnerのaccess_token
//     "learnerAId": "uuid",                // 同learner_id
//     "learnerBId": "uuid"                 // 他learnerのlearner_id（読める必要はない・書き込み拒否検証用）
//   }
// ⚠️ 書き込み検証は learnerA 自身の行と、拒否されることを確認する試行のみ。
//    Andyさんのlearner_idをlearnerBIdに使ってよいのは「拒否の確認」だけで、
//    成功する書き込みには一切使わない（matrixの期待値がそれを保証する）。
// 出力: PASS/FAIL matrix。FAILが1件でもあれば exit 1 → §stop-conditionsに従いrollback判断。
import { readFileSync } from 'node:fs';

const envFile = process.argv[2];
if (!envFile) { console.error('usage: node post-apply-verification.mjs <env.json>'); process.exit(2); }
const env = JSON.parse(readFileSync(envFile, 'utf8'));
const { url, anonKey, serviceRoleKey, learnerAJwt, learnerAId, learnerBId } = env;
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) { console.error('unexpected url'); process.exit(2); }

const results = [];
const record = (id, desc, ok, note = '') => {
  results.push({ id, desc, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${desc}${note ? ' | ' + note : ''}`);
};
const rest = (path, { method = 'GET', token, body, headers = {} } = {}) =>
  fetch(`${url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const svc = (path, opts = {}) =>
  fetch(`${url}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json', ...(opts.headers ?? {}),
    },
  });

const TBL = 'ai_course_vocab_item_progress';
const UNIT_RPC = 'ai_upsert_unit_progress';

const main = async () => {
  // ── anon 拒否 ──
  {
    const r = await rest(`/${TBL}?select=learner_id&limit=1`);
    record('M01', `anon read ${TBL} 拒否`, r.status === 401 || r.status === 403 || r.status === 406, `status=${r.status}`);
    const w = await rest(`/${TBL}`, { method: 'POST', body: { learner_id: learnerAId, item_id: 'probe' } });
    record('M02', 'anon write 拒否', w.status >= 400, `status=${w.status}`);
  }
  // ── learner A 本人 read/write ──
  {
    const ins = await rest(`/${TBL}`, { method: 'POST', token: learnerAJwt,
      body: { learner_id: learnerAId, item_id: 'verify-post-apply', self_assessment: 'seen' },
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' } });
    record('M03', 'learnerA own upsert 許可', ins.status === 200 || ins.status === 201, `status=${ins.status}`);
    const rd = await rest(`/${TBL}?learner_id=eq.${learnerAId}&item_id=eq.verify-post-apply&select=item_id,row_version`, { token: learnerAJwt });
    const rows = rd.ok ? await rd.json() : [];
    record('M04', 'learnerA own read 許可', rows.length === 1);
  }
  // ── learner A → B 分離 ──
  {
    const rd = await rest(`/${TBL}?learner_id=eq.${learnerBId}&select=item_id`, { token: learnerAJwt });
    const rows = rd.ok ? await rd.json() : [];
    record('M05', 'learnerA→B read 0行', Array.isArray(rows) && rows.length === 0);
    const w = await rest(`/${TBL}`, { method: 'POST', token: learnerAJwt,
      body: { learner_id: learnerBId, item_id: 'должно-fail' } });
    record('M06', 'learnerA→B write 拒否', w.status >= 400, `status=${w.status}`);
  }
  // ── entitlements: learner書き込み全拒否・select本人のみ ──
  {
    const ins = await rest('/ai_course_entitlements', { method: 'POST', token: learnerAJwt, body: { learner_id: learnerAId } });
    record('M07', 'entitlements insert 拒否(learner)', ins.status >= 400, `status=${ins.status}`);
    const upd = await rest(`/ai_course_entitlements?learner_id=eq.${learnerAId}`, { method: 'PATCH', token: learnerAJwt, body: { lab_preview: true } });
    // grant revoke により 42501（PostgREST: 403）想定
    record('M08', 'entitlements update 拒否(learner)', upd.status >= 400, `status=${upd.status}`);
    const del = await rest(`/ai_course_entitlements?learner_id=eq.${learnerAId}`, { method: 'DELETE', token: learnerAJwt });
    record('M09', 'entitlements delete 拒否(learner)', del.status >= 400, `status=${del.status}`);
  }
  // ── admin_overrides 保護trigger ──
  {
    const upd = await rest(`/ai_learners?id=eq.${learnerAId}`, { method: 'PATCH', token: learnerAJwt,
      body: { admin_overrides: { labPreview: true } } });
    record('M10', 'admin_overrides自己昇格 拒否', upd.status >= 400, `status=${upd.status}`);
    const prof = await rest(`/ai_learners?id=eq.${learnerAId}`, { method: 'PATCH', token: learnerAJwt,
      body: { display_name: 'sho' }, headers: { Prefer: 'return=minimal' } });
    record('M11', '通常profile更新 許可', prof.status === 204 || prof.status === 200, `status=${prof.status}`);
  }
  // ── unit progress RPC ──
  {
    const call = (body) => rest(`/rpc/${UNIT_RPC}`, { method: 'POST', token: learnerAJwt, body });
    const first = await call({ p_learner_id: learnerAId, p_unit_id: 'verify-unit', p_state: { phase: 'intro' }, p_expected_row_version: 0, p_mutation_id: 'mut-1' });
    record('M12', 'RPC 本人upsert(新規) 許可', first.ok, `status=${first.status}`);
    const dup = await call({ p_learner_id: learnerAId, p_unit_id: 'verify-unit', p_state: { phase: 'intro' }, p_expected_row_version: 0, p_mutation_id: 'mut-1' });
    const dupRow = dup.ok ? await dup.json() : null;
    record('M13', '同mutationId再送はno-op(row_version=1のまま)', dup.ok && dupRow && dupRow.row_version === 1);
    const stale = await call({ p_learner_id: learnerAId, p_unit_id: 'verify-unit', p_state: { phase: 'x' }, p_expected_row_version: 0, p_mutation_id: 'mut-2' });
    record('M14', 'stale rowVersionはP0409 conflict', stale.status >= 400, `status=${stale.status}`);
    const other = await call({ p_learner_id: learnerBId, p_unit_id: 'verify-unit', p_state: {}, p_expected_row_version: 0, p_mutation_id: 'mut-3' });
    record('M15', 'RPC 他人learner_id 拒否', other.status >= 400, `status=${other.status}`);
    const direct = await rest('/ai_course_unit_progress', { method: 'POST', token: learnerAJwt,
      body: { learner_id: learnerAId, unit_id: 'direct', state: {} } });
    record('M16', 'unit_progress 直接insert 拒否(RPC経由のみ)', direct.status >= 400, `status=${direct.status}`);
  }
  // ── service role 正当操作＋検証行の掃除（自分で作った行のみ削除） ──
  {
    const r = await svc(`/${TBL}?learner_id=eq.${learnerAId}&item_id=eq.verify-post-apply`, { method: 'DELETE' });
    record('M17', 'service_role 正当操作（検証行の削除）', r.status === 204 || r.status === 200, `status=${r.status}`);
    const r2 = await svc(`/ai_course_unit_progress?learner_id=eq.${learnerAId}&unit_id=eq.verify-unit`, { method: 'DELETE' });
    record('M18', 'service_role 検証unit行の削除', r2.status === 204 || r2.status === 200, `status=${r2.status}`);
  }

  const fails = results.filter(r => !r.ok);
  console.log(`\n== ${results.length - fails.length}/${results.length} PASS ==`);
  if (fails.length) {
    console.log('STOP CONDITION: FAILあり → docs/ai-course/decision-packets/final-database-and-entitlement-apply-packet.md §19に従いrollback判断');
    process.exit(1);
  }
};
main().catch(e => { console.error(e); process.exit(1); });
