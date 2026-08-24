-- 自動メールを「黙って失敗しない」状態にする（2026-08-24）
--
-- ■ 何が起きていたか
--   本番の ai_course_mail_log は **0行** だった。購入後フォローメールは1通も届いていない。
--   ところが 0行 という事実からは、次のどれなのかが**まったく区別できなかった**:
--     (a) cron が登録されていない       (b) 送信対象が0件だった
--     (c) 送信に失敗した                 (d) Resend の鍵や差出人ドメインの問題
--   旧設計は送信に失敗するとログ行を DELETE していたため、(c) の痕跡が残らない。
--   「証拠が無い＝正常」に見えてしまう作りで、誰も異常に気づけなかった。
--
--   （実際の原因は (b)。ai_course_access.purchase_id が既に消えた購入行を指していた。
--     修正は Edge Function 側＝購入台帳を user_id でも引き当てる。）
--
-- ■ この migration で変えること
--   1. ログ行を消さない。status で遷移を残す（scheduled → sent / failed → 再試行）
--   2. 失敗理由・試行回数・次回再試行時刻を持つ（error_reason に個人情報を入れない）
--   3. 実行そのものの記録（mail_job_runs）を持つ ＝「そもそも走ったのか」が分かる
--   4. 想定ジョブが cron に居るかを問い合わせられるようにする（ai_mail_health）
--
-- ■ 壊さないこと
--   dedupe_key の一意制約はそのまま。**同じ人へ同じ用件を2通送らない**保証は
--   むしろ強くなる（失敗しても行が残るので、消した隙に二重送信する余地が無い）。

-- ── 1. 配信ログに状態を持たせる ────────────────────────────────────────────
alter table public.ai_course_mail_log
  -- 'scheduled'（送ると決めた）| 'sent'（送れた）| 'failed'（送れなかった）
  -- 既定を 'scheduled' にする: 書き忘れが「送れたこと」に化けない側へ倒す
  add column if not exists status text not null default 'scheduled',
  -- 失敗理由。**PII禁止**。'provider_500' のような短いコードだけを入れる
  add column if not exists error_reason text,
  add column if not exists attempts integer not null default 0,
  add column if not exists first_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists scheduled_at timestamptz not null default now(),
  -- どの用途の配信か（'ai_course' = 購入後フォロー / 'event' = 開催前日リマインド）
  add column if not exists scope text not null default 'ai_course',
  -- 対象の外部キー相当。大会エントリーのIDのように uuid でないものも入るので text
  add column if not exists subject_ref text,
  add column if not exists updated_at timestamptz not null default now();

-- sent_at は「送れた時刻」に意味を戻す（送る前は NULL）
alter table public.ai_course_mail_log alter column sent_at drop not null;
alter table public.ai_course_mail_log alter column sent_at drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_course_mail_log_status_chk'
  ) then
    alter table public.ai_course_mail_log
      add constraint ai_course_mail_log_status_chk
      check (status in ('scheduled', 'sent', 'failed'));
  end if;
end $$;

-- 旧仕様で入った行の読み替え（送信直前にしか insert されなかったので 'sent' が正しい）。
-- 2026-08-24 時点では0行なので実質no-op。過去データのあるDBへ後追いで当てても壊れないように置く。
update public.ai_course_mail_log
   set status = 'sent', attempts = 1, last_attempt_at = sent_at
 where sent_at is not null and status = 'scheduled' and attempts = 0;

create index if not exists ai_course_mail_log_retry_idx
  on public.ai_course_mail_log (next_retry_at)
  where status = 'failed';
create index if not exists ai_course_mail_log_status_idx
  on public.ai_course_mail_log (scope, status, scheduled_at desc);

-- 状態を遷移させるので update が要る（delete は運用の手動リセット用に残す）
grant update on public.ai_course_mail_log to service_role;

comment on table public.ai_course_mail_log is
  'AIコースのフォローメールと開催前日リマインドの配信ログ。dedupe_key で二重送信を防ぎ、'
  'status/attempts/error_reason で「黙って失敗した」を残す。service_role専用';
comment on column public.ai_course_mail_log.error_reason is
  '失敗理由の短いコード（例: provider_500）。宛先・本文・外部APIの応答本文を入れないこと';

-- ── 2. 実行そのものの記録 ──────────────────────────────────────────────────
-- 「送る相手が0件だった」と「そもそも走っていない」を区別するための最小の台帳。
-- 開始時に1行入れ、終了時に finished_at を埋める。落ちた実行は finished_at が NULL のまま残る。
create table if not exists public.mail_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  dry_run boolean not null default false,
  scanned integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  -- 実行全体が落ちた理由の短いコード（PII禁止）
  error text
);

create index if not exists mail_job_runs_job_idx
  on public.mail_job_runs (job, started_at desc);

alter table public.mail_job_runs enable row level security;
revoke all on public.mail_job_runs from anon, authenticated;
grant all on public.mail_job_runs to service_role;

comment on table public.mail_job_runs is
  '自動メールジョブの実行記録。finished_at が NULL のまま古い行＝途中で落ちた実行。service_role専用';

-- ── 3. 想定ジョブが cron に居るか ─────────────────────────────────────────
-- cron スキーマは PostgREST から見えないので security definer で橋渡しする
-- （ai_monitor_cron_health と同じ作法）。
-- 既存の cron_stale 検知は「登録されているジョブが古いか」しか見ないため、
-- **一度も登録されていないジョブ**は誰にも気づかれない。ここはその穴を塞ぐ。
create or replace function public.ai_mail_health()
returns table (
  job text,
  is_scheduled boolean,
  cron_last_start timestamptz,
  cron_last_status text,
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz
)
language sql security definer set search_path = public, cron as $$
  with expected(job) as (
    values ('ai-course-lifecycle-daily'), ('event-reminder-daily')
  )
  select
    e.job,
    exists (select 1 from cron.job j where j.jobname = e.job and j.active),
    (select d.start_time from cron.job j
        join cron.job_run_details d on d.jobid = j.jobid
       where j.jobname = e.job order by d.start_time desc limit 1),
    (select d.status from cron.job j
        join cron.job_run_details d on d.jobid = j.jobid
       where j.jobname = e.job order by d.start_time desc limit 1)::text,
    (select r.started_at from public.mail_job_runs r
       where r.job = e.job order by r.started_at desc limit 1),
    (select r.finished_at from public.mail_job_runs r
       where r.job = e.job order by r.started_at desc limit 1)
  from expected e
$$;

revoke all on function public.ai_mail_health() from public, anon, authenticated;
grant execute on function public.ai_mail_health() to service_role;

-- 確認:
--   select * from public.ai_mail_health();
--   select scope, status, count(*) from public.ai_course_mail_log group by 1, 2;
--   select job, started_at, finished_at, sent, failed from public.mail_job_runs order by started_at desc limit 10;
