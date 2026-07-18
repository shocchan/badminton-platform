-- AI日本語レッスン完成版（Andyさん向け12週コース）のデータモデル
-- 既存テーブルへは一切変更しない追加形式。すべて ai_ プレフィックス。
-- カリキュラム本体は現時点ではフロントのデータファイル（将来 ai_curriculum_items へ移行可能）。

-- ── 生徒 ──
create table if not exists public.ai_learners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  preferred_language text not null default 'zh',
  estimated_level text not null default 'N3',
  difficulty_level int not null default 2 check (difficulty_level between 1 and 5),
  current_week int not null default 1 check (current_week between 1 and 12),
  is_active boolean not null default true,
  hearing jsonb not null default '{}'::jsonb,          -- 初回診断の回答
  settings jsonb not null default '{}'::jsonb,          -- zhSupport / correction / weeklyTarget / examDate 等
  admin_overrides jsonb not null default '{}'::jsonb,   -- 管理者指定: nextMissionId / priorityItems / note 等
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 表現ごとの定着状態 ──
create table if not exists public.ai_item_progress (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  item_id text not null,
  mastery_state text not null default 'initial',        -- initial/understood/used_with_hint/used_independently/reviewed_day1/reviewed_day3/retained_day7/retained_day30
  mastery_score numeric not null default 0,
  first_learned_at timestamptz not null default now(),
  last_practiced_at timestamptz not null default now(),
  next_review_at date,
  review_stage text not null default 'none',            -- none/day1/day3/day7/day30/extra
  successful_reviews int not null default 0,
  failed_reviews int not null default 0,
  updated_at timestamptz not null default now(),
  unique (learner_id, item_id)
);

-- ── レッスンセッション ──
create table if not exists public.ai_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  mission_id text not null,
  mode text not null default 'voice',                   -- voice/text
  lesson_kind text not null default 'new',              -- new/review_day1/review_day3/review_day7/extra
  difficulty int not null default 2,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int not null default 0,
  completion_status text not null default 'in_progress',-- in_progress/completed/interrupted/error
  end_reason text,
  target_expression text,
  target_used boolean not null default false,
  target_used_independently boolean not null default false,
  hints_used int not null default 0,
  chinese_support_used boolean not null default false,
  error_code text,
  estimated_cost_usd numeric not null default 0,
  report jsonb,                                         -- ai-lesson-report の生成結果
  curriculum_version text not null default 'v1',
  created_at timestamptz not null default now()
);
create index if not exists ai_learning_sessions_learner_idx on public.ai_learning_sessions (learner_id, started_at desc);

-- ── 発話ログ ──
create table if not exists public.ai_session_utterances (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.ai_learning_sessions(id) on delete cascade,
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  speaker text not null,                                -- student/tutor/system
  transcript text not null,
  at_ms int not null default 0,
  is_final boolean not null default true,
  related_target boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_session_utterances_session_idx on public.ai_session_utterances (session_id, at_ms);

-- ── 日次利用量（コスト安全装置） ──
create table if not exists public.ai_usage_daily (
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  usage_date date not null,
  sessions_count int not null default 0,
  seconds_used int not null default 0,
  estimated_cost_usd numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (learner_id, usage_date)
);

-- ── レッスン後フィードバック ──
create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.ai_learning_sessions(id) on delete set null,
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  difficulty_rating text,                               -- too_easy/just_right/too_hard
  speed_rating text,                                    -- too_fast/ok/too_slow
  zh_support_rating text,                               -- want_more/ok/want_less
  remembered boolean,
  comment text,
  created_at timestamptz not null default now()
);

-- ── 通知予定（外部通知は別フェーズ。データ構造のみ用意） ──
create table if not exists public.ai_notification_queue (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  kind text not null,                                   -- review_due/weekly_summary 等
  due_date date not null,
  payload jsonb not null default '{}'::jsonb,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 管理者・設定 ──
create table if not exists public.ai_admins (
  email text primary key
);

create table if not exists public.ai_config (
  key text primary key,
  value jsonb not null
);

-- ── RLS ──
alter table public.ai_learners enable row level security;
alter table public.ai_item_progress enable row level security;
alter table public.ai_learning_sessions enable row level security;
alter table public.ai_session_utterances enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_notification_queue enable row level security;
alter table public.ai_admins enable row level security;
alter table public.ai_config enable row level security;

-- 管理者判定（security definer で ai_admins を参照）
create or replace function public.ai_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.ai_admins where email = coalesce(auth.jwt()->>'email', '')) $$;

-- 自分の learner_id 集合
create or replace function public.ai_my_learner_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select id from public.ai_learners where user_id = auth.uid() $$;

-- ai_learners: 本人 or 管理者
drop policy if exists ai_learners_select on public.ai_learners;
create policy ai_learners_select on public.ai_learners for select to authenticated
  using (user_id = auth.uid() or public.ai_is_admin());
drop policy if exists ai_learners_insert on public.ai_learners;
create policy ai_learners_insert on public.ai_learners for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists ai_learners_update on public.ai_learners;
create policy ai_learners_update on public.ai_learners for update to authenticated
  using (user_id = auth.uid() or public.ai_is_admin());

-- 子テーブル共通: learner_id が自分のもの or 管理者
do $do$
declare t text;
begin
  foreach t in array array['ai_item_progress','ai_learning_sessions','ai_session_utterances','ai_usage_daily','ai_feedback','ai_notification_queue']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin())', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin())', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin())', t, t);
  end loop;
end
$do$;

-- ai_admins: 自分の行だけ見える（= 管理者判定に使える）。書き込みは service_role のみ
drop policy if exists ai_admins_select on public.ai_admins;
create policy ai_admins_select on public.ai_admins for select to authenticated
  using (email = coalesce(auth.jwt()->>'email', ''));

-- ai_config: 管理者のみ閲覧（上限値は Edge Function が service_role で参照）
drop policy if exists ai_config_select on public.ai_config;
create policy ai_config_select on public.ai_config for select to authenticated
  using (public.ai_is_admin());

-- ── GRANT（RLSポリシーだけでは不可。GRANT忘れは42501になる） ──
grant select, insert, update on public.ai_learners, public.ai_item_progress,
  public.ai_learning_sessions, public.ai_session_utterances, public.ai_usage_daily,
  public.ai_feedback, public.ai_notification_queue to authenticated;
grant select on public.ai_admins, public.ai_config to authenticated;
grant all on all tables in schema public to service_role;

-- ── 初期データ ──
insert into public.ai_admins (email) values
  ('shodorannga@gmail.com'), ('info@kawabado.com')
on conflict do nothing;

insert into public.ai_config (key, value) values
  ('usage_limits', '{"session_max_seconds":240,"daily_max_sessions":5,"daily_max_seconds":1200,"monthly_cost_warn_usd":15}'::jsonb),
  ('signup_invite_code', '"andy-course-2026"'::jsonb)
on conflict (key) do nothing;
