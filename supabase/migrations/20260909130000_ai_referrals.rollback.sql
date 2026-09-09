-- rollback: 20260909130000_ai_referrals.sql
--
-- ⚠️ 付与済みの30日は**戻さない**。もらった人から取り上げるほうが害が大きい。
--    表と関数だけ落とし、受講権（ai_course_access）には触れない。

drop function if exists public.ai_admin_referrals();
drop function if exists public.ai_referral_revoke_reward(uuid, text);
drop function if exists public.ai_referral_reward(uuid, uuid);
drop function if exists public.ai_referral_attach_user(uuid, uuid);
drop function if exists public.ai_referral_touch(text, uuid);
drop function if exists public.ai_my_referral();

drop table if exists public.ai_referrals;
drop table if exists public.ai_referral_codes;

delete from public.ai_config where key = 'referral';
