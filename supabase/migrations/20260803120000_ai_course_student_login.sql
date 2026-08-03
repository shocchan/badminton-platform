-- 生徒ログイン（ログインID＋6文字パスワード）の台帳。
--
-- 方針（PAID STUDENT PILOT §2・§3・§6）:
--   - 認証の正準は Supabase Auth。**パスワードはここに保存しない**（hashも持たない）
--   - このテーブルが持つのは「ログインID ↔ Authユーザー」の対応だけ
--   - learner から直接読めない。解決は service_role を持つ Worker だけが行う
--     （対応表が読めると、IDの総当たりで登録者を列挙できてしまう）
--
-- rollback: supabase/rollbacks/rollback_20260803120000_ai_course_student_login.sql

-- ── ログインID ↔ Auth ユーザー ─────────────────────────────
create table if not exists public.ai_course_logins (
  login_id      text primary key,
  -- Auth 側の正準ID。ユーザー削除で対応も消す
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- 認証時に Supabase Auth へ渡すメール。learner には見せない
  email         text not null,
  -- 用途の区別（owner_pilot_test / paid_student など）。運用の取り違え防止
  account_purpose text not null default 'paid_student',
  is_active     boolean not null default true,
  -- 管理者による手動lock。自動lockは attempts から計算するのでここには書かない
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists ai_course_logins_user_id_key on public.ai_course_logins(user_id);
create index if not exists ai_course_logins_email_idx on public.ai_course_logins(lower(email));

comment on table public.ai_course_logins is
  'ログインID↔Authユーザーの対応。パスワードは保存しない（正準はSupabase Auth）。learnerからは読めない';

-- ── ログイン試行の記録（audit log・自動lockの根拠） ──────────
create table if not exists public.ai_course_login_attempts (
  id            bigserial primary key,
  -- 存在しないIDへの試行も記録する（総当たりの検知に要る）ため FK は張らない
  login_id      text not null,
  succeeded     boolean not null,
  -- 生IPは保存しない。日付混じりのハッシュ（Worker側で計算）
  ip_hash       text,
  attempted_at  timestamptz not null default now()
);

create index if not exists ai_course_login_attempts_lookup_idx
  on public.ai_course_login_attempts(login_id, attempted_at desc);

comment on table public.ai_course_login_attempts is
  'ログイン試行の監査ログ。パスワードは保存しない。IPはハッシュのみ';

-- ── RLS: learner からは一切見えない ───────────────────────
alter table public.ai_course_logins enable row level security;
alter table public.ai_course_login_attempts enable row level security;

-- policy を作らない = anon/authenticated からは 0 行。
-- service_role は RLS を迂回するので Worker だけが読み書きできる。
-- 「自分の行だけ見せる」policy も**作らない**: ログインIDは本人にはメールで伝えるため、
-- アプリから引く必要がない。読めるようにするほど列挙の的が増える。

revoke all on public.ai_course_logins from anon, authenticated;
revoke all on public.ai_course_login_attempts from anon, authenticated;

-- ── 古い試行ログの掃除（監査に必要な期間だけ残す） ──────────
create or replace function public.ai_course_prune_login_attempts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_course_login_attempts
  where attempted_at < now() - interval '90 days';
$$;

revoke all on function public.ai_course_prune_login_attempts() from anon, authenticated;
