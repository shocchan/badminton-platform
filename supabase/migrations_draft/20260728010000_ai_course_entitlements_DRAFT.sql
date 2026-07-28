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

-- rollback:
--   drop table if exists public.ai_course_entitlements;
