-- 20260913150000 の取り消し（発行関数は差し替え前の本番定義へ。平文列は消す）
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
      insert into public.ai_learning_codes (user_id, code_hash, code_prefix, label, issued_by)
        values (p_user_id, v_hash, substr(v_code, 1, 3), left(coalesce(p_label, ''), 80), 'service')
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
      insert into public.ai_learning_codes (user_id, code_hash, code_prefix, label, issued_by, is_test)
        values (p_user_id, v_hash, substr(v_code, 1, 3), left(coalesce(p_label, ''), 80),
                coalesce(auth.jwt() ->> 'email', 'admin'), coalesce(v_is_test, false))
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

drop function if exists public.ai_admin_learning_code_plain();
drop function if exists public.ai_admin_referral_tree();
alter table public.ai_learning_codes drop column if exists code_plain;
notify pgrst, 'reload schema';
