-- ¥600体験を「商品の学習サイクルを一周できる」形にする（2026-08-26 CEO指示 Phase S2）。
--
-- 【いまの問題】
-- 体験は「体験を始める」から**実時間60分**で切れる。
-- ところがこの商品の中心は間隔反復（忘れかけた頃にもう一度出す）で、復習は翌日以降に届く。
-- つまり600円を払った人は、**この商品のいちばん効く部分を構造上体験できない**。
-- 実測: 唯一の体験購入者は4個の表現が復習予定に入ったが、1個も受け取っていない。
--
-- 【変更】
--   trial_days（既定7）を足し、開始時の valid_until を「開始 + 7日」にする。
--   trial_days が null の行は**従来どおり** trial_window_minutes（60分）で動く。
--
-- 【AI原価はどう動くか（実測ベースの検算）】
-- 音声は**合計回数**で頭打ち（voiceSessionsTotal 3）なので日数を伸ばしても増えない。
-- ところが**テキスト会話は1日あたりの上限しかない**ので、日数ぶん伸びる。
-- planAiBudget の最悪値モデルで検算した実数（600円・上限は原価率60%＝¥360）:
--   旧 60分・音声3・テキスト10/日 → ¥300（50.0%）
--   7日・テキスト10/日のまま      → ¥352（58.7%）… 通るが余裕が¥8しかない
--   7日・テキスト 5/日            → ¥326（54.3%）… これを採る
-- したがって textSessionsPerDay を 10 → 5 にする。
-- 音声3回が主で、テキストは補助なので、体験の中身は落ちない。
--
-- あわせて voiceSessionsPerDay を 3 → 2 にする。
-- 合計3回のまま「初日に全部使い切って翌日の復習を体験できない」を防ぐための配分で、
-- もらえる回数は減らない。
--
-- 【既存を壊さない作り】
-- 新しい関数を作らず ai_start_trial を置き換える。
-- 本番のフロントは（承認まで）古いままだが、古いフロントが呼んでも trial_days があれば
-- 7日になる＝「LPは7日と書いてあるのに60分で切れる」という食い違いが起きない。
-- 開始済みの行（trial_started_at が入っている行）には一切触らない。
--
-- rollback: 20260826150000_ai_trial_seven_days.rollback.sql

alter table public.ai_course_access
  add column if not exists trial_days int;

comment on column public.ai_course_access.trial_days is
  '体験の有効日数（AI体験パス=7）。null＝旧仕様（trial_window_minutes の実時間制）。開始でvalid_untilが開始+日数になる';

-- 体験の開始。trial_days を優先し、無ければ従来の分数にフォールバックする
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
  -- 体験プランかどうかの判定は従来どおり（日数だけの行も体験として扱う）
  if v_row.trial_window_minutes is null and v_row.trial_days is null then
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

  v_until := case
    when v_row.trial_days is not null then now() + make_interval(days => v_row.trial_days)
    else now() + make_interval(mins => v_row.trial_window_minutes)
  end;

  update public.ai_course_access
    set trial_started_at = now(), valid_until = v_until, updated_at = now()
    where user_id = auth.uid();
  return jsonb_build_object('ok', true, 'code', 'started',
    'startedAt', now(), 'validUntil', v_until,
    'trialDays', v_row.trial_days, 'windowMinutes', v_row.trial_window_minutes);
end;
$$;

revoke all on function public.ai_start_trial() from public, anon;
grant execute on function public.ai_start_trial() to authenticated;

-- ── 音声会話の1日あたり配分（合計は変えない） ──────────────────
-- 「会話 → フィードバック → 復習予定 → 翌日の復習 → 定着確認」を
-- 最低1回は通せるように、初日に3回とも使い切れないようにする。
update public.ai_config
  set value = jsonb_set(
        jsonb_set(value, '{ai-trial-pass,voiceSessionsPerDay}', '2'::jsonb),
        '{ai-trial-pass,textSessionsPerDay}', '5'::jsonb)
  where key = 'plan_ai_budgets'
    and value ? 'ai-trial-pass';
