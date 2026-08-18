-- rollback: 20260720000000 の元定義（grant復活なし）へ戻す
create or replace function public.ai_delete_test_learners()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not public.ai_is_admin() then raise exception 'forbidden'; end if;
  delete from public.ai_learners where is_test;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
