-- ============================================================
-- AUGUST RELEASE / GATE① 適用直前preflight（read-only・単一結果セット）
--
-- Management API の database/query は「最後の文の結果」しか返さないため、
-- 全チェックを1つの union all にまとめて1回で取得する。
-- 出力は件数とIDの先頭8桁のみ（個人名・メール・生UUIDは出さない）。
-- ⚠️ SELECTのみ。INSERT/UPDATE/DELETE/DDLを1文も含まない。
-- ============================================================
select k, v from (
  -- ── 対象件数（entitlements移行の対象＝labPreviewを持つlearner） ──
  select 1 as ord, 'learners_total' as k, count(*)::text as v from public.ai_learners
  union all select 2, 'labpreview_match', count(*)::text from public.ai_learners where admin_overrides ? 'labPreview'
  union all select 3, 'non_target_learners', count(*)::text from public.ai_learners where not (admin_overrides ? 'labPreview')
  union all select 4, 'labpreview_ids_redacted', coalesce(string_agg(left(id::text, 8), ','), '(none)')
    from public.ai_learners where admin_overrides ? 'labPreview'

  -- ── baseline row counts（適用前後で不変であるべき既存表） ──
  union all select 10, 'baseline_ai_learners', count(*)::text from public.ai_learners
  union all select 11, 'baseline_ai_item_progress', count(*)::text from public.ai_item_progress
  union all select 12, 'baseline_ai_learning_sessions', count(*)::text from public.ai_learning_sessions
  union all select 13, 'baseline_ai_session_utterances', count(*)::text from public.ai_session_utterances
  union all select 14, 'baseline_ai_growth_snapshots', count(*)::text from public.ai_growth_snapshots
  union all select 15, 'baseline_ai_usage_daily', count(*)::text from public.ai_usage_daily
  union all select 16, 'baseline_ai_config', count(*)::text from public.ai_config
  union all select 17, 'baseline_ai_course_invites', count(*)::text from public.ai_course_invites
  union all select 18, 'baseline_auth_users', count(*)::text from auth.users

  -- ── 衝突チェック（同名 table / function / trigger / index / policy） ──
  union all select 20, 'conflict_objects', count(*)::text from (
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
  union all select 21, 'conflict_policies', count(*)::text from pg_policies where schemaname = 'public'
    and (policyname like 'ai_course_vocab%' or policyname like 'ai_course_entitlements%' or policyname like 'ai_course_unit_progress%')

  -- ── 依存helper（migrationが前提にする関数がsearch_path固定で存在するか） ──
  union all select 30, 'helper_functions',
    coalesce(string_agg(p.proname || ':' || coalesce(array_to_string(p.proconfig, '|'), 'NO-search_path'), ' / ' order by p.proname), '(none)')
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in ('ai_my_learner_ids','ai_is_admin')

  -- ── migration history ──
  union all select 40, 'history_applied_total', count(*)::text from supabase_migrations.schema_migrations
  union all select 41, 'history_latest_version', coalesce(max(version), '(none)') from supabase_migrations.schema_migrations
  union all select 42, 'history_target_applied', coalesce(string_agg(version, ',' order by version), '(none)')
    from supabase_migrations.schema_migrations where version in ('20260728000000','20260728010000','20260729000000')
  union all select 43, 'history_duplicate_versions', coalesce(
    (select string_agg(version, ',') from
      (select version from supabase_migrations.schema_migrations group by version having count(*) > 1) d), '(none)')
) t order by ord;
