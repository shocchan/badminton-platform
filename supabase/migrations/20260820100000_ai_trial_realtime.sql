-- AI体験パスのリアルタイム60分制（2026-08-20 CEO決定）。
--
-- 「開始ボタンを押したらそこから実時間60分。画面を閉じても・進まなくても
--  60分経ったら自動終了」に変更する（従来の累計会話秒数モデルを置き換え）。
--
-- 仕組み（既存の期間ゲートを再利用し、二重の時計を作らない）:
-- - 購入時: valid_until = 購入+30日（＝**開始の期限**。この間に好きなタイミングで開始できる）
--   trial_window_minutes = 60（商品由来・webhookが設定）/ trial_started_at = null
-- - 開始（ai_start_trial RPC・本人がボタンで実行）:
--   trial_started_at = now() / **valid_until = now() + 60分** に書き換え
-- - 以降は既存のクライアントゲート＋ai_start_session の期間チェックがそのまま効く
--
-- rollback: 20260820100000_ai_trial_realtime.rollback.sql

alter table public.ai_course_access
  add column if not exists trial_window_minutes int,
  add column if not exists trial_started_at timestamptz;

comment on column public.ai_course_access.trial_window_minutes is
  'リアルタイム体験の分数（AI体験パス=60）。null＝リアルタイム制ではないプラン';
comment on column public.ai_course_access.trial_started_at is
  '体験を開始した時刻（本人がai_start_trialで押した瞬間）。null＝未開始。開始でvalid_untilが開始+分数になる';

-- 本人による体験開始。管理者以外がai_course_accessを書ける唯一の経路なので、
-- 変更できる内容を「自分の行の、未開始のリアルタイム体験を、いま開始する」に固定する
create or replace function public.ai_start_trial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_course_access%rowtype;
  v_until timestamptz;
begin
  select * into v_row from public.ai_course_access where user_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_access');
  end if;
  if v_row.trial_window_minutes is null then
    return jsonb_build_object('ok', false, 'code', 'not_trial_plan');
  end if;
  -- 冪等: 開始済みなら現状を返すだけ（連打・リロードで縮まない）
  if v_row.trial_started_at is not null then
    return jsonb_build_object('ok', true, 'code', 'already_started',
      'startedAt', v_row.trial_started_at, 'validUntil', v_row.valid_until);
  end if;
  -- 開始期限（購入+30日のvalid_until）を過ぎていたら開始できない
  if now() > v_row.valid_until then
    return jsonb_build_object('ok', false, 'code', 'activation_expired');
  end if;
  if now() < v_row.valid_from then
    return jsonb_build_object('ok', false, 'code', 'not_started_yet');
  end if;

  v_until := now() + make_interval(mins => v_row.trial_window_minutes);
  update public.ai_course_access
    set trial_started_at = now(), valid_until = v_until, updated_at = now()
    where user_id = auth.uid();
  return jsonb_build_object('ok', true, 'code', 'started',
    'startedAt', now(), 'validUntil', v_until);
end;
$$;

revoke all on function public.ai_start_trial() from public, anon;
grant execute on function public.ai_start_trial() to authenticated;
