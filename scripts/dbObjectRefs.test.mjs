// コードが呼ぶDBの関数・テーブルを取り出す部品と、デプロイ手順への配線（2026-09-10）。
//
// 【きっかけ】
// 管理画面の「入金確認」を押すと404だった。ボタンが呼ぶ admin_set_entry_payment を作る
// migration が本番DBに一度も適用されておらず、8/28の統合から約2週間、誰も気づかなかった
// （問い合わせタブも同じ理由で動いていなかった）。
//
// 【このテストが守ること】
// 1. 実際の事故を拾える … 例を手で書いて通すのではなく、**本物の src** から欠けていた3本を拾う
//    （手書きの fixture だけで緑にして、本番では一度も効いていなかった前例がある）
// 2. 誤検知しない … storage のバケット・Array.from・引数の中の文字列・コメントを拾わない
//    （嘘で止まる門は面倒がられて外される。外された門がいちばん危ない）
// 3. Edge Function の実物の書き方（rpc ヘルパー・path ヘルパー・REST直叩き）を拾える
// 4. 本番デプロイ・Edge Function デプロイ・ステージングに配線されている
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractDbRefs, isScannedFile, findMissing, emptyRefs, addRefs } from './dbObjectRefs.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const names = (map) => [...map.keys()].sort();
const src = (...lines) => lines.join('\n');

/** 本番デプロイの門と同じ範囲（dir 配下の、実行されるファイル）から集める */
const collect = (dir) => {
  const refs = emptyRefs();
  const walk = (p) => {
    for (const name of readdirSync(p)) {
      const full = join(p, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (isScannedFile(full)) addRefs(refs, extractDbRefs(readFileSync(full, 'utf8')), full);
    }
  };
  walk(join(ROOT, dir));
  return refs;
};

describe('2026-09-10 の事故を、本物のソースから拾える', () => {
  const refs = collect('src');
  const MISSING_THAT_DAY = ['admin_list_contacts', 'admin_set_contact_status', 'admin_set_entry_payment'];

  it('入金確認・問い合わせが呼んでいた3本の関数名を拾う', () => {
    for (const fn of MISSING_THAT_DAY) expect(refs.rpcs.has(fn), `${fn} を拾えていない`).toBe(true);
  });

  it('本番DBにその3本が無ければ「無い」と言う（あの日の本番DBを再現）', () => {
    const liveFunctions = new Set([...refs.rpcs.keys()].filter((n) => !MISSING_THAT_DAY.includes(n)));
    const liveRelations = new Set(refs.tables.keys());
    expect(findMissing(refs, liveFunctions, liveRelations)).toEqual({ rpcs: MISSING_THAT_DAY, tables: [] });
  });

  it('どこで呼んでいるかを行番号つきで示す（直す人が探さずに済む）', () => {
    expect(refs.rpcs.get('admin_set_entry_payment').some((at) => /src\/pages\/AdminPage\.tsx:\d+$/.test(at))).toBe(true);
  });
});

describe('supabase-js の書き方', () => {
  it('rpc の名前を拾う（改行をはさんでも・型引数つきでも）', () => {
    const r = extractDbRefs(src(
      "const { error } = await supabase.rpc('admin_set_entry_payment', { p_entry_id: 1 });",
      'await supabase',
      '  .rpc(',
      '    "ai_record_usage", {})',
      "const { data } = await supabase.rpc<Row[]>('ai_service_status');",
    ));
    expect(names(r.rpcs)).toEqual(['admin_set_entry_payment', 'ai_record_usage', 'ai_service_status']);
  });

  it('テーブルを拾い、storage のバケットと組み込みの from は拾わない', () => {
    const r = extractDbRefs(src(
      "supabase.from('entries').select('*');",
      'supabase',
      '  .from("tournaments")',
      "supabase.storage.from('blog-images').upload(path, file);",
      'supabase',
      '  .storage',
      "  .from('ai_audio')",
      "const chars = Array.from('abc');",
      "const bytes = Buffer.from('aGVsbG8=', 'base64');",
    ));
    expect(names(r.tables)).toEqual(['entries', 'tournaments']);
  });

  it('コメントに書いた名前は拾わない', () => {
    const r = extractDbRefs(src(
      "// supabase.rpc('old_removed_function') はもう使わない",
      "/* supabase.from('old_table') */",
      "supabase.rpc('ai_service_status');",
    ));
    expect(names(r.rpcs)).toEqual(['ai_service_status']);
    expect(names(r.tables)).toEqual([]);
  });
});

describe('REST を直に叩く書き方', () => {
  it('名前が文字で書いてあれば拾い、変数なら拾わない', () => {
    const r = extractDbRefs(src(
      'await fetch(`${supabaseUrl}/rest/v1/rpc/ai_grant_purchase_access`, { method: "POST" });',
      'await fetch(`${supabaseUrl}/rest/v1/payment_reminders?select=entry_id,stage`);',
      'await fetch(`${supabaseUrl}/rest/v1/ai_plan_applications`, { method: "POST" });',
      'await fetch(`${url}/rest/v1/${path}`);',
      'await fetch(`${url}/rest/v1/rpc/${fn}`);',
    ));
    expect(names(r.rpcs)).toEqual(['ai_grant_purchase_access']);
    expect(names(r.tables)).toEqual(['ai_plan_applications', 'payment_reminders']);
  });
});

describe('Edge Function のヘルパー経由', () => {
  it('名前が1番目の引数のヘルパー（引数の中の文字列・変数の名前は拾わない）', () => {
    const r = extractDbRefs(src(
      'const rpc = async (fn: string, args: Record<string, unknown>) => {',
      '  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {',
      '    method: "POST", headers: dbHeaders, body: JSON.stringify(args),',
      '  });',
      '  return res.json();',
      '};',
      'const throttle = await rpc("ai_code_login_throttle", { p_ip_hash: ipHash });',
      "await rpc('ai_code_login_record', { p_ok: ok, p_reason: 'awaiting_payment' });",
      'await rpc(dynamicName, {});',
    ));
    expect(names(r.rpcs)).toEqual(['ai_code_login_record', 'ai_code_login_throttle']);
    expect(names(r.tables)).toEqual([]);
  });

  it('名前が3番目の引数のヘルパー（ai-course-auth の形）', () => {
    const r = extractDbRefs(src(
      'const rpc = async (url: string, key: string, fn: string, args: Record<string, unknown>) => {',
      '  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {',
      '    method: "POST",',
      '  });',
      '  return res.json();',
      '};',
      'const known = await rpc(url, serviceKey, "ai_email_has_learner", { p_email: email });',
    ));
    expect(names(r.rpcs)).toEqual(['ai_email_has_learner']);
  });

  it('path を受けるヘルパーと、それを1段かぶせたヘルパー', () => {
    const r = extractDbRefs(src(
      'const rest = (path: string, init?: RequestInit) =>',
      '  fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...db } });',
      'const get = async (path: string) => (await rest(path)).json();',
      'const learners = await get("ai_learners?select=user_id,settings&limit=1000");',
      'const rows = await get(`ai_plan_purchases?id=in.(${ids.join(",")})&select=${cols}`);',
      'const other = await get(`${table}?select=id`);',
      'const partial = await get(`ai_plan${suffix}`);',
    ));
    expect(names(r.tables)).toEqual(['ai_learners', 'ai_plan_purchases']);
  });

  it('同じ引数名のよその関数を、ヘルパーと取り違えない', () => {
    const r = extractDbRefs(src(
      'const label = (path: string) => path.toUpperCase();',
      'const rest = (path: string) => fetch(`${u}/rest/v1/${path}`);',
      'label("not_a_table");',
      'rest("entries?select=id");',
    ));
    expect(names(r.tables)).toEqual(['entries']);
  });
});

describe('Edge Function の実物から拾える', () => {
  const fn = (name) => extractDbRefs(read(`supabase/functions/${name}/index.ts`));

  it('rpc ヘルパーで呼んでいる関数名', () => {
    expect(names(fn('ai-course-auth').rpcs)).toEqual(
      expect.arrayContaining(['ai_email_has_learner', 'ai_redeem_invite', 'ai_check_otp_throttle']));
    expect(names(fn('ai-course-code-login').rpcs)).toEqual(
      expect.arrayContaining(['ai_code_login_record', 'ai_code_login_throttle', 'ai_resolve_learning_code']));
    expect(names(fn('ai-course-beta-invite').rpcs)).toEqual(
      expect.arrayContaining(['ai_service_is_admin_email', 'ai_service_grant_beta_access', 'ai_service_issue_learning_code']));
    expect(names(fn('ai-course-monitor').rpcs)).toContain('ai_monitor_cron_health');
  });

  it('REST を直に叩いている関数名・テーブル（Stripe webhook）', () => {
    const hook = fn('ai-course-stripe-webhook');
    expect(names(hook.rpcs)).toEqual(expect.arrayContaining(['ai_grant_purchase_access', 'ai_expire_purchase']));
    expect(names(hook.tables)).toContain('ai_course_alerts');
  });

  it('path ヘルパーで読んでいるテーブル（ai-course-lifecycle-mails）', () => {
    expect(names(fn('ai-course-lifecycle-mails').tables)).toEqual(
      expect.arrayContaining(['ai_learners', 'ai_plan_purchases', 'ai_course_mail_log']));
  });
});

describe('対象にするファイル', () => {
  it('本番で実行されるコードだけを見る', () => {
    expect(isScannedFile('src/pages/AdminPage.tsx')).toBe(true);
    expect(isScannedFile('supabase/functions/ai-course-auth/index.ts')).toBe(true);
    expect(isScannedFile('scripts/check-db-objects.mjs')).toBe(true);
    expect(isScannedFile('src/pages/adminOpsWiring.test.ts')).toBe(false);
    expect(isScannedFile('src/components/admin/adminContacts.test.tsx')).toBe(false);
    expect(isScannedFile('supabase/functions/x/index_test.ts')).toBe(false);
    expect(isScannedFile('src/vite-env.d.ts')).toBe(false);
    expect(isScannedFile('supabase/migrations/x.sql')).toBe(false);
  });
});

describe('確かめられないときは通さない', () => {
  const CLI = join(ROOT, 'scripts/check-db-objects.mjs');
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: '', HOME: tmpdir() },
  });

  it('トークンが無ければ exit 2 で止まる', () => {
    const r = run('scripts');
    expect(r.status, r.stdout + r.stderr).toBe(2);
  });

  it('--warn のときだけ、確かめられなくても続ける（ステージング用）', () => {
    expect(run('--warn', 'scripts').status).toBe(0);
  });

  it('調べるファイルが1つも無いのは設定の間違いとして止める', () => {
    expect(run('no/such/dir').status).toBe(2);
  });
});

describe('デプロイ手順への配線', () => {
  const prod = read('scripts/deploy-production.sh');
  const edge = read('scripts/deploy-edge-functions.sh');
  const staging = read('scripts/deploy-staging.sh');

  it('本番デプロイは、ビルドより前に src を本番DBと突き合わせる（DRY_RUN でも必ず通る）', () => {
    const gate = prod.indexOf('node scripts/check-db-objects.mjs src');
    expect(gate, '門(e)が無い').toBeGreaterThan(-1);
    expect(gate).toBeLessThan(prod.indexOf('npm run build'));
    expect(gate).toBeLessThan(prod.indexOf('if [ "${DRY_RUN:-}" = "1" ]'));
  });

  it('無いときも、確かめられないときも止まる（抜け道を作らない）', () => {
    const block = prod.slice(prod.indexOf('門(e)'), prod.indexOf('✅ (e)'));
    expect(block).toContain('gate_stop "本番DBに無い関数・テーブルをコードが呼んでいる"');
    expect(block).toContain('gate_stop "本番DBの関数・テーブルを確認できない"');
    expect(block).not.toContain('--warn');
  });

  it('Edge Function は出す前に、出す関数を突き合わせ、無ければ1つも出さない', () => {
    const check = edge.indexOf('node scripts/check-db-objects.mjs');
    expect(check, '確認が無い').toBeGreaterThan(-1);
    expect(check).toBeLessThan(edge.indexOf('supabase functions deploy "$fn"'));
    expect(edge).toContain('CHECK_PATHS+=("supabase/functions/$fn")');
    // _shared を丸ごと足すと、使っていない部品のせいで無関係な関数まで止まる（下のテスト）
    expect(edge).not.toMatch(/CHECK_PATHS=\([^)]*_shared/);
  });

  it('共有部品は、その関数が import しているものだけを見る（使っていない部品で止めない）', () => {
    // 2026-09-10 実測: _shared/aiCostMeter.ts が呼ぶ ai_record_usage_event は本番DBに無い。
    // これを読むのは AIレッスンの4関数だけ。_shared を丸ごと見ていたら、
    // それを読まない Stripe webhook のデプロイまで止めていた
    const list = (fn) => spawnSync(process.execPath,
      [join(ROOT, 'scripts/check-db-objects.mjs'), '--list-files', `supabase/functions/${fn}`],
      { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n');
    expect(list('ai-lesson-token').some((f) => f.endsWith('_shared/aiCostMeter.ts')), 'AIレッスンは原価メーターを読む').toBe(true);
    const hook = list('ai-course-stripe-webhook');
    expect(hook.some((f) => f.endsWith('ai-course-stripe-webhook/index.ts'))).toBe(true);
    expect(hook.some((f) => f.endsWith('_shared/aiCostMeter.ts')), 'webhook は原価メーターを読まない').toBe(false);
  });

  it('ステージングは止めずに知らせる（本番へ出すときは門(e)が止める）', () => {
    expect(staging).toContain('node scripts/check-db-objects.mjs --warn src');
  });
});
