-- 20260820120000 のロールバック（匿名INSERTを再び許す）。
-- ⚠️ 戻すと誰でも無制限に申込を流し込める状態に戻る。広告を出しているなら戻さないこと。
grant insert on public.ai_plan_applications to anon, authenticated;
grant insert on public.ai_terms_consents    to anon, authenticated;

create policy ai_plan_applications_insert on public.ai_plan_applications
  for insert to anon, authenticated with check (true);
create policy ai_terms_consents_insert on public.ai_terms_consents
  for insert to anon, authenticated with check (true);
