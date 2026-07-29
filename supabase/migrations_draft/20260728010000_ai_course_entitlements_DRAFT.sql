-- ============================================================
-- 内部権限（entitlement）の分離（CEO指示 2026-07-28・草案・未適用）
-- ⚠️ migrations_draft/ は supabase CLI の適用対象外。共有SupabaseへはCEO承認まで適用しない。
--
-- 背景: 現在の内部権限（labPreview等）は ai_learners.admin_overrides (jsonb) にあり、
--       ai_learners_update policy が本人の全列更新を許すため、
--       learner本人が自分の admin_overrides を書き換えて内部画面を開ける（権限昇格）。
--
-- 案A採用時のスキーマ: 権限を専用テーブルへ分離し、learner本人はread-onlyにする。
-- ============================================================

create table if not exists public.ai_course_entitlements (
  learner_id uuid primary key references public.ai_learners(id) on delete cascade,
  lab_preview boolean not null default false,
  internal_review boolean not null default false,
  decision_console boolean not null default false,
  content_reviewer boolean not null default false,
  granted_by text not null default '',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,          -- nullなら無期限。期限切れはクライアント/RPC双方で無効扱い
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_course_entitlements enable row level security;
revoke all on public.ai_course_entitlements from anon;
-- learner本人は自分の行の select のみ。insert/update/deleteの権限そのものを与えない
-- ⚠️ Supabaseの default privileges が新テーブルへ authenticated に ALL を自動付与するため、
--    明示revokeが必須（H1 local実測 M07: revoke無しではPATCHが200になる。RLS policy欠如で
--    実データは変更されないが、grant層でも遮断して二層にする）。
revoke insert, update, delete on public.ai_course_entitlements from authenticated;
grant select on public.ai_course_entitlements to authenticated;
grant all on public.ai_course_entitlements to service_role;

drop policy if exists ai_course_entitlements_select on public.ai_course_entitlements;
create policy ai_course_entitlements_select on public.ai_course_entitlements
  for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
-- write policyは一切作らない＝service_role（管理作業）のみが付与・剥奪できる

-- 既存フラグの移行（shocchanの検証用learnerのみ・値はadmin_overridesから写す）
-- ※適用時にCEO立ち会いで実行する。ここでは対象を「admin_overridesにlabPreviewを持つ行」に限定
insert into public.ai_course_entitlements (learner_id, lab_preview, internal_review, decision_console, content_reviewer, granted_by)
select id,
       coalesce((admin_overrides->>'labPreview')::boolean, false),
       coalesce((admin_overrides->>'labPreview')::boolean, false),   -- 初期値はlabPreviewに揃え、以後は個別制御
       coalesce((admin_overrides->>'labPreview')::boolean, false),
       coalesce((admin_overrides->>'labPreview')::boolean, false),
       'migration:20260728010000'
from public.ai_learners
where admin_overrides ? 'labPreview'
on conflict (learner_id) do nothing;

-- 注意: admin_overrides からの labPreview 削除は、クライアント切替の動作確認後に
--       別migrationで行う（本草案では既存データを変更しない）。

-- ── 二層防御の2層目: ai_learners.admin_overrides の列保護（草案・未適用） ──
-- learner本人のupdate自体は残す（display_name等の自己更新のため）が、
-- admin_overrides の変更だけは admin / service_role 以外で拒否する。
create or replace function public.ai_course_protect_admin_overrides()
returns trigger language plpgsql security definer as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
begin
  if new.admin_overrides is distinct from old.admin_overrides then
    -- 許可: 管理者JWT / 直接続（claimsなし=migration・psql経路）/ service_role JWT（Data API管理作業）
    -- H1 local実測 M18: service_role のREST経由PATCHは claims が非nullのため、
    -- role判定を追加しないと管理作業まで拒否される（実測で確認済み）。
    if not (
      public.ai_is_admin()
      or v_claims is null
      or (v_claims::jsonb->>'role') = 'service_role'
    ) then
      raise exception 'admin_overrides can only be changed by admin or service role';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ai_learners_protect_admin_overrides on public.ai_learners;
create trigger ai_learners_protect_admin_overrides
  before update on public.ai_learners
  for each row execute function public.ai_course_protect_admin_overrides();
-- 注: service_role はRLS・triggerの対象だが、current_setting('request.jwt.claims') が
--     nullになる直接接続/migration経路を許可する。適用前にshadow DBで
--     「learner本人のadmin_overrides変更が拒否され、他列の自己更新は通る」ことを検証する。

-- rollback:
--   drop trigger if exists ai_learners_protect_admin_overrides on public.ai_learners;
--   drop function if exists public.ai_course_protect_admin_overrides();
--   drop table if exists public.ai_course_entitlements;
