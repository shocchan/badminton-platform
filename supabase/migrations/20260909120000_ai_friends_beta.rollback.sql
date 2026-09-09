-- rollback: 20260909120000_ai_friends_beta.sql
--
-- ⚠️ plan_ai_budgets から friends-beta を外すと、既に配った Friends Beta の人は
--    「枠なし＝共通上限だけ」に戻る（締め出しにはならない）。受講権と学習記録は消さない。

drop function if exists public.ai_admin_beta_dashboard();
drop function if exists public.ai_my_conversation_budget();

update public.ai_config
   set value = value - 'friends-beta'
 where key = 'plan_ai_budgets';

delete from public.ai_config where key = 'friends_beta';
