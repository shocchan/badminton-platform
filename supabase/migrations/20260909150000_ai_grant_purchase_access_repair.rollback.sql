-- rollback: 20260909150000_ai_grant_purchase_access_repair.sql
--
-- ⚠️ これを戻すと、決済しても受講権が付かない状態（2026-09-09 の実決済テストで
--    発覚した障害そのもの）へ戻る。**基本的に戻さない。**
--    戻すのは「このRPCの中身が原因で別の事故が起きた」と特定できたときだけ。
--
-- ai_course_access_grants は「どの購入が受講権に効いたか」の履歴なので、
-- 落とすと冪等性の根拠が消える（Stripe再送で二重に期間が伸びうる）。
-- そのため既定では**テーブルは残す**。関数だけ落とす形にしてある。
-- テーブルごと消す必要がある場合は、下のコメントを外すこと。

drop function if exists public.ai_grant_purchase_access(uuid, uuid, text, int, int, int, int, text);
drop function if exists public.ai_plan_rank(text);

-- drop table if exists public.ai_course_access_grants;   -- 履歴なので既定では残す
