-- セルフサービス決済のwebhook（service_role・REST経由）が書くテーブルへのGRANT（2026-08-19）
--
-- 背景: 2026-08-02 の匿名キー封鎖で default privileges を絞って以降、
-- 新規・既存テーブルへの service_role の権限は明示GRANTが要る。
-- ID発行スクリプト（create-student-login.mjs）は Management API の直接SQL経由
-- （postgresロール）だったため、この欠落が露見していなかった。
-- ai-course-stripe-webhook は REST（service_roleロール）経由で書くため 42501 になる
-- （2026-08-19 QAの実測: "permission denied for table ai_course_signup_grants"）。
--
-- service_role は RLS をバイパスする管理ロール。GRANTを与えても
-- anon / authenticated の権限は一切変わらない（既存の封鎖はそのまま）。
grant select, insert, update on public.ai_course_signup_grants to service_role;
grant select, insert, update on public.ai_course_access to service_role;
