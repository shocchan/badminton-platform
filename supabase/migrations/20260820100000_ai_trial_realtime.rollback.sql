-- 20260820100000_ai_trial_realtime.sql のロールバック。
-- ⚠️ 開始済みの体験（trial_started_at設定済み）の valid_until は開始+60分に
--    書き換わっている。列を落とすと「なぜ短いのか」の説明が消えるだけで、
--    期間そのものは戻らない点に注意（必要なら該当行のvalid_untilを手で戻す）。
drop function if exists public.ai_start_trial();
alter table public.ai_course_access
  drop column if exists trial_window_minutes,
  drop column if exists trial_started_at;
