// @vitest-environment node
/*
 * AI会話の回数: 会話が成立していない回は消費しない（2026-09-11 CEO指示）の QA テストケース。
 *
 * **本物の Postgres（PGlite・WASM）で migration をそのまま実行して確かめる。**
 * 本番DB・実在の生徒のデータは一切使わない（テストの中で架空の利用者を作る）。
 * ai_start_session が参照する周辺のテーブルは、本番と同じ列だけを持つ最小の形で用意する。
 * ai_release_stale_sessions と回数券の台帳は、本番に入っている migration の本文をそのまま読む。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const MIGRATION = read('supabase/migrations/20260911120000_ai_voice_session_consumption.sql');
const ROLLBACK = read('supabase/migrations/20260911120000_ai_voice_session_consumption.rollback.sql');
const extract = (file: string, re: RegExp, what: string) => {
  const m = read(file).match(re);
  if (!m) throw new Error(`${what} の定義が ${file} に見つからない`);
  return m[0];
};
const STALE_FN = extract('supabase/migrations/20260720000000_ai_course_security.sql',
  /create or replace function public\.ai_release_stale_sessions[\s\S]*?\$\$;/, 'ai_release_stale_sessions');
const CREDITS_TABLE = extract('supabase/migrations/20260910100000_ai_conversation_beta.sql',
  /create table if not exists public\.ai_conversation_credits[\s\S]*?\n\);/, 'ai_conversation_credits');

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
-- Supabase の既定（public に作ったものは API ロールにも権限が付く）を、いちばん緩い形で再現する。
-- この上で migration の revoke が効いているかを確かめる
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create table public.ai_learners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  admin_overrides jsonb not null default '{}'::jsonb
);
create table public.ai_course_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  plan_id text,
  ai_seconds_limit int
);
create table public.ai_usage_daily (
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  usage_date date not null,
  sessions_count int not null default 0,
  seconds_used int not null default 0,
  estimated_cost_usd numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (learner_id, usage_date)
);
create table public.ai_config (key text primary key, value jsonb not null);
create table public.ai_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  mission_id text not null,
  mode text default 'voice',
  lesson_kind text default 'new',
  difficulty int default 2,
  started_at timestamptz default now(),
  ended_at timestamptz,
  duration_seconds int not null default 0,
  completion_status text default 'in_progress',
  end_reason text,
  target_expression text,
  created_at timestamptz not null default now()
);
create table public.ai_plan_purchases (id uuid primary key default gen_random_uuid());
create function public.ai_is_admin() returns boolean language sql stable as $$ select false $$;

insert into public.ai_config (key, value) values
  ('conversation_beta', '{"perWeek":3,"sessionSeconds":240,"paidSessionSeconds":360}'),
  -- 1人で何十回も予約するテストのため、日次・月次の安全装置だけ広げる（回数の規則とは別物）
  ('usage_limits', '{"daily_max_sessions":100,"daily_max_seconds":1000000,"monthly_max_sessions":1000,"monthly_max_seconds":10000000}'),
  ('plan_ai_budgets', '{"plan_test":{"voiceSessionsTotal":2,"voiceSessionsPerDay":10,"textSessionsPerDay":10}}');
`;

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const base = async () => {
  const d = new PGlite();
  await d.exec(STUB);
  await d.exec(STALE_FN);
  await d.exec(CREDITS_TABLE);
  return d;
};
/** 台帳へ書く版の Edge Function が、ずっと前から動いている状態にする */
const markClaimLive = (d: PGlite) => d.query(`insert into public.ai_config (key, value)
  values ('voice_claim_live_since', to_jsonb(now() - interval '30 days'))
  on conflict (key) do update set value = excluded.value`);

/** 往復が2回成立した材料（あいさつ→質問、答え→返事） */
const TALKED = { userTurns: 2, aiRepliesAfterUser: 2, tutorTurns: 3, userSpeechStarts: 2, connectedMs: 3_000 };
/** 一度もつながらなかったと報告された材料 */
const NEVER_CONNECTED = { connectedMs: 0, userTurns: 0, aiRepliesAfterUser: 0, tutorTurns: 0, userSpeechStarts: 0 };

const api = (d: PGlite) => {
  const one = async <T = J>(sql: string, params: unknown[] = []): Promise<T> =>
    (await d.query<{ r: T }>(sql, params)).rows[0].r;
  const actAs = (uid: string | null, role: string) =>
    d.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)`,
      [uid ?? '', role]);
  const newUser = async (credits = 0) => {
    const uid = randomUUID();
    await d.query('insert into auth.users (id) values ($1)', [uid]);
    await d.query('insert into public.ai_learners (user_id) values ($1)', [uid]);
    if (credits) {
      await d.query(`insert into public.ai_conversation_credits (user_id, delta, reason, note) values ($1, $2, 'grant', 'test')`,
        [uid, credits]);
    }
    return uid;
  };
  const start = async (uid: string, mode: 'voice' | 'text' = 'voice') => {
    await actAs(uid, 'authenticated');
    return one(`select public.ai_start_session('m1', 'new', $1, 2, null) as r`, [mode]);
  };
  /** Edge Function が OpenAI へ行く前に呼ぶ。reportsEvidence=false は更新前の画面から来た回 */
  const claim = async (sid: string, uid: string, reportsEvidence = true) => {
    await actAs(null, 'service_role');
    return one(`select public.ai_service_claim_voice_token($1::uuid, $2::uuid, $3::boolean) as r`, [sid, uid, reportsEvidence]);
  };
  const release = async (sid: string, uid: string) => {
    await actAs(null, 'service_role');
    return one(`select public.ai_service_release_voice_token($1::uuid, $2::uuid) as r`, [sid, uid]);
  };
  const report = async (sid: string, uid: string, ev: unknown) => {
    await actAs(uid, 'authenticated');
    return one(`select public.ai_voice_report_evidence($1::uuid, $2::jsonb) as r`, [sid, JSON.stringify(ev)]);
  };
  const budget = async (uid: string) => {
    await actAs(uid, 'authenticated');
    return one(`select public.ai_my_conversation_budget() as r`);
  };
  /** クライアントが直接書く「終了」（本人は ai_learning_sessions の全列を書き換えられる） */
  const close = (sid: string, status = 'interrupted', reason = 'superseded-new', duration = 0) =>
    d.query(`update public.ai_learning_sessions set completion_status = $2, end_reason = $3, duration_seconds = $4, ended_at = now() where id = $1`,
      [sid, status, reason, duration]);
  const ledger = async (sid: string) =>
    (await d.query<J>('select * from public.ai_voice_session_ledger where session_id = $1', [sid])).rows[0];
  const balance = async (uid: string) =>
    Number((await d.query<{ s: string }>('select coalesce(sum(delta), 0) as s from public.ai_conversation_credits where user_id = $1', [uid])).rows[0].s);
  const chargeRows = async (sid: string) =>
    Number((await d.query<{ n: string }>(`select count(*) as n from public.ai_conversation_credits where session_id = $1 and reason = 'session'`, [sid])).rows[0].n);
  /** 時間を進める代わりに、その回の記録（台帳とセッション行）を過去へずらす */
  const shiftBack = async (sid: string, minutes: number) => {
    await d.query(`update public.ai_voice_session_ledger
        set reserved_at = reserved_at - make_interval(mins => $2::int),
            token_first_at = token_first_at - make_interval(mins => $2::int),
            token_last_at = token_last_at - make_interval(mins => $2::int)
      where session_id = $1`, [sid, minutes]);
    await d.query(`update public.ai_learning_sessions set started_at = started_at - make_interval(mins => $2::int) where id = $1`,
      [sid, minutes]);
  };
  const startOk = async (uid: string) => {
    const s = await start(uid);
    expect(s.ok, JSON.stringify(s)).toBe(true);
    return s.sessionId as string;
  };
  /** 予約 → トークン → 往復2回成立の報告 → 終了 */
  const talk = async (uid: string) => {
    const sid = await startOk(uid);
    expect((await claim(sid, uid)).ok).toBe(true);
    await report(sid, uid, TALKED);
    await close(sid, 'completed', 'completed', 120);
    return sid;
  };
  /** 予約 → トークン → 成立しない材料（または報告なし）→ 終了 */
  const connectedButLeft = async (uid: string, ev: unknown = { tutorTurns: 1, userSpeechStarts: 1, userTurns: 1, aiRepliesAfterUser: 1, connectedMs: 3_000 }) => {
    const sid = await startOk(uid);
    expect((await claim(sid, uid)).ok).toBe(true);
    if (ev) await report(sid, uid, ev);
    await close(sid, 'interrupted', 'interrupted', 3);
    return sid;
  };
  /** 予約だけ（トークン無し）→ 閉じた */
  const reservedOnly = async (uid: string, reason = 'superseded-new') => {
    const sid = await startOk(uid);
    await close(sid, 'interrupted', reason, 0);
    return sid;
  };
  return { d, one, actAs, newUser, start, claim, release, report, budget, close, ledger, balance, chargeRows, shiftBack, startOk, talk, connectedButLeft, reservedOnly };
};
type Api = ReturnType<typeof api>;

let A: Api;
beforeAll(async () => {
  const d = await base();
  await d.exec(MIGRATION);
  await markClaimLive(d);
  A = api(d);
}, 120_000);
afterAll(async () => { await A?.d.close(); });

describe('会話成立の定義（ai_voice_conversation_established・ここだけ）', () => {
  const established = (ev: unknown) =>
    A.one<boolean>(`select public.ai_voice_conversation_established($1::jsonb) as r`, [JSON.stringify(ev)]);

  it('画面の案内どおり「こんにちは」と言い、先生が最初の質問をしただけ（往復1回）→ 不成立', async () => {
    expect(await established({ userTurns: 1, aiRepliesAfterUser: 1, tutorTurns: 2, userSpeechStarts: 1, connectedMs: 8_000 })).toBe(false);
  });
  it('その質問に答えて、先生がまた返した（往復2回）→ 成立', async () => {
    expect(await established(TALKED)).toBe(true);
  });
  it('AI のあいさつだけ（生徒の発話なし）→ 不成立', async () => {
    expect(await established({ tutorTurns: 1, connectedMs: 20_000 })).toBe(false);
  });
  it('生徒は話したが AI が応答しないまま終わった → 不成立', async () => {
    expect(await established({ userTurns: 3, aiRepliesAfterUser: 1, tutorTurns: 2, userSpeechStarts: 3, connectedMs: 30_000 })).toBe(false);
  });
  it('生徒が声を出していて、AI が話していて、90 秒以上つながっていた → 成立。89.999 秒は不成立', async () => {
    expect(await established({ tutorTurns: 1, userSpeechStarts: 1, connectedMs: 90_000 })).toBe(true);
    expect(await established({ tutorTurns: 1, userSpeechStarts: 1, connectedMs: 89_999 })).toBe(false);
  });
  it('90 秒以上でも、AI が一度も話していなければ不成立', async () => {
    expect(await established({ tutorTurns: 0, userSpeechStarts: 3, connectedMs: 200_000 })).toBe(false);
  });
  it('90 秒以上でも、生徒の声が一度も届いていなければ不成立（マイクが効かず「言い方がわからない」で先生が話しただけ）', async () => {
    expect(await established({ tutorTurns: 4, userSpeechStarts: 0, connectedMs: 200_000 })).toBe(false);
  });
  it('数値でない・負の値・object 以外は 0 として扱う', async () => {
    expect(await established({ userTurns: '5', aiRepliesAfterUser: -3, tutorTurns: 1, connectedMs: 'x' })).toBe(false);
    expect(await established(null)).toBe(false);
    expect(await established([1, 2])).toBe(false);
  });
});

describe('予約しただけでは減らない', () => {
  it('回数券の回でも、予約した時点では回数券は減らない（6分の回として予約される）', async () => {
    const uid = await A.newUser(1);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const s = await A.start(uid);
    expect(s).toMatchObject({ ok: true, usedCredit: true, sessionMaxSeconds: 360, creditChargedOn: 'conversation_established' });
    expect(await A.balance(uid)).toBe(1);
    expect(await A.ledger(s.sessionId)).toMatchObject({ outcome: 'pending', charge_kind: 'credit', token_count: 0 });
  });
});

describe('段階1: AI の会話トークンが一度も出ていない回は、必ず消費しない', () => {
  it('接続前に閉じた回（superseded-new・0秒）は、週の枠も回数券も減らない', async () => {
    const uid = await A.newUser(1);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const sid = await A.startOk(uid);
    await A.close(sid, 'interrupted', 'superseded-new', 0);
    const b = await A.budget(uid);
    expect(b.credits).toBe(1);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'no_token' });
    expect(await A.chargeRows(sid)).toBe(0);
  });

  it('マイク拒否・トークン取得失敗で戻った回は、何回くり返しても消費しない', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 6; i++) await A.reservedOnly(uid, 'error-exit-before-start');
    expect(await A.budget(uid)).toMatchObject({ voiceRemainingWeek: 3, voiceUsedThisWeek: 0, nextVoiceAvailableAt: null });
  });

  it('OpenAI がトークンを返さず、記録を戻した回（release）もトークン無しとして消費しない', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    expect((await A.claim(sid, uid)).ok).toBe(true);
    expect((await A.release(sid, uid)).released).toBe(true);
    await A.close(sid, 'interrupted', 'error-exit-before-start');
    await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'no_token', token_count: 0 });
  });

  it('放置されて自動で閉じた回（stale_timeout）も、トークンが無ければ消費しない', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.shiftBack(sid, 25);
    const next = await A.start(uid);           // 前の回を自動で閉じてから始まる
    expect(next.ok).toBe(true);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'no_token' });
    expect(next.remainingVoiceWeek).toBe(2);  // 数えているのは今の回だけ
  });
});

describe('段階2: 会話が成立した回は消費する（手動終了でも返さない）', () => {
  it('往復が成立した時点で消費し、回数券の回はそこで1枚だけ引く（何度報告しても1枚）', async () => {
    const uid = await A.newUser(2);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    expect(await A.report(sid, uid, { ...TALKED, aiRepliesAfterUser: 1 })).toMatchObject({ established: false, outcome: 'pending' });
    expect(await A.report(sid, uid, TALKED)).toMatchObject({ ok: true, established: true, outcome: 'consumed' });
    await A.report(sid, uid, TALKED);
    await A.report(sid, uid, { ...TALKED, userTurns: 5 });
    expect(await A.balance(uid)).toBe(1);
    expect(await A.chargeRows(sid)).toBe(1);
  });

  it('成立したあと手動で終了（manual-summary）しても返さない', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    await A.report(sid, uid, TALKED);
    await A.close(sid, 'completed', 'manual-summary', 40);
    const b = await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'consumed', outcome_reason: 'established' });
    expect(b.voiceRemainingWeek).toBe(2);
  });

  it('成立したあと、本人が 0秒・中断・superseded-new に書き換えても返さない（悪用防止）', async () => {
    const uid = await A.newUser(1);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    await A.report(sid, uid, TALKED);
    await A.close(sid, 'interrupted', 'superseded-new', 0);
    await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'consumed' });
    expect(await A.balance(uid)).toBe(0);
  });

  it('生徒が声を出していて AI と 90 秒以上つながっていた回（聞くだけ）は消費する', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    await A.d.query(`update public.ai_voice_session_ledger set token_first_at = now() - interval '2 minutes' where session_id = $1`, [sid]);
    expect(await A.report(sid, uid, { tutorTurns: 3, userSpeechStarts: 1, connectedMs: 95_000 }))
      .toMatchObject({ established: true, outcome: 'consumed' });
  });
});

describe('段階3: トークンは出たが成立の報告が無い回（悪用の上限）', () => {
  it('接続直後に閉じた・「こんにちは」と先生の最初の質問だけ・数秒で中断 → 消費しない', async () => {
    const uid = await A.newUser();
    const sid = await A.connectedButLeft(uid);
    const b = await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'not_established' });
    expect(b.voiceRemainingWeek).toBe(3);
  });

  it('直近7日で2回までは消費しない。3回目からは消費し、回数券の回なら1枚引く', async () => {
    const uid = await A.newUser(1);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const a = await A.connectedButLeft(uid);
    const b = await A.connectedButLeft(uid);
    const c = await A.connectedButLeft(uid);
    await A.budget(uid);
    expect(await A.ledger(a)).toMatchObject({ outcome: 'not_consumed' });
    expect(await A.ledger(b)).toMatchObject({ outcome: 'not_consumed' });
    expect(await A.ledger(c)).toMatchObject({ outcome: 'consumed', outcome_reason: 'unestablished_over_cap' });
    expect(await A.balance(uid)).toBe(0);
  });

  it('報告を一切送らない改造クライアントでも、タダで話せるのは週2回まで', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 5; i++) {
      const sid = await A.startOk(uid);
      await A.claim(sid, uid);
      await A.close(sid, 'completed', 'completed', 240);   // 4分話した（ことにする）
    }
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'voice_weekly_limit' });
  });

  it('一度もつながらなかった回（接続失敗・中国本土の回線など）は、別枠で直近7日3回まで消費しない', async () => {
    const uid = await A.newUser();
    const failed: string[] = [];
    for (let i = 0; i < 4; i++) failed.push(await A.connectedButLeft(uid, NEVER_CONNECTED));
    const left = await A.connectedButLeft(uid);   // つながったが会話にならなかった回は、別の枠がまだ残っている
    await A.budget(uid);
    for (const sid of failed.slice(0, 3)) expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'setup_failed' });
    expect(await A.ledger(failed[3])).toMatchObject({ outcome: 'consumed', outcome_reason: 'unestablished_over_cap' });
    expect(await A.ledger(left)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'not_established' });
  });

  it('材料を送らない版の画面（更新前の画面）から始めた回は、トークンが出ていればこれまでどおり消費する', async () => {
    const uid = await A.newUser(1);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const sid = await A.startOk(uid);
    await A.claim(sid, uid, false);
    await A.close(sid, 'completed', 'completed', 200);
    await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'consumed', outcome_reason: 'legacy_client', reports_evidence: false });
    expect(await A.balance(uid)).toBe(0);
  });

  it('更新前の画面でも、トークンが出ていない回は消費しない', async () => {
    const uid = await A.newUser();
    const sid = await A.reservedOnly(uid, 'error-exit-before-start');
    await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'no_token' });
  });
});

describe('遅れて届いた成立の報告', () => {
  it('終了の処理が先に届いて「消費しない」になった回に、あとから成立の報告が来たら消費へ直す', async () => {
    const uid = await A.newUser(1);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const sid = await A.connectedButLeft(uid, null);
    await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed' });
    expect(await A.report(sid, uid, TALKED)).toMatchObject({ established: true, outcome: 'consumed' });
    expect(await A.ledger(sid)).toMatchObject({ outcome_reason: 'established_late' });
    expect(await A.balance(uid)).toBe(0);
  });

  it('週の枠が埋まったあとに成立が遅れて届いた回は、回数券の回として引く（週の上限を超えて無料にならない）', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 2; i++) await A.talk(uid);
    const s3 = await A.startOk(uid);
    await A.claim(s3, uid);
    await A.report(s3, uid, { userTurns: 1, aiRepliesAfterUser: 1, tutorTurns: 2, userSpeechStarts: 1, connectedMs: 3_000 });
    await A.close(s3, 'interrupted', 'superseded-new');   // 別の端末で「終了して新しく始める」
    await A.talk(uid);                                    // 新しい回で話した（週の3回目）
    expect(await A.ledger(s3)).toMatchObject({ outcome: 'not_consumed', charge_kind: 'free' });
    expect(await A.report(s3, uid, TALKED)).toMatchObject({ established: true, outcome: 'consumed' }); // 前の端末の報告が遅れて届いた
    expect(await A.ledger(s3)).toMatchObject({ charge_kind: 'credit', outcome_reason: 'established_late' });
    expect(await A.balance(uid)).toBe(-1);
    expect(await A.budget(uid)).toMatchObject({ credits: 0, voiceRemainingWeek: 0 });
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'voice_weekly_limit' });
  });

  it('30分を過ぎてから届いた報告では直さない', async () => {
    const uid = await A.newUser(1);
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const sid = await A.connectedButLeft(uid, null);
    await A.budget(uid);
    await A.shiftBack(sid, 31);
    expect(await A.report(sid, uid, TALKED)).toMatchObject({ established: true, outcome: 'not_consumed' });
    expect(await A.balance(uid)).toBe(1);
  });
});

describe('本人以外・改ざん', () => {
  it('他人の回へ報告しても何も変わらない', async () => {
    const owner = await A.newUser();
    const other = await A.newUser();
    const sid = await A.startOk(owner);
    await A.claim(sid, owner);
    expect(await A.report(sid, other, TALKED)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'pending', evidence: {} });
  });

  it('つながっていた時間は「最初のトークン発行からの実時間」を超えられない', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    expect(await A.report(sid, uid, { tutorTurns: 5, userSpeechStarts: 5, connectedMs: 99_999_999 })).toMatchObject({ established: false });
    expect((await A.ledger(sid)).evidence.connectedMs).toBeLessThanOrEqual(6_000);
  });

  it('あとから小さい数を送っても減らない（大きいほうを残す）', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    await A.report(sid, uid, { userTurns: 1, tutorTurns: 1, userSpeechStarts: 2 });
    await A.report(sid, uid, { userTurns: 0, tutorTurns: 0, userSpeechStarts: 0 });
    expect((await A.ledger(sid)).evidence).toMatchObject({ userTurns: 1, tutorTurns: 1, userSpeechStarts: 2 });
  });

  it('started_at を8日前・mode を text に書き換えても、週の数は減らない', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 3; i++) await A.talk(uid);
    await A.d.query(`update public.ai_learning_sessions set started_at = now() - interval '8 days', mode = 'text'
      where learner_id = (select id from public.ai_learners where user_id = $1)`, [uid]);
    expect(await A.budget(uid)).toMatchObject({ voiceRemainingWeek: 0 });
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'voice_weekly_limit' });
  });

  it('トークンが出ていない回への報告は記録しない（つながっていない）', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    expect(await A.report(sid, uid, TALKED)).toMatchObject({ ok: true, established: false, code: 'no_token' });
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'pending', evidence: {} });
  });
});

describe('トークン発行の記録（Edge Function が OpenAI へ行く前に呼ぶ）', () => {
  it('テキストで予約した回には、音声のトークンを出さない', async () => {
    const uid = await A.newUser();
    const s = await A.start(uid, 'text');
    expect(await A.claim(s.sessionId, uid)).toMatchObject({ ok: false, code: 'not_voice_session' });
  });
  it('他人の user_id では出さない', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    expect(await A.claim(sid, randomUUID())).toMatchObject({ ok: false, code: 'forbidden' });
  });
  it('service_role 以外（ログインした本人）が呼んでも出さない', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.actAs(uid, 'authenticated');
    expect(await A.one(`select public.ai_service_claim_voice_token($1::uuid, $2::uuid, true) as r`, [sid, uid]))
      .toMatchObject({ ok: false, code: 'forbidden' });
  });
  it('予約から10分を過ぎたら出さない', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.shiftBack(sid, 11);
    expect(await A.claim(sid, uid)).toMatchObject({ ok: false, code: 'session_expired' });
  });
  it('1回の予約で出せるのは5回まで（再試行・先生の切り替え）', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    for (let i = 0; i < 5; i++) expect((await A.claim(sid, uid)).ok).toBe(true);
    expect(await A.claim(sid, uid)).toMatchObject({ ok: false, code: 'token_limit' });
  });
  it('「消費しない」と決まった回には、あとから出さない（使い回し防止）', async () => {
    const uid = await A.newUser();
    const sid = await A.reservedOnly(uid);
    await A.budget(uid);
    expect(await A.claim(sid, uid)).toMatchObject({ ok: false, code: 'session_closed' });
  });
  it('材料を送る版の画面かを記録する（一度送る版と記録されたら残る）', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.claim(sid, uid, true);
    await A.claim(sid, uid, false);
    expect(await A.ledger(sid)).toMatchObject({ reports_evidence: true, token_count: 2 });
  });
});

describe('週の上限と「あと何日で1回もどるか」', () => {
  it('成立した回が3回で上限。回数券が0なら voice_weekly_limit と戻る日時を返す', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const r = await A.start(uid);
    expect(r).toMatchObject({ ok: false, code: 'voice_weekly_limit', usedThisWeek: 3 });
    expect(r.nextAvailableAt).not.toBeNull();
  });

  it('成立しなかった回は「戻る日時」の計算に入らない', async () => {
    const uid = await A.newUser();
    const skipped = await A.reservedOnly(uid);
    await A.budget(uid);
    await A.shiftBack(skipped, 60 * 48);        // 2日前の「消費しなかった回」
    const talked: string[] = [];
    for (let i = 0; i < 3; i++) talked.push(await A.talk(uid));
    for (const sid of talked) await A.shiftBack(sid, 60 * 24); // 1日前に話した3回
    const b = await A.budget(uid);
    const want = await A.one<string>(`select (min(reserved_at) + interval '7 days')::text as r from public.ai_voice_session_ledger where session_id = any($1::uuid[])`, [talked]);
    expect(new Date(b.nextVoiceAvailableAt).getTime()).toBe(new Date(want).getTime());
  });

  it('テキストの回は数えない', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 2; i++) {
      const s = await A.start(uid, 'text');
      await A.close(s.sessionId, 'completed', 'text-complete', 300);
    }
    expect(await A.budget(uid)).toMatchObject({ voiceRemainingWeek: 3 });
  });
});

describe('進行中の回', () => {
  it('トークンが出て進行中（20分以内）の回は途中で決めない。画面の残りには数えない（入口を塞がない）', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    const b = await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'pending' });
    expect(b.voiceRemainingWeek).toBe(3);
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'session_already_active' });
  });

  it('トークンがまだ出ていない進行中の回は、使った回に数えない', async () => {
    const uid = await A.newUser();
    await A.startOk(uid);
    expect(await A.budget(uid)).toMatchObject({ voiceRemainingWeek: 3 });
  });

  it('進行中のまま20分を過ぎた回は決める（トークンあり・報告なし → 消費しない）', async () => {
    const uid = await A.newUser();
    const sid = await A.startOk(uid);
    await A.claim(sid, uid);
    await A.shiftBack(sid, 21);
    await A.budget(uid);
    expect(await A.ledger(sid)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'not_established' });
  });

  it('閉じずに離れた回があるときは、週の上限より先に「前の回を終了して新しく始める」へ案内する', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 2; i++) await A.talk(uid);
    const abandoned = await A.startOk(uid);
    await A.claim(abandoned, uid);                 // トークンは出たが、タブを閉じた
    // 入口の画面は「使い切りました」にならない（開始ボタンから復旧の案内へ進める）
    expect(await A.budget(uid)).toMatchObject({ voiceRemainingWeek: 1 });
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'session_already_active' });
    await A.close(abandoned, 'interrupted', 'superseded-new');   // 「終了して新しく始める」
    const next = await A.start(uid);
    expect(next).toMatchObject({ ok: true, remainingVoiceWeek: 0 });
    expect(await A.ledger(abandoned)).toMatchObject({ outcome: 'not_consumed', outcome_reason: 'not_established' });
  });

  it('テキストの回が進行中でも、音声が週の上限なら上限を返す（始められない音声のためにテキストを終わらせない）', async () => {
    const uid = await A.newUser();
    for (let i = 0; i < 3; i++) await A.talk(uid);
    const text = await A.start(uid, 'text');
    expect(text.ok).toBe(true);
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'voice_weekly_limit' });
    expect(await A.one<string>(`select completion_status as r from public.ai_learning_sessions where id = $1`, [text.sessionId])).toBe('in_progress');
  });

  it('進行中の回があると次の回は始められない（回数を二重に使わない）', async () => {
    const uid = await A.newUser();
    await A.startOk(uid);
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'session_already_active' });
    expect(await A.one<number>(`select count(*)::int as r from public.ai_voice_session_ledger where user_id = $1`, [uid])).toBe(1);
  });
});

describe('プランの音声枠（受講期間の合計）', () => {
  it('成立しなかった回はプランの合計にも数えない', async () => {
    const uid = await A.newUser();
    await A.d.query(`insert into public.ai_course_access (user_id, valid_from, valid_until, plan_id)
      values ($1, now() - interval '1 day', now() + interval '30 days', 'plan_test')`, [uid]);
    for (let i = 0; i < 3; i++) await A.reservedOnly(uid);
    expect(await A.budget(uid)).toMatchObject({ voiceTotal: 2, voiceRemainingTotal: 2 });
    await A.talk(uid);
    await A.talk(uid);
    expect(await A.start(uid)).toMatchObject({ ok: false, code: 'plan_voice_total_exhausted' });
  });
});

describe('権限（本人は台帳を読めない・書けない。内部の部品は呼べない）', () => {
  const tablePriv = (role: string, priv: string) =>
    A.one<boolean>(`select has_table_privilege($1, 'public.ai_voice_session_ledger', $2) as r`, [role, priv]);
  const fnPriv = (role: string, fn: string) =>
    A.one<boolean>(`select has_function_privilege($1, $2, 'EXECUTE') as r`, [role, fn]);

  it('anon / authenticated は台帳に何の権限も無い', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(await tablePriv(role, priv), `${role} ${priv}`).toBe(false);
      }
    }
  });

  it('ログインした本人が呼べるのは、自分の回へ材料を送る ai_voice_report_evidence だけ', async () => {
    expect(await fnPriv('authenticated', 'public.ai_voice_report_evidence(uuid, jsonb)')).toBe(true);
    expect(await fnPriv('anon', 'public.ai_voice_report_evidence(uuid, jsonb)')).toBe(false);
    for (const fn of [
      'public.ai_voice_settle_pending(uuid)', 'public.ai_voice_mark_consumed(uuid, text)',
      'public.ai_voice_used_since(uuid, timestamptz, boolean)', 'public.ai_voice_oldest_used_since(uuid, timestamptz, boolean)',
      'public.ai_voice_conversation_established(jsonb)', 'public.ai_voice_evidence_int(jsonb, text, bigint)',
      'public.ai_voice_consumption_rule()', 'public.ai_voice_claim_live_since()',
      'public.ai_service_claim_voice_token(uuid, uuid, boolean)', 'public.ai_service_release_voice_token(uuid, uuid)',
    ]) {
      expect(await fnPriv('authenticated', fn), fn).toBe(false);
      expect(await fnPriv('anon', fn), fn).toBe(false);
    }
    expect(await fnPriv('service_role', 'public.ai_service_claim_voice_token(uuid, uuid, boolean)')).toBe(true);
    expect(await fnPriv('service_role', 'public.ai_service_release_voice_token(uuid, uuid)')).toBe(true);
  });

  it('未ログイン（anon）は ai_start_session と ai_release_stale_sessions を呼べない', async () => {
    expect(await fnPriv('anon', 'public.ai_start_session(text, text, text, integer, text)')).toBe(false);
    expect(await fnPriv('authenticated', 'public.ai_start_session(text, text, text, integer, text)')).toBe(true);
    expect(await fnPriv('anon', 'public.ai_release_stale_sessions(uuid)')).toBe(false);
    expect(await fnPriv('authenticated', 'public.ai_release_stale_sessions(uuid)')).toBe(false);
  });
});

describe('本番へ出す途中（DB は新しく、Edge Function はまだトークンを記録しない古い版）', () => {
  let F: Api;
  beforeAll(async () => { const d = await base(); await d.exec(MIGRATION); F = api(d); }, 120_000);
  afterAll(async () => { await F?.d.close(); });

  it('新しい画面が成立を報告すれば、トークンの記録が無くても消費し、週の上限と回数券が効く', async () => {
    const uid = await F.newUser(1);
    for (let i = 0; i < 4; i++) {
      const sid = await F.startOk(uid);
      expect(await F.report(sid, uid, TALKED)).toMatchObject({ established: true, outcome: 'consumed' });
      await F.close(sid, 'completed', 'completed', 200);
    }
    expect(await F.balance(uid)).toBe(0);     // 4回目は回数券
    expect(await F.start(uid)).toMatchObject({ ok: false, code: 'voice_weekly_limit' });
  });

  it('古い画面（報告なし）でも、話し放題にはならない（週2回までしか見逃さない）', async () => {
    const uid = await F.newUser();
    for (let i = 0; i < 5; i++) {
      const sid = await F.startOk(uid);
      await F.close(sid, 'completed', 'completed', 240);
    }
    expect(await F.start(uid)).toMatchObject({ ok: false, code: 'voice_weekly_limit' });
  });

  it('新しい Edge Function が最初にトークンを記録したあとの予約から、「トークン無し＝消費しない」が効く', async () => {
    const first = await F.newUser();
    const warm = await F.startOk(first);
    expect((await F.claim(warm, first)).ok).toBe(true);
    const since = await F.one<string>(`select value #>> '{}' as r from public.ai_config where key = 'voice_claim_live_since'`);
    expect(since).toBeTruthy();
    const uid = await F.newUser();
    for (let i = 0; i < 4; i++) await F.reservedOnly(uid, 'error-exit-before-start');
    expect(await F.budget(uid)).toMatchObject({ voiceRemainingWeek: 3 });
  });
});

describe('この migration より前の音声セッション（台帳へ写す）', () => {
  let L: Api;
  let uid: string;
  let creditSession: string;
  let recentInProgress: string;
  beforeAll(async () => {
    const d = await base();
    L = api(d);
    uid = await L.newUser(1);
    const learner = (await d.query<{ id: string }>('select id from public.ai_learners where user_id = $1', [uid])).rows[0].id;
    const ins = async (mode: string, startedAgo: string, status: string) =>
      (await d.query<{ id: string }>(`insert into public.ai_learning_sessions (learner_id, mission_id, mode, started_at, completion_status)
        values ($1, 'legacy', $2, now() - $3::interval, $4) returning id`, [learner, mode, startedAgo, status])).rows[0].id;
    await ins('voice', '1 day', 'completed');
    creditSession = await ins('voice', '2 days', 'completed');
    await d.query(`insert into public.ai_conversation_credits (user_id, delta, reason, session_id) values ($1, -1, 'session', $2)`, [uid, creditSession]);
    recentInProgress = await ins('voice', '2 minutes', 'in_progress');
    await ins('text', '1 day', 'completed');
    await d.exec(MIGRATION);
    await markClaimLive(d);
  }, 120_000);
  afterAll(async () => { await L?.d.close(); });

  it('音声セッションは全部「消費した回」として写り、回数券を使った回は回数券の行とつながる。テキストは写らない', async () => {
    const rows = (await L.d.query<J>(`select l.charge_kind, l.outcome, l.outcome_reason, l.credit_entry_id is not null as linked, s.mode
      from public.ai_voice_session_ledger l join public.ai_learning_sessions s on s.id = l.session_id
      where l.user_id = $1 order by s.started_at`, [uid])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.outcome === 'consumed' && r.outcome_reason === 'legacy_before_ledger' && r.mode === 'voice')).toBe(true);
    expect(rows.filter((r) => r.charge_kind === 'credit' && r.linked)).toHaveLength(1);
  });

  it('これまでどおり数える。あとで started_at / mode を書き換えても減らない', async () => {
    await L.d.query(`update public.ai_learning_sessions set mode = 'text', started_at = now() - interval '30 days'
      where mission_id = 'legacy' and completion_status = 'completed'`);
    await L.close(recentInProgress, 'interrupted', 'superseded-new');
    expect(await L.budget(uid)).toMatchObject({ voiceUsedThisWeek: 3, voiceRemainingWeek: 0 });
  });

  it('移る直前に予約された回は、移ったあとも10分以内ならトークンを取れる（回数券を払ったのに断られない）', async () => {
    const d = await base();
    const T = api(d);
    const u = await T.newUser();
    const learner = (await d.query<{ id: string }>('select id from public.ai_learners where user_id = $1', [u])).rows[0].id;
    const sid = (await d.query<{ id: string }>(`insert into public.ai_learning_sessions (learner_id, mission_id, mode, started_at, completion_status)
      values ($1, 'legacy', 'voice', now() - interval '2 minutes', 'in_progress') returning id`, [learner])).rows[0].id;
    await d.exec(MIGRATION);
    expect(await T.claim(sid, u)).toMatchObject({ ok: true });
    await d.close();
  }, 120_000);
});

describe('migration を入れ直すと、Edge Function の最初の記録からやり直す', () => {
  it('rollback のあとで入れ直しても、前回の記録が残って話し放題にならない', async () => {
    const d = await base();
    const M = api(d);
    try {
      await d.exec(MIGRATION);
      const u0 = await M.newUser();
      const warm = await M.startOk(u0);
      expect((await M.claim(warm, u0)).ok).toBe(true);
      await M.close(warm, 'completed', 'completed', 10);
      const markers = () => M.one<number>(`select count(*)::int as r from public.ai_config where key = 'voice_claim_live_since'`);
      expect(await markers()).toBe(1);
      await d.exec(ROLLBACK);
      expect(await markers()).toBe(0);
      await d.exec(MIGRATION);
      const uid = await M.newUser();
      for (let i = 0; i < 5; i++) {
        const sid = await M.startOk(uid);
        await M.close(sid, 'completed', 'completed', 240);   // 古い Edge Function でトークンを取って話した（記録なし）
      }
      expect(await M.start(uid)).toMatchObject({ ok: false, code: 'voice_weekly_limit' });
    } finally {
      await d.close();
    }
  }, 120_000);
});

describe('rollback', () => {
  it('古い Edge Function の間に話した回（トークンの記録なし）は、戻すときに消費する。残高は 0 未満を出さない', async () => {
    const d = await base();
    await d.exec(MIGRATION);                       // 最初の記録はまだ無い
    const P = api(d);
    try {
      const uid = await P.newUser(1);
      for (let i = 0; i < 3; i++) {
        const sid = await P.startOk(uid);
        await P.report(sid, uid, TALKED);
        await P.close(sid, 'completed', 'completed', 200);
      }
      const paid = await P.startOk(uid);            // 回数券の回。記録なしで話して閉じた（まだ決まっていない）
      await P.close(paid, 'completed', 'completed', 240);
      await d.exec(ROLLBACK);
      expect(await P.ledger(paid)).toMatchObject({ outcome: 'consumed', outcome_reason: 'rollback' });
      expect(await P.balance(uid)).toBe(0);
      await d.query(`insert into public.ai_conversation_credits (user_id, delta, reason, note) values ($1, -3, 'adjust', 'test')`, [uid]);
      expect(await P.budget(uid)).toMatchObject({ credits: 0 });
    } finally {
      await d.close();
    }
  }, 120_000);

  it('戻すと予約時に回数券を引く 9/10 の動きになる。進行中の回は確定し、消費しないと決まった回は数え直さない', async () => {
    const d = await base();
    await d.exec(MIGRATION);
    await markClaimLive(d);
    const R = api(d);
    try {
      const uid = await R.newUser(1);
      for (let i = 0; i < 3; i++) await R.talk(uid);
      await R.reservedOnly(uid);
      await R.reservedOnly(uid);
      const inFlight = await R.startOk(uid);        // 回数券の回が、トークンを取って進行中
      await R.claim(inFlight, uid);

      await d.exec(ROLLBACK);

      expect(await R.one<boolean>(`select to_regprocedure('public.ai_voice_report_evidence(uuid, jsonb)') is null as r`)).toBe(true);
      expect(await R.ledger(inFlight)).toMatchObject({ outcome: 'consumed', outcome_reason: 'rollback' });
      expect(await R.balance(uid)).toBe(0);           // 進行中だった回数券の回は、ここで1枚引かれた
      expect(await R.budget(uid)).toMatchObject({ voiceUsedThisWeek: 4 }); // 3回＋進行中の回。消費しなかった2回は数えない

      await R.close(inFlight, 'completed', 'completed', 200);
      await d.query(`insert into public.ai_conversation_credits (user_id, delta, reason, note) values ($1, 1, 'grant', 'test')`, [uid]);
      expect(await R.start(uid)).toMatchObject({ ok: true, usedCredit: true });
      expect(await R.balance(uid)).toBe(0);           // 9/10 の動き: 予約した時点で引く
    } finally {
      await d.close();
    }
  }, 120_000);
});
