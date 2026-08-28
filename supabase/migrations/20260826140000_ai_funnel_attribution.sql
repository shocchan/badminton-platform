-- 流入元 → 購入 → 学習 → 転換 を1本で追える計測基盤（2026-08-26 CEO指示 Phase S1）。
--
-- 【いま何ができていないか】
-- 実測: 記録された LP 閲覧 7件はすべて UTM なし＝流入元不明。
-- 8月の Meta 広告 ¥1,992 は申込0件だったが、そもそも広告経由の閲覧があったのかも判別できない。
-- 既存の計測は2つに割れていて、どちらも片側しか見えない:
--   - ai_lp_views       … 未ログインでも書けるが「1ブラウザ1日1行」で、購入までは追えない
--   - ai_course_events  … 購入後の学習は追えるが auth 必須で、LP・CTA・checkout は書けない
-- ファネルの断絶がちょうど「お金の判断に必要なところ」に来ている。
--
-- 【この migration が足すもの】
--   ai_attribution   … ブラウザ単位の流入元台帳。first-touch は上書きしない / last-touch は毎回更新
--   ai_funnel_events … 未ログインから購入後まで同じ anon_id で並ぶ出来事
-- 既存の2表は消さない。ai_lp_views の「見た人数」の数え方は今も有効なので残す。
--
-- 【個人情報を持たない】
-- anon_id はブラウザが作る乱数UUIDで、氏名・メール・IP・UserAgent は一切保存しない。
-- referrer は**ホスト名だけ**（既存 ai_lp_views と同じ方針）。
-- GA4 側へもこの表の値は送らない。
--
-- 【anon 実行を許す表なので、書ける内容を固定する】
--   - kind はホワイトリスト外なら黙って捨てる（例外にしない＝計測で画面を壊さない）
--   - anon_id は UUID 形式のみ
--   - 文字列は 120 文字で切る
--   - 1 anon_id / 1日 あたり 300 行で打ち止め
--
-- rollback: 20260826140000_ai_funnel_attribution.rollback.sql

-- ── 流入元台帳 ──────────────────────────────────────────────
create table if not exists public.ai_attribution (
  anon_id text primary key,
  user_id uuid,

  -- first touch: 最初に来たときの流入元。**二度と上書きしない**
  ft_source text, ft_medium text, ft_campaign text, ft_content text, ft_term text,
  ft_referrer_host text, ft_landing_path text,
  ft_at timestamptz not null default now(),

  -- last touch: UTM か referrer を持って来るたびに更新
  lt_source text, lt_medium text, lt_campaign text, lt_content text, lt_term text,
  lt_referrer_host text, lt_landing_path text,
  lt_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_attribution is
  'ブラウザ単位の流入元（first-touch/last-touch）。個人情報は持たない。anon_idはクライアント生成のUUID';
comment on column public.ai_attribution.user_id is
  'ログイン後に本人が紐付ける（ai_link_attribution）。最初に付いたら変えない';

create index if not exists ai_attribution_user_idx on public.ai_attribution (user_id) where user_id is not null;
create index if not exists ai_attribution_ft_source_idx on public.ai_attribution (ft_source) where ft_source is not null;

-- ── ファネルの出来事 ────────────────────────────────────────
create table if not exists public.ai_funnel_events (
  id bigint generated always as identity primary key,
  anon_id text not null,
  user_id uuid,
  kind text not null,
  -- 出来事ごとの文脈。free text は入れない（anon が書ける表なので列を固定する）
  plan_id text,
  locale text,
  logged_in boolean,
  trial_state text,
  -- staging と本番は同じDBを共有している（.env.staging が URL を上書きしていない）。
  -- staging の動作確認を本番の数字に混ぜないための印。管理画面は既定で false だけ数える
  is_test boolean not null default false,
  occurred_at timestamptz not null default now(),
  occurred_on date not null default ((now() at time zone 'Asia/Tokyo')::date)
);

comment on table public.ai_funnel_events is
  '流入→LP→CTA→checkout→購入→学習→転換 の出来事。未ログインでも書けるので列を固定し kind をホワイトリストで縛る';

create index if not exists ai_funnel_events_kind_day_idx on public.ai_funnel_events (occurred_on, kind) where not is_test;
create index if not exists ai_funnel_events_anon_idx on public.ai_funnel_events (anon_id, occurred_at);
create index if not exists ai_funnel_events_user_idx on public.ai_funnel_events (user_id) where user_id is not null;

-- ── RLS: 読めるのは管理者だけ。書き込みは RPC 経由に限定 ──────
alter table public.ai_attribution enable row level security;
alter table public.ai_funnel_events enable row level security;

drop policy if exists ai_attribution_admin_read on public.ai_attribution;
create policy ai_attribution_admin_read on public.ai_attribution
  for select using (public.ai_is_admin());

drop policy if exists ai_funnel_events_admin_read on public.ai_funnel_events;
create policy ai_funnel_events_admin_read on public.ai_funnel_events
  for select using (public.ai_is_admin());

-- ── 記録RPC（anon 実行可） ──────────────────────────────────
create or replace function public.ai_record_funnel_event(
  p_anon_id text,
  p_kind text,
  p_plan_id text default null,
  p_locale text default null,
  p_logged_in boolean default null,
  p_trial_state text default null,
  -- 流入元。UTM が無ければ null を渡す（last-touch は更新しない）
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_content text default null,
  p_term text default null,
  p_referrer_host text default null,
  p_landing_path text default null,
  -- 本番ホスト以外（staging・ローカル）からの記録。集計から外すための印
  p_is_test boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 仕様（CEO指示 Phase S1）の13種。ここに無いものは黙って捨てる
  v_kinds constant text[] := array[
    'lp_view', 'cta_click',
    'trial_checkout_start', 'monthly_checkout_start', 'six_month_checkout_start',
    'purchase', 'trial_activated',
    'lesson_started', 'lesson_completed',
    'review_scheduled', 'review_completed',
    'upgrade_cta_view', 'upgrade_cta_click'
  ];
  v_cut constant int := 120;
  v_today_rows int;
  v_has_touch boolean;
  v_uid uuid := auth.uid();
begin
  -- 形が違うものは捨てる。例外は投げない（計測の失敗で画面を壊さない）
  if p_anon_id is null or p_anon_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  if p_kind is null or not (p_kind = any(v_kinds)) then
    return;
  end if;

  -- 1日あたりの上限。壊れたクライアントや悪意で表が膨らむのを止める
  select count(*) into v_today_rows
    from public.ai_funnel_events
    where anon_id = p_anon_id and occurred_on = (now() at time zone 'Asia/Tokyo')::date;
  if v_today_rows >= 300 then
    return;
  end if;

  v_has_touch := coalesce(p_source, p_medium, p_campaign, p_content, p_term, p_referrer_host) is not null;

  -- first-touch は insert のときだけ入る。last-touch は流入元を持って来たときだけ更新
  insert into public.ai_attribution as a (
    anon_id, user_id,
    ft_source, ft_medium, ft_campaign, ft_content, ft_term, ft_referrer_host, ft_landing_path,
    lt_source, lt_medium, lt_campaign, lt_content, lt_term, lt_referrer_host, lt_landing_path
  ) values (
    p_anon_id, v_uid,
    left(p_source, v_cut), left(p_medium, v_cut), left(p_campaign, v_cut),
    left(p_content, v_cut), left(p_term, v_cut), left(p_referrer_host, v_cut), left(p_landing_path, v_cut),
    left(p_source, v_cut), left(p_medium, v_cut), left(p_campaign, v_cut),
    left(p_content, v_cut), left(p_term, v_cut), left(p_referrer_host, v_cut), left(p_landing_path, v_cut)
  )
  on conflict (anon_id) do update set
    -- 既に誰かに紐付いていれば変えない（付け替えは事故のもと）
    user_id = coalesce(a.user_id, v_uid),
    lt_source        = case when v_has_touch then left(p_source, v_cut)        else a.lt_source end,
    lt_medium        = case when v_has_touch then left(p_medium, v_cut)        else a.lt_medium end,
    lt_campaign      = case when v_has_touch then left(p_campaign, v_cut)      else a.lt_campaign end,
    lt_content       = case when v_has_touch then left(p_content, v_cut)       else a.lt_content end,
    lt_term          = case when v_has_touch then left(p_term, v_cut)          else a.lt_term end,
    lt_referrer_host = case when v_has_touch then left(p_referrer_host, v_cut) else a.lt_referrer_host end,
    lt_landing_path  = case when v_has_touch then left(p_landing_path, v_cut)  else a.lt_landing_path end,
    lt_at            = case when v_has_touch then now() else a.lt_at end,
    updated_at = now();

  insert into public.ai_funnel_events (anon_id, user_id, kind, plan_id, locale, logged_in, trial_state, is_test)
  values (
    p_anon_id, v_uid, p_kind,
    left(p_plan_id, v_cut), left(p_locale, 8), p_logged_in, left(p_trial_state, 32),
    coalesce(p_is_test, false)
  );
end;
$$;

revoke all on function public.ai_record_funnel_event(
  text, text, text, text, boolean, text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.ai_record_funnel_event(
  text, text, text, text, boolean, text, text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- ── ログインしたら、そのブラウザの流入元を本人に紐付ける ────────
create or replace function public.ai_link_attribution(p_anon_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_anon_id is null or p_anon_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  -- 最初に付いた人から付け替えない。既に別人のブラウザなら何もしない
  update public.ai_attribution
    set user_id = auth.uid(), updated_at = now()
    where anon_id = p_anon_id and user_id is null;
  -- そのブラウザで未ログインのまま積んだ出来事にも、あとから本人を入れる
  update public.ai_funnel_events
    set user_id = auth.uid()
    where anon_id = p_anon_id and user_id is null;
end;
$$;

revoke all on function public.ai_link_attribution(text) from public, anon;
grant execute on function public.ai_link_attribution(text) to authenticated;

-- ── 購入に流入元を焼き付ける（あとで台帳が消えても売上の出どころが残る） ──
alter table public.ai_plan_purchases
  add column if not exists anon_id text,
  add column if not exists attribution_source text,
  add column if not exists attribution_campaign text;

comment on column public.ai_plan_purchases.anon_id is
  '購入したブラウザの anon_id（ai_attribution へ join できる）';
comment on column public.ai_plan_purchases.attribution_source is
  '購入時点の first-touch source を焼き付けたもの。台帳の更新に影響されない';

create index if not exists ai_plan_purchases_anon_idx
  on public.ai_plan_purchases (anon_id) where anon_id is not null;
