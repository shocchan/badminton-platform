-- 販売LPが何人に見られているかを、管理ページから確かめられるようにする（CEO依頼 2026-08-23）。
--
-- なぜ自前で数えるか:
--   GA4 は入っているが、管理ページから読むには別の認証情報とサーバーが要る。
--   いま知りたいのは「誰かに見つかっているか」「どこから来たか」の2つだけなので、
--   自分のDBに最小限を記録して、そのまま管理ページとボードに出す。
--
-- 記録するもの: 日付・どのページ・言語・流入元のホスト名・utm。
-- **記録しないもの: IPアドレス・UserAgent・URL全体・個人を識別できるもの。**
-- 1ブラウザ1日1回だけ送る（クライアント側で抑制）＝「延べ表示回数」ではなく「見た人」に近い数。
--
-- 数字の性格: 自前カウンタなので、GAのようなbot除外はしていない。
--   多少ふくらむ可能性はある目安の数字として扱う（画面にもそう書く）。

create table if not exists public.ai_lp_views (
  id uuid primary key default gen_random_uuid(),
  viewed_on date not null default (now() at time zone 'Asia/Tokyo')::date,
  path text not null,
  lang text not null,
  variant text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create index if not exists ai_lp_views_viewed_on_idx on public.ai_lp_views (viewed_on desc);

alter table public.ai_lp_views enable row level security;

-- 読めるのは管理者だけ。**直接の insert は誰にも許さない**（下のRPC経由のみ）
drop policy if exists ai_lp_views_admin_read on public.ai_lp_views;
create policy ai_lp_views_admin_read on public.ai_lp_views
  for select using (public.ai_is_admin());

/**
 * LP表示を1件記録する。匿名から呼ばれる唯一の入口。
 * 入力は**すべてここで正規化・切り詰め**る（長い文字列・想定外の値を表に入れない）。
 */
create or replace function public.ai_record_lp_view(
  p_path text,
  p_lang text default 'ja',
  p_variant text default null,
  p_referrer_host text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_path text := left(coalesce(p_path, ''), 120);
  v_lang text := case when p_lang in ('ja', 'zh') then p_lang else 'ja' end;
begin
  -- 見に覚えのないパスは記録しない（この表を任意の文字列の置き場にしない）
  if v_path !~ '^/(ja|zh)/ai-course(/[a-z-]{1,24})?$' then
    return;
  end if;
  insert into public.ai_lp_views
    (path, lang, variant, referrer_host, utm_source, utm_medium, utm_campaign)
  values (
    v_path, v_lang,
    left(nullif(p_variant, ''), 24),
    left(nullif(p_referrer_host, ''), 120),
    left(nullif(p_utm_source, ''), 60),
    left(nullif(p_utm_medium, ''), 60),
    left(nullif(p_utm_campaign, ''), 60)
  );
end;
$function$;

revoke all on function public.ai_record_lp_view(text, text, text, text, text, text, text) from public;
grant execute on function public.ai_record_lp_view(text, text, text, text, text, text, text) to anon, authenticated;

-- 自分（運営）のメール。テスト購入を本物の数字から外すために使う
insert into public.ai_config (key, value)
values ('owner_emails', '["shodorannga@gmail.com", "shocchance3@gmail.com"]'::jsonb)
on conflict (key) do update set value = excluded.value;

-- 購入台帳に「これはテスト」の印をつけられるようにする（CEO確認 2026-08-23:
-- いまある申込はすべて本人の動作確認で、まだ誰にも見つかっていない）
alter table public.ai_plan_purchases add column if not exists is_test boolean not null default false;

update public.ai_plan_purchases
  set is_test = true
  where created_at < '2026-08-24'::timestamptz;
