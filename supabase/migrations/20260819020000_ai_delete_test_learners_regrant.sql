-- テストデータ削除後に再登録できなかった不具合の恒久修正（2026-08-19 CEO実害報告）。
--
-- ai_delete_test_learners は learner 行を消すが、登録許可（signup_grants）は
-- 初回登録時に消費済み（consumed_at セット）のまま残る。そのため削除後に同じ
-- テストアカウントでログインすると、名前登録の INSERT が RLS で弾かれて
-- 「アカウントデータを作成できませんでした」で詰んでいた。
-- 削除と同時に、そのアカウントの登録許可を復活させる（is_test の grant のみ）。
create or replace function public.ai_delete_test_learners()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if not public.ai_is_admin() then raise exception 'forbidden'; end if;

  -- 削除対象の learner に対応する grant を先に復活させる（メールは auth.users から引く）
  update public.ai_course_signup_grants g
    set consumed_at = null,
        expires_at = greatest(coalesce(g.expires_at, now()), now() + interval '2 years')
  from public.ai_learners l
  join auth.users u on u.id = l.user_id
  where l.is_test and g.email = u.email and g.is_test;

  delete from public.ai_learners where is_test;  -- 子テーブルは on delete cascade
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.ai_delete_test_learners() to authenticated;
