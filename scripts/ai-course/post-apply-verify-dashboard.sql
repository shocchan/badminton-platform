-- 適用直後の検証（SQL Editorに貼る・**SELECTのみ**）。すべて期待値どおりならOK。
-- 2026-07-30 Gateでlocal実測した期待値を右列に記す。
select 'new_tables_with_rls' as k, count(*)::text as v, '5' as expected
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
   and c.relname in ('ai_course_vocab_item_progress','ai_course_vocab_pack_progress',
                     'ai_course_vocab_diagnostic_attempts','ai_course_entitlements','ai_course_unit_progress')
union all
select 'policies', count(*)::text, '11' from pg_policies where schemaname = 'public'
   and (tablename like 'ai_course_vocab%' or tablename in ('ai_course_entitlements','ai_course_unit_progress'))
union all
select 'indexes', count(*)::text, '3' from pg_indexes where schemaname = 'public'
   and indexname in ('ai_cvip_due_idx','ai_cvda_learner_idx','ai_cup_updated_idx')
union all
select 'touch_triggers', count(*)::text, '3' from pg_trigger
 where not tgisinternal and tgname like 'ai_course_vocab%_touch'
union all
select 'admin_overrides_protect_trigger', count(*)::text, '1' from pg_trigger
 where tgname = 'ai_learners_protect_admin_overrides'
union all
select 'definer_functions_with_search_path',
       coalesce(string_agg(p.proname || ':' || coalesce(array_to_string(p.proconfig, '|'), 'NO-search_path'), ' / '), '(none)'),
       'ai_course_protect_admin_overrides / ai_upsert_unit_progress ともに search_path=public'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ai_course_protect_admin_overrides','ai_upsert_unit_progress')
union all
select 'anon_grants_on_new_tables', count(*)::text, '0'
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon'
   and table_name in ('ai_course_vocab_item_progress','ai_course_vocab_pack_progress',
                      'ai_course_vocab_diagnostic_attempts','ai_course_entitlements','ai_course_unit_progress')
union all
select 'authenticated_write_on_entitlements', count(*)::text, '0'
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'authenticated' and table_name = 'ai_course_entitlements'
   and privilege_type in ('INSERT','UPDATE','DELETE')
union all
select 'authenticated_write_on_unit_progress', count(*)::text, '0'
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'authenticated' and table_name = 'ai_course_unit_progress'
   and privilege_type in ('INSERT','UPDATE','DELETE')
union all
select 'entitlement_rows_migrated', count(*)::text, '1（6d967731…のみ）' from public.ai_course_entitlements
union all
select 'entitlement_ids_redacted', coalesce(string_agg(left(learner_id::text, 8), ','), '(none)'), '6d967731'
  from public.ai_course_entitlements
union all
select 'baseline_learners_total', count(*)::text, '適用前と同じ（1）' from public.ai_learners
union all
select 'baseline_item_progress_rows', count(*)::text, '適用前と同じ（12）' from public.ai_item_progress
union all
select 'baseline_sessions_rows', count(*)::text, '適用前と同じ（24）' from public.ai_learning_sessions
order by 1;
