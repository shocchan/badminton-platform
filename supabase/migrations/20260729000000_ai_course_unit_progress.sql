-- ============================================================
-- N3/N2 単元進捗の正式テーブル（2026-07-30 正式化・remote未適用）
-- ⚠️ remoteへの適用は APPLY_SHARED_SUPABASE_MIGRATIONS 受領後のみ。localは通常適用。
-- rollback: supabase/rollbacks/rollback_20260729000000_ai_course_unit_progress.sql
--
-- 対応する client 契約: src/lib/aiLesson/course/persistence/unitProgressRepository.ts
--   - StoredProgress { learnerId, unitId, state(UnitRunState), rowVersion, updatedAtMs }
--   - upsert は楽観ロック（expectedRowVersion不一致= conflict）＋ mutationId 冪等
-- 方針: additive only・既存テーブル変更なし・RLS有効・learner本人のみ・
--       管理者は ai_is_admin()・時刻はサーバ時刻のみ（クライアント時刻を信用しない）
-- ============================================================

create table if not exists public.ai_course_unit_progress (
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  unit_id text not null check (char_length(unit_id) between 1 and 64),
  state jsonb not null,
  row_version int not null default 1 check (row_version >= 1),
  -- 冪等性: 最後に適用した mutationId。同じIDの再送は no-op で現行行を返す
  last_mutation_id text not null default '' check (char_length(last_mutation_id) <= 128),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (learner_id, unit_id)
);
create index if not exists ai_cup_updated_idx on public.ai_course_unit_progress (learner_id, updated_at desc);

alter table public.ai_course_unit_progress enable row level security;
-- ⚠️ Supabase環境は default privileges で新テーブルに anon/authenticated へ ALL が自動付与される
--    （H1 local実測で確認）。「書き込みは必ずRPC経由」を成立させるため、明示的にrevokeする。
revoke all on public.ai_course_unit_progress from anon;
revoke insert, update, delete on public.ai_course_unit_progress from authenticated;
grant select on public.ai_course_unit_progress to authenticated;
grant all on public.ai_course_unit_progress to service_role;

drop policy if exists ai_course_unit_progress_select on public.ai_course_unit_progress;
create policy ai_course_unit_progress_select on public.ai_course_unit_progress
  for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());

-- 書き込みpolicyは作らない。書き込みは security definer の ai_upsert_unit_progress のみ
-- （definer実行のためRLS policyに依存せず、関数冒頭の本人確認が唯一の入口ガード）。
-- 直接のinsert/update/deleteはgrant revokeにより42501になる（H1 matrix M10で実証）。
drop policy if exists ai_course_unit_progress_write_self on public.ai_course_unit_progress;
drop policy if exists ai_course_unit_progress_update_self on public.ai_course_unit_progress;

-- 楽観ロック＋冪等 upsert。
-- security definer にしない: RLS を関数内の文にも適用する（本人以外の行は見えず書けず）。
-- ただし table grant は select のみのため、この関数だけに insert/update を許すために
-- 関数所有者を通常ロールにせず、grant を関数内で要求される形にできない。
-- → PostgreSQL の権限モデル上、invoker 実行では呼び出し元に table への insert/update 権限が必要。
--   そこで「直接のtable書き込みを禁じつつRPC経由のみ許す」ため、本関数は security definer とし、
--   関数冒頭で必ず本人確認（ai_my_learner_ids）を行う。definer でも learner_id は検証済みのみ扱う。
create or replace function public.ai_upsert_unit_progress(
  p_learner_id uuid,
  p_unit_id text,
  p_state jsonb,
  p_expected_row_version int,
  p_mutation_id text
) returns public.ai_course_unit_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_course_unit_progress;
begin
  -- 本人（または管理者）以外は拒否。service_role（jwt claimsなし直接続）は許可
  if not (
    p_learner_id in (select public.ai_my_learner_ids())
    or public.ai_is_admin()
    or current_setting('request.jwt.claims', true) is null
    or coalesce(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
  ) then
    raise exception 'unit progress: not owner' using errcode = '42501';
  end if;
  if p_mutation_id is null or char_length(p_mutation_id) = 0 or char_length(p_mutation_id) > 128 then
    raise exception 'unit progress: invalid mutation id' using errcode = '22023';
  end if;

  select * into v_row from public.ai_course_unit_progress
    where learner_id = p_learner_id and unit_id = p_unit_id
    for update;

  if not found then
    if p_expected_row_version <> 0 then
      raise exception 'unit progress: conflict' using errcode = 'P0409';
    end if;
    insert into public.ai_course_unit_progress (learner_id, unit_id, state, row_version, last_mutation_id)
      values (p_learner_id, p_unit_id, p_state, 1, p_mutation_id)
      returning * into v_row;
    return v_row;
  end if;

  -- 冪等: 同じmutationの再送は現行行を返す（row_versionを進めない）
  if v_row.last_mutation_id = p_mutation_id then
    return v_row;
  end if;

  if v_row.row_version <> p_expected_row_version then
    raise exception 'unit progress: conflict' using errcode = 'P0409';
  end if;

  update public.ai_course_unit_progress
    set state = p_state,
        row_version = v_row.row_version + 1,
        last_mutation_id = p_mutation_id,
        updated_at = now()
    where learner_id = p_learner_id and unit_id = p_unit_id
    returning * into v_row;
  return v_row;
end $$;

revoke all on function public.ai_upsert_unit_progress(uuid, text, jsonb, int, text) from public;
grant execute on function public.ai_upsert_unit_progress(uuid, text, jsonb, int, text) to authenticated;
grant execute on function public.ai_upsert_unit_progress(uuid, text, jsonb, int, text) to service_role;

-- rollback（feature rollback。security設定には触れない）:
--   rollback_20260729000000_ai_course_unit_progress.sql を参照
