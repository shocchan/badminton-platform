-- 20260912110000_invite_existing_account.sql の取り消し
drop function if exists public.ai_service_user_id_by_email(text);
notify pgrst, 'reload schema';
