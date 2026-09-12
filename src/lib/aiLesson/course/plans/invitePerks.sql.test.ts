// @vitest-environment node
/*
 * 紹介した生徒への特典（2026-09-12 CEO決定）を、本物の Postgres（PGlite）で migration ごと確かめる。
 * 本番DB・実在の生徒は使わない（架空の利用者を作る）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const MIGRATION = read('supabase/migrations/20260912120000_invite_referrer_perks.sql');
const ROLLBACK = read('supabase/migrations/20260912120000_invite_referrer_perks.rollback.sql');

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.ai_learners (user_id uuid primary key references auth.users(id) on delete cascade, display_name text not null default '');
create table public.ai_course_invites (id uuid primary key default gen_random_uuid(), code text not null unique);
create table public.ai_course_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  trial_days int, trial_started_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.ai_admins (user_id uuid primary key);
create function public.ai_is_admin() returns boolean language sql stable security definer
  as $$ select exists (select 1 from public.ai_admins where user_id = auth.uid()) $$;
`;

let db: PGlite;
const ERI = randomUUID(); const A = randomUUID(); const B = randomUUID(); const ADMIN = randomUUID();
const as = async (uid: string | null) => { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); };
const startTrial = (uid: string) => db.query(`update public.ai_course_access set trial_started_at = now(), valid_until = now() + interval '7 days' where user_id = $1`, [uid]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(MIGRATION.replace(/notify pgrst[^;]*;/g, ''));
  await db.query(`insert into auth.users (id, email) values ($1,'eri@x'),($2,'a@x'),($3,'b@x'),($4,'admin@x')`, [ERI, A, B, ADMIN]);
  await db.query(`insert into public.ai_admins values ($1)`, [ADMIN]);
  await db.query(`insert into public.ai_learners values ($1,'エリ'),($2,'小王'),($3,'')`, [ERI, A, B]);
  await db.query(`insert into public.ai_course_invites (code, referrer_user_id) values ('ERICODE1', $1), ('TEACHER1', null)`, [ERI]);
  await db.query(`insert into public.ai_course_access (user_id, valid_until) values ($1, now() + interval '10 days')`, [ERI]);
}, 120_000);
afterAll(async () => { await db.close(); });

describe('「始める」の瞬間に紹介者へ権利ができる', () => {
  it('エリさんのコードから来た人が始めると、エリさんに perk 未選択の権利が1件できる', async () => {
    await db.query(`insert into public.ai_course_access (user_id, valid_until, trial_days, invite_code) values ($1, now()+interval '30 days', 7, 'ERICODE1')`, [A]);
    await startTrial(A);
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.ai_invite_perks where referrer_user_id = $1 and invitee_user_id = $2 and perk is null`, [ERI, A]);
    expect(r.rows[0].n).toBe(1);
  });

  it('同じ人がもう一度 update されても2件目はできない（冪等）', async () => {
    await db.query(`update public.ai_course_access set updated_at = now(), trial_started_at = now() where user_id = $1`, [A]);
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.ai_invite_perks where invitee_user_id = $1`, [A]);
    expect(r.rows[0].n).toBe(1);
  });

  it('先生のコード（referrer なし）からの申込では権利ができない', async () => {
    await db.query(`insert into public.ai_course_access (user_id, valid_until, trial_days, invite_code) values ($1, now()+interval '30 days', 7, 'TEACHER1')`, [B]);
    await startTrial(B);
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.ai_invite_perks where invitee_user_id = $1`, [B]);
    expect(r.rows[0].n).toBe(0);
  });
});

describe('本人が読む・選ぶ', () => {
  it('ai_my_invite_perks は自分の権利だけ（申込者の表示名つき）', async () => {
    await as(ERI);
    const r = await db.query<{ j: { inviteeName: string | null; perk: string | null }[] }>(`select public.ai_my_invite_perks() j`);
    expect(r.rows[0].j).toHaveLength(1);
    expect(r.rows[0].j[0].inviteeName).toBe('小王');
    expect(r.rows[0].j[0].perk).toBeNull();
    await as(A);
    const other = await db.query<{ j: unknown[] }>(`select public.ai_my_invite_perks() j`);
    expect(other.rows[0].j).toHaveLength(0);
  });

  it('他人の権利は選べない', async () => {
    const id = (await db.query<{ id: string }>(`select id from public.ai_invite_perks where invitee_user_id = $1`, [A])).rows[0].id;
    await as(A);
    const r = await db.query<{ j: { ok: boolean; code: string } }>(`select public.ai_choose_invite_perk($1, 'month') j`, [id]);
    expect(r.rows[0].j).toEqual({ ok: false, code: 'not_found' });
  });

  it('知らない特典名は弾く', async () => {
    const id = (await db.query<{ id: string }>(`select id from public.ai_invite_perks where invitee_user_id = $1`, [A])).rows[0].id;
    await as(ERI);
    const r = await db.query<{ j: { ok: boolean; code: string } }>(`select public.ai_choose_invite_perk($1, 'car') j`, [id]);
    expect(r.rows[0].j.code).toBe('invalid_perk');
  });

  it('「1か月追加」を選ぶと自分の受講期限が +30日になり、その場で完了扱い', async () => {
    const id = (await db.query<{ id: string }>(`select id from public.ai_invite_perks where invitee_user_id = $1`, [A])).rows[0].id;
    const before = (await db.query<{ u: string }>(`select valid_until u from public.ai_course_access where user_id = $1`, [ERI])).rows[0].u;
    await as(ERI);
    const r = await db.query<{ j: { ok: boolean; code: string; perk: string } }>(`select public.ai_choose_invite_perk($1, 'month') j`, [id]);
    expect(r.rows[0].j.ok).toBe(true);
    expect(r.rows[0].j.perk).toBe('month');
    const after = (await db.query<{ u: string }>(`select valid_until u from public.ai_course_access where user_id = $1`, [ERI])).rows[0].u;
    expect(Math.round((Date.parse(after) - Date.parse(before)) / 86_400_000)).toBe(30);
    const row = (await db.query<{ fulfilled: boolean }>(`select fulfilled_at is not null fulfilled from public.ai_invite_perks where id = $1`, [id])).rows[0];
    expect(row.fulfilled).toBe(true);
  });

  it('選び直しはできない（2回目は already_chosen・期限も動かない）', async () => {
    const id = (await db.query<{ id: string }>(`select id from public.ai_invite_perks where invitee_user_id = $1`, [A])).rows[0].id;
    const before = (await db.query<{ u: string }>(`select valid_until u from public.ai_course_access where user_id = $1`, [ERI])).rows[0].u;
    await as(ERI);
    const r = await db.query<{ j: { code: string; perk: string } }>(`select public.ai_choose_invite_perk($1, 'mv') j`, [id]);
    expect(r.rows[0].j).toMatchObject({ code: 'already_chosen', perk: 'month' });
    const after = (await db.query<{ u: string }>(`select valid_until u from public.ai_course_access where user_id = $1`, [ERI])).rows[0].u;
    expect(String(after)).toBe(String(before));
  });

  it('MV・文法完全版は「選んだ」だけで、渡すのは先生（fulfilled は空のまま）', async () => {
    const C = randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1,'c@x')`, [C]);
    await db.query(`insert into public.ai_course_access (user_id, valid_until, trial_days, invite_code) values ($1, now()+interval '30 days', 7, 'ERICODE1')`, [C]);
    await startTrial(C);
    const id = (await db.query<{ id: string }>(`select id from public.ai_invite_perks where invitee_user_id = $1`, [C])).rows[0].id;
    await as(ERI);
    const r = await db.query<{ j: { ok: boolean } }>(`select public.ai_choose_invite_perk($1, 'grammar') j`, [id]);
    expect(r.rows[0].j.ok).toBe(true);
    const row = (await db.query<{ perk: string; f: string | null }>(`select perk, fulfilled_at f from public.ai_invite_perks where id = $1`, [id])).rows[0];
    expect(row.perk).toBe('grammar');
    expect(row.f).toBeNull();
  });
});

describe('管理者', () => {
  it('一覧は管理者だけ。渡したら fulfilled を付けられる', async () => {
    await as(ERI);
    const denied = await db.query<{ j: { ok: boolean } }>(`select public.ai_admin_invite_perks() j`);
    expect(denied.rows[0].j.ok).toBe(false);
    await as(ADMIN);
    const r = await db.query<{ j: { ok: boolean; rows: { id: string; perk: string; referrerName: string; fulfilledAt: string | null }[] } }>(`select public.ai_admin_invite_perks() j`);
    expect(r.rows[0].j.ok).toBe(true);
    const g = r.rows[0].j.rows.find((x) => x.perk === 'grammar')!;
    expect(g.referrerName).toBe('エリ');
    expect(g.fulfilledAt).toBeNull();
    await db.query(`select public.ai_admin_fulfill_invite_perk($1)`, [g.id]);
    const after = await db.query<{ f: string | null }>(`select fulfilled_at f from public.ai_invite_perks where id = $1`, [g.id]);
    expect(after.rows[0].f).not.toBeNull();
  });
});

describe('rollback', () => {
  it('rollback で表・関数・列が消え、もう一度 migration を流せる', async () => {
    await db.exec(ROLLBACK.replace(/notify pgrst[^;]*;/g, ''));
    const t = await db.query<{ n: number }>(`select count(*)::int n from pg_tables where tablename = 'ai_invite_perks'`);
    expect(t.rows[0].n).toBe(0);
    const c = await db.query<{ n: number }>(`select count(*)::int n from information_schema.columns where table_name='ai_course_access' and column_name='invite_code'`);
    expect(c.rows[0].n).toBe(0);
    await db.exec(MIGRATION.replace(/notify pgrst[^;]*;/g, ''));
  });
});
