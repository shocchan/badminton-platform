-- ============================================================
-- しくみラボ 正式進捗の専用テーブル（Phase 2B §15 草案・未適用）
-- ⚠️ この migrations_draft/ ディレクトリは supabase CLI の適用対象外。
-- ⚠️ 共有Supabase（staging/本番同居）へは CEO承認まで適用しないこと。
-- 方針: additive only・既存テーブル変更なし・backfillなし・RLS有効・
--       learner本人のみ・管理者はai_is_admin()（admin_overrides jsonbはRLS根拠にしない）
-- ============================================================

-- 1) 単元attempt（1回の単元実施）
create table if not exists public.ai_course_foundation_unit_attempts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  unit_id text not null,
  attempt_number int not null check (attempt_number >= 1),
  attempt_seed int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  locale text not null default 'zh' check (locale in ('ja', 'zh')),
  question_count int not null default 0 check (question_count >= 0),
  correct_count int not null default 0 check (correct_count >= 0 and correct_count <= question_count),
  reading_score jsonb,      -- {correct,total} 軸別スコア（列を増やしすぎない）
  meaning_score jsonb,
  form_score jsonb,
  connection_score jsonb,
  particle_score jsonb,
  usage_score jsonb,
  created_at timestamptz not null default now(),
  constraint ai_cfua_completed_after_start check (completed_at is null or completed_at >= started_at),
  constraint ai_cfua_unique_attempt unique (learner_id, unit_id, attempt_number)
);
create index if not exists ai_cfua_learner_idx on public.ai_course_foundation_unit_attempts (learner_id, unit_id);

-- 2) 問題attempt（1問の回答・自由入力本文は保存しない方針 §15）
create table if not exists public.ai_course_foundation_question_attempts (
  id uuid primary key default gen_random_uuid(),
  unit_attempt_id uuid not null references public.ai_course_foundation_unit_attempts(id) on delete cascade,
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  question_id text not null,
  item_id text,
  rule_id text,
  dimension text not null check (dimension in ('reading', 'meaning', 'form', 'connection', 'particle', 'usage')),
  correct boolean not null,
  hint_used boolean not null default false,
  error_tag text not null,
  attempted_at timestamptz not null default now(),
  constraint ai_cfqa_target check (item_id is not null or rule_id is not null),
  constraint ai_cfqa_unique_answer unique (unit_attempt_id, question_id)
);
create index if not exists ai_cfqa_learner_idx on public.ai_course_foundation_question_attempts (learner_id, attempted_at);

-- 3) Item×次元の進捗（1行= learner×item）
create table if not exists public.ai_course_foundation_item_progress (
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  item_id text not null,
  reading_state text not null default 'not_seen' check (reading_state in ('not_seen','familiar','guided','independent','retained')),
  meaning_state text not null default 'not_seen' check (meaning_state in ('not_seen','familiar','guided','independent','retained')),
  form_state text not null default 'not_seen' check (form_state in ('not_seen','familiar','guided','independent','retained')),
  connection_state text not null default 'not_seen' check (connection_state in ('not_seen','familiar','guided','independent','retained')),
  particle_state text not null default 'not_seen' check (particle_state in ('not_seen','familiar','guided','independent','retained')),
  usage_state text not null default 'not_seen' check (usage_state in ('not_seen','familiar','guided','independent','retained')),
  last_attempted_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (learner_id, item_id)
);

-- 4) 復習キュー
create table if not exists public.ai_course_foundation_review_queue (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  target_type text not null check (target_type in ('item', 'rule')),
  target_id text not null,
  dimension text not null check (dimension in ('reading', 'meaning', 'form', 'connection', 'particle', 'usage')),
  error_tag text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  source_attempt_id uuid references public.ai_course_foundation_unit_attempts(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_cfrq_open_unique unique (learner_id, target_type, target_id, dimension, status)
);
create index if not exists ai_cfrq_due_idx on public.ai_course_foundation_review_queue (learner_id, status, due_at);

-- ── RLS（全テーブル共通: learner本人のみ・管理者はai_is_admin()・anon拒否）──
-- admin_overrides jsonb は learner 本人が更新できる可能性があるため RLS 根拠に使用しない（§16監査）。
do $do$
declare t text;
begin
  foreach t in array array[
    'ai_course_foundation_unit_attempts',
    'ai_course_foundation_question_attempts',
    'ai_course_foundation_item_progress',
    'ai_course_foundation_review_queue']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin())', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (learner_id in (select public.ai_my_learner_ids()))', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (learner_id in (select public.ai_my_learner_ids())) with check (learner_id in (select public.ai_my_learner_ids()))', t, t);
    -- delete ポリシーは作らない（学習履歴の削除は service_role 経由の運用のみ・soft delete不要の方針）
  end loop;
end $do$;

-- question_attempts は unit_attempt の所有者一致も強制（他人のattemptへの紐付け防止）
drop policy if exists ai_cfqa_owner_pair on public.ai_course_foundation_question_attempts;
create policy ai_cfqa_owner_pair on public.ai_course_foundation_question_attempts
  for insert to authenticated
  with check (
    learner_id in (select public.ai_my_learner_ids())
    and exists (
      select 1 from public.ai_course_foundation_unit_attempts ua
      where ua.id = unit_attempt_id and ua.learner_id = ai_course_foundation_question_attempts.learner_id
    )
  );

-- 注意: Postgresの permissive policy はOR結合されるため、question_attempts の汎用insertポリシーは
-- 所有者一致ペアチェックを迂回させてしまう。汎用insertを削除し、ペア検証つきポリシーのみ残す。
drop policy if exists ai_course_foundation_question_attempts_insert on public.ai_course_foundation_question_attempts;
