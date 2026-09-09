-- rollback: 20260909140000_ai_testimonial_moderation.sql
--
-- ⚠️ 列は落とさない（却下の理由・編集案・匿名希望は、消すと二度と復元できない記録）。
--    関数だけ 2026-08-26 の形へ戻す。公開用RPCは落とす。

drop function if exists public.ai_public_testimonials(text, integer);
drop function if exists public.ai_set_testimonial_edit(uuid, text);
drop function if exists public.ai_unreject_testimonial(uuid);
drop function if exists public.ai_reject_testimonial(uuid, text);
drop function if exists public.ai_submit_testimonial(text, boolean, text, text, text, boolean);

-- 承認関数を却下チェックの無い形に戻す
create or replace function public.ai_approve_testimonial(p_id uuid, p_approve boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consent boolean;
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select consent_publish into v_consent from public.ai_testimonials where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if p_approve and not v_consent then
    return jsonb_build_object('ok', false, 'code', 'no_consent');
  end if;
  update public.ai_testimonials
    set approved_at = case when p_approve then now() else null end,
        approved_by = case when p_approve then auth.uid() else null end
    where id = p_id;
  return jsonb_build_object('ok', true, 'code', case when p_approve then 'approved' else 'unapproved' end);
end;
$$;

grant execute on function public.ai_approve_testimonial(uuid, boolean) to authenticated;
