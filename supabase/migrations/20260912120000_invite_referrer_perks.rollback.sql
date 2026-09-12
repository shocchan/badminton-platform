-- 20260912120000_invite_referrer_perks.sql の取り消し。
-- 特典の記録（ai_invite_perks）は消える。1か月追加で延びた valid_until は戻さない（本人に約束済みのため）。
drop trigger if exists ai_invite_perks_on_trial_start on public.ai_course_access;
drop function if exists public.ai_invite_perks_on_trial_start();
drop function if exists public.ai_admin_fulfill_invite_perk(uuid, boolean);
drop function if exists public.ai_admin_invite_perks();
drop function if exists public.ai_choose_invite_perk(uuid, text);
drop function if exists public.ai_my_invite_perks();
drop table if exists public.ai_invite_perks;
alter table public.ai_course_access drop column if exists invite_code;
alter table public.ai_course_invites drop column if exists referrer_user_id;
notify pgrst, 'reload schema';
