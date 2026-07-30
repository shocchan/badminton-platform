-- ============================================================
-- Remote適用「直前」に実行する読み取り専用SELECT集（2026-07-30 Preflight）
-- 実行者: service_role（SQL Editor または psql直接続）。書き込み文は一切含まない。
-- 目的: 対象行数の確定・衝突の事前検出・Andyさん非対象の証明・前後比較の基準値取得。
-- 結果は redacted ID（先頭8桁）と件数のみをパケットへ転記する（learner名を書かない）。
-- ============================================================

-- [P1] 基準row count（適用後に同じクエリを再実行し、既存3表が不変であることを確認）
select 'ai_learners' as t, count(*) from public.ai_learners
union all select 'ai_item_progress', count(*) from public.ai_item_progress
union all select 'ai_learning_sessions', count(*) from public.ai_learning_sessions
union all select 'ai_usage_daily', count(*) from public.ai_usage_daily;

-- [P2] entitlements移行の対象件数（想定1件＝shocchan検証learnerのみ）
select count(*) as labpreview_rows,
       array_agg(left(id::text, 8)) as redacted_ids
from public.ai_learners
where admin_overrides ? 'labPreview';

-- [P3] Andyさん（=labPreviewを持たない全learner）が移行対象外であることの裏取り
--      対象外learnerの件数のみ（IDは出さない）。P2 + P3 = ai_learners総数と一致すること。
select count(*) as non_target_learners
from public.ai_learners
where not (admin_overrides ? 'labPreview');

-- [P4] CEO test learner存在確認（cd58eebf sessionの持ち主・redacted）
select left(learner_id::text, 8) as redacted_learner, count(*) as sessions
from public.ai_learning_sessions
where id = 'cd58eebf-f4d9-4821-8120-632814721a94'
group by learner_id;

-- [P5] 新規作成予定オブジェクトの名前衝突チェック（すべて0行であること）
select 'table' as kind, tablename as name from pg_tables
 where schemaname = 'public'
   and tablename in ('ai_course_vocab_item_progress','ai_course_vocab_pack_progress',
                     'ai_course_vocab_diagnostic_attempts','ai_course_entitlements',
                     'ai_course_unit_progress')
union all
select 'function', proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and proname in ('ai_course_vocab_touch','ai_course_protect_admin_overrides','ai_upsert_unit_progress')
union all
select 'trigger', tgname from pg_trigger
 where tgname in ('ai_learners_protect_admin_overrides')
union all
select 'index', indexname from pg_indexes
 where schemaname = 'public' and indexname in ('ai_cvip_due_idx','ai_cvda_learner_idx','ai_cup_updated_idx');

-- [P6] policy同名衝突チェック（0行であること）
select policyname, tablename from pg_policies
 where schemaname = 'public'
   and policyname like 'ai_course_vocab%' or policyname like 'ai_course_entitlements%'
    or policyname like 'ai_course_unit_progress%';

-- [P7] migration history（version重複・20260728000000/20260728010000/20260729000000 が未適用であること）
select version, name from supabase_migrations.schema_migrations
 where version in ('20260728000000','20260728010000','20260729000000');
select version, count(*) from supabase_migrations.schema_migrations
 group by version having count(*) > 1;

-- [P8] 依存する既存関数の存在＋RLS前提の確認
select proname, prosecdef as security_definer,
       (select array_agg(unnest) from unnest(proconfig)) as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('ai_my_learner_ids','ai_is_admin');

-- [P9] 既存ai_テーブルの現行RLS状態（適用前snapshot）
select c.relname, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'ai\_%' and c.relkind = 'r'
order by c.relname;
