-- ⚠️ SUPERSEDED（2026-07-30）: 本草案は 20260728000000_ai_course_vocab_persistence.sql に置き換えられた。適用しないこと。
-- ============================================================
-- ことば図鑑 語彙進捗の専用テーブル（Phase 2C+ §47 草案・未適用）
-- ⚠️ migrations_draft/ は supabase CLI の適用対象外。共有SupabaseへはCEO承認まで適用しない。
-- 教材・画像manifestはTS静的データ（DBへ入れない）。学習者進捗のみDB。
-- ============================================================
create table if not exists public.ai_course_foundation_vocabulary_progress (
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  item_id text not null,
  sense_id text,
  self_assessment text not null default 'unseen' check (self_assessment in ('unseen','seen','learning','self_known','needs_review')),
  reading_state text not null default 'not_seen' check (reading_state in ('not_seen','familiar','guided','independent','retained')),
  meaning_state text not null default 'not_seen' check (meaning_state in ('not_seen','familiar','guided','independent','retained')),
  form_state text not null default 'not_seen' check (form_state in ('not_seen','familiar','guided','independent','retained')),
  connection_state text not null default 'not_seen' check (connection_state in ('not_seen','familiar','guided','independent','retained')),
  usage_state text not null default 'not_seen' check (usage_state in ('not_seen','familiar','guided','independent','retained')),
  image_viewed_at timestamptz,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (learner_id, item_id)
);
alter table public.ai_course_foundation_vocabulary_progress enable row level security;
revoke all on public.ai_course_foundation_vocabulary_progress from anon;
grant select, insert, update on public.ai_course_foundation_vocabulary_progress to authenticated;
grant all on public.ai_course_foundation_vocabulary_progress to service_role;
drop policy if exists ai_cfvp_select on public.ai_course_foundation_vocabulary_progress;
create policy ai_cfvp_select on public.ai_course_foundation_vocabulary_progress for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
drop policy if exists ai_cfvp_insert on public.ai_course_foundation_vocabulary_progress;
create policy ai_cfvp_insert on public.ai_course_foundation_vocabulary_progress for insert to authenticated
  with check (learner_id in (select public.ai_my_learner_ids()));
drop policy if exists ai_cfvp_update on public.ai_course_foundation_vocabulary_progress;
create policy ai_cfvp_update on public.ai_course_foundation_vocabulary_progress for update to authenticated
  using (learner_id in (select public.ai_my_learner_ids())) with check (learner_id in (select public.ai_my_learner_ids()));
-- rollback: drop table if exists public.ai_course_foundation_vocabulary_progress;
