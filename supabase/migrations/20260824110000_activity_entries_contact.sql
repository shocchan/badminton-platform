-- ===================================================
-- 通常活動の申込を「名簿」にする（2026-08-24）
--
-- 【なぜ】
-- 通常活動の申込は 6月19人 → 7月83人 → 8月94人 と広告ゼロで伸びている、
-- 3事業で唯一の実需。ところが activity_entries には
--   activity_id / name / member_type / source / cancel_code / notes / quantity / status
-- しか無く、**連絡先が1件も残っていない**。累計166件が名簿として使えない。
-- リピートも「名前の文字列一致」でしか数えられない（同姓同名・表記ゆれで壊れる）。
--
-- 【何をする】
--   1. email   … 任意。入力した人にだけ次回案内を送れるようにする
--   2. user_id … 任意。ログインして申し込んだ人を本人IDで数えられるようにする
--
-- 【絶対に守ること】
--   - 既存166行に触らない（NOT NULL・DEFAULT・バックフィルを一切やらない）
--   - 申込のしやすさを落とさない（必須化しない・DBで弾かない）
--   - **email が匿名SELECTで読めるようにしない**
--
-- 【email が公開されない仕組み】
-- このテーブルは「参加者名の公開表示」のため anon の SELECT を残してある。
-- ただし 20260802010000_lockdown_public_reads.sql で
--   REVOKE SELECT ON activity_entries FROM anon, authenticated;
--   GRANT  SELECT (id, activity_id, name, member_type, source, quantity,
--                  created_at, status, notes) ON activity_entries TO anon, authenticated;
-- と**列単位のGRANT**に切り替わっている。
-- 列単位GRANTのテーブルに後から足した列は、明示的にGRANTしない限り誰にも読めない。
-- ＝ email / user_id は追加した時点で anon/authenticated から見えない。
-- （同じ仕組みで cancel_code を隠しているのが本番で1年近く動いている実績のある経路）
--
-- Supabase Realtime も同じ列権限で払い落とされる（realtime.apply_rls は
-- has_column_privilege で is_selectable を判定し、読めない列を payload から外す）。
-- ActivityPage は postgres_changes を購読しているが、cancel_code が漏れていないのと
-- 同じ理由で email も payload に載らない。
--
-- ⚠️ 唯一の露出経路は supabase/rollbacks/rollback_20260802010000_lockdown_public_reads.sql。
--    あれは `GRANT SELECT ON activity_entries TO anon, authenticated` を実行するので、
--    このmigration適用後にあれを流すと email が公開される。実行しないこと。
--
-- 【名寄せ（リピート集計）に使う列の優先順位】← 集計SQL担当への申し送り
--   1. user_id                       … 最も確実。本人IDなので同姓同名でも割れない
--   2. lower(trim(email))            … user_id が無い行のフォールバック
--   3. name                          … 上2つが無い既存行の最後の手段（誤差ありと明示する）
-- 例:
--   coalesce(user_id::text, lower(trim(email)), 'name:' || name) as person_key
-- ===================================================

-- ── 1) 列の追加 ────────────────────────────────────────────
-- nullable・DEFAULTなし・CHECKなし。
-- CHECK制約を付けないのは意図的。DB側で弾く経路を作ると「申込が失敗する」道が増える。
-- 形式チェックはクライアント側（isValidOptionalEmail）だけで行い、空欄は必ず通す。
alter table public.activity_entries
  add column if not exists email text;

alter table public.activity_entries
  add column if not exists user_id uuid;

-- auth.users への参照。退会したら自動で NULL に落ちる（名簿から個人が消える）。
-- ※ 下の trigger が user_id を必ず「実在する本人 or NULL」にするので、
--    この外部キーが申込を失敗させることは無い。
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'activity_entries_user_id_fkey'
      and conrelid = 'public.activity_entries'::regclass
  ) then
    alter table public.activity_entries
      add constraint activity_entries_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

comment on column public.activity_entries.email is
  '任意の連絡先。未入力なら NULL。匿名SELECT不可（列単位GRANTから除外）。名寄せは lower(trim(email))。';
comment on column public.activity_entries.user_id is
  '申込時にログインしていた本人のID。未ログインなら NULL。リピート集計の第1キー。匿名SELECT不可。';

-- ── 2) 名寄せ用のインデックス ──────────────────────────────
-- 既存166行はどちらも NULL なので、部分インデックスは実質ゼロ行から始まる。
create index if not exists activity_entries_user_id_idx
  on public.activity_entries (user_id)
  where user_id is not null;

create index if not exists activity_entries_email_idx
  on public.activity_entries (lower(trim(email)))
  where email is not null;

-- ── 3) user_id は自称させない ──────────────────────────────
-- anon INSERT が開いているテーブルなので、放置すると誰でも他人の user_id を書ける
-- （＝名簿が汚れて、リピート数が信用できなくなる）。
-- JWT の本人IDで上書きして固定する。**絶対に例外を投げない**＝申込は決して失敗しない。
--
-- auth.uid() は JWT を読むだけだが、退会直後の有効JWTだと実在しないIDを返しうる。
-- そのまま入れると外部キー違反で申込が落ちるので、実在確認を挟んで無ければ NULL にする。
create or replace function public.auth_uid_if_exists()
returns uuid
language sql stable security definer set search_path = public
as $$ select u.id from auth.users u where u.id = auth.uid() $$;
grant execute on function public.auth_uid_if_exists() to anon, authenticated;

create or replace function public.activity_entries_bind_user_id()
returns trigger
language plpgsql
as $$
begin
  -- PostgREST 経由（anon / authenticated）のときだけ上書きする。
  -- service_role / postgres はバックアップ復元や管理作業で正しい値を入れてくるので、
  -- ここで NULL に潰してはいけない。
  if current_user in ('anon', 'authenticated') then
    new.user_id := public.auth_uid_if_exists();
  end if;
  return new;
end $$;

drop trigger if exists activity_entries_bind_user_id_trg on public.activity_entries;
create trigger activity_entries_bind_user_id_trg
  before insert on public.activity_entries
  for each row execute function public.activity_entries_bind_user_id();

-- ── 3.5) ログイン中の人も申し込めることを確実にする ────────
-- 20260802010000 で「ログイン済みなら何でもできる」ポリシーを管理者限定
--   （admins can manage activity_entries: FOR ALL TO authenticated USING/CHECK is_admin()）
-- に差し替えた。当時 INSERT を許していたポリシーが `TO anon` 限定だった場合、
-- **ログイン中の一般会員だけ申込が通らない**という穴が残る。
-- user_id を紐づける機能はログイン中の申込が通ることが前提なので、ここで明示的に開ける。
--
-- 権限としては何も広げていない: 同じ INSERT は今も匿名で誰でもできる。
-- ログイン中の人が匿名より不利になっている状態を無くすだけ。
-- （すでに同等のポリシーがあれば、permissive 同士の OR なので単に冗長になるだけ）
drop policy if exists "activity_entries_insert_authenticated" on public.activity_entries;
create policy "activity_entries_insert_authenticated" on public.activity_entries
  for insert to authenticated with check (true);

-- ── 4) 念のための明示的な封鎖（多層防御） ──────────────────
-- 列単位GRANTなので本来これは何もしないが、
-- 「読めないことは意図であって偶然ではない」をコードに残しておく。
revoke select (email, user_id) on public.activity_entries from anon, authenticated;
revoke update (email, user_id) on public.activity_entries from anon;

-- ── 適用後の確認（SQLエディタで実行して目視すること） ────────
-- 1) 匿名から email が読めないこと（false が2つ返るのが正しい）
--    select has_column_privilege('anon','public.activity_entries','email','SELECT'),
--           has_column_privilege('anon','public.activity_entries','user_id','SELECT');
-- 2) 既存行が壊れていないこと（166 と、email/user_id が全部 NULL）
--    select count(*), count(email), count(user_id) from public.activity_entries;
-- 3) 匿名の INSERT 権限が残っていること（申込が通る前提）
--    select has_table_privilege('anon','public.activity_entries','INSERT');
