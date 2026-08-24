-- 20260824110000_activity_entries_contact.sql の巻き戻し
--
-- ⚠️ 列を落とすと、それまでに集めたメール・user_id は消える。
--    戻す前に必ずバックアップを取ること:
--      select id, activity_id, name, email, user_id, created_at
--      from public.activity_entries where email is not null or user_id is not null;
--
-- 「申込が壊れた」ときの応急処置なら、列を落とすより先に trigger だけ外すほうが軽い:
--   drop trigger if exists activity_entries_bind_user_id_trg on public.activity_entries;

drop trigger if exists activity_entries_bind_user_id_trg on public.activity_entries;
drop function if exists public.activity_entries_bind_user_id();
drop function if exists public.auth_uid_if_exists();

-- ⚠️ このポリシーを落とすと、ログイン中の一般会員の申込が通らなくなる可能性がある
--   （元から `TO anon` 限定の INSERT ポリシーしか無かった場合）。
--   巻き戻す前に、ログイン状態で申込が通るか staging で必ず確かめること。
drop policy if exists "activity_entries_insert_authenticated" on public.activity_entries;

drop index if exists public.activity_entries_email_idx;
drop index if exists public.activity_entries_user_id_idx;

alter table public.activity_entries
  drop constraint if exists activity_entries_user_id_fkey;

alter table public.activity_entries drop column if exists user_id;
alter table public.activity_entries drop column if exists email;
