-- 20260824150000_ai_usage_events の巻き戻し（適用は人間の判断で）。
--
-- 既存の ai_usage_daily / ai_record_usage(int, numeric) には一切触れない
-- （このマイグレーションが足したのは明細台帳・単価表・読み取り関数だけ）。
-- 学習データ・購入台帳にも触れない。
drop function if exists public.ai_cost_summary(date, date);
drop function if exists public.ai_backfill_voice_usage_events(int);
drop function if exists public.ai_record_usage_event(text, text, text, bigint, bigint, bigint, bigint, bigint, int, text, uuid, uuid, text, boolean);
drop table if exists public.ai_usage_events;
drop function if exists public.ai_model_cost_usd(text, bigint, bigint, bigint, bigint, bigint);
drop table if exists public.ai_model_prices;
delete from public.ai_config where key = 'realtime_token_estimate';
