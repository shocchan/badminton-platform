-- 回数券の付与が本番で必ず失敗していたのを直す（2026-09-10 実決済で発覚）
--
-- ■ 何が起きたか
--   CEOが実際に¥300を支払ったが、残高が積まれなかった。
--   ai_payment_events: signature ok → **topup grant failed: conv-topup-1**（2回・Stripeの再送ぶん）
--
-- ■ 原因（2つとも私の実装ミス）
--   1. **service_role に EXECUTE を渡していなかった。**
--      revoke all ... from public, anon, authenticated は書いたのに grant を書き忘れた。
--      Webhookは service_role で呼ぶので、そもそも実行できない。
--   2. 関数の中の `current_setting('request.jwt.claim.role')` による自前のロール判定。
--      PostgREST経由では期待した値が入らず、通っても弾かれる。
--      **このリポジトリの他の ai_service_* 関数は、body で判定せず grant だけで守っている**
--      （ai_service_issue_learning_code / ai_service_grant_beta_access）。そちらへ揃える。
--
-- ■ 直し方
--   body の自前判定を外し、**実行権限で守る**（service_role と postgres だけ）。
--   anon・authenticated には渡さない＝学習者が自分で残高を増やせない。
create or replace function public.ai_service_grant_conversation_credits(
  p_user_id uuid, p_credits int, p_purchase_id uuid default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  -- ロールの判定は body ではなく EXECUTE 権限で行う（下の grant を参照）。
  -- PostgREST経由では request.jwt.claim.role が期待どおりに読めず、
  -- 正当な呼び出しまで forbidden で落ちていた（2026-09-10 実決済で発覚）
  if p_user_id is null or coalesce(p_credits, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;

  -- 同じ購入の再送では何もしない（Stripeは再送する）
  if p_purchase_id is not null then
    select id into v_id from public.ai_conversation_credits
      where purchase_id = p_purchase_id limit 1;
    if found then
      return jsonb_build_object('ok', true, 'alreadyGranted', true,
        'balance', (select coalesce(sum(delta),0)::int from public.ai_conversation_credits where user_id = p_user_id));
    end if;
  end if;

  insert into public.ai_conversation_credits (user_id, delta, reason, purchase_id, note)
    values (p_user_id, p_credits, 'purchase', p_purchase_id, p_note);

  return jsonb_build_object('ok', true, 'alreadyGranted', false,
    'balance', (select coalesce(sum(delta),0)::int from public.ai_conversation_credits where user_id = p_user_id));
end;
$$;

revoke all on function public.ai_service_grant_conversation_credits(uuid, int, uuid, text) from public, anon, authenticated;
-- **これが抜けていた。** Webhook は service_role で呼ぶ
grant execute on function public.ai_service_grant_conversation_credits(uuid, int, uuid, text) to service_role;
