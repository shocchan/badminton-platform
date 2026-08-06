-- 20260802020000_late_entry_override.sql の取り消し。
--
-- 【段階1】追加受付だけを止めたい場合（コード・スキーマは触らない・即時・無停止）
--   UPDATE public.tournaments SET late_entry_until = NULL WHERE id = 28;
--   → 大会28は共通ルール（開催14日前）に戻り、サイトから申し込めなくなる。
--     既存の申込・入金には影響しない。まずはこれで十分なことが多い。
--
-- 【段階2】以下は仕組みごと元に戻す完全ロールバック。
--   ※ 実行前に scripts/backup-supabase.sh を必ず実行すること。
--   ※ フロント側も late_entry_until を参照しない版に戻す（デプロイのロールバック）必要がある。

BEGIN;

-- 匿名の直接INSERTを元の状態（無条件許可）に戻す
GRANT INSERT ON public.entries TO anon, authenticated;

CREATE POLICY "entries_insert_anon" ON public.entries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "entries_insert_public" ON public.entries
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow insert for all" ON public.entries
  FOR INSERT TO public WITH CHECK (true);

-- 追加した関数を削除
DROP FUNCTION IF EXISTS public.create_tournament_entry(bigint,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.tournament_is_late_entry(bigint);
DROP FUNCTION IF EXISTS public.tournament_entry_deadline(bigint);
DROP FUNCTION IF EXISTS public.standard_entry_deadline(date);

-- 追加した列を削除（既存データには影響しない。NULL のみの列）
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS late_entry_until;

COMMIT;
