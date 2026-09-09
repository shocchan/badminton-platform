-- ===================================================
-- 自己ベストを「端末」ではなく「アカウント」で出す（2026-09-09 CEO報告）
--
-- ■ 何が起きていたか
--   マイページの「ラリー自己ベスト」が、**どのアカウントでログインしても同じ数字**
--   （実機で19）になっていた。原因は MyPage.tsx が localStorage
--   （kawabado_rally_best）を読んでいたこと。あれは端末に1つしかない値なので、
--   同じブラウザで別のアカウントに入れ替えても同じ数字が出る。
--   本人の記録ではないものを「あなたの自己ベスト」として見せていた。
--
-- ■ 直し方
--   game_plays には最初から user_id がある（ログイン中のプレイは記録済み。
--   本番実測: 全160プレイ中27件が user_id つき）。そこから本人ぶんだけを数える
--   RPC をここで足す。マイページはこれだけを見る＝端末の値は混ぜない。
--
--   記録が無ければ 0 を返す。**localStorage で埋めない。**
--   埋めると「他人の記録が自分の記録として出る」という今回のバグに戻る。
--
-- ■ 権限
--   game_plays は RLS 有効・ポリシー0件（＝直接 select できない）。
--   なので security definer にし、関数の中で auth.uid() に固定して本人ぶんだけ返す。
--   引数に user_id は取らない（他人の記録を指定できる余地を作らない）。
-- ===================================================

create or replace function public.game_my_best(p_mode text default 'rally')
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(
    case when coalesce(p_mode, 'rally') = 'knock'
      then coalesce(score, 0)
      else coalesce(rally_count, 0)
    end
  ), 0)::int
  from public.game_plays
  where user_id = auth.uid()
    -- 既存行は mode = null が旧ラリーゲーム（20260825100000 の約束）
    and coalesce(mode, 'rally') = coalesce(p_mode, 'rally');
$$;

comment on function public.game_my_best(text) is
  'ログイン中の本人の自己ベスト。端末ではなくアカウント単位。未ログイン・記録なしは0。'
  '引数にuser_idを取らないのは、他人の記録を指定できないようにするため（2026-09-09）';

revoke all on function public.game_my_best(text) from public;
-- anon にも許す（auth.uid() が null なので必ず0が返る＝情報は出ない）。
-- ログイン前後で呼び出し側を分岐させずに済む
grant execute on function public.game_my_best(text) to anon, authenticated;
