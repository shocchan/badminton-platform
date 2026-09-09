-- 口コミの承認フロー（2026-09-09 P1-6）
--
-- 既にある ai_testimonials（2026-08-26）は「掲載許諾」と「管理者承認」を分けて持っていた。
-- 足りていなかったのは3つ:
--   1. 却下（rejected）の状態が無く、「見たけれど載せない」と決めた記録が残らなかった
--   2. 匿名希望が**表示名が空かどうか**でしか表せなかった（本人の意思として残らない）
--   3. 誤字などの軽い直しを入れる場所が無く、直すなら原文を書き換えるしかなかった
--      → **原文は絶対に書き換えない。** 編集案は別の列に置き、どちらも残す
--
-- 【変えない約束】
--   - 架空の口コミは作らない
--   - 掲載許諾は感想とは別のチェックで、既定はOFF
--   - 許諾があっても自動公開しない（人が承認する）
--   - 口コミを書くことを、割引・紹介報酬・無料期間の条件にしない
--
-- rollback: 20260909140000_ai_testimonial_moderation.rollback.sql

alter table public.ai_testimonials
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists reject_reason text,
  /** 本人が「名前は出さないでほしい」と言ったか。表示名の有無とは別に意思として残す */
  add column if not exists anonymous boolean not null default false,
  /**
   * 掲載用の編集案（誤字直し・句読点など）。**原文（body）は絶対に書き換えない。**
   * null なら原文をそのまま載せる。
   */
  add column if not exists edited_body text,
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz;

comment on column public.ai_testimonials.edited_body is
  '掲載用の編集案。原文(body)は書き換えない。AIが勝手に美化しない（軽微な誤字直しのみ・人が入れる）';

create index if not exists ai_testimonials_pending_idx
  on public.ai_testimonials (created_at desc)
  where approved_at is null and rejected_at is null;

-- ── 投稿（匿名希望を受け取れるようにする） ──
create or replace function public.ai_submit_testimonial(
  p_body text,
  p_consent_publish boolean default false,
  p_display_name text default null,
  p_locale text default 'ja',
  p_context text default null,
  p_anonymous boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_today int;
  v_learner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_signed_in');
  end if;
  if length(v_body) = 0 then
    return jsonb_build_object('ok', false, 'code', 'empty');
  end if;
  if length(v_body) > 600 then
    v_body := left(v_body, 600);
  end if;

  select count(*) into v_today from public.ai_testimonials
    where user_id = v_uid and created_at > now() - interval '1 day';
  if v_today >= 1 then
    return jsonb_build_object('ok', false, 'code', 'already_today');
  end if;

  select id into v_learner from public.ai_learners where user_id = v_uid limit 1;

  insert into public.ai_testimonials (
    user_id, learner_id, body, locale, context, consent_publish, display_name, anonymous
  ) values (
    v_uid, v_learner, v_body,
    case when p_locale = 'zh' then 'zh' else 'ja' end,
    left(p_context, 40),
    coalesce(p_consent_publish, false),
    -- 匿名希望なら表示名は保存しない（あとで気が変わっても、こちらは持っていない）
    case when coalesce(p_anonymous, false) then null
         else nullif(btrim(left(coalesce(p_display_name, ''), 40)), '') end,
    coalesce(p_anonymous, false)
  );

  return jsonb_build_object('ok', true, 'code', 'saved',
    'truncated', length(btrim(coalesce(p_body, ''))) > 600);
end;
$$;

revoke all on function public.ai_submit_testimonial(text, boolean, text, text, text, boolean) from public, anon;
grant execute on function public.ai_submit_testimonial(text, boolean, text, text, text, boolean) to authenticated;

-- ── 却下（見たけれど載せない、を記録として残す） ──
create or replace function public.ai_reject_testimonial(p_id uuid, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.ai_testimonials
     set rejected_at = now(), rejected_by = auth.uid(),
         reject_reason = left(coalesce(p_reason, ''), 200),
         -- 却下したら公開もやめる（承認と却下が同時に立たない）
         approved_at = null, approved_by = null
   where id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

revoke all on function public.ai_reject_testimonial(uuid, text) from public, anon;
grant execute on function public.ai_reject_testimonial(uuid, text) to authenticated;

/** 却下を取り消して未処理に戻す（押し間違いから戻れるように） */
create or replace function public.ai_unreject_testimonial(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.ai_testimonials
     set rejected_at = null, rejected_by = null, reject_reason = null
   where id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

revoke all on function public.ai_unreject_testimonial(uuid) from public, anon;
grant execute on function public.ai_unreject_testimonial(uuid) to authenticated;

-- ── 編集案（原文は書き換えない） ──
create or replace function public.ai_set_testimonial_edit(p_id uuid, p_edited text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edited text := nullif(btrim(coalesce(p_edited, '')), '');
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.ai_testimonials
     set edited_body = left(v_edited, 600),
         edited_by = case when v_edited is null then null else auth.uid() end,
         edited_at = case when v_edited is null then null else now() end
   where id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

revoke all on function public.ai_set_testimonial_edit(uuid, text) from public, anon;
grant execute on function public.ai_set_testimonial_edit(uuid, text) to authenticated;

-- ── 承認（却下されている行は承認できない） ──
create or replace function public.ai_approve_testimonial(p_id uuid, p_approve boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consent boolean;
  v_rejected timestamptz;
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select consent_publish, rejected_at into v_consent, v_rejected
    from public.ai_testimonials where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if p_approve and not v_consent then
    return jsonb_build_object('ok', false, 'code', 'no_consent');
  end if;
  if p_approve and v_rejected is not null then
    return jsonb_build_object('ok', false, 'code', 'rejected');
  end if;
  update public.ai_testimonials
    set approved_at = case when p_approve then now() else null end,
        approved_by = case when p_approve then auth.uid() else null end
    where id = p_id;
  return jsonb_build_object('ok', true, 'code', case when p_approve then 'approved' else 'unapproved' end);
end;
$$;

revoke all on function public.ai_approve_testimonial(uuid, boolean) from public, anon;
grant execute on function public.ai_approve_testimonial(uuid, boolean) to authenticated;

-- ── 公開用（誰でも読める。ただし許諾＋承認が揃った行だけ） ──
/**
 * LPに出す口コミ。**本文以外は返さない**（user_id も learner_id も出さない）。
 * 匿名希望・表示名なしは name=null で返し、画面側で「利用中の学習者」と出す。
 * 編集案があればそれを、無ければ原文を返す。
 */
create or replace function public.ai_public_testimonials(p_locale text default 'ja', p_limit integer default 6)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'text', coalesce(t.edited_body, t.body),
      'name', case when t.anonymous then null else t.display_name end,
      'locale', t.locale,
      'approvedAt', t.approved_at
    ) order by t.approved_at desc), '[]'::jsonb)
  from (
    select * from public.ai_testimonials
     where consent_publish
       and approved_at is not null
       and rejected_at is null
       and locale = case when p_locale = 'zh' then 'zh' else 'ja' end
     order by approved_at desc
     limit greatest(1, least(coalesce(p_limit, 6), 20))
  ) t
$$;

revoke all on function public.ai_public_testimonials(text, integer) from public;
grant execute on function public.ai_public_testimonials(text, integer) to anon, authenticated, service_role;
