-- 受講権（利用期間）テーブル（2026-08-18 CEO指示）。
--
-- 「日本語学習の購入済み・学習できると認めた人だけ、ログインしたら日本語学習もできる」を
-- データで持つ。これまで利用可否の実体は signup_grants（初回登録の門）しかなく、
-- **一度 learner が作られた人を期限で止める仕組みが無かった**。
--
-- 設計:
-- - user_id 主キー（auth.users 1人につき1行）。learner_id ではなく user_id なのは、
--   learner 行がまだ無い人（ID発行済み・未ログイン）にも期間を付けるため
-- - 本人は自分の行だけ読める。書けるのは管理者（ai_is_admin）だけ
-- - 期限切れの扱いはアプリ側（見せ方・文言）が持つ。ここは事実だけ持つ
create table if not exists public.ai_course_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  note text,
  granted_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_course_access enable row level security;

drop policy if exists ai_course_access_select on public.ai_course_access;
create policy ai_course_access_select on public.ai_course_access
  for select to authenticated
  using (user_id = auth.uid() or public.ai_is_admin());

drop policy if exists ai_course_access_ins on public.ai_course_access;
create policy ai_course_access_ins on public.ai_course_access
  for insert to authenticated with check (public.ai_is_admin());

drop policy if exists ai_course_access_upd on public.ai_course_access;
create policy ai_course_access_upd on public.ai_course_access
  for update to authenticated using (public.ai_is_admin());

drop policy if exists ai_course_access_del on public.ai_course_access;
create policy ai_course_access_del on public.ai_course_access
  for delete to authenticated using (public.ai_is_admin());

-- 2026-08-02 の匿名キー封鎖以降、このプロジェクトは default privileges を絞ってあるため、
-- 新テーブルは authenticated への GRANT を明示しないと RLS 以前に 42501 で弾かれる
-- （staging実機で確認）。anon には一切与えない。行の絞り込みは上のRLSが行う
grant select, insert, update, delete on public.ai_course_access to authenticated;
