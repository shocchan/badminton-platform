-- AI日本語コース: 招待コードのサーバー側管理・利用制限のサーバー強制・プライバシー・問題報告
--
-- 背景（受入テストで判明した問題）:
--  1. 招待コードがフロントのコード内既定値（andy-course-2026）で動いてしまう
--  2. 招待コードを知らなくても supabase.auth.signInWithOtp を直接叩けば登録できてしまう
--  3. 利用制限がクライアント判定のみで、複数タブ・誤操作で上限を超えられる
--
-- 方針:
--  - 「auth ユーザーを作れるか」ではなく「AIコースの learner になれるか」を境界にする。
--    kawabado の通常会員登録フローには一切影響を与えないため、Supabase の公開サインアップ設定は変更しない。
--  - 招待コードは service_role からのみ読める表に置き、フロントのバンドルには一切含めない。
--  - セッション開始は RPC で原子的に「上限確認 → 予約（行作成）」を行う。
--
-- 既存テーブル（members / activities / 決済系）へは一切変更しない。

-- ────────────────────────────────────────────────
-- 1. 招待コード（期限・利用回数・対象メール制限に対応した構造）
-- ────────────────────────────────────────────────
create table if not exists public.ai_course_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null default '',
  max_uses int,                       -- null = 無制限
  used_count int not null default 0,
  expires_at timestamptz,             -- null = 無期限
  allowed_email text,                 -- null = メール制限なし
  is_active boolean not null default true,
  is_test boolean not null default false,  -- staging受入テスト用コード
  created_at timestamptz not null default now()
);

-- 招待コードは誰にも読ませない（service_role のみ）。RLS有効＋ポリシーなし＝authenticated/anonは0行。
alter table public.ai_course_invites enable row level security;
revoke all on public.ai_course_invites from anon, authenticated;

-- ────────────────────────────────────────────────
-- 2. 登録許可（招待コード検証に成功したメールにだけ発行される短命チケット）
--    これが無いと ai_learners を作れない ＝ 招待コードを知らない人はコースに入れない
-- ────────────────────────────────────────────────
create table if not exists public.ai_course_signup_grants (
  email text primary key,
  invite_id uuid references public.ai_course_invites(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  is_test boolean not null default false
);
alter table public.ai_course_signup_grants enable row level security;
revoke all on public.ai_course_signup_grants from anon, authenticated;

-- ────────────────────────────────────────────────
-- 3. 招待コードの検証＋grant発行（Edge Function が service_role で呼ぶ）
--    平文コードは引数でのみ受け取り、戻り値・ログには出さない。
-- ────────────────────────────────────────────────
create or replace function public.ai_redeem_invite(p_code text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.ai_course_invites%rowtype;
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  select * into v_invite from public.ai_course_invites
  where code = p_code and is_active limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_invite');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'invite_expired');
  end if;
  if v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'invite_exhausted');
  end if;
  if v_invite.allowed_email is not null and lower(v_invite.allowed_email) <> v_email then
    return jsonb_build_object('ok', false, 'reason', 'invite_email_mismatch');
  end if;

  -- 既にlearnerがある（＝登録済み）なら grant は不要。再ログインは通常のOTPで行う。
  insert into public.ai_course_signup_grants (email, invite_id, expires_at, is_test)
  values (v_email, v_invite.id, now() + interval '24 hours', v_invite.is_test)
  on conflict (email) do update
    set invite_id = excluded.invite_id,
        granted_at = now(),
        expires_at = excluded.expires_at,
        consumed_at = null,
        is_test = excluded.is_test;

  return jsonb_build_object('ok', true, 'isTest', v_invite.is_test);
end;
$$;
revoke all on function public.ai_redeem_invite(text, text) from anon, authenticated;

-- ────────────────────────────────────────────────
-- 4. learner のテスト区分＋「grantが無いと作れない」INSERTポリシー
-- ────────────────────────────────────────────────
alter table public.ai_learners add column if not exists is_test boolean not null default false;

drop policy if exists ai_learners_insert on public.ai_learners;
create policy ai_learners_insert on public.ai_learners for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.ai_course_signup_grants g
      where g.email = lower(coalesce(auth.jwt()->>'email', ''))
        and g.consumed_at is null
        and g.expires_at > now()
    )
  );

-- learner作成時に grant を消費し、テスト区分を引き継ぐ
create or replace function public.ai_consume_signup_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  update public.ai_course_signup_grants
    set consumed_at = now()
    where email = v_email and consumed_at is null;

  update public.ai_course_invites i
    set used_count = i.used_count + 1
    from public.ai_course_signup_grants g
    where g.email = v_email and i.id = g.invite_id;

  new.is_test := coalesce(
    (select g.is_test from public.ai_course_signup_grants g where g.email = v_email), false);
  return new;
end;
$$;

drop trigger if exists ai_learners_consume_grant on public.ai_learners;
create trigger ai_learners_consume_grant
  before insert on public.ai_learners
  for each row execute function public.ai_consume_signup_grant();

-- ────────────────────────────────────────────────
-- 5. 利用制限のサーバー強制（確認と予約を1トランザクションで）
--    クライアントは ai_learning_sessions を直接 insert せず、このRPCを通す。
-- ────────────────────────────────────────────────

-- 異常切断で in_progress のまま残ったセッションを解放する（永久ロック防止）
create or replace function public.ai_release_stale_sessions(p_learner_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_learning_sessions
    set completion_status = 'interrupted',
        end_reason = coalesce(end_reason, 'stale_timeout'),
        ended_at = coalesce(ended_at, now())
  where learner_id = p_learner_id
    and completion_status = 'in_progress'
    and started_at < now() - interval '15 minutes';
$$;

create or replace function public.ai_start_session(
  p_mission_id text,
  p_lesson_kind text,
  p_mode text,
  p_difficulty int,
  p_target_expression text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner public.ai_learners%rowtype;
  v_limits jsonb;
  v_max_sessions int;
  v_max_seconds int;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_usage public.ai_usage_daily%rowtype;
  v_active int;
  v_session_id uuid;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;
  if not v_learner.is_active then
    return jsonb_build_object('ok', false, 'code', 'learner_suspended');
  end if;

  perform public.ai_release_stale_sessions(v_learner.id);

  -- 同時アクティブセッション（別タブ・二重起動の防止）
  select count(*) into v_active from public.ai_learning_sessions
    where learner_id = v_learner.id and completion_status = 'in_progress';
  if v_active > 0 then
    return jsonb_build_object('ok', false, 'code', 'session_already_active');
  end if;

  select value into v_limits from public.ai_config where key = 'usage_limits';
  v_max_sessions := coalesce((v_limits->>'daily_max_sessions')::int, 5);
  v_max_seconds  := coalesce((v_limits->>'daily_max_seconds')::int, 1200);

  -- 当日行をロックして確認（複数タブの同時開始を直列化）
  insert into public.ai_usage_daily (learner_id, usage_date)
    values (v_learner.id, v_today)
    on conflict (learner_id, usage_date) do nothing;
  select * into v_usage from public.ai_usage_daily
    where learner_id = v_learner.id and usage_date = v_today for update;

  if v_usage.sessions_count >= v_max_sessions then
    return jsonb_build_object('ok', false, 'code', 'daily_session_limit');
  end if;
  if v_usage.seconds_used >= v_max_seconds then
    return jsonb_build_object('ok', false, 'code', 'daily_time_limit');
  end if;

  insert into public.ai_learning_sessions
    (learner_id, mission_id, mode, lesson_kind, difficulty, target_expression, completion_status)
  values
    (v_learner.id, p_mission_id, coalesce(p_mode, 'voice'), coalesce(p_lesson_kind, 'new'),
     coalesce(p_difficulty, 2), p_target_expression, 'in_progress')
  returning id into v_session_id;

  -- 予約時点で回数を消費する（ページ更新で回数だけ増える事故は
  -- session_already_active で弾かれるため発生しない）
  update public.ai_usage_daily
    set sessions_count = sessions_count + 1, updated_at = now()
    where learner_id = v_learner.id and usage_date = v_today;

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'learnerId', v_learner.id,
    'remainingSessions', v_max_sessions - (v_usage.sessions_count + 1)
  );
end;
$$;
grant execute on function public.ai_start_session(text, text, text, int, text) to authenticated;

-- クライアントからの直接 insert を禁止し、必ず ai_start_session を通す
drop policy if exists ai_learning_sessions_insert on public.ai_learning_sessions;
create policy ai_learning_sessions_insert on public.ai_learning_sessions for insert to authenticated
  with check (public.ai_is_admin());

-- ────────────────────────────────────────────────
-- 6. プライバシー: 発話ログの保持期間と削除（レポートは残す）
-- ────────────────────────────────────────────────
create or replace function public.ai_delete_my_utterances()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_learner_id uuid; v_count int;
begin
  select id into v_learner_id from public.ai_learners where user_id = auth.uid() limit 1;
  if v_learner_id is null then return 0; end if;
  delete from public.ai_session_utterances where learner_id = v_learner_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.ai_delete_my_utterances() to authenticated;

-- 管理者による削除（対象learner指定）
create or replace function public.ai_admin_delete_utterances(p_learner_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if not public.ai_is_admin() then raise exception 'forbidden'; end if;
  delete from public.ai_session_utterances where learner_id = p_learner_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.ai_admin_delete_utterances(uuid) to authenticated;

-- 保持期間を過ぎた発話ログの削除（自動バッチは別フェーズ。手動/cronから呼べる形で用意）
create or replace function public.ai_purge_expired_utterances()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_days int; v_count int;
begin
  select coalesce((value->>'utterance_retention_days')::int, 180)
    into v_days from public.ai_config where key = 'privacy';
  delete from public.ai_session_utterances
    where created_at < now() - (coalesce(v_days, 180) || ' days')::interval;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.ai_purge_expired_utterances() from anon, authenticated;

-- ────────────────────────────────────────────────
-- 7. 問題報告（§18）。APIキー・OTP・発話全文は保存しない
-- ────────────────────────────────────────────────
create table if not exists public.ai_issue_reports (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references public.ai_learners(id) on delete set null,
  session_id uuid references public.ai_learning_sessions(id) on delete set null,
  page text,
  error_code text,
  user_agent text,
  platform text,
  online boolean,
  comment text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.ai_issue_reports enable row level security;

drop policy if exists ai_issue_reports_insert on public.ai_issue_reports;
create policy ai_issue_reports_insert on public.ai_issue_reports for insert to authenticated
  with check (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
drop policy if exists ai_issue_reports_select on public.ai_issue_reports;
create policy ai_issue_reports_select on public.ai_issue_reports for select to authenticated
  using (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
drop policy if exists ai_issue_reports_update on public.ai_issue_reports;
create policy ai_issue_reports_update on public.ai_issue_reports for update to authenticated
  using (public.ai_is_admin());

grant select, insert on public.ai_issue_reports to authenticated;
grant update on public.ai_issue_reports to authenticated;

-- ────────────────────────────────────────────────
-- 8. テストlearnerの一括削除（§21）
-- ────────────────────────────────────────────────
create or replace function public.ai_delete_test_learners()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if not public.ai_is_admin() then raise exception 'forbidden'; end if;
  delete from public.ai_learners where is_test;  -- 子テーブルは on delete cascade
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.ai_delete_test_learners() to authenticated;

-- ────────────────────────────────────────────────
-- 9. OTP送信の制御（招待コード検証前の大量送信・総当たりを防ぐ）
-- ────────────────────────────────────────────────

-- 既に登録済みか（継続ログイン時は招待コード不要にするための判定）。service_roleのみ。
create or replace function public.ai_email_has_learner(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ai_learners l
    join auth.users u on u.id = l.user_id
    where lower(u.email) = lower(trim(p_email))
  );
$$;
revoke all on function public.ai_email_has_learner(text) from anon, authenticated;

create table if not exists public.ai_otp_throttle (
  email text primary key,
  last_sent_at timestamptz not null default now(),
  sent_in_window int not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.ai_otp_throttle enable row level security;
revoke all on public.ai_otp_throttle from anon, authenticated;

-- 60秒の再送間隔＋1時間あたりの上限。許可された場合のみ true を返して記録する。
create or replace function public.ai_check_otp_throttle(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_row public.ai_otp_throttle%rowtype;
  v_cooldown int := 60;      -- 秒
  v_hourly_max int := 8;
  v_wait int;
begin
  insert into public.ai_otp_throttle (email, last_sent_at, sent_in_window, window_started_at)
    values (v_email, now() - interval '1 hour', 0, now())
    on conflict (email) do nothing;
  select * into v_row from public.ai_otp_throttle where email = v_email for update;

  if v_row.window_started_at < now() - interval '1 hour' then
    v_row.sent_in_window := 0;
    v_row.window_started_at := now();
  end if;

  v_wait := v_cooldown - extract(epoch from (now() - v_row.last_sent_at))::int;
  if v_wait > 0 then
    return jsonb_build_object('ok', false, 'code', 'otp_cooldown', 'retryAfter', v_wait);
  end if;
  if v_row.sent_in_window >= v_hourly_max then
    return jsonb_build_object('ok', false, 'code', 'otp_hourly_limit', 'retryAfter', 3600);
  end if;

  update public.ai_otp_throttle
    set last_sent_at = now(),
        sent_in_window = v_row.sent_in_window + 1,
        window_started_at = v_row.window_started_at
    where email = v_email;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.ai_check_otp_throttle(text) from anon, authenticated;

-- ────────────────────────────────────────────────
-- 10. 設定の追加・招待コードの移行
-- ────────────────────────────────────────────────
insert into public.ai_config (key, value) values
  ('privacy', '{"utterance_retention_days":180}'::jsonb)
on conflict (key) do nothing;

-- 旧: ai_config.signup_invite_code に平文で置いていたものを招待コード表へ移す。
-- 本番の実コードは Supabase Secret / SQL で別途投入する（このファイルには書かない）。
do $do$
declare v_old text;
begin
  select value #>> '{}' into v_old from public.ai_config where key = 'signup_invite_code';
  if v_old is not null and v_old <> '' then
    insert into public.ai_course_invites (code, label, max_uses)
      values (v_old, 'migrated from ai_config', null)
      on conflict (code) do nothing;
  end if;
  delete from public.ai_config where key = 'signup_invite_code';
end
$do$;
