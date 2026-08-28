-- 購入直後のActivation改善（2026-08-26 CEO指示 P0）。
--
-- 【解く問題】
-- 実データで、受講権を持つ12人のうち**7人が一度もセッションを開始していない**。
-- 購入完了画面がログインIDだけを出し、初期パスワードはメールで送る作りだったため、
-- 買った直後に「メールを開いて探す」という外部アプリへの離脱が挟まっていた。
--
-- ここでは3つを足す。いずれも既存の列・制約・データを壊さない（追加とCHECKの緩和のみ）。
--
--   1. status CHECK に 'refunded' を追加（**本番の実バグ**）
--      webhook は charge.refunded で status='refunded' に更新しようとするが
--      （ai-course-stripe-webhook/index.ts:271）、本番のCHECK制約は
--      ('pending','paid','provisioned','failed') しか許していない。
--      = **全額返金の記録が制約違反で失敗し、受講権も止まらない。**
--      返金が起きるまで誰も気づかない種類の不具合なので、先に塞ぐ。
--
--   2. login_claimed_at — 購入直後の自動ログインを**1回だけ**にする印。
--      Stripe の session_id は推測不能だが、URLを共有されたら他人がアカウントを
--      奪える。使い切りにして、さらに Edge Function 側で発行後60分に制限する。
--
--   3. payment_method — Alipay / WeChat Pay / カードのどれで買われたかを残す。
--      中国語話者がどの決済を使うかは、集客の判断に直結する。
--
-- ロールバック: 20260826090000_ai_course_activation.rollback.sql

-- ── 1. 返金ステータスを許可する（本番バグの修正） ──
alter table public.ai_plan_purchases
  drop constraint if exists ai_plan_purchases_status_check;

alter table public.ai_plan_purchases
  add constraint ai_plan_purchases_status_check
  check (status in ('pending', 'paid', 'provisioned', 'failed', 'refunded'));

-- ── 2. 購入直後の自動ログイン（使い切り） ──
alter table public.ai_plan_purchases
  add column if not exists login_claimed_at timestamptz;

comment on column public.ai_plan_purchases.login_claimed_at is
  '購入直後の自動ログインを行使した時刻。非nullなら二度目は発行しない（使い切り）。'
  'パスワードは一切保存・返却しない。実際の交換は Edge Function ai-course-claim-session が行う';

-- ── 3. 決済手段（Alipay / WeChat Pay / カード） ──
alter table public.ai_plan_purchases
  add column if not exists payment_method text;

comment on column public.ai_plan_purchases.payment_method is
  'Stripe の payment_method_types（card / alipay / wechat_pay 等）。webhook が記録する。'
  '中国語話者がどの決済を使うかの分析用。未取得は null';

-- 決済手段別の集計を軽くする（件数は小さいが、管理画面が毎回全件走査しないように）
create index if not exists ai_plan_purchases_payment_method_idx
  on public.ai_plan_purchases (payment_method)
  where payment_method is not null;
