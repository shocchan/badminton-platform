-- ライフサイクルメールの送信ログ（2026-08-21）
--
-- なぜ表が要るか: cron は毎日走る。同じ人へ同じ用件のメールを毎日送らないための
-- **冪等キー**を持つ場所が必要。Stripeのwebhookと同じ考え方（送った事実を記録して二度送らない）。
--
-- 個人情報を最小化する: 宛先メールは purchases 側にあるので**ここには持たない**。
-- 「誰に・どの用件を・いつ送ったか」だけを持つ。

create table if not exists public.ai_course_mail_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  purchase_id uuid,
  -- 'trial_not_started' | 'trial_ended' | 'expiring_soon'
  kind text not null,
  sent_at timestamptz not null default now(),
  -- 冪等キー。purchase_id が無い行でも一意になるよう文字列で組む
  dedupe_key text not null
);

create unique index if not exists ai_course_mail_log_dedupe_uq
  on public.ai_course_mail_log (dedupe_key);
create index if not exists ai_course_mail_log_sent_at_idx
  on public.ai_course_mail_log (sent_at desc);

alter table public.ai_course_mail_log enable row level security;
-- 匿名・ログイン利用者からは一切見えない（service_role だけが読み書きする）
revoke all on public.ai_course_mail_log from anon, authenticated;
-- delete も渡す: 送信に失敗したときログを取り消して翌日リトライできるようにするため
grant select, insert, delete on public.ai_course_mail_log to service_role;

comment on table public.ai_course_mail_log is
  'AIコースの自動フォローメール送信ログ。dedupe_key で二重送信を防ぐ。service_role専用';
