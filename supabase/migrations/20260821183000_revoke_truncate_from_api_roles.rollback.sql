-- 巻き戻し（本来この権限は不要なので、通常このrollbackを流す必要はない）。
-- 何かがこの権限に依存していたと判明した場合のみ、原因を特定したうえで実行すること。
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_cost_topups',
    'ai_course_access',
    'ai_course_alerts',
    'ai_course_events',
    'ai_plan_applications',
    'ai_terms_consents'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('grant truncate on public.%I to anon, authenticated', t);
    end if;
  end loop;
end $$;

alter default privileges in schema public grant truncate on tables to anon, authenticated;
