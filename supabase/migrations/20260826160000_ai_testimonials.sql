-- 受講者の声を、許諾を取ったうえで集める（2026-08-26 CEO指示 Phase S7）。
--
-- 【いまの状態】
-- LPに載っている「声」は1件だけで、内容は「先行モニターが利用を開始しています」という告知。
-- 実際の感想はゼロ。アカウントは12件発行済みなのに、**集める仕組みが無い**。
-- 中国語圏の購入判断では実績の見え方が日本より強く効くので、ここが空なのは重い。
--
-- 【絶対に守ること（CEO方針）】
--   - 架空の口コミは作らない
--   - 掲載の許諾は**感想とは別のチェック**で取り、既定はOFF
--   - 許諾があっても**自動公開しない**（管理画面で人が見てから）
--
-- 【個人情報】
-- 氏名・メールは持たない。user_id と、任意の表示名（本人が入れた文字列。空でよい）だけ。
-- 表示名は「掲載してよい」と言った人が自分で決めた呼び名で、本名を強制しない。
--
-- rollback: 20260826160000_ai_testimonials.rollback.sql

create table if not exists public.ai_testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  learner_id uuid,
  /** 本人が書いた感想。空では保存しない */
  body text not null,
  /** 書いたときの表示言語（ja/zh）。掲載時にどちらの読者へ出すかの手がかり */
  locale text not null default 'ja',
  /** 何の直後に書いたか（report / trial_end / home）。文脈が違えば読み方も違う */
  context text,
  /**
   * 紹介への掲載を許諾したか。**感想とは別のチェック**で、既定は false。
   * false のまま保存された感想は、こちらの改善のためだけに読む。
   */
  consent_publish boolean not null default false,
  /** 本人が決めた表示名。空なら掲載時も匿名で扱う（本名は求めない） */
  display_name text,
  /**
   * 管理者が掲載を承認した時刻。null＝未承認。
   * 許諾があっても**ここが入るまで公開しない**（自動公開しない）。
   */
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.ai_testimonials is
  '受講者の感想。掲載許諾（consent_publish）と管理者承認（approved_at）の両方が揃わない限り公開しない。架空の口コミは作らない';

create index if not exists ai_testimonials_user_idx on public.ai_testimonials (user_id, created_at desc);
create index if not exists ai_testimonials_publishable_idx
  on public.ai_testimonials (created_at desc)
  where consent_publish and approved_at is not null;

alter table public.ai_testimonials enable row level security;

-- 本人は自分の感想だけ読める（あとで「何を書いたか」を確認できるように）
drop policy if exists ai_testimonials_own_read on public.ai_testimonials;
create policy ai_testimonials_own_read on public.ai_testimonials
  for select using (user_id = auth.uid());

-- 管理者は全部読める
drop policy if exists ai_testimonials_admin_read on public.ai_testimonials;
create policy ai_testimonials_admin_read on public.ai_testimonials
  for select using (public.ai_is_admin());

-- 書き込みはRPC経由だけ（承認列を本人に触らせない）
drop policy if exists ai_testimonials_admin_write on public.ai_testimonials;
create policy ai_testimonials_admin_write on public.ai_testimonials
  for update using (public.ai_is_admin()) with check (public.ai_is_admin());

/**
 * 感想を1件送る（本人のみ）。
 * approved_at は**この関数からは絶対に入らない**（自動公開しない）。
 * 連投を防ぐため、同じ人は1日1件まで。
 */
create or replace function public.ai_submit_testimonial(
  p_body text,
  p_consent_publish boolean default false,
  p_display_name text default null,
  p_locale text default 'ja',
  p_context text default null
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
  -- 長すぎるものは切る（掲載できる長さに収める。切ったことは返り値で伝える）
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
    user_id, learner_id, body, locale, context, consent_publish, display_name
  ) values (
    v_uid, v_learner, v_body,
    case when p_locale = 'zh' then 'zh' else 'ja' end,
    left(p_context, 40),
    coalesce(p_consent_publish, false),
    nullif(btrim(left(coalesce(p_display_name, ''), 40)), '')
  );

  return jsonb_build_object('ok', true, 'code', 'saved',
    'truncated', length(btrim(coalesce(p_body, ''))) > 600);
end;
$$;

revoke all on function public.ai_submit_testimonial(text, boolean, text, text, text) from public, anon;
grant execute on function public.ai_submit_testimonial(text, boolean, text, text, text) to authenticated;

/**
 * 掲載を承認・取り消しする（管理者のみ）。
 * 「許諾がある」ことと「掲載してよい」ことは別なので、
 * consent_publish が false の行は承認できない。
 */
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
    -- 本人が掲載してよいと言っていないものは、管理者でも公開にできない
    return jsonb_build_object('ok', false, 'code', 'no_consent');
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
