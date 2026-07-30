-- ⚠️ security rollback（通常は実行しない・明示判断が必要）
--
-- admin_overrides の列保護（trigger＋function）を撤去する。
-- 撤去すると learner本人が自分の admin_overrides を書き換えて内部画面を開ける状態へ戻る
-- （= migration適用前の既知の権限昇格リスク）。
-- feature rollback（entitlementsテーブルの撤去）とは意図的に分離している。
-- 実行はCEOの明示判断があるときのみ。
drop trigger if exists ai_learners_protect_admin_overrides on public.ai_learners;
drop function if exists public.ai_course_protect_admin_overrides();
