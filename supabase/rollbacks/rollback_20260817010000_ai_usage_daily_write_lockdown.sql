-- rollback: ai_usage_daily の直接書き込み遮断を解除し、適用前の状態へ戻す。
-- 適用前の実測状態は docs/ai-course/production/ai-usage-daily-hardening-20260817.md に記録
-- （grant: authenticated へ select/insert/update、policy: insert/update とも admin バイパスつき）。
grant insert, update on public.ai_usage_daily to authenticated;

drop policy if exists ai_usage_daily_insert on public.ai_usage_daily;
create policy ai_usage_daily_insert on public.ai_usage_daily for insert to authenticated
  with check (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());

drop policy if exists ai_usage_daily_update on public.ai_usage_daily;
create policy ai_usage_daily_update on public.ai_usage_daily for update to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
