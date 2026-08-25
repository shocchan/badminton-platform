-- 20260825100000_game_knock_mode.sql の巻き戻し（適用は人間の判断で）
--
-- ⚠️ 列を drop すると **30秒ノックのプレイ記録は取り直せない**。
--    「何本打てたか」の分布はこの列にしかない。実行前に必ずバックアップを取ること:
--      create table game_plays_backup_20260825 as select * from public.game_plays;
--
-- 先にフロント側を rally に戻す（?mode= を使わない / VITE_GAME_MODE を外す）こと。
-- 関数だけ落として列を残す（データを守る）巻き戻しも下に用意してある。

-- ── A. 関数だけ戻す（データは残す。まずこちらを検討する） ──

drop function if exists public.game_record_knock_play(text, int, int);
drop function if exists public.game_device_scores(text, text);

-- admin_game_stats を作り替え前の定義に戻す
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
    'max_rally',       (select coalesce(max(rally_count), 0) from game_plays),
    'avg_rally',       (select coalesce(round(avg(rally_count)::numeric, 1), 0) from game_plays),
    'total_draws',     (select coalesce(sum(draw_count), 0) from game_plays),
    'winners',         (select count(*) from lottery_draws where is_winner),
    'ramen_total',     (select count(*) from coupons where type = 'ramen'),
    'badminton_total', (select count(*) from coupons where type = 'badminton'),
    'top_rallies',     (select coalesce(jsonb_agg(r), '[]'::jsonb)
                        from (select rally_count, played_at from game_plays
                              order by rally_count desc, played_at asc limit 5) r)
  ) into result;
  return result;
end $$;

grant execute on function admin_game_stats() to authenticated;

-- ── B. 列まで完全に消す（記録を捨てる。バックアップを取った後だけ） ──
-- 下の5行はコメントアウトしてある。本当に捨てると決めたときだけ外す。
--
-- drop index if exists public.game_plays_device_mode_idx;
-- alter table public.game_plays drop constraint if exists game_plays_mode_chk;
-- alter table public.game_plays drop constraint if exists game_plays_score_chk;
-- alter table public.game_plays drop constraint if exists game_plays_max_combo_chk;
-- alter table public.game_plays drop column if exists mode, drop column if exists score, drop column if exists max_combo;
