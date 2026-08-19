-- 購入台帳 ai_plan_purchases（セルフサービス決済・2026-08-19）
--
-- ⚠️⚠️ **remote未適用。適用にはCEOの許可が要る** ⚠️⚠️
--   staging と production は同じ Supabase プロジェクトを共有しているため、
--   適用＝production への変更になる。rollback: 20260819210000_ai_plan_purchases.rollback.sql
--
-- 目的: 600円・2,980円プランの「Stripe決済 → 自動アカウント発行 → メール通知」の
-- 事実記録。20260818130000 の ai_course_access.purchase_id が参照する先（§9で予告済み）。
--
-- 設計:
-- - 書き込みは Edge Function（service_role）だけ。anon / authenticated には一切GRANTしない
--   （RLS有効・policyなし＝service_role以外は全拒否。管理者の閲覧は下の読み取り専用RPC経由）
-- - stripe_session_id unique が冪等性の要（Stripeのwebhook再送で二重発行しない）
-- - buyer_email は購入者の実メール（アカウントのauthメールは内部ID形式で別物）
-- - utm はLPから引き継いだ流入元（個人情報なし）。広告の費用対効果の分析用

create table if not exists public.ai_plan_purchases (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  plan_id text not null,
  plan_version int not null,
  amount_jpy int not null,
  currency text not null default 'jpy',
  /** Stripeのlive/testどちらの決済か。テスト決済を売上として数えない */
  livemode boolean not null default false,
  buyer_email text,
  locale text not null default 'ja',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'provisioned', 'failed')),
  /** 発行したアカウント（auth.users）。発行前は null */
  user_id uuid,
  /** 発行したログインID（生徒がログイン画面で入力する値） */
  login_id text,
  error text,
  utm jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provisioned_at timestamptz
);

comment on table public.ai_plan_purchases is
  'セルフサービス決済の購入台帳。書き込みはEdge Function（service_role）のみ。ai_course_access.purchase_id の参照先';
comment on column public.ai_plan_purchases.status is
  'pending=セッション作成 / paid=決済確認 / provisioned=アカウント発行・メール送信完了 / failed=発行失敗（要手動対応）';

alter table public.ai_plan_purchases enable row level security;
-- 2026-08-02 封鎖後の default privileges 対策と同じ流儀で、grant層でも遮断して二層にする
revoke all on public.ai_plan_purchases from anon, authenticated;
grant all on public.ai_plan_purchases to service_role;

-- 管理者の閲覧（読み取り専用RPC・ai_admin_list_accounts と同じガード方式）
create or replace function public.ai_admin_list_purchases()
returns table(
  id uuid,
  stripe_session_id text,
  plan_id text,
  plan_version int,
  amount_jpy int,
  livemode boolean,
  buyer_email text,
  locale text,
  status text,
  user_id uuid,
  login_id text,
  error text,
  created_at timestamptz,
  provisioned_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id, p.stripe_session_id, p.plan_id, p.plan_version, p.amount_jpy,
    p.livemode, p.buyer_email, p.locale, p.status, p.user_id, p.login_id,
    p.error, p.created_at, p.provisioned_at
  from public.ai_plan_purchases p
  where public.ai_is_admin()
  order by p.created_at desc;
$$;

revoke all on function public.ai_admin_list_purchases() from public, anon;
grant execute on function public.ai_admin_list_purchases() to authenticated;
