-- ============================================================
-- シャトル供養カウンター: スキーマ
-- ============================================================

create table if not exists shuttle_retirement_log (
  id uuid primary key default gen_random_uuid(),
  count integer not null check (count > 0),
  venue text,
  note text,
  logged_at date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table shuttle_retirement_log is '大会・練習会ごとに引退したシャトルの本数ログ';

create table if not exists shuttle_counter (
  id smallint primary key default 1,
  total_count integer not null default 0,
  last_milestone integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into shuttle_counter (id, total_count, last_milestone)
values (1, 0, 0)
on conflict (id) do nothing;

create or replace function update_shuttle_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total integer;
  milestones integer[] := array[50, 100, 300, 500, 1000];
  m integer;
begin
  update shuttle_counter
  set total_count = total_count + new.count,
      updated_at = now()
  where id = 1
  returning total_count into new_total;

  foreach m in array milestones loop
    if new_total >= m then
      update shuttle_counter
      set last_milestone = m
      where id = 1 and last_milestone < m;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_update_shuttle_counter on shuttle_retirement_log;
create trigger trg_update_shuttle_counter
after insert on shuttle_retirement_log
for each row execute function update_shuttle_counter();

alter table shuttle_counter enable row level security;
alter table shuttle_retirement_log enable row level security;

drop policy if exists "shuttle_counter_public_read" on shuttle_counter;
create policy "shuttle_counter_public_read"
  on shuttle_counter for select
  using (true);

drop policy if exists "shuttle_log_public_read" on shuttle_retirement_log;
create policy "shuttle_log_public_read"
  on shuttle_retirement_log for select
  using (true);

alter publication supabase_realtime add table shuttle_counter;
