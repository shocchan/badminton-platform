-- ===================================================
-- 30秒ノック（ゲーム作り替え・設計案B）のスコア記録（2026-08-25）
--
-- ■ 何のために足すか
--   旧ラリーゲームは 166開始 / 93完了 ＝ **44%が結果画面に到達していなかった**。
--   さらに 0ラリーのプレイは記録すらされていなかった（クライアント側で捨てていた）。
--   新しい30秒ノックは「必ず結果に到達する」「0本でも記録する」ので、
--   はじめて「何本打てたか」の分布が取れる。その置き場をここで作る。
--
-- ■ 既存データを壊さないための約束
--   ・追加する列はすべて nullable。既存行は mode = null のまま＝旧ラリーゲームとして扱う
--   ・ノックのプレイは draw_count = 0 / rally_count = 0 で入る
--     → rally-lottery Edge Function の「今日この端末で抽選対象になったゲーム数」
--       （draw_count > 0 で数えている）に一切影響しない。抽選・クーポンには関与しない
--   ・admin_game_stats() のラリー系の集計に mode is null の条件を足す
--     → ノックの0ラリー行で avg_rally が薄まるのを防ぐ（ここを足さないと既存の数字が狂う）
--
-- ■ 適用について
--   本番へは当てていない。staging で確認してからCEO判断で当てる。
--   巻き戻しは 20260825100000_game_knock_mode.rollback.sql。
-- ===================================================

-- ── 1. 列の追加（すべて nullable） ──

alter table public.game_plays add column if not exists score int;
alter table public.game_plays add column if not exists max_combo int;
alter table public.game_plays add column if not exists mode text;

comment on column public.game_plays.mode is
  'null=旧ラリーゲーム / knock=30秒ノック。既存行を書き換えないため null を旧扱いにしている';
comment on column public.game_plays.score is
  '30秒ノックで打った本数。ラリーゲームでは null';
comment on column public.game_plays.max_combo is
  '30秒ノックの最大連続ヒット数。ラリーゲームでは null';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_plays_mode_chk') then
    alter table public.game_plays
      add constraint game_plays_mode_chk check (mode is null or mode in ('knock'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'game_plays_score_chk') then
    -- 30秒で200本は物理的に不可能（1本あたり150ms）。自己申告の上限として置く
    alter table public.game_plays
      add constraint game_plays_score_chk check (score is null or (score >= 0 and score <= 200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'game_plays_max_combo_chk') then
    alter table public.game_plays
      add constraint game_plays_max_combo_chk
      check (max_combo is null or (max_combo >= 0 and max_combo <= 200));
  end if;
end $$;

create index if not exists game_plays_device_mode_idx
  on public.game_plays (guest_device_id, mode, played_at desc);

-- ── 2. 記録用の公開RPC ──
--
-- なぜ Edge Function ではなく RPC か:
--   抽選（rally-lottery）は当落という「お金の出るもの」を扱うのでサーバー専用のままにする。
--   ノックのスコアは景品に一切つながらないので、判定のないただの記録として最小の経路で書く。
--   そのぶん、値の上限・1日の本数上限をこの関数の中で必ず掛ける。
--
-- 返す情報に個人を識別できるものは含めない。

create or replace function public.game_record_knock_play(
  p_device_uuid text,
  p_score int,
  p_max_combo int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
  v_today int;
  v_id uuid;
begin
  if p_device_uuid is null or length(p_device_uuid) < 8 or length(p_device_uuid) > 64 then
    raise exception 'bad device';
  end if;
  if p_score is null or p_score < 0 or p_score > 200 then
    raise exception 'bad score';
  end if;
  if p_max_combo is null or p_max_combo < 0 or p_max_combo > 200 then
    raise exception 'bad combo';
  end if;

  insert into public.guest_devices (device_uuid)
  values (p_device_uuid)
  on conflict (device_uuid) do update set device_uuid = excluded.device_uuid
  returning id into v_device;

  -- 1端末1日200本まで（30秒ゲームなので現実的な上限。荒らしでDBを膨らませない）
  select count(*) into v_today
  from public.game_plays
  where guest_device_id = v_device
    and mode = 'knock'
    and played_at >= (date_trunc('day', now() at time zone 'Asia/Tokyo')) at time zone 'Asia/Tokyo';

  if v_today >= 200 then
    return jsonb_build_object('recorded', false, 'reason', 'daily_cap');
  end if;

  insert into public.game_plays
    (guest_device_id, rally_count, draw_count, mode, score, max_combo)
  values
    (v_device, 0, 0, 'knock', p_score, least(p_max_combo, p_score))
  returning id into v_id;

  return jsonb_build_object('recorded', true, 'id', v_id);
end $$;

revoke all on function public.game_record_knock_play(text, int, int) from public;
grant execute on function public.game_record_knock_play(text, int, int) to anon, authenticated;

-- ── 3. 自己ベスト・直近10回を引く公開RPC ──
--
-- 自己ベストの正はここ（サーバー）。localStorage は端末を変えると消えるので控えにしかならない。
-- 返すのは score / rally_count / max_combo / played_at だけ。個人情報は返さない。

create or replace function public.game_device_scores(
  p_device_uuid text,
  p_mode text default 'knock'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
  v_best int := 0;
  v_recent jsonb := '[]'::jsonb;
begin
  if p_mode is null or p_mode not in ('knock', 'rally') then
    raise exception 'bad mode';
  end if;
  if p_device_uuid is null or length(p_device_uuid) < 8 or length(p_device_uuid) > 64 then
    return jsonb_build_object('best', 0, 'recent', '[]'::jsonb);
  end if;

  select id into v_device from public.guest_devices where device_uuid = p_device_uuid;
  if v_device is null then
    return jsonb_build_object('best', 0, 'recent', '[]'::jsonb);
  end if;

  if p_mode = 'knock' then
    select coalesce(max(score), 0) into v_best
    from public.game_plays
    where guest_device_id = v_device and mode = 'knock';

    select coalesce(jsonb_agg(to_jsonb(r) order by r.played_at desc), '[]'::jsonb)
    into v_recent
    from (
      select score, max_combo, played_at
      from public.game_plays
      where guest_device_id = v_device and mode = 'knock'
      order by played_at desc
      limit 10
    ) r;
  else
    select coalesce(max(rally_count), 0) into v_best
    from public.game_plays
    where guest_device_id = v_device and mode is null;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.played_at desc), '[]'::jsonb)
    into v_recent
    from (
      select rally_count, played_at
      from public.game_plays
      where guest_device_id = v_device and mode is null
      order by played_at desc
      limit 10
    ) r;
  end if;

  return jsonb_build_object('best', v_best, 'recent', v_recent);
end $$;

revoke all on function public.game_device_scores(text, text) from public;
grant execute on function public.game_device_scores(text, text) to anon, authenticated;

-- ── 4. 管理画面の統計を、ノック行で薄まらないように直す ──
--
-- ノックのプレイは rally_count = 0 で入るので、
-- ここを直さないと avg_rally / max_rally / top_rallies が意味を失う。
-- 既存のキーは全部そのまま（意味だけ正しくなる）＋ ノック用のキーを足すだけなので、
-- 管理画面のコードを変えなくても壊れない。

create or replace function admin_game_stats()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'total_plays',     (select count(*) from game_plays),
    'plays_today',     (select count(*) from game_plays
                        where played_at >= (date_trunc('day', now() at time zone 'Asia/Tokyo')) at time zone 'Asia/Tokyo'),
    'plays_7d',        (select count(*) from game_plays where played_at >= now() - interval '7 days'),
    'plays_30d',       (select count(*) from game_plays where played_at >= now() - interval '30 days'),
    'unique_players',  (select count(distinct coalesce(user_id::text, guest_device_id::text)) from game_plays),
    -- ラリー系は旧ゲーム（mode is null）だけを見る
    'max_rally',       (select coalesce(max(rally_count), 0) from game_plays where mode is null),
    'avg_rally',       (select coalesce(round(avg(rally_count)::numeric, 1), 0) from game_plays where mode is null),
    'total_draws',     (select coalesce(sum(draw_count), 0) from game_plays),
    'winners',         (select count(*) from lottery_draws where is_winner),
    'ramen_total',     (select count(*) from coupons where type = 'ramen'),
    'badminton_total', (select count(*) from coupons where type = 'badminton'),
    'top_rallies',     (select coalesce(jsonb_agg(r), '[]'::jsonb)
                        from (select rally_count, played_at from game_plays
                              where mode is null
                              order by rally_count desc, played_at asc limit 5) r),
    -- ここから30秒ノック
    'knock_plays',     (select count(*) from game_plays where mode = 'knock'),
    'knock_players',   (select count(distinct coalesce(user_id::text, guest_device_id::text))
                        from game_plays where mode = 'knock'),
    'knock_max_score', (select coalesce(max(score), 0) from game_plays where mode = 'knock'),
    'knock_avg_score', (select coalesce(round(avg(score)::numeric, 1), 0) from game_plays where mode = 'knock'),
    'knock_median_score', (select coalesce(
                            percentile_cont(0.5) within group (order by score), 0)
                          from game_plays where mode = 'knock'),
    'top_knock',       (select coalesce(jsonb_agg(r), '[]'::jsonb)
                        from (select score, max_combo, played_at from game_plays
                              where mode = 'knock'
                              order by score desc, played_at asc limit 5) r)
  ) into result;
  return result;
end $$;

grant execute on function admin_game_stats() to authenticated;
