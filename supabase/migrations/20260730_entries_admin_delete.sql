-- 管理ページからエントリーを一括削除できるようにする（2026-07-30）
--
-- RLSポリシー entries_delete_admin（is_admin() ガード）はすでに存在するが、
-- authenticated ロールに DELETE のテーブル権限が無いため 42501 になる。
-- ポリシーが実際に効くように GRANT を足す。anon には付けない。
GRANT DELETE ON public.entries TO authenticated;

-- 参考: entries を参照している外部キーはどちらも ON DELETE CASCADE
--   results.entry_id            → 試合結果も一緒に消える
--   payment_reminders.entry_id  → 督促の送信履歴も一緒に消える
