-- rollback: ai_record_usage RPC を撤去する。
-- ⚠️ クライアントがRPC優先へ切替済みの場合、撤去すると直接upsertフォールバックへ落ちる。
--   第2弾（20260817010000）適用後はフォールバックも 42501 になるため、
--   先に rollback_20260817010000 を適用してから本ファイルを適用すること。
drop function if exists public.ai_record_usage(int, numeric);
