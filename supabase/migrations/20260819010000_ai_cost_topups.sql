-- AIコストのチャージ台帳（2026-08-19 CEO指示「後何ドル使えるか見たい・補充したら増えたと確認したい」）。
--
-- 前提の正直な整理: OpenAI の実残高は外部APIで取得できない（credit_grants APIは廃止済み）。
-- そのため「実残高の自動取得」ではなく、**チャージした事実をここに記録**し、
-- 残り = チャージ合計 − 推定使用合計（ai_usage_daily） を画面で計算して見せる。
-- チャージを記録した瞬間に残高が増えるので「補充したら増えた」が確認できる。
create table if not exists public.ai_cost_topups (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric not null check (amount_usd > 0),
  note text,
  created_by text not null default 'admin-ui',
  created_at timestamptz not null default now()
);

alter table public.ai_cost_topups enable row level security;

drop policy if exists ai_cost_topups_select on public.ai_cost_topups;
create policy ai_cost_topups_select on public.ai_cost_topups
  for select to authenticated using (public.ai_is_admin());
drop policy if exists ai_cost_topups_ins on public.ai_cost_topups;
create policy ai_cost_topups_ins on public.ai_cost_topups
  for insert to authenticated with check (public.ai_is_admin());
drop policy if exists ai_cost_topups_del on public.ai_cost_topups;
create policy ai_cost_topups_del on public.ai_cost_topups
  for delete to authenticated using (public.ai_is_admin());

-- default privileges が絞られているため明示GRANT（anonには与えない）
grant select, insert, delete on public.ai_cost_topups to authenticated;
