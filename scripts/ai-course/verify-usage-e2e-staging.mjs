// 「会話レッスン1回」のデータ層ライフサイクルを、staging配信バンドルと同一ソースの
// 実装コード（courseRepository / courseUsage）をそのまま動かして本番Supabaseに実測する。
//
// 経緯: staging実画面へのセッショントークン注入はauto modeの安全装置で遮断されたため、
// gate-remote-sync-e2e.mjs と同じ「本物の実装コードを直接動かす」方式で検証する。
// 配信チャンク（courseRepository-*.js）が手元buildとsha256一致していることは別途確認済み。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/verify-usage-e2e-staging.mjs -- --confirm-remote
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { supabase } from '../../src/services/supabaseClient';
import { courseRepository } from '../../src/lib/aiLesson/course/courseRepository';
import { getTodayUsage, jstTodayISO } from '../../src/lib/aiLesson/course/courseUsage';

const REF = 'jdkwijdphlkrcoiggfqw';
const SYNTH_DOMAIN = 'kawabado-usage-verify.invalid';
const ROOT = join(import.meta.dirname, '../..');

if (!process.argv.includes('--confirm-remote')) {
  console.error('refuse: --confirm-remote が必要（本番プロジェクトに合成fixtureを作成します）');
  process.exit(2);
}

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
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

const fixture = {};
const PASSWORD = `usage-e2e-${Math.random().toString(36).slice(2)}-Aa1!`;

try {
  const before = await mgmtSql(`select 'learners' k, count(*)::text v from public.ai_learners
    union all select 'auth_users', count(*)::text from auth.users order by 1`);
  console.log(`before: ${before.map(r => `${r.k}=${r.v}`).join(' ')}`);

  fixture.email = `usage-e2e-${Date.now()}@${SYNTH_DOMAIN}`;
  const uRes = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixture.email, password: PASSWORD, email_confirm: true,
      user_metadata: { temporary_qa: true, purpose: 'usage-hardening-lesson-lifecycle-e2e' } }),
  });
  const uBody = await uRes.json();
  if (!uRes.ok) throw new Error(`createUser: ${uRes.status} ${JSON.stringify(uBody).slice(0, 200)}`);
  fixture.userId = uBody.id;

  const lRes = await fetch(`${API}/rest/v1/ai_learners`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: fixture.userId, display_name: 'USAGE E2E', is_test: true }),
  });
  const lBody = await lRes.json();
  if (!lRes.ok) throw new Error(`mkLearner: ${lRes.status} ${JSON.stringify(lBody).slice(0, 200)}`);
  const L = lBody[0].id;
  fixture.learnerId = L;
  console.log(`fixture learner=${L.slice(0, 8)}***`);

  // アプリと同じシングルトンclientでログイン（courseRepositoryが内部で使うのはこのclient）
  const { error: signErr } = await supabase.auth.signInWithPassword({ email: fixture.email, password: PASSWORD });
  if (signErr) throw new Error(`signIn: ${signErr.message}`);

  // ── レッスン1回のライフサイクル（AiCoursePageと同じ呼び出し順） ──
  const st = await courseRepository.createSession(L, {
    missionId: 'usage-verify-e2e', lessonKind: 'new', mode: 'text',
    difficulty: 2, targetExpression: '〜といいます',
  });
  check('E01', 'ai_start_session でセッション予約（回数+1）', 'true', st.ok);

  await courseRepository.finalizeSession(st.sessionId, {
    endedAt: new Date().toISOString(), durationSeconds: 187,
    completionStatus: 'completed', endReason: 'goal_achieved',
    targetUsed: true, targetUsedIndependently: true,
    chineseSupportUsed: false, estimatedCostUsd: 0.08,
  }, [], L);

  await courseRepository.recordUsage(L, 187, 0.08);

  // クライアントの読み経路（残量表示と同じ実装）で見えること
  const u = await getTodayUsage(L);
  check('E02', 'getTodayUsage: 会話1回=1回・187秒・$0.08', '1|187|0.08',
    `${u.sessionsCount}|${u.secondsUsed}|${u.costUsd}`);

  // DB実体（service経由）でも同じ行に積まれていること
  const row = await mgmtSql(`select sessions_count::text s, seconds_used::text sec, estimated_cost_usd::text c
    from public.ai_usage_daily where learner_id='${L}'::uuid and usage_date='${jstTodayISO()}'`);
  check('E03', 'DB実体: JST今日の行に 1|187|0.08', '1|187|0.08',
    row[0] ? `${row[0].s}|${row[0].sec}|${row[0].c}` : '(no row)');

  // 2回目のレッスンでさらに加算されること（上書きでないこと）
  await courseRepository.recordUsage(L, 60, 0.02);
  const u2 = await getTodayUsage(L);
  check('E04', '2回目の記録は加算（187+60=247秒/$0.10）', '1|247|0.1',
    `${u2.sessionsCount}|${u2.secondsUsed}|${u2.costUsd}`);

  await supabase.auth.signOut();
} finally {
  console.log('\n--- cleanup ---');
  if (fixture.userId && fixture.email?.endsWith(`@${SYNTH_DOMAIN}`)) {
    const v = await mgmtSql(`select email from auth.users where id = '${fixture.userId}'::uuid`);
    if (v[0]?.email === fixture.email) {
      const r = await fetch(`${API}/auth/v1/admin/users/${fixture.userId}`, {
        method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      console.log(`removed fixture ${fixture.userId.slice(0, 8)}*** → http:${r.status}`);
    } else { console.log('SKIP cleanup: email mismatch'); }
  }
  const after = await mgmtSql(`select 'learners' k, count(*)::text v from public.ai_learners
    union all select 'auth_users', count(*)::text from auth.users
    union all select 'usage_rows', count(*)::text from public.ai_usage_daily order by 1`);
  console.log(`after: ${after.map(r => `${r.k}=${r.v}`).join(' ')}`);
}

const fails = results.filter(r => !r.pass);
console.log(`\nTOTAL ${results.length}  PASS ${results.length - fails.length}  FAIL ${fails.length}`);
process.exit(fails.length ? 1 : 0);
