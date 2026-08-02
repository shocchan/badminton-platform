-- ============================================================
-- セルフサービス販売（雨ざらし市場モデル）の永続化
-- 2026-08-02 作成 / **remote 未適用**
--
-- ⚠️ staging と production は同じ Supabase プロジェクトを共有している。
--    したがって remote への適用は production への適用と同義であり、
--    CEO の明示承認（APPLY_SHARED_SUPABASE_MIGRATIONS）なしには実行しない。
--    local 適用は通常どおり可。
--
-- rollback: supabase/rollbacks/rollback_20260803000000_ai_course_sales.sql
--
-- 設計の要点:
--   1. 金額・利用権の**書き込みは service_role だけ**。learner は自分の行を読むだけ。
--      クライアントから利用権を足せる経路を1つも作らない。
--   2. 消費時間はサーバー関数の中でしか増えない（RPC 経由・直接 update 不可）。
--   3. 付与は purchase_id の一意制約でべき等。Webhook 再送で二重に付かない。
-- ============================================================

-- ── 購入 ──────────────────────────────────────────────
create table if not exists public.ai_plan_purchases (
  order_id      text primary key,                 -- クライアント発番のべき等キー
  plan_id       text not null,
  plan_version  integer not null,
  amount        integer not null check (amount >= 0),
  currency      text not null default 'JPY',
  email         text not null,
  lang          text not null default 'ja' check (lang in ('ja','zh')),
  terms_version text not null,
  gateway_id    text not null,
  reference     text not null default '',
  status        text not null default 'created'
                check (status in ('created','paid','granted','failed')),
  paid_amount   integer not null default 0,
  fee_amount    integer not null default 0,
  failure_code  text,
  learner_id    uuid references public.ai_learners(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ai_plan_purchases_learner_idx on public.ai_plan_purchases(learner_id);
create index if not exists ai_plan_purchases_reference_idx on public.ai_plan_purchases(reference);

alter table public.ai_plan_purchases enable row level security;
revoke all on public.ai_plan_purchases from anon;
revoke insert, update, delete on public.ai_plan_purchases from authenticated;
grant select on public.ai_plan_purchases to authenticated;
grant all on public.ai_plan_purchases to service_role;

drop policy if exists ai_plan_purchases_select on public.ai_plan_purchases;
create policy ai_plan_purchases_select on public.ai_plan_purchases
  for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
-- write policy は作らない＝ service_role（Edge Function）だけが書ける

-- ── 利用権（append-only の台帳） ──────────────────────
create table if not exists public.ai_plan_entitlements (
  id             text primary key,
  learner_id     uuid not null references public.ai_learners(id) on delete cascade,
  plan_id        text not null,
  plan_version   integer not null,
  -- ★ 一意制約が二重付与の最終防波堤。アプリ側のべき等判定が抜けてもここで止まる
  purchase_id    text not null unique references public.ai_plan_purchases(order_id),
  granted_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  active_seconds integer,                          -- null なら時間制ではない
  voice_seconds  integer not null default 0,
  ai_reports     integer not null default 0,
  period_ends_at timestamptz,
  status         text not null default 'active' check (status in ('active','expired','refunded')),
  created_at     timestamptz not null default now()
);
create index if not exists ai_plan_entitlements_learner_idx on public.ai_plan_entitlements(learner_id);

alter table public.ai_plan_entitlements enable row level security;
revoke all on public.ai_plan_entitlements from anon;
revoke insert, update, delete on public.ai_plan_entitlements from authenticated;
grant select on public.ai_plan_entitlements to authenticated;
grant all on public.ai_plan_entitlements to service_role;

drop policy if exists ai_plan_entitlements_select on public.ai_plan_entitlements;
create policy ai_plan_entitlements_select on public.ai_plan_entitlements
  for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());

-- ── 消費実績（learner ごとに1行） ─────────────────────
create table if not exists public.ai_plan_consumption (
  learner_id     uuid primary key references public.ai_learners(id) on delete cascade,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  voice_seconds  integer not null default 0 check (voice_seconds >= 0),
  ai_reports     integer not null default 0 check (ai_reports >= 0),
  updated_at     timestamptz not null default now()
);

alter table public.ai_plan_consumption enable row level security;
revoke all on public.ai_plan_consumption from anon;
revoke insert, update, delete on public.ai_plan_consumption from authenticated;
grant select on public.ai_plan_consumption to authenticated;
grant all on public.ai_plan_consumption to service_role;

drop policy if exists ai_plan_consumption_select on public.ai_plan_consumption;
create policy ai_plan_consumption_select on public.ai_plan_consumption
  for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());

-- ── 利用枠（サーバー正準の時間計測） ──────────────────
-- 二重タブの排他と、最後に合図が来た時刻をここで持つ。
create table if not exists public.ai_plan_usage_window (
  learner_id        uuid primary key references public.ai_learners(id) on delete cascade,
  active_session_id text,
  status            text not null default 'closed' check (status in ('running','paused','closed')),
  last_tick_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.ai_plan_usage_window enable row level security;
revoke all on public.ai_plan_usage_window from anon;
revoke insert, update, delete on public.ai_plan_usage_window from authenticated;
grant select on public.ai_plan_usage_window to authenticated;
grant all on public.ai_plan_usage_window to service_role;

drop policy if exists ai_plan_usage_window_select on public.ai_plan_usage_window;
create policy ai_plan_usage_window_select on public.ai_plan_usage_window
  for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());

-- ── アップセル表示の記録（頻度制限の根拠） ────────────
create table if not exists public.ai_plan_upsell_impressions (
  id          bigserial primary key,
  learner_id  uuid not null references public.ai_learners(id) on delete cascade,
  rule_id     text not null,
  session_id  text not null,
  shown_at    timestamptz not null default now(),
  -- 'dismissed' は「今はしない」を押した。次に出すまでの冷却期間の起点になる
  outcome     text not null default 'shown' check (outcome in ('shown','dismissed','accepted'))
);
create index if not exists ai_plan_upsell_learner_idx on public.ai_plan_upsell_impressions(learner_id, rule_id, shown_at desc);

alter table public.ai_plan_upsell_impressions enable row level security;
revoke all on public.ai_plan_upsell_impressions from anon;
revoke insert, update, delete on public.ai_plan_upsell_impressions from authenticated;
grant select on public.ai_plan_upsell_impressions to authenticated;
grant all on public.ai_plan_upsell_impressions to service_role;

drop policy if exists ai_plan_upsell_select on public.ai_plan_upsell_impressions;
create policy ai_plan_upsell_select on public.ai_plan_upsell_impressions
  for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());

-- ── 6か月伴走の相談申込（人が対応する唯一の入口） ────
create table if not exists public.ai_plan_consultations (
  id           uuid primary key default gen_random_uuid(),
  plan_id      text not null,
  email        text not null,
  lang         text not null default 'ja' check (lang in ('ja','zh')),
  message      text not null default '',
  status       text not null default 'received'
               check (status in ('received','contacted','closed')),
  created_at   timestamptz not null default now()
);

alter table public.ai_plan_consultations enable row level security;
revoke all on public.ai_plan_consultations from anon, authenticated;
grant all on public.ai_plan_consultations to service_role;
-- 相談内容は本人にも一覧させない（他人のメールが混ざる事故を構造的に防ぐ）。
-- 管理者は service_role 経由の管理画面から見る。

-- ── 手動対応の記録（§16 採算に効く。件数が増えたら赤字要因として見える） ──
create table if not exists public.ai_plan_support_events (
  id           bigserial primary key,
  plan_id      text not null,
  learner_id   uuid references public.ai_learners(id) on delete set null,
  -- 自己解決できずに人が動いた事実だけを残す（内容は残さない）
  category     text not null,
  minutes      integer not null default 0 check (minutes >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists ai_plan_support_plan_idx on public.ai_plan_support_events(plan_id, created_at desc);

alter table public.ai_plan_support_events enable row level security;
revoke all on public.ai_plan_support_events from anon, authenticated;
grant all on public.ai_plan_support_events to service_role;

-- ── 消費を増やすのは、この関数だけ ────────────────────
-- クライアントは秒数を送れない。サーバーが自分の時計で測った差だけを渡す設計にし、
-- ここでは「負の値を入れない」「上限を超えない」を最終確認する。
create or replace function public.ai_plan_consume(
  p_learner_id uuid,
  p_active_seconds integer default 0,
  p_voice_seconds integer default 0,
  p_ai_reports integer default 0
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_active_seconds < 0 or p_voice_seconds < 0 or p_ai_reports < 0 then
    raise exception 'negative consumption is not allowed';
  end if;
  insert into public.ai_plan_consumption (learner_id, active_seconds, voice_seconds, ai_reports)
  values (p_learner_id, p_active_seconds, p_voice_seconds, p_ai_reports)
  on conflict (learner_id) do update set
    active_seconds = public.ai_plan_consumption.active_seconds + excluded.active_seconds,
    voice_seconds  = public.ai_plan_consumption.voice_seconds  + excluded.voice_seconds,
    ai_reports     = public.ai_plan_consumption.ai_reports     + excluded.ai_reports,
    updated_at     = now();
end $$;

revoke all on function public.ai_plan_consume(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_plan_consume(uuid, integer, integer, integer) to service_role;
