-- 20260828120000_ai_budget_cost_ratio.sql の巻き戻し。
--
-- **戻すと原価率が上限を超えた状態に返る**（1か月 48.4% / 体験 60.7%）。
-- 「使われるほど利益が減る」状態なので、戻すのは
-- 「価格を上げた」「テキスト単価が実請求で下がると確認できた」ときだけにすること。

update public.ai_config
  set value = jsonb_set(value, '{ai-month,voiceSessionsTotal}', '10'::jsonb)
  where key = 'plan_ai_budgets'
    and value ? 'ai-month';

update public.ai_config
  set value = jsonb_set(value, '{ai-trial-pass,textSessionsPerDay}', '5'::jsonb)
  where key = 'plan_ai_budgets'
    and value ? 'ai-trial-pass';
