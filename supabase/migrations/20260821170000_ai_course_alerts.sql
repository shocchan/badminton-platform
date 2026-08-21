-- Task 1: 運用アラート（2026-08-21）
--
-- 目的: 「入金済みなのに学習を始められない人がいる」「会話が毎回エラーで終わっている」
-- といった**運営が気づけない障害**を、機械的に拾って一覧と日次メールに出す。
--
-- 設計:
-- - 同じ事象は dedupe_key で1行に集約し、count と last_seen_at を更新する
--   （同じエラーを大量通知しない／件数と初回・最終発生は残す）
-- - detail に会話本文・氏名・メールを入れない（PII禁止。件数とコードだけ）
-- - 閾値・通知先は ai_config の 'monitoring' キーで一元管理（コードへ散在させない）
-- - 解決は人が押す（ai_admin_resolve_alert）。再発すると同じ行が unresolved に戻る

create table if not exists public.ai_course_alerts (
  id uuid primary key default gen_random_uuid(),
  -- 同一事象の集約キー（例: 'provision_failed:<purchase_id>' / 'conversation_error:mic_denied'）
  dedupe_key text not null unique,
  kind text not null check (kind ~ '^[a-z0-9_]{2,40}$'),
  severity text not null check (severity in ('critical', 'warning', 'info')),
  title text not null,
  -- 人が読む説明。**PIIを入れない**（件数・エラーコード・対象機能まで）
  detail text not null default '',
  /** 生徒詳細へ飛ぶための対象。無い場合は null */
  subject_user_id uuid,
  occurrences integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);

create index if not exists ai_course_alerts_open_idx
  on public.ai_course_alerts (resolved, severity, last_seen_at desc);

alter table public.ai_course_alerts enable row level security;

-- 管理者だけが読める（学習者・匿名からは1行も見えない）
drop policy if exists ai_course_alerts_select on public.ai_course_alerts;
create policy ai_course_alerts_select on public.ai_course_alerts
  for select to authenticated
  using (public.ai_is_admin());

-- 書き込みポリシーは作らない＝クライアント直書き不可（監視ジョブ＝service_role のみ）
grant select on public.ai_course_alerts to authenticated;
grant all on public.ai_course_alerts to service_role;

-- 解決/未解決の切り替え（管理者のみ。誤操作から戻せるよう双方向）
create or replace function public.ai_admin_resolve_alert(p_id uuid, p_resolved boolean default true)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.ai_is_admin() then return false; end if;
  update public.ai_course_alerts
     set resolved = p_resolved,
         resolved_at = case when p_resolved then now() else null end,
         resolved_by = case when p_resolved then coalesce(auth.jwt() ->> 'email', 'admin') else null end
   where id = p_id;
  return found;
end $$;

revoke all on function public.ai_admin_resolve_alert(uuid, boolean) from public, anon;
grant execute on function public.ai_admin_resolve_alert(uuid, boolean) to authenticated, service_role;

-- cron の健全性（cron スキーマは PostgREST から見えないので security definer で橋渡し）
create or replace function public.ai_monitor_cron_health()
returns table (jobname text, last_status text, last_start timestamptz)
language sql security definer set search_path = public, cron as $$
  select j.jobname::text,
         (select d.status from cron.job_run_details d
           where d.jobid = j.jobid order by d.start_time desc limit 1)::text,
         (select d.start_time from cron.job_run_details d
           where d.jobid = j.jobid order by d.start_time desc limit 1)
    from cron.job j
   where j.active
$$;

revoke all on function public.ai_monitor_cron_health() from public, anon, authenticated;
grant execute on function public.ai_monitor_cron_health() to service_role;

-- 監視のしきい値（コードに散らさない。運用中に変えられるようDBへ置く）
insert into public.ai_config (key, value)
values ('monitoring', jsonb_build_object(
  'alert_email', 'info@kawabado.com',
  -- 決済したのにこの分数を過ぎても発行されていなければ critical
  'provision_stuck_minutes', 30,
  -- 直近24時間で同一エラーコードがこの件数以上なら warning
  'conversation_error_threshold', 3,
  -- cron が最後に走ってからこの時間を過ぎたら warning
  'cron_stale_hours', 30,
  -- 同じアラートの再通知を抑える時間（日次サマリーの重複防止）
  'digest_cooldown_hours', 20
))
on conflict (key) do nothing;
