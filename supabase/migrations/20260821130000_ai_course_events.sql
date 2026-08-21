-- Phase 1 計測基盤: 学習ファネルの穴埋めイベント（2026-08-21）
--
-- 既にあるもの: 会話の実績・原価・離脱理由 = ai_learning_sessions / 音声の日次利用 = ai_usage_daily。
-- 無かったもの: **ログインと非会話活動（バトル・教材だけの日）の日付つき履歴**。
-- これが無いと再訪率(D1/D7)が「音声会話をした日」しか数えられず過小に出る。
--
-- 方針:
-- - クライアントは直接INSERTできない（RPC経由のみ。kind検査・サイズ上限・回数上限つき）
-- - SELECTは他の学習テーブルと同じ「本人 or 管理者」
-- - 会話本文・名前・メール等のPIIはpropsに入れない（クライアント側の規律 + サイズ上限で抑止）

create table if not exists public.ai_course_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind ~ '^[a-z0-9_]{2,40}$'),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_course_events_user_idx on public.ai_course_events (user_id, created_at desc);
create index if not exists ai_course_events_kind_idx on public.ai_course_events (kind, created_at desc);

alter table public.ai_course_events enable row level security;

drop policy if exists ai_course_events_select on public.ai_course_events;
create policy ai_course_events_select on public.ai_course_events
  for select to authenticated
  using (user_id = auth.uid() or public.ai_is_admin());

-- INSERT/UPDATE/DELETE のポリシーは作らない＝クライアント直書き不可（RPCと service_role のみ）
grant select on public.ai_course_events to authenticated;
grant all on public.ai_course_events to service_role;

create or replace function public.ai_log_course_event(p_kind text, p_props jsonb default '{}'::jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if p_kind is null or p_kind !~ '^[a-z0-9_]{2,40}$' then return false; end if;
  -- props はメタ情報だけ（2KB上限。超えたら捨てて本体イベントだけ残す）
  if pg_column_size(coalesce(p_props, '{}'::jsonb)) > 2048 then
    p_props := '{}'::jsonb;
  end if;
  -- 1人1日400件で頭打ち（自動操作・暴走の保険。正常利用は1日数十件）
  if (select count(*) from public.ai_course_events
      where user_id = v_uid and created_at > now() - interval '24 hours') >= 400 then
    return false;
  end if;
  insert into public.ai_course_events (user_id, kind, props)
  values (v_uid, p_kind, coalesce(p_props, '{}'::jsonb));
  return true;
end $$;

revoke all on function public.ai_log_course_event(text, jsonb) from public, anon;
grant execute on function public.ai_log_course_event(text, jsonb) to authenticated, service_role;
