-- ============================================================
-- Remote preflight（**ダッシュボードのSQL Editorに貼って実行する版**・read-only）
-- 2026-07-30 Final Executable Migration Gate で local実証済み（構文検証OK）。
--
-- 使い方: Supabase Dashboard → SQL Editor → 下の [A] を貼って Run → 結果を記録
--         続けて [B] を貼って Run → 結果を記録。
-- 出力は「件数」と「IDの先頭8桁（redacted）」のみ。個人名・メール・生IDは出さない。
-- ⚠️ SELECTのみ。INSERT/UPDATE/DELETE/DDLは1文も含まない。
-- ============================================================

-- ───────── [A] 対象件数・衝突・helper関数 ─────────
select 'learners_total' as k, count(*)::text as v from public.ai_learners
union all select 'labpreview_match', count(*)::text from public.ai_learners where admin_overrides ? 'labPreview'
union all select 'non_target_learners', count(*)::text from public.ai_learners where not (admin_overrides ? 'labPreview')
union all select 'labpreview_ids_redacted', coalesce(string_agg(left(id::text, 8), ','), '(none)') from public.ai_learners where admin_overrides ? 'labPreview'
union all select 'item_progress_rows', count(*)::text from public.ai_item_progress
union all select 'sessions_rows', count(*)::text from public.ai_learning_sessions
union all select 'conflict_objects', count(*)::text from (
  select tablename as n from pg_tables where schemaname = 'public'
    and tablename in ('ai_course_vocab_item_progress','ai_course_vocab_pack_progress',
                      'ai_course_vocab_diagnostic_attempts','ai_course_entitlements','ai_course_unit_progress')
  union all
  select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in ('ai_course_vocab_touch','ai_course_protect_admin_overrides','ai_upsert_unit_progress')
  union all
  select tgname from pg_trigger where tgname = 'ai_learners_protect_admin_overrides'
  union all
  select indexname from pg_indexes where schemaname = 'public'
    and indexname in ('ai_cvip_due_idx','ai_cvda_learner_idx','ai_cup_updated_idx')
) x
union all select 'conflict_policies', count(*)::text from pg_policies where schemaname = 'public'
  and (policyname like 'ai_course_vocab%' or policyname like 'ai_course_entitlements%' or policyname like 'ai_course_unit_progress%')
union all select 'helper_functions', coalesce(string_agg(p.proname || ':' || coalesce(array_to_string(p.proconfig, '|'), 'no-search_path'), ' / '), '(none)')
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname in ('ai_my_learner_ids','ai_is_admin')
order by 1;

-- ───────── [B] migration history（衝突・重複・適用済み確認） ─────────
-- ※ [A] とは別に貼って実行する（1回のRunで最後の結果しか表示されないため）
-- select 'target_versions_applied' as k,
--        coalesce(string_agg(version, ','), '(none)') as v
--   from supabase_migrations.schema_migrations
--  where version in ('20260728000000','20260728010000','20260729000000')
-- union all
-- select 'latest_applied_version', coalesce(max(version), '(none)') from supabase_migrations.schema_migrations
-- union all
-- select 'applied_total', count(*)::text from supabase_migrations.schema_migrations
-- union all
-- select 'duplicate_versions',
--        coalesce((select string_agg(version, ',') from
--                  (select version from supabase_migrations.schema_migrations group by version having count(*) > 1) d), '(none)')
-- order by 1;

-- 期待値（判定基準）:
--   labpreview_match          = 1（CEO検証learnerのみ。2以上なら要確認・0ならentitlements移行は0行）
--   conflict_objects          = 0（1以上なら同名object衝突 → 適用中止）
--   conflict_policies         = 0（同上）
--   target_versions_applied   = (none)（既に適用済みなら再適用不要）
--   duplicate_versions        = (none)
--   helper_functions          = ai_is_admin/ai_my_learner_ids ともに search_path=public
