-- AI利用枠を、決めた原価率の中に収める（CEO決定 2026-08-28）
--
-- ■ なぜ必要か
-- 2つのプランが、宣言した原価率の上限を超えたまま公開されていた。
-- 上限まで使われた月は、使われるほど利益が減る形になっていた。
--
--   1か月 AI自学プラン（¥2,980）  48.4% > 上限45%
--   AI体験パス（¥600）            60.7% > 上限60%
--
-- 体験パスのほうは 2026-08-26 に「60分 → 7日間」へ伸ばしたときに、
-- 当時のテキスト原価（音声の約1/300）で 54.3% と見積もっていた。
-- その後 2026-08-24 の見直しで「実測と呼んでいたテキスト単価は循環参照だった」と分かり
-- （estimateSessionCost の出力を時間で割り戻して単価と呼んでいた）、模型を作り直した結果、
-- 同じ枠が 60.7% になった。**枠が増えたのではなく、原価の見方が正しくなった。**
--
-- ■ どこを削ったか
-- 高いのは音声だけ。1回4分で ¥100。テキストは1回 ¥1.8。
-- 冒険・バトル・模試・答案は端末内で完結して原価ゼロ。だから音声から削る。
--
--   ai-month      音声 10回 → 8回     48.4% → 41.7%（テキスト8回/日は据え置き）
--   ai-trial-pass テキスト 5回/日 → 4回 60.7% → 58.6%（音声3回・7日間は据え置き）
--
-- 体験パスの日数（7日）は削らない。翌日の復習に出会わせるのがこの商品の目的で、
-- そこを削ると7日化した意味が消える。
--
-- ■ なぜ**サーバー側も**変えるのか
-- src/lib/aiLesson/course/plans/planAiBudget.ts の PLAN_AI_BUDGETS はクライアントの見込みで、
-- **実際に効いている上限は ai_config.plan_ai_budgets（ここ）**。
-- コードだけ直しても、サーバーは今までどおり音声10回を許してしまう。
-- planAiBudget.test.ts の「マイグレーションが行き着く値が PLAN_AI_BUDGETS と一致する」が
-- この2つのずれを機械で止めている。

update public.ai_config
  set value = jsonb_set(value, '{ai-month,voiceSessionsTotal}', '8'::jsonb)
  where key = 'plan_ai_budgets'
    and value ? 'ai-month';

update public.ai_config
  set value = jsonb_set(value, '{ai-trial-pass,textSessionsPerDay}', '4'::jsonb)
  where key = 'plan_ai_budgets'
    and value ? 'ai-trial-pass';
