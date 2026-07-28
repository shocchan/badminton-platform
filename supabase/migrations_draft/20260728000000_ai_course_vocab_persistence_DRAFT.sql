-- ============================================================
-- 語彙進捗・診断・復習予定の正式保存（CEO指示 2026-07-28・草案・未適用）
-- ⚠️ migrations_draft/ は supabase CLI の適用対象外。
-- ⚠️ 共有Supabaseへの適用はCEOの明示承認後のみ。この草案作成では一切適用しない。
--
-- 設計原則:
--   - 教材固定データ（語・訳・例文・cognate）はTS静的データのまま。DBへは learner進捗のみ
--   - JSON一括保存にしない（検索・RLS・部分更新・競合解決のため列に分解）
--   - すべて ai_ プレフィックス・既存テーブルへ変更なし
--   - 日付は timestamptz（UTC保存）。「学習上の今日」はクライアントの LearningClock が決め、
--     review の期限判定は next_review_on (date) をクライアントのローカル日付と比較する
--   - 冪等キー: (learner_id, item_id, sense_key) / attempt は attempt_id で一意
-- ============================================================

-- ── 1. 語ごとの進捗（learner_vocabulary_item_progress 相当） ──
create table if not exists public.ai_course_vocab_item_progress (
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  item_id text not null,
  -- senseが無い語は '-'（PKにnullを含めないための番兵値）
  sense_key text not null default '-',
  self_assessment text not null default 'unseen'
    check (self_assessment in ('unseen','seen','learning','self_known','needs_review')),
  -- 次元別の確認状態（診断・練習の結果から導出した最新値）
  dimension_states jsonb not null default '{}'::jsonb,  -- {reading:'independent',meaning:'guided',...} 6次元固定・小さいJSON
  review_stage text not null default 'none'
    check (review_stage in ('none','day1','day3','day7','retention_candidate','retained_preview')),
  last_result text check (last_result in ('wrong','supported','independent')),
  last_attempt_at timestamptz,
  -- 期限判定用のローカル日付（LearningClockが算出した YYYY-MM-DD をそのまま保存）
  next_review_on date,
  consecutive_independent int not null default 0,
  source text not null default 'daily'
    check (source in ('diagnostic','daily','quick_review','practice','journey')),
  -- 教材の版（教材更新時に「どの版で学んだか」を追える）
  content_version text not null default 'phase-2e-1.5',
  -- 楽観ロック（同時更新の検出。クライアントは読み取り時のversionを添えて更新する）
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (learner_id, item_id, sense_key)
);
create index if not exists ai_cvip_due_idx
  on public.ai_course_vocab_item_progress (learner_id, next_review_on)
  where next_review_on is not null;

-- ── 2. パック進捗（learner_vocabulary_pack_progress 相当） ──
create table if not exists public.ai_course_vocab_pack_progress (
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  pack_id text not null,
  selected_goal text
    check (selected_goal in ('daily_conversation','life_in_japan','jlpt_n3','work')),
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','completed')),
  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (learner_id, pack_id)
);

-- ── 3. 診断の試行（learner_vocabulary_diagnostic_attempts 相当） ──
-- 冪等性: attempt_id はクライアント生成のUUID。再送・再読込では同じattempt_idをupsertする
create table if not exists public.ai_course_vocab_diagnostic_attempts (
  attempt_id uuid primary key,
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  pack_id text not null,
  question_set_version text not null,
  -- 出題セットのitem/次元の並び（再開用・教材本文は含めない。IDと次元のみ）
  question_refs jsonb not null default '[]'::jsonb,
  state text not null default 'in_progress'
    check (state in ('in_progress','completed','abandoned')),
  answered_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  row_version bigint not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists ai_cvda_learner_idx
  on public.ai_course_vocab_diagnostic_attempts (learner_id, pack_id, started_at desc);

-- ── RLS（3表共通: learner本人 read/write・admin read・deleteはservice_roleのみ） ──
do $$
declare t text;
begin
  foreach t in array array[
    'ai_course_vocab_item_progress',
    'ai_course_vocab_pack_progress',
    'ai_course_vocab_diagnostic_attempts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated
      using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin())', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated
      with check (learner_id in (select public.ai_my_learner_ids()))', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated
      using (learner_id in (select public.ai_my_learner_ids()))
      with check (learner_id in (select public.ai_my_learner_ids()))', t, t);
    -- delete policyは作らない＝authenticatedは削除不可（service_roleのみ）
  end loop;
end $$;

-- updated_at / row_version の自動更新
create or replace function public.ai_course_vocab_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array[
    'ai_course_vocab_item_progress',
    'ai_course_vocab_pack_progress',
    'ai_course_vocab_diagnostic_attempts'
  ] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I
      for each row execute function public.ai_course_vocab_touch()', t, t);
  end loop;
end $$;
