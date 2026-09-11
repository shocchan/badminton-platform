// @vitest-environment node
// 招待リンクからの登録（2026-09-11 CEO決定「メール登録したら ID・パスワード・個人リンクが届く」）の約束。
//
// 1. 招待からの受講権の自動発行が、実際には動いていなかった（BEFORE トリガーが先に登録許可を消費し、
//    AFTER トリガーが「未消費」で探して必ず空振り）。本物の Postgres（PGlite）で再現し、直したことを固定する。
// 2. Edge Function ai-course-invite-signup の約束（回数制限→照合→作成→コード→メール、パスワードは応答に出さない）。
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const pick = (file: string, re: RegExp) => { const m = read(file).match(re); if (!m) throw new Error(`not found in ${file}: ${re}`); return m[0]; };

const STUB = `
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), '')) $$;
create table public.ai_course_invites (id uuid primary key default gen_random_uuid(), code text, label text, max_uses int, used_count int not null default 0, expires_at timestamptz, allowed_email text, is_active boolean not null default true, is_test boolean not null default false, created_at timestamptz default now(), plan_id text, access_days int, channel text);
create table public.ai_course_signup_grants (email text primary key, invite_id uuid, granted_at timestamptz default now(), expires_at timestamptz, consumed_at timestamptz, is_test boolean not null default false, plan_id text, access_days int, channel text);
create table public.ai_course_access (user_id uuid primary key, valid_from timestamptz not null default now(), valid_until timestamptz not null, plan_id text, source text, note text, granted_by text);
create table public.ai_learners (id uuid primary key default gen_random_uuid(), user_id uuid unique not null, is_test boolean not null default false);
`;
const CONSUME = `
create or replace function public.ai_consume_signup_grant() returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  update public.ai_course_signup_grants set consumed_at = now() where email = v_email and consumed_at is null;
  update public.ai_course_invites i set used_count = i.used_count + 1 from public.ai_course_signup_grants g where g.email = v_email and i.id = g.invite_id;
  new.is_test := coalesce((select g.is_test from public.ai_course_signup_grants g where g.email = v_email), false);
  return new;
end; $$;
create trigger ai_learners_consume_grant before insert on public.ai_learners for each row execute function public.ai_consume_signup_grant();
`;
const OLD_PROVISION = pick('supabase/migrations/20260910100000_ai_free_trial_invites.sql', /create or replace function public\.ai_provision_access_from_grant\(\)[\s\S]*?\n\$\$;/);
const NEW_PROVISION = pick('supabase/migrations/20260911150000_fix_invite_access_provision.sql', /create or replace function public\.ai_provision_access_from_grant\(\)[\s\S]*?\n\$\$;/);
const TRIGGER = `create trigger ai_learners_provision_access after insert on public.ai_learners for each row execute function public.ai_provision_access_from_grant();`;

const scenario = async (provisionSql: string) => {
  const d = new PGlite();
  await d.exec(STUB); await d.exec(CONSUME); await d.exec(provisionSql); await d.exec(TRIGGER);
  const uid = randomUUID(); const email = `t-${uid.slice(0, 8)}@example.com`;
  await d.query('insert into auth.users (id, email) values ($1, $2)', [uid, email]);
  await d.query(`insert into public.ai_course_signup_grants (email, expires_at, plan_id, access_days, channel) values ($1, now() + interval '30 days', 'free-7d', 7, 'student_referral')`, [email]);
  await d.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)`, [uid, email]);
  await d.query('insert into public.ai_learners (user_id) values ($1)', [uid]);
  const access = (await d.query<{ plan_id: string; days: number; source: string }>(`select plan_id, round(extract(epoch from (valid_until - valid_from)) / 86400)::int as days, source from public.ai_course_access where user_id = $1`, [uid])).rows;
  const grant = (await d.query<{ consumed: boolean }>('select consumed_at is not null as consumed from public.ai_course_signup_grants where email = $1', [email])).rows[0];
  await d.close();
  return { access, grant };
};

describe('招待からの受講権の自動発行（本物の Postgres で）', () => {
  it('直す前: 登録許可が先に消費され、受講権が付かなかった（再現）', async () => {
    const r = await scenario(OLD_PROVISION);
    expect(r.grant.consumed).toBe(true);
    expect(r.access).toHaveLength(0);
  }, 60_000);
  it('直した後: 学習者行ができた瞬間に free-7d・7日の受講権が付く', async () => {
    const r = await scenario(NEW_PROVISION);
    expect(r.access).toEqual([{ plan_id: 'free-7d', days: 7, source: 'invite' }]);
    expect(r.grant.consumed).toBe(true);
  }, 60_000);
  it('既に受講権がある人には触らない（有料の受講権を無料枠で上書きしない）', async () => {
    const d = new PGlite();
    await d.exec(STUB); await d.exec(CONSUME); await d.exec(NEW_PROVISION); await d.exec(TRIGGER);
    const uid = randomUUID(); const email = 'paid@example.com';
    await d.query('insert into auth.users (id, email) values ($1, $2)', [uid, email]);
    await d.query(`insert into public.ai_course_access (user_id, valid_until, plan_id, source) values ($1, now() + interval '180 days', 'coach-6m', 'purchase')`, [uid]);
    await d.query(`insert into public.ai_course_signup_grants (email, expires_at, plan_id) values ($1, now() + interval '1 day', 'free-7d')`, [email]);
    await d.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)`, [uid, email]);
    await d.query('insert into public.ai_learners (user_id) values ($1)', [uid]);
    const rows = (await d.query<{ plan_id: string }>('select plan_id from public.ai_course_access where user_id = $1', [uid])).rows;
    await d.close();
    expect(rows).toEqual([{ plan_id: 'coach-6m' }]);
  }, 60_000);
});

describe('Edge Function ai-course-invite-signup', () => {
  const SRC = read('supabase/functions/ai-course-invite-signup/index.ts');
  const DEPLOY = read('scripts/deploy-edge-functions.sh');
  const PAGE = read('src/pages/ai-lesson/InviteLandingPage.tsx');
  const AUTH = read('src/lib/aiLesson/course/courseAuth.ts');
  const body = SRC.slice(SRC.indexOf('serve(async (req)'));
  const at = (s: string) => { const i = body.indexOf(s); if (i < 0) throw new Error(`missing: ${s}`); return i; };

  it('順番: 回数制限 → 登録済み確認 → 招待照合 → アカウント作成 → 学習コード → メール → 記録', () => {
    const order = ['ai_code_login_throttle', 'ai_email_has_learner', 'ai_redeem_invite', '/auth/v1/admin/users', 'ai_service_issue_learning_code', 'api.resend.com/emails', 'ai_course_mail_log'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('パスワードは応答に出さない（メールにだけ）', () => {
    expect(body).toMatch(/return json\(\{ ok: true, sentTo: email \}\);/);
    expect(body).not.toMatch(/json\(\{[^}]*password/);
    expect(body).not.toMatch(/console\.(log|error)\([^)]*password/);
  });
  it('個人リンクは study.kawabado.com の /learn/ で、メール確認済みのアカウントを作る', () => {
    expect(SRC).toContain('const STUDY_ORIGIN = "https://study.kawabado.com";');
    expect(body).toMatch(/\/\$\{lang\}\/learn\/\$\{formatCode\(issued\.raw\)\}/);
    expect(body).toMatch(/email_confirm: true/);
  });
  it('登録許可の期限を30日に延ばす（個人リンクを後日開いても学習者行を作れる）', () => {
    expect(SRC).toContain('const GRANT_DAYS = 30;');
    expect(body).toMatch(/ai_course_signup_grants\?email=eq\.[\s\S]*?expires_at/);
  });
  it('メールには ID・パスワード・個人リンク・AI会話は含まない・記録は消えない が入る（中文・日本語）', () => {
    for (const s of ['ID（邮箱）', '密码:', '个人链接', '不含AI会话', '不会消失', 'ID（メールアドレス）', 'パスワード:', '個人リンク', 'AI会話は含みません', '消えません']) {
      expect(SRC, s).toContain(s);
    }
  });
  it('未ログインから呼ばれる＝deploy スクリプトの JWT 検証 OFF の一覧に載っている', () => {
    expect(DEPLOY).toMatch(/^\s+ai-course-invite-signup\s/m);
  });
  it('画面は OTP を使わず、送信後は「メールを確認してください」を出す', () => {
    expect(PAGE).toMatch(/signupWithInvite\(email, invite, lang\)/);
    expect(PAGE).not.toMatch(/sendEmailOtp|verifyEmailOtp/);
    expect(PAGE).toMatch(/data-testid="invite-sent"/);
    expect(AUTH).toMatch(/functions\/v1\/ai-course-invite-signup/);
  });
});
