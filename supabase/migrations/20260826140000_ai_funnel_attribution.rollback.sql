-- 20260826140000_ai_funnel_attribution.sql の取り消し。
--
-- 表ごと落とすので、記録した流入元と出来事は失われる。
-- 「計測をやめる」ではなく「作り直す」目的なら、drop table は実行せず
-- 関数の revoke だけにして表は残すこと（データは戻らない）。
--
-- ai_plan_purchases の3列は**残す**。購入行は売上の記録で、
-- 計測基盤を巻き戻す理由と、購入の出どころを消す理由は別だから。
-- どうしても消すなら最下部のコメントを外す。

revoke all on function public.ai_record_funnel_event(
  text, text, text, text, boolean, text, text, text, text, text, text, text, text, boolean) from anon, authenticated;
drop function if exists public.ai_record_funnel_event(
  text, text, text, text, boolean, text, text, text, text, text, text, text, text, boolean);

revoke all on function public.ai_link_attribution(text) from authenticated;
drop function if exists public.ai_link_attribution(text);

drop policy if exists ai_funnel_events_admin_read on public.ai_funnel_events;
drop policy if exists ai_attribution_admin_read on public.ai_attribution;

drop table if exists public.ai_funnel_events;
drop table if exists public.ai_attribution;

-- 購入側の列は既定では残す。消す場合のみ以下を有効化する:
-- alter table public.ai_plan_purchases
--   drop column if exists anon_id,
--   drop column if exists attribution_source,
--   drop column if exists attribution_campaign;
