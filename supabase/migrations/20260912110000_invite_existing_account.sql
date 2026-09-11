-- 招待からの登録: 既にアカウントがあるメール（学習者行は無い）でも申し込めるようにする（2026-09-12 CEO実機）
--
-- 症状: 以前バドミントン側などで作ったアカウントのメールを入れると、auth admin の作成が 422 を返し
--       「このメールアドレスは登録済みです」で止まっていた。
-- 対応: Edge Function（ai-course-invite-signup）が 422 のとき、この関数でユーザーIDを引き、
--       パスワードは触らずに受講権と個人リンクだけ付ける。
-- service_role 専用。ブラウザ（anon / authenticated）からは呼べない。

create or replace function public.ai_service_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(trim(p_email))
  order by u.created_at
  limit 1;
$$;

revoke all on function public.ai_service_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.ai_service_user_id_by_email(text) to service_role;

notify pgrst, 'reload schema';
