-- AI日本語コース: 会話力の成長を視覚化するための追加データ構造（§13〜27）
-- 既存テーブル・既存カラム・既存RLSは変更しない。追加のみ（ai_ プレフィックス）。

-- ── セッションごとの発話メトリクス（成長計算の材料。完了時にフロントが算出して保存） ──
-- 既存カラムは触らず、jsonb カラムを1つ足すだけ。既存セッションは {} のまま（成長は今後蓄積）。
alter table public.ai_learning_sessions
  add column if not exists speech_metrics jsonb not null default '{}'::jsonb;

-- ── 成長スナップショット（時系列。上書きせず追記） ──
create table if not exists public.ai_growth_snapshots (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  -- diagnosis / after5 / week1..week12 / after20 / midcourse / final / manual
  trigger_kind text not null,
  session_count int not null default 0,
  data jsonb not null default '{}'::jsonb,   -- GrowthSnapshot 全体
  created_at timestamptz not null default now(),
  -- 各マイルストーンは1回だけ記録（重複・上書き防止）
  unique (learner_id, trigger_kind)
);
create index if not exists ai_growth_snapshots_learner_idx
  on public.ai_growth_snapshots (learner_id, created_at);

-- ── RLS（他の ai_ 子テーブルと同じ: 本人 or 管理者） ──
alter table public.ai_growth_snapshots enable row level security;

drop policy if exists ai_growth_snapshots_select on public.ai_growth_snapshots;
create policy ai_growth_snapshots_select on public.ai_growth_snapshots for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
drop policy if exists ai_growth_snapshots_insert on public.ai_growth_snapshots;
create policy ai_growth_snapshots_insert on public.ai_growth_snapshots for insert to authenticated
  with check (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
drop policy if exists ai_growth_snapshots_update on public.ai_growth_snapshots;
create policy ai_growth_snapshots_update on public.ai_growth_snapshots for update to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());

grant select, insert, update on public.ai_growth_snapshots to authenticated;
