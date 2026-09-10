-- service_role に原価明細の読み取りを渡す（2026-09-10・forward-only）。
--
-- ■ 何が足りなかったか
--   20260824150000_ai_usage_events を本番へ当てた（2026-09-10）あと、権限を read back したところ
--   service_role に ai_model_prices / ai_usage_events の SELECT が無かった。
--   このプロジェクトは既定権限で service_role へ自動付与されない（ai_usage_daily は個別に grant 済み）。
--   scripts/ai-course/reconcile-openai-cost.mjs は service_role キーで REST から ai_usage_events を読むので、
--   このままだと突合が permission denied で落ちる。
--
-- ■ やること
--   SELECT だけを渡す。書き込みは今までどおり security definer の RPC（ai_record_usage_event）だけ。
--   anon には何も渡さない。過去の migration は書き換えない。
grant select on public.ai_model_prices to service_role;
grant select on public.ai_usage_events to service_role;
