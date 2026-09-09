-- 決済の観測（2026-09-09 P0-1）
--
-- 【なぜ要るか】
-- 本番Stripeで 2026-08-20〜09-07 に checkout が14件開始され、**完了0件**。
-- ところが手元のデータでは、その14件が
--   ・誰も払わなかった（正常な離脱）
--   ・払われたのに webhook が届かず台帳が動かなかった（事故）
-- のどちらなのか **区別できない**。理由は3つ:
--   1. webhook を1件も記録していない（受信ログが存在しない）
--   2. checkout.session.expired を無視しているので、放置された行も pending のまま
--   3. Edge Function のログ保持が1日しかなく、遡れない
-- 「沈黙」を証拠に変えるための土台をここで作る。
--
-- 【設計】
-- - webhook は**受け取った全イベント**をここへ1行書く（無視したものも、署名が違ったものも）
-- - 個人情報は入れない。session は末尾8桁だけ持つ（完全な session_id は
--   ai-course-claim-session の鍵になるので、観測用の表には置かない）
-- - stripe_event_id で一意にし、Stripeの再送を二重に数えない
-- - 読めるのは管理者だけ。書けるのは service_role（Edge Function）だけ
--
-- rollback: 20260909100000_ai_payment_observability.rollback.sql

-- ── 1. 台帳のステータスに、実際にコードが書く値を許可する ──
--
-- ⚠️ 既存の CHECK は pending / paid / provisioned / failed / refunded しか許していないが、
--    webhook は Alipay・WeChat Pay の「承認済み・入金待ち」で status='awaiting_payment' を
--    書こうとしている（ai-course-stripe-webhook の payment_status !== 'paid' の分岐）。
--    その UPDATE / INSERT は CHECK 違反で 400 になり、**エラーは握り潰されて**
--    行は pending のまま残っていた。つまり中国語話者が最も使う決済手段の
--    途中経過が、まるごと記録から消えていた。値を足して直す。
alter table public.ai_plan_purchases
  drop constraint if exists ai_plan_purchases_status_check;
alter table public.ai_plan_purchases
  add constraint ai_plan_purchases_status_check
  check (status in (
    'pending',            -- checkout セッションを作った（まだ何も起きていない）
    'awaiting_payment',   -- Alipay/WeChat Pay: 承認済み・入金確定待ち
    'paid',               -- 入金確定（発行はこれから）
    'provisioned',        -- アカウント発行まで完了
    'expired',            -- Stripe 側でセッションが期限切れ（＝買われなかった）
    'failed',
    'refunded'
  ));

-- ── 2. webhook 受信ログ ──
create table if not exists public.ai_payment_events (
  id uuid primary key default gen_random_uuid(),
  /**
   * Stripe の event.id。
   * **一意にはしない。** 1つのイベントについて「受け取った」→「こう処理した」の
   * 2行を残すため（途中で落ちた場合は received だけが残り、それが証拠になる）。
   * Stripeの再送も行が増えて見えるほうが観測として正しい。
   */
  stripe_event_id text,
  /** checkout.session.completed など。署名検証に失敗した場合は 'signature_failed' */
  event_type text not null,
  /** checkout session の**末尾8桁だけ**。完全なIDは持たない（claim-session の鍵になるため） */
  session_ref text,
  /** Stripe の payment_status（paid / unpaid / no_payment_required） */
  payment_status text,
  /** card / alipay / wechat_pay など */
  payment_method text,
  livemode boolean,
  /** この関数が何をしたか。received=受け取った（処理はこれから） / handled=処理した /
      ignored=対象外のイベント / waiting=入金待ち / error=処理に失敗 /
      signature_failed=署名不一致（本文は信用しない） */
  outcome text not null check (outcome in ('received', 'handled', 'ignored', 'waiting', 'error', 'signature_failed')),
  /** 人が読む短い説明。**PIIを入れない**（メール・氏名・会話本文は禁止） */
  detail text not null default '',
  received_at timestamptz not null default now()
);

comment on table public.ai_payment_events is
  'Stripe webhook の受信ログ。無視したイベントも署名エラーも必ず1行残す。個人情報は入れない（session は末尾8桁のみ）';

create index if not exists ai_payment_events_recent_idx
  on public.ai_payment_events (received_at desc);
create index if not exists ai_payment_events_event_idx
  on public.ai_payment_events (stripe_event_id);
create index if not exists ai_payment_events_session_idx
  on public.ai_payment_events (session_ref, received_at desc);

alter table public.ai_payment_events enable row level security;

drop policy if exists ai_payment_events_admin_read on public.ai_payment_events;
create policy ai_payment_events_admin_read on public.ai_payment_events
  for select to authenticated
  using (public.ai_is_admin());

-- 書き込みポリシーは作らない＝クライアントからは書けない（Edge Function の service_role のみ）
grant select on public.ai_payment_events to authenticated;
grant all on public.ai_payment_events to service_role;

/**
 * 決済の観測ボード（管理者のみ）。
 *
 * 台帳（ai_plan_purchases）と受信ログ（ai_payment_events）を突き合わせて、
 * 「セッションを作った」→「webhookが来た」→「発行できた」がどこで切れているかを1画面で見る。
 * **個人情報は返さない。** buyer_email はマスクした形（あるか無いかだけ）で返す。
 */
create or replace function public.ai_admin_payment_watch(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 180)));
  v_sessions jsonb;
  v_events jsonb;
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(x order by x_created desc), '[]'::jsonb)
    into v_sessions
  from (
    select
      jsonb_build_object(
        'sessionRef', right(p.stripe_session_id, 8),
        'createdAt', p.created_at,
        'updatedAt', p.updated_at,
        'planId', p.plan_id,
        'amountJpy', p.amount_jpy,
        'locale', p.locale,
        'status', p.status,
        'livemode', p.livemode,
        'isTest', coalesce(p.is_test, false),
        'paymentMethod', p.payment_method,
        'hasPaymentIntent', p.stripe_payment_intent_id is not null,
        'hasBuyerEmail', p.buyer_email is not null,
        'provisioned', p.provisioned_at is not null,
        'loginClaimed', p.login_claimed_at is not null,
        'error', left(coalesce(p.error, ''), 200),
        -- この session について webhook を何件受け取ったか（0なら「届いていない」）
        'webhookCount', (
          select count(*) from public.ai_payment_events e
           where e.session_ref = right(p.stripe_session_id, 8)
        )
      ) as x,
      p.created_at as x_created
    from public.ai_plan_purchases p
    where p.created_at >= v_since
    order by p.created_at desc
    limit 200
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
      'receivedAt', e.received_at,
      'eventType', e.event_type,
      'sessionRef', e.session_ref,
      'paymentStatus', e.payment_status,
      'paymentMethod', e.payment_method,
      'livemode', e.livemode,
      'outcome', e.outcome,
      'detail', e.detail
    ) order by e.received_at desc), '[]'::jsonb)
    into v_events
  from (
    select * from public.ai_payment_events
     where received_at >= v_since
     order by received_at desc limit 200
  ) e;

  return jsonb_build_object(
    'ok', true,
    'since', v_since,
    'sessions', v_sessions,
    'events', v_events,
    'totals', jsonb_build_object(
      'sessions', (select count(*) from public.ai_plan_purchases where created_at >= v_since and coalesce(is_test,false) = false),
      'provisioned', (select count(*) from public.ai_plan_purchases where created_at >= v_since and coalesce(is_test,false) = false and status = 'provisioned'),
      'webhookEvents', (select count(*) from public.ai_payment_events where received_at >= v_since),
      'webhookEventsEver', (select count(*) from public.ai_payment_events)
    )
  );
end;
$$;

revoke all on function public.ai_admin_payment_watch(integer) from public, anon;
grant execute on function public.ai_admin_payment_watch(integer) to authenticated;

/**
 * 期限切れセッションの取り込み（webhook の checkout.session.expired から呼ぶ）。
 * pending のものだけを expired にする。既に払われた行には絶対に触らない。
 */
create or replace function public.ai_expire_purchase(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.ai_plan_purchases
     set status = 'expired', updated_at = now()
   where stripe_session_id = p_session_id
     and status = 'pending';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$$;

revoke all on function public.ai_expire_purchase(text) from public, anon, authenticated;
grant execute on function public.ai_expire_purchase(text) to service_role;
