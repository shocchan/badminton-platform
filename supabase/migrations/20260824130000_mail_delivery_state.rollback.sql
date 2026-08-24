-- 配信ログの状態化の巻き戻し（適用は人間の判断で）
--
-- 注意: 列を落とすと**なぜ届かなかったかの記録が消える**。
-- 戻すのは「新しい Edge Function を旧版へ差し戻したとき」だけにすること。
-- 旧版は sent_at を not null default now() で insert するため、その2点だけは必ず戻す。

drop function if exists public.ai_mail_health();
drop table if exists public.mail_job_runs;

drop index if exists public.ai_course_mail_log_retry_idx;
drop index if exists public.ai_course_mail_log_status_idx;

-- 旧版は「行がある＝送信済み」とみなす。届いていない行を残すと永久に送られなくなるので落とす。
delete from public.ai_course_mail_log where status <> 'sent';

alter table public.ai_course_mail_log drop constraint if exists ai_course_mail_log_status_chk;
alter table public.ai_course_mail_log
  drop column if exists status,
  drop column if exists error_reason,
  drop column if exists attempts,
  drop column if exists first_attempt_at,
  drop column if exists last_attempt_at,
  drop column if exists next_retry_at,
  drop column if exists scheduled_at,
  drop column if exists scope,
  drop column if exists subject_ref,
  drop column if exists updated_at;

update public.ai_course_mail_log set sent_at = now() where sent_at is null;
alter table public.ai_course_mail_log alter column sent_at set default now();
alter table public.ai_course_mail_log alter column sent_at set not null;

revoke update on public.ai_course_mail_log from service_role;
