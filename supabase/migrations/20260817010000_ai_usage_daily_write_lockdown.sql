-- ============================================================
-- ai_usage_daily の二層防御・第2弾: 直接書き込みの遮断（2026-08-17 総監査P1）
--
-- ⚠️ 適用順序: 20260817000000（ai_record_usage RPC）を適用し、クライアントを
--   RPC経由へ切り替えたデプロイの「後」にのみ適用する。staging/本番同一DBのため、
--   先に適用すると旧バンドルの利用量記録が 42501 で失敗する
--   （その場合も pending キューに残り、新バンドルでの flush 時にRPCで回収される）。
--
-- 内容（vocab 3表 20260728000000 と同じ二層防御）:
--   - grant層: authenticated から insert/update を revoke（select は本人+adminのまま残す。
--     残量表示 courseUsage / admin集計 courseAdminApi が読むため）
--   - policy層: insert/update ポリシーを削除（RLSはポリシー無し＝拒否）
--   - 書き込み経路は security definer RPC（ai_start_session / ai_record_usage）と
--     service_role のみになる
-- ============================================================

revoke insert, update on public.ai_usage_daily from authenticated;
revoke all on public.ai_usage_daily from anon;

drop policy if exists ai_usage_daily_insert on public.ai_usage_daily;
drop policy if exists ai_usage_daily_update on public.ai_usage_daily;
