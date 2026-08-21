-- 教材の人間レビュー記録（Task 3・2026-08-21）
--
-- 設計の要点:
-- - **教材の本文はコードが正準**（vocabularyReview / n2GrammarDrafts / listeningBank）。
--   ここに本文を複製しない。持つのは「人がどう判定したか」だけ。
-- - **追記専用**。1件の判定ごとに1行増える。現在の状態＝(kind, content_id) ごとの最新行。
--   これで変更履歴が自動的に残り、誤操作は「前の状態をもう一度入れる」だけで戻せる。
-- - 一括更新の口を作らない（RPCは1件ずつ）。AIや service_role が reviewed を書かない運用。
--
-- 状態:
--   unreviewed … 未確認（行が無い場合も同じ扱い）
--   needs_fix  … 修正が必要（メモ必須ではないが推奨）
--   reviewed   … 人が内容を確認した

create table if not exists public.ai_content_reviews (
  id uuid primary key default gen_random_uuid(),
  -- 'vocab' | 'n2grammar' | 'listening'（将来の教材種別もここに足す）
  content_kind text not null check (content_kind ~ '^[a-z0-9_]{2,24}$'),
  content_id text not null check (length(content_id) between 1 and 128),
  status text not null check (status in ('unreviewed', 'needs_fix', 'reviewed')),
  note text not null default '' check (length(note) <= 2000),
  reviewed_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ai_content_reviews_current_idx
  on public.ai_content_reviews (content_kind, content_id, created_at desc);

alter table public.ai_content_reviews enable row level security;

drop policy if exists ai_content_reviews_select on public.ai_content_reviews;
create policy ai_content_reviews_select on public.ai_content_reviews
  for select to authenticated
  using (public.ai_is_admin());

-- 書き込みポリシーは作らない＝クライアント直書き不可（下のRPCだけが入口）
grant select on public.ai_content_reviews to authenticated;
grant select, insert on public.ai_content_reviews to service_role;

-- 現在の状態（種別ごとの最新行）
create or replace function public.ai_admin_list_content_reviews()
returns table (
  content_kind text, content_id text, status text,
  note text, reviewed_by text, reviewed_at timestamptz, revisions bigint
)
language sql stable security definer set search_path = public as $$
  select r.content_kind, r.content_id, r.status, r.note, r.reviewed_by, r.created_at,
         (select count(*) from public.ai_content_reviews h
           where h.content_kind = r.content_kind and h.content_id = r.content_id)
    from (
      select distinct on (content_kind, content_id) *
        from public.ai_content_reviews
       order by content_kind, content_id, created_at desc
    ) r
   where public.ai_is_admin()
$$;

revoke all on function public.ai_admin_list_content_reviews() from public, anon;
grant execute on function public.ai_admin_list_content_reviews() to authenticated, service_role;

-- 1件だけ記録する（一括の口は作らない）
create or replace function public.ai_admin_set_content_review(
  p_kind text, p_content_id text, p_status text, p_note text default ''
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  -- **人間（管理者JWT）以外は書けない**。AI・service_role からは false を返す
  if not public.ai_is_admin() then return false; end if;
  if p_status not in ('unreviewed', 'needs_fix', 'reviewed') then return false; end if;
  if p_kind !~ '^[a-z0-9_]{2,24}$' then return false; end if;
  if p_content_id is null or length(p_content_id) not between 1 and 128 then return false; end if;

  insert into public.ai_content_reviews (content_kind, content_id, status, note, reviewed_by)
  values (p_kind, p_content_id, p_status, left(coalesce(p_note, ''), 2000),
          coalesce(auth.jwt() ->> 'email', 'admin'));
  return true;
end $$;

revoke all on function public.ai_admin_set_content_review(text, text, text, text) from public, anon;
grant execute on function public.ai_admin_set_content_review(text, text, text, text) to authenticated;

-- 1件の履歴（誤操作から戻すとき、いつ何にしたかを見る）
create or replace function public.ai_admin_content_review_history(p_kind text, p_content_id text)
returns table (status text, note text, reviewed_by text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select status, note, reviewed_by, created_at
    from public.ai_content_reviews
   where public.ai_is_admin()
     and content_kind = p_kind and content_id = p_content_id
   order by created_at desc
   limit 50
$$;

revoke all on function public.ai_admin_content_review_history(text, text) from public, anon;
grant execute on function public.ai_admin_content_review_history(text, text) to authenticated;
