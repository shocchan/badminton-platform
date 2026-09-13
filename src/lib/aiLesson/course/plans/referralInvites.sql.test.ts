// @vitest-environment node
/*
 * 生徒の招待リンクで友達を無料招待 → 1人につき +7日（2026-09-13 CEO決定）を、
 * 本物の Postgres（PGlite）で 20260912120000（特典）＋20260913140000（今回）の migration ごと確かめる。
 * 本番DB・実在の生徒は使わない。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/notify pgrst[^;]*;/g, '');
const PERKS = read('supabase/migrations/20260912120000_invite_referrer_perks.sql');
const MIGRATION = read('supabase/migrations/20260913140000_referral_invites.sql');
const ROLLBACK = read('supabase/migrations/20260913140000_referral_invites.rollback.sql');

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.ai_config (key text primary key, value jsonb not null);
create table public.ai_learners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', is_test boolean not null default false,
  settings jsonb not null default '{}'::jsonb
);
create table public.ai_course_invites (
  id uuid primary key default gen_random_uuid(), code text not null unique, label text not null default '',
  max_uses int, used_count int not null default 0, expires_at timestamptz, is_active boolean not null default true,
  is_test boolean not null default false, created_at timestamptz not null default now(),
  plan_id text, access_days int, channel text
);
create table public.ai_course_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  valid_from timestamptz not null default now(), valid_until timestamptz not null,
  trial_days int, trial_started_at timestamptz, updated_at timestamptz not null default now()
);
create table public.ai_admins (user_id uuid primary key);
create function public.ai_is_admin() returns boolean language sql stable security definer
  as $$ select exists (select 1 from public.ai_admins where user_id = auth.uid()) $$;
`;

let db: PGlite;
const ME = randomUUID(); const F1 = randomUUID(); const F2 = randomUUID(); const F3 = randomUUID(); const F4 = randomUUID();
const as = async (uid: string | null) => { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); };
const diagnose = (uid: string) => db.query(
  `update public.ai_learners set settings = jsonb_set(settings, '{adventureV2,diagnosis}', jsonb_build_object('completedAt', now()::text), true) where user_id = $1`, [uid]);
const untilOf = async (uid: string) => Date.parse(String((await db.query<{ u: string }>(`select valid_until u from public.ai_course_access where user_id = $1`, [uid])).rows[0].u));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(PERKS);
  await db.exec(MIGRATION);
  await db.query(`insert into auth.users (id, email) values ($1,'me@x'),($2,'f1@x'),($3,'f2@x'),($4,'f3@x'),($5,'f4@x')`, [ME, F1, F2, F3, F4]);
  await db.query(`insert into public.ai_learners (user_id, display_name, settings) values ($1,'月月','{"adventureV2":{}}')`, [ME]);
  await db.query(`insert into public.ai_course_access (user_id, valid_until, trial_days, trial_started_at) values ($1, now() + interval '5 days', 7, now())`, [ME]);
}, 120_000);
afterAll(async () => { await db.close(); });

let code = '';

describe('本人の招待コード', () => {
  it('学習画面から呼ぶと自分のコードができる（week・student_referral・free-7d）。2回目は同じコード', async () => {
    await as(ME);
    const r1 = (await db.query<{ j: { ok: boolean; code: string; cap: number; days: number; rewarded: number } }>(`select public.ai_my_referral_invite() j`)).rows[0].j;
    expect(r1.ok).toBe(true);
    expect(r1.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(r1).toMatchObject({ cap: 3, days: 7, rewarded: 0 });
    code = r1.code;
    const r2 = (await db.query<{ j: { code: string } }>(`select public.ai_my_referral_invite() j`)).rows[0].j;
    expect(r2.code).toBe(code);
    const inv = (await db.query<{ reward_kind: string; channel: string; plan_id: string; referrer_user_id: string }>(`select reward_kind, channel, plan_id, referrer_user_id from public.ai_course_invites where code = $1`, [code])).rows[0];
    expect(inv).toMatchObject({ reward_kind: 'week', channel: 'student_referral', plan_id: 'free-7d', referrer_user_id: ME });
  });

  it('招待ページ用の公開情報は期限と満員だけ（誰のコードかは出ない）', async () => {
    await as(null);
    const j = (await db.query<{ j: Record<string, unknown> }>(`select public.ai_invite_public_info($1) j`, [code.toLowerCase()])).rows[0].j;
    expect(j).toMatchObject({ ok: true, active: true, full: false });
    expect(j).not.toHaveProperty('referrer_user_id');
    const none = (await db.query<{ j: { ok: boolean } }>(`select public.ai_invite_public_info('NOPE0000') j`)).rows[0].j;
    expect(none.ok).toBe(false);
  });
});

describe('紹介先が1日目の診断を終えると +7日', () => {
  const signup = async (uid: string, name: string) => {
    await db.query(`insert into public.ai_learners (user_id, display_name, settings) values ($1,$2,'{"adventureV2":{}}')`, [uid, name]);
    await db.query(`insert into public.ai_course_access (user_id, valid_until, trial_days, invite_code) values ($1, now() + interval '30 days', 7, $2)`, [uid, code]);
    await db.query(`update public.ai_course_access set trial_started_at = now(), valid_until = now() + interval '7 days' where user_id = $1`, [uid]);
  };

  it('登録・開始だけでは伸びない（「おめでとう」画面の権利もできない）', async () => {
    const before = await untilOf(ME);
    await signup(F1, '友1');
    expect(await untilOf(ME)).toBe(before);
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.ai_invite_perks where invitee_user_id = $1`, [F1])).rows[0].n;
    expect(n).toBe(0);
    await as(ME);
    const j = (await db.query<{ j: { waiting: number } }>(`select public.ai_my_referral_invite() j`)).rows[0].j;
    expect(j.waiting).toBe(1);
  });

  it('診断を終えた瞬間に +7日。同じ人が再び保存しても2回目は無い', async () => {
    const before = await untilOf(ME);
    await diagnose(F1);
    const after = await untilOf(ME);
    expect(Math.round((after - before) / 86_400_000)).toBe(7);
    await db.query(`update public.ai_learners set settings = jsonb_set(settings, '{adventureV2,x}', '1', true) where user_id = $1`, [F1]);
    expect(await untilOf(ME)).toBe(after);
    const row = (await db.query<{ perk: string; f: string | null }>(`select perk, fulfilled_at f from public.ai_invite_perks where invitee_user_id = $1`, [F1])).rows[0];
    expect(row.perk).toBe('week');
    expect(row.f).not.toBeNull();
  });

  it('期限切れの人にも「今から7日」で付く', async () => {
    await db.query(`update public.ai_course_access set valid_until = now() - interval '10 days' where user_id = $1`, [ME]);
    await signup(F2, '友2');
    await diagnose(F2);
    const after = await untilOf(ME);
    expect(Math.round((after - Date.now()) / 86_400_000)).toBe(7);
  });

  it('上限3人。4人目は記録だけで延長しない', async () => {
    await signup(F3, '友3'); await diagnose(F3);
    const at3 = await untilOf(ME);
    await signup(F4, '友4'); await diagnose(F4);
    expect(await untilOf(ME)).toBe(at3);
    const rows = (await db.query<{ f: string | null; note: string }>(`select fulfilled_at f, note from public.ai_invite_perks where invitee_user_id = $1`, [F4])).rows;
    expect(rows[0].f).toBeNull();
    expect(rows[0].note).toContain('上限');
    await as(ME);
    const j = (await db.query<{ j: { rewarded: number; waiting: number } }>(`select public.ai_my_referral_invite() j`)).rows[0].j;
    expect(j.rewarded).toBe(3);
    expect(j.waiting).toBe(0);
  });

  it('week の行は「おめでとう（3択）」画面に出ない', async () => {
    await as(ME);
    const j = (await db.query<{ j: { perk: string | null }[] }>(`select public.ai_my_invite_perks() j`)).rows[0].j;
    expect(j.filter((p) => p.perk === null)).toHaveLength(0);
  });
});

describe('先生が紐づけたコード（choice）は今までどおり', () => {
  it('「始める」で3択の権利ができ、診断完了では延長しない', async () => {
    const ERI = randomUUID(); const G = randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1,'eri@x'),($2,'g@x')`, [ERI, G]);
    await db.query(`insert into public.ai_learners (user_id, display_name, settings) values ($1,'エリ','{}'),($2,'友','{"adventureV2":{}}')`, [ERI, G]);
    await db.query(`insert into public.ai_course_access (user_id, valid_until) values ($1, now() + interval '10 days')`, [ERI]);
    await db.query(`insert into public.ai_course_invites (code, referrer_user_id, reward_kind) values ('ERICODE1', $1, 'choice')`, [ERI]);
    await db.query(`insert into public.ai_course_access (user_id, valid_until, trial_days, invite_code) values ($1, now() + interval '30 days', 7, 'ERICODE1')`, [G]);
    await db.query(`update public.ai_course_access set trial_started_at = now() where user_id = $1`, [G]);
    const before = await untilOf(ERI);
    await diagnose(G);
    expect(await untilOf(ERI)).toBe(before);
    const row = (await db.query<{ perk: string | null }>(`select perk from public.ai_invite_perks where invitee_user_id = $1`, [G])).rows[0];
    expect(row.perk).toBeNull();
  });
});

describe('rollback', () => {
  it('rollback で関数とトリガーが消え、もう一度流せる', async () => {
    await db.exec(ROLLBACK);
    const n = (await db.query<{ n: number }>(`select count(*)::int n from pg_proc where proname in ('ai_my_referral_invite','ai_referral_invite_reward','ai_invite_public_info')`)).rows[0].n;
    expect(n).toBe(0);
    await db.exec(MIGRATION);
  });
});
