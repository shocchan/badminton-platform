-- 20260824120000_admin_ops_payment_and_contacts.sql の巻き戻し
--
-- 注意: contacts のポリシーは「元の緩い状態（authenticated なら誰でも読める）」に戻す。
-- これは 2026-08-02 に塞いだのと同じ種類の穴なので、戻すのは
-- 「管理画面が壊れて他に手が無い」ときだけにすること。

DROP FUNCTION IF EXISTS admin_set_entry_payment(BIGINT, BOOLEAN);
DROP FUNCTION IF EXISTS admin_list_contacts();
DROP FUNCTION IF EXISTS admin_set_contact_status(UUID, TEXT);

DROP POLICY IF EXISTS "admins can read contacts" ON contacts;
DROP POLICY IF EXISTS "admins can update contacts" ON contacts;

CREATE POLICY "authenticated can read contacts" ON contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can update contacts" ON contacts
  FOR UPDATE TO authenticated USING (true);

GRANT INSERT, SELECT, UPDATE ON public.contacts TO authenticated;
GRANT INSERT ON public.contacts TO anon;
