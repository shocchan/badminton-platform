-- 申込の受け口を Edge Function 一本にする（2026-08-20・広告出稿前のbot対策）。
--
-- 背景: ai_plan_applications / ai_terms_consents は anon に INSERT を許していた。
-- 匿名キーは配信JSに埋まっている（そういう設計のキー）ので、URLが公開されると
-- 誰でも無制限にゴミ申込を流し込める。実際の被害は
-- 「本物の問い合わせが埋もれて見落とす」＋「管理画面が宣伝文で埋まる」。
--
-- これ以降の唯一の経路: Edge Function `ai-course-apply`
--   ①Turnstile検証（鍵が設定されているときだけ必須）②入力検証
--   ③service_role で保存 ④管理者へメール通知
-- service_role は RLS を迂回するので、ここで anon の権限を落としても保存は動く。
--
-- rollback: 20260820120000_ai_apply_via_function_only.rollback.sql

-- ① 匿名の書き込み権限を剥奪（RLSポリシーより手前の層で止める）
revoke insert on public.ai_plan_applications from anon;
revoke insert on public.ai_terms_consents   from anon;
-- ログイン済み一般ユーザーからも剥奪する（学習者アカウントで叩けても意味がない）
revoke insert on public.ai_plan_applications from authenticated;
revoke insert on public.ai_terms_consents   from authenticated;

-- ② RLSポリシーも合わせて落とす（権限とポリシーの二層で同じことを言う）
drop policy if exists ai_plan_applications_insert on public.ai_plan_applications;
drop policy if exists ai_terms_consents_insert    on public.ai_terms_consents;

-- ③ Edge Function（service_role）だけが書ける状態を明示
grant insert, select on public.ai_plan_applications to service_role;
grant insert, select on public.ai_terms_consents    to service_role;

comment on table public.ai_plan_applications is
  '申込記録。書き込みは Edge Function ai-course-apply（service_role）のみ。匿名INSERTは 2026-08-20 に剥奪';
