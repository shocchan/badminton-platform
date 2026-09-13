-- 管理画面で「配った個人リンク」をそのまま見られるようにする＋誰が誰を招待したかの一覧（2026-09-13 CEO指示）
--
-- ■ 個人リンク（学習コード）
--   これまで台帳にはハッシュしか無く、発行の瞬間しか平文を見られなかった。先生が生徒に
--   「リンク見失った」と言われたとき、再発行（前のを無効化）しかできず不便。
--   → 発行時に平文も code_plain に保存し、**管理者だけ** RPC で読めるようにする。
--   既に配ったコードは復元できない（ハッシュのみ）。一度だけ再発行が要る。
--   照合（ログイン）は今までどおりハッシュで行う。平文列は照合に使わない。
--
-- ■ 紹介の紐づけ
--   ai_admin_referral_tree(): 紹介者 → 紹介先（登録日時・開始・診断完了・延長済み）を一覧で返す。
-- rollback は同名の .rollback.sql

alter table public.ai_learning_codes add column if not exists code_plain text;
comment on column public.ai_learning_codes.code_plain is
  '発行時の平文（管理者が配ったリンクを見返す用・2026-09-13）。照合には使わない。RPC ai_admin_learning_code_plain 経由でのみ読む';

-- 生徒本人・匿名からは列ごと見えないように（既存の admin_read ポリシーは管理者のみだが念のため列も絞る）
revoke select (code_plain) on public.ai_learning_codes from anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_service_issue_learning_code(p_user_id uuid, p_label text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_code text;
  v_hash text;
  v_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_user');
  end if;

  update public.ai_learning_codes
     set revoked_at = now(), revoked_reason = 'reissued'
   where user_id = p_user_id and revoked_at is null;

  for i in 1..5 loop
    v_code := public.ai_generate_learning_code();
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
    begin
      insert into public.ai_learning_codes (user_id, code_hash, code_prefix, label, issued_by, code_plain)
        values (p_user_id, v_hash, substr(v_code, 1, 3), left(coalesce(p_label, ''), 80), 'service', v_code)
        returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;

  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'generate_failed');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'raw', v_code);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_admin_issue_learning_code(p_user_id uuid, p_label text DEFAULT ''::text, p_revoke_existing boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_code text;
  v_hash text;
  v_id uuid;
  v_is_test boolean := false;
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_user');
  end if;

  -- テスト用の学習者に発行したコードは、本番の集計から外せるように印を付ける
  select coalesce(l.is_test, false) into v_is_test
    from public.ai_learners l where l.user_id = p_user_id limit 1;

  if coalesce(p_revoke_existing, true) then
    update public.ai_learning_codes
       set revoked_at = now(), revoked_reason = 'reissued'
     where user_id = p_user_id and revoked_at is null;
  end if;

  -- 衝突はまず起きないが、起きたら作り直す（unique 制約に任せて握り潰さない）
  for i in 1..5 loop
    v_code := public.ai_generate_learning_code();
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
    begin
      insert into public.ai_learning_codes (user_id, code_hash, code_prefix, label, issued_by, is_test, code_plain)
        values (p_user_id, v_hash, substr(v_code, 1, 3), left(coalesce(p_label, ''), 80),
                coalesce(auth.jwt() ->> 'email', 'admin'), coalesce(v_is_test, false), v_code)
        returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;

  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'generate_failed');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    -- 表示用に4桁ずつ区切る（読み上げ・書き写しのため）。照合時は区切りを無視する
    'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4),
    'raw', v_code
  );
end;
$function$
;

-- ── 管理者: 有効な個人リンクの平文（全員分・一覧用） ──────────────────
create or replace function public.ai_admin_learning_code_plain()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('userId', c.user_id, 'code', c.code_plain, 'issuedAt', c.issued_at, 'useCount', c.use_count, 'lastUsedAt', c.last_used_at))
    from (
      select distinct on (user_id) user_id, code_plain, issued_at, use_count, last_used_at
      from public.ai_learning_codes
      where revoked_at is null and code_plain is not null
      order by user_id, issued_at desc
    ) c
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.ai_admin_learning_code_plain() from public, anon;
grant execute on function public.ai_admin_learning_code_plain() to authenticated;

-- ── 管理者: 誰が誰を招待したか ───────────────────────────────────
create or replace function public.ai_admin_referral_tree()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'referrerUserId', i.referrer_user_id,
      'referrerName', coalesce(nullif(lr.display_name, ''), ur.email),
      'code', i.code,
      'rewardKind', i.reward_kind,
      'inviteeUserId', a.user_id,
      'inviteeName', coalesce(nullif(li.display_name, ''), ui.email),
      'inviteeEmail', ui.email,
      'wechatId', g.wechat_id,
      'signedUpAt', a.created_at,
      'startedAt', a.trial_started_at,
      'diagnosedAt', li.settings #>> '{adventureV2,diagnosis,completedAt}',
      'perk', p.perk,
      'rewardedAt', p.fulfilled_at,
      'isTest', coalesce(li.is_test, false) or i.is_test
    ) order by a.created_at desc)
    from public.ai_course_invites i
    join public.ai_course_access a on a.invite_code = i.code and a.user_id <> i.referrer_user_id
    join auth.users ui on ui.id = a.user_id
    join auth.users ur on ur.id = i.referrer_user_id
    left join public.ai_learners li on li.user_id = a.user_id
    left join public.ai_learners lr on lr.user_id = i.referrer_user_id
    left join public.ai_invite_perks p on p.invitee_user_id = a.user_id
    left join public.ai_course_signup_grants g on lower(g.email) = lower(ui.email)
    where i.referrer_user_id is not null
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.ai_admin_referral_tree() from public, anon;
grant execute on function public.ai_admin_referral_tree() to authenticated;

notify pgrst, 'reload schema';
