-- ============================================================
-- AI原価を「実利用から」計算できるようにする（2026-08-24 WAVE 4-4）
--
-- なぜ要るか（監査で判明した3つの穴）:
--
--   1. 「実測 $8.11/時間」は循環参照だった。
--      ai_usage_daily.estimated_cost_usd を作っている式は
--      estimateSessionCost(sec) = 分数 × $0.1344（courseStats.ts）で、
--      その値を時間で割り戻して「実測」と呼んでいた。実請求と一度も突合していない。
--      → 分数だけでなく **モデル名とトークン数** を残す。突合できる形にする。
--
--   2. テキスト会話・レポート・翻訳の原価が、どのモデルで出たのか残っていない。
--      ai_usage_daily は (learner_id, usage_date) の数値スカラー1本しか持たず、
--      音声とテキストの区別も、モデルの区別もできない。
--      → kind（voice/text/report/translate/transcribe）とモデル別に1行ずつ残す。
--
--   3. 推定値と実測値を同じ列に混ぜていた。
--      問題の本質は「推定を実測と呼んだこと」なので、source 列で必ず区別する。
--        estimated … 分数などから **こちらが仮定した** トークン数で計算した値
--        reported  … OpenAI のレスポンス usage が返した **実トークン数** で計算した値
--        billed    … OpenAI の請求API（Usage/Costs）と突合して確定した値
--
-- 既存資産との関係（**壊さない**）:
--   - ai_usage_daily と ai_record_usage(int, numeric) は**そのまま**。
--     加算専用・1回$1クランプという安全弁を今も使い続ける。
--   - このマイグレーションが足すのは「明細台帳」。既定では ai_usage_daily へ
--     二重計上しない（p_rollup = false）。クライアントは今も ai_record_usage で
--     日次へ積んでいるため、両方から積むと数字が倍になる。
--   - 明細と日次のズレ自体が情報になる（ズレ = 日次に載っていない原価）。
--     ai_cost_summary() がその差を出す。
--
-- 単価は**DBが正**にする。Edge Function はトークン数とモデル名しか送らない。
-- クライアント/関数が計算した金額を信用すると、単価の書き換えで金額を偽装できる。
-- ============================================================

-- ── 1. モデル別の単価表（USD / 1M tokens） ──────────────────────────
--
-- 出典の書き方の約束（provenance）:
--   repo:<path>   … 今日より前からこのリポジトリに在った数字（＝新規に持ち込んでいない）
--   list:<行>     … OpenAI 価格表の該当行。**未突合**。reconcile-openai-cost.mjs で検算する
--   derived:<式>  … 他の単価から導いた値
-- 「未突合」を消してよいのは、実請求と突き合わせた後だけ。
create table if not exists public.ai_model_prices (
  model text primary key,
  input_per_million numeric not null default 0,
  cached_input_per_million numeric not null default 0,
  output_per_million numeric not null default 0,
  audio_input_per_million numeric not null default 0,
  audio_output_per_million numeric not null default 0,
  provenance text not null,
  updated_at timestamptz not null default now()
);

comment on table public.ai_model_prices is
  'AI原価計算の単価表（USD/1Mトークン）。src/lib/aiLesson/course/aiModelPricing.ts の写し。ズレは aiModelPricing.test.ts が落とす。';

-- seed は JSON 1本で置く（TS 側との一致を vitest がこのファイルを読んで検証するため、
-- 機械で読める形にしておく。20260823120000 の plan_ai_budgets と同じ作り）。
insert into public.ai_model_prices (
  model, input_per_million, cached_input_per_million, output_per_million,
  audio_input_per_million, audio_output_per_million, provenance
)
select
  x.model, x.input_per_million, x.cached_input_per_million, x.output_per_million,
  x.audio_input_per_million, x.audio_output_per_million, x.provenance
from jsonb_to_recordset('[
  {"model":"gpt-realtime-2.1","input_per_million":4,"cached_input_per_million":0.4,"output_per_million":16,"audio_input_per_million":32,"audio_output_per_million":64,"provenance":"repo:src/lib/aiLesson/course/courseConfig.ts REALTIME_COST(32/64) + list:realtime text 4/16, cached audio 0.4 (未突合)"},
  {"model":"gpt-realtime-2.1-mini","input_per_million":0.6,"cached_input_per_million":0.06,"output_per_million":2.4,"audio_input_per_million":10,"audio_output_per_million":20,"provenance":"repo:supabase/functions/ai-lesson-token/index.ts コメント(音声10/20) + list:mini text (未突合)"},
  {"model":"gpt-4o-mini","input_per_million":0.15,"cached_input_per_million":0.075,"output_per_million":0.6,"audio_input_per_million":0,"audio_output_per_million":0,"provenance":"repo:src/lib/aiLesson/course/courseChatApi.ts MINI_COST(0.15/0.6) + derived:cached=input*0.5"},
  {"model":"gpt-4o","input_per_million":2.5,"cached_input_per_million":1.25,"output_per_million":10,"audio_input_per_million":0,"audio_output_per_million":0,"provenance":"list:gpt-4o text 2.50/10.00 (未突合)。AI_LESSON_CHAT_MODEL で切替えられる＝原価17倍になる先"},
  {"model":"gpt-4o-transcribe","input_per_million":2.5,"cached_input_per_million":2.5,"output_per_million":10,"audio_input_per_million":6,"audio_output_per_million":0,"provenance":"list:gpt-4o-transcribe audio-in 6.00 / text 2.50/10.00 (未突合)。realtime の入力文字起こしで使用"}
]'::jsonb) as x(
  model text, input_per_million numeric, cached_input_per_million numeric,
  output_per_million numeric, audio_input_per_million numeric,
  audio_output_per_million numeric, provenance text
)
on conflict (model) do update set
  input_per_million = excluded.input_per_million,
  cached_input_per_million = excluded.cached_input_per_million,
  output_per_million = excluded.output_per_million,
  audio_input_per_million = excluded.audio_input_per_million,
  audio_output_per_million = excluded.audio_output_per_million,
  provenance = excluded.provenance,
  updated_at = now();

alter table public.ai_model_prices enable row level security;
drop policy if exists ai_model_prices_select on public.ai_model_prices;
create policy ai_model_prices_select on public.ai_model_prices
  for select to authenticated using (true);
revoke all on public.ai_model_prices from anon;
revoke insert, update, delete on public.ai_model_prices from authenticated;
grant select on public.ai_model_prices to authenticated;

-- 音声（realtime）の「分数 → トークン数」の仮定。**仮定であることを明示して置く**。
-- ここを実測へ寄せるのが reconcile-openai-cost.mjs の仕事。
insert into public.ai_config (key, value)
values ('realtime_token_estimate', '{"approx_input_tokens_per_min":1800,"approx_output_tokens_per_min":1200,"note":"repo:courseConfig.ts REALTIME_COST の写し。実測ではなく仮定"}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ── 2. 単価表からコストを出す関数 ──────────────────────────
--
-- 未知のモデルは 0 にしない。0 にすると「知らないモデルを使った月だけ原価が消える」
-- ＝いちばん危ない向きに外れる。**表の中の最大単価**へ倒して過大に見積もる。
--
-- 照合は「完全一致 → いちばん長い前方一致 → 最大単価」の順。
-- OpenAI は要求した `gpt-4o-mini` に対し `gpt-4o-mini-2024-07-18` のような
-- 版つきの名前を返すことがあり、**記録には実際に返った名前をそのまま残す**ため
-- （env で差し替えられるのだから、記録は実際の値でなければ意味がない）、
-- 単価側で版差を吸収する。前方一致が無ければ「知らないモデル」として過大側へ倒す。
create or replace function public.ai_model_cost_usd(
  p_model text,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_audio_input_tokens bigint default 0,
  p_audio_output_tokens bigint default 0
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select m.*
    from public.ai_model_prices m
    -- starts_with を使う（like だと model 名の _ や % が誤ってワイルドカードになる）
    where m.model = p_model or starts_with(coalesce(p_model, ''), m.model)
    order by (m.model = p_model) desc, length(m.model) desc
    limit 1
  ), p as (
    select
      coalesce(m.input_per_million,        (select max(input_per_million)        from public.ai_model_prices)) as inp,
      coalesce(m.cached_input_per_million, (select max(cached_input_per_million) from public.ai_model_prices)) as cin,
      coalesce(m.output_per_million,       (select max(output_per_million)       from public.ai_model_prices)) as outp,
      coalesce(m.audio_input_per_million,  (select max(audio_input_per_million)  from public.ai_model_prices)) as ain,
      coalesce(m.audio_output_per_million, (select max(audio_output_per_million) from public.ai_model_prices)) as aout
    from (select 1) one
    left join matched m on true
  )
  select round((
      greatest(coalesce(p_input_tokens, 0), 0)        * p.inp
    + greatest(coalesce(p_cached_input_tokens, 0), 0) * p.cin
    + greatest(coalesce(p_output_tokens, 0), 0)       * p.outp
    + greatest(coalesce(p_audio_input_tokens, 0), 0)  * p.ain
    + greatest(coalesce(p_audio_output_tokens, 0), 0) * p.aout
  ) / 1000000.0, 8)
  from p;
$$;

revoke all on function public.ai_model_cost_usd(text, bigint, bigint, bigint, bigint, bigint) from public, anon;
grant execute on function public.ai_model_cost_usd(text, bigint, bigint, bigint, bigint, bigint) to authenticated, service_role;

-- ── 3. 明細台帳 ──────────────────────────
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references public.ai_learners(id) on delete cascade,
  session_id uuid references public.ai_learning_sessions(id) on delete set null,
  occurred_at timestamptz not null default now(),
  -- 日次集計は ai_usage_daily と同じ Asia/Tokyo 基準（JST 0〜9時が前日へ逃げない）
  usage_date date not null default (now() at time zone 'Asia/Tokyo')::date,
  kind text not null check (kind in ('voice', 'text', 'report', 'translate', 'transcribe')),
  -- **env で上書きできるので、実際に使われた値をそのまま入れる**
  model text not null,
  source text not null default 'estimated' check (source in ('estimated', 'reported', 'billed')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  audio_input_tokens bigint not null default 0 check (audio_input_tokens >= 0),
  audio_output_tokens bigint not null default 0 check (audio_output_tokens >= 0),
  realtime_seconds int not null default 0 check (realtime_seconds >= 0),
  -- **その分数がどう測られたか**。音声はトークン数が取れないので、ここが根拠になる。
  --   client_wallclock       … ブラウザの経過時間（現状の音声。誤差は接続待ちを含む向き）
  --   session_duration       … ai_learning_sessions.duration_seconds から後追いで入れた
  --   pending_client_report  … トークン発行時点。分数はまだ無い
  duration_source text,
  estimated_cost_usd numeric not null default 0,
  -- ai_usage_daily へも積んだか。二重計上の調査を後からできるようにする
  rolled_into_daily boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_date_idx on public.ai_usage_events (usage_date desc);
create index if not exists ai_usage_events_learner_idx on public.ai_usage_events (learner_id, usage_date desc);
-- 音声は「トークン発行時に器を作り、終了後に分数で埋める」ため、セッション×種別で1行に寄せる
create unique index if not exists ai_usage_events_voice_uniq
  on public.ai_usage_events (session_id, kind) where kind = 'voice' and session_id is not null;

comment on table public.ai_usage_events is
  'AI呼び出し1回ぶんの明細。ai_usage_daily（日次スカラー）を置き換えるものではなく、その内訳と根拠を残す台帳。';

alter table public.ai_usage_events enable row level security;
drop policy if exists ai_usage_events_select on public.ai_usage_events;
create policy ai_usage_events_select on public.ai_usage_events
  for select to authenticated
  using (
    public.ai_is_admin()
    or learner_id in (select id from public.ai_learners where user_id = auth.uid())
  );
-- 書き込みは security definer RPC と service_role のみ（ai_usage_daily と同じ二層防御）
revoke all on public.ai_usage_events from anon;
revoke insert, update, delete on public.ai_usage_events from authenticated;
grant select on public.ai_usage_events to authenticated;

-- ── 4. 記録RPC ──────────────────────────
--
-- 金額は受け取らない。**トークン数とモデル名だけ**受け取り、単価表で計算する。
-- 金額を受け取る形にすると、呼び出し側の単価定義がズレた瞬間に台帳が壊れる
-- （そして誰も気づかない。それが今回の $8.11 問題そのもの）。
create or replace function public.ai_record_usage_event(
  p_kind text,
  p_model text,
  p_source text default 'reported',
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_audio_input_tokens bigint default 0,
  p_audio_output_tokens bigint default 0,
  p_realtime_seconds int default 0,
  p_duration_source text default null,
  p_session_id uuid default null,
  p_learner_id uuid default null,
  p_note text default null,
  -- 既定は false。true にすると ai_usage_daily へも積む（既存クライアントと二重計上しないため）
  p_rollup boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_learner_id uuid;
  v_kind text;
  v_source text;
  v_model text;
  v_in bigint; v_cin bigint; v_out bigint; v_ain bigint; v_aout bigint;
  v_secs int;
  v_cost numeric;
  v_limits jsonb;
  v_max_seconds int;
  v_id uuid;
  v_rolled boolean := false;
begin
  -- 種別・source は許可値のみ（不正値は保存せず弾く。あとで「不明」を数えずに済む）
  v_kind := lower(coalesce(p_kind, ''));
  if v_kind not in ('voice', 'text', 'report', 'translate', 'transcribe') then
    return jsonb_build_object('ok', false, 'code', 'bad_kind');
  end if;
  v_source := lower(coalesce(p_source, 'reported'));
  if v_source not in ('estimated', 'reported', 'billed') then
    return jsonb_build_object('ok', false, 'code', 'bad_source');
  end if;
  v_model := nullif(btrim(coalesce(p_model, '')), '');
  if v_model is null then
    return jsonb_build_object('ok', false, 'code', 'model_required');
  end if;
  v_model := left(v_model, 80);

  -- 学習者の解決:
  --   ログインユーザー（auth.uid() あり）は **必ず本人**。p_learner_id は無視する
  --   （引数で他人の learner_id を書けると、他人の枠へ原価を付け替えられる）。
  --   service_role（auth.uid() なし・Edge Function）だけが p_learner_id / p_session_id を指定できる。
  --   anon には execute を与えないので、uid が無い＝service_role とみなしてよい。
  if v_uid is not null then
    select id into v_learner_id from public.ai_learners where user_id = v_uid limit 1;
    if v_learner_id is null then
      return jsonb_build_object('ok', false, 'code', 'no_learner');
    end if;
  else
    v_learner_id := p_learner_id;
    if v_learner_id is null and p_session_id is not null then
      select learner_id into v_learner_id from public.ai_learning_sessions where id = p_session_id;
    end if;
  end if;

  -- トークン数のサニタイズ。負値は0、1回あたり200万トークンでクランプ
  -- （実際の1コールは多くて数万。桁違いの注入を構造的に遮断する）
  v_in   := least(greatest(coalesce(p_input_tokens, 0), 0), 2000000);
  v_cin  := least(greatest(coalesce(p_cached_input_tokens, 0), 0), 2000000);
  v_out  := least(greatest(coalesce(p_output_tokens, 0), 0), 2000000);
  v_ain  := least(greatest(coalesce(p_audio_input_tokens, 0), 0), 2000000);
  v_aout := least(greatest(coalesce(p_audio_output_tokens, 0), 0), 2000000);
  v_secs := least(greatest(coalesce(p_realtime_seconds, 0), 0), 24 * 3600);

  -- 金額は必ずサーバ側で計算する（引数に金額は無い）
  v_cost := public.ai_model_cost_usd(v_model, v_in, v_cin, v_out, v_ain, v_aout);
  -- 1イベントの上限 $10（realtime 60分ぶんより上・現実の1コールより十分上）
  v_cost := least(greatest(coalesce(v_cost, 0), 0), 10.0);

  -- 音声は「発行時に器を作り、終了後に分数で埋める」ので、同じセッションは1行へ寄せる
  insert into public.ai_usage_events (
    learner_id, session_id, kind, model, source,
    input_tokens, cached_input_tokens, output_tokens,
    audio_input_tokens, audio_output_tokens,
    realtime_seconds, duration_source, estimated_cost_usd, note
  ) values (
    v_learner_id, p_session_id, v_kind, v_model, v_source,
    v_in, v_cin, v_out, v_ain, v_aout,
    v_secs, nullif(left(coalesce(p_duration_source, ''), 40), ''), v_cost,
    nullif(left(coalesce(p_note, ''), 200), '')
  )
  on conflict (session_id, kind) where kind = 'voice' and session_id is not null
  do update set
    model = excluded.model,
    source = excluded.source,
    input_tokens = excluded.input_tokens,
    cached_input_tokens = excluded.cached_input_tokens,
    output_tokens = excluded.output_tokens,
    audio_input_tokens = excluded.audio_input_tokens,
    audio_output_tokens = excluded.audio_output_tokens,
    -- 分数は後から入る方が正しい（0で上書きしない）
    realtime_seconds = greatest(ai_usage_events.realtime_seconds, excluded.realtime_seconds),
    duration_source = coalesce(excluded.duration_source, ai_usage_events.duration_source),
    estimated_cost_usd = greatest(ai_usage_events.estimated_cost_usd, excluded.estimated_cost_usd),
    occurred_at = now()
  returning id into v_id;

  -- 日次への積み増し（既定 false）。**既存 ai_record_usage と同じ安全弁をそのまま使う**
  if p_rollup and v_learner_id is not null then
    select value into v_limits from public.ai_config where key = 'usage_limits';
    v_max_seconds := coalesce((v_limits->>'session_max_seconds')::int, 240);
    insert into public.ai_usage_daily
      (learner_id, usage_date, sessions_count, seconds_used, estimated_cost_usd, updated_at)
      values (
        v_learner_id, (now() at time zone 'Asia/Tokyo')::date, 0,
        least(v_secs, v_max_seconds),   -- 秒: 1セッション上限でクランプ（既存と同じ）
        least(v_cost, 1.0),             -- 金額: 1回$1でクランプ（既存と同じ安全弁）
        now()
      )
    on conflict (learner_id, usage_date) do update
      set seconds_used = ai_usage_daily.seconds_used + excluded.seconds_used,
          estimated_cost_usd = ai_usage_daily.estimated_cost_usd + excluded.estimated_cost_usd,
          updated_at = now();
    v_rolled := true;
    update public.ai_usage_events set rolled_into_daily = true where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'costUsd', v_cost, 'rolledIntoDaily', v_rolled);
end $$;

revoke all on function public.ai_record_usage_event(text, text, text, bigint, bigint, bigint, bigint, bigint, int, text, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.ai_record_usage_event(text, text, text, bigint, bigint, bigint, bigint, bigint, int, text, uuid, uuid, text, boolean) to authenticated, service_role;

-- ── 5. 音声セッションの分数を後追いで埋める ──────────────────────────
--
-- 音声は OpenAI の usage をこちら側で受け取れない（WebRTCでブラウザが直接繋ぐ）。
-- 取れるのは分数だけなので、**分数と、その分数がどう測られたか**を残す。
-- ai_learning_sessions.duration_seconds は既に保存されているので、
-- トークン発行時に記録したモデル名と突き合わせて埋める。クライアント改修が要らない。
create or replace function public.ai_backfill_voice_usage_events(p_days int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_est jsonb;
  v_in_per_min numeric;
  v_out_per_min numeric;
  v_updated int := 0;
begin
  if auth.uid() is not null and not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select value into v_est from public.ai_config where key = 'realtime_token_estimate';
  v_in_per_min := coalesce((v_est->>'approx_input_tokens_per_min')::numeric, 1800);
  v_out_per_min := coalesce((v_est->>'approx_output_tokens_per_min')::numeric, 1200);

  with target as (
    select e.id, e.model, s.duration_seconds
    from public.ai_usage_events e
    join public.ai_learning_sessions s on s.id = e.session_id
    where e.kind = 'voice'
      and coalesce(s.duration_seconds, 0) > 0
      and e.realtime_seconds < coalesce(s.duration_seconds, 0)
      and e.occurred_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
  )
  update public.ai_usage_events e
    set realtime_seconds = t.duration_seconds,
        duration_source = 'session_duration',
        source = 'estimated',   -- トークン実測ではない。分数からの推定であることを必ず残す
        audio_input_tokens = round(t.duration_seconds / 60.0 * v_in_per_min),
        audio_output_tokens = round(t.duration_seconds / 60.0 * v_out_per_min),
        estimated_cost_usd = least(public.ai_model_cost_usd(
          t.model, 0, 0, 0,
          round(t.duration_seconds / 60.0 * v_in_per_min)::bigint,
          round(t.duration_seconds / 60.0 * v_out_per_min)::bigint
        ), 10.0)
  from target t
  where e.id = t.id;
  get diagnostics v_updated = row_count;

  return jsonb_build_object('ok', true, 'updated', v_updated);
end $$;

revoke all on function public.ai_backfill_voice_usage_events(int) from public, anon;
grant execute on function public.ai_backfill_voice_usage_events(int) to authenticated, service_role;

-- ── 6. 突合用サマリ（管理者のみ） ──────────────────────────
--
-- 「点検ボードのAI原価が音声だけ」を直せるように、明細側の合計と、
-- 既存 ai_usage_daily の合計を **並べて** 返す。ズレを隠さない。
create or replace function public.ai_cost_summary(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date);
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Tokyo')::date);
  v_rows jsonb;
  v_events_total numeric;
  v_daily_total numeric;
begin
  if auth.uid() is not null and not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select coalesce(jsonb_agg(r order by r->>'kind', r->>'model'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'kind', kind, 'model', model, 'source', source,
      'calls', count(*),
      'inputTokens', sum(input_tokens + cached_input_tokens),
      'outputTokens', sum(output_tokens),
      'audioInputTokens', sum(audio_input_tokens),
      'audioOutputTokens', sum(audio_output_tokens),
      'realtimeSeconds', sum(realtime_seconds),
      'costUsd', round(sum(estimated_cost_usd), 4)
    ) as r
    from public.ai_usage_events
    where usage_date between v_from and v_to
    group by kind, model, source
  ) s;

  select round(coalesce(sum(estimated_cost_usd), 0), 4) into v_events_total
  from public.ai_usage_events where usage_date between v_from and v_to;

  select round(coalesce(sum(estimated_cost_usd), 0), 4) into v_daily_total
  from public.ai_usage_daily where usage_date between v_from and v_to;

  return jsonb_build_object(
    'ok', true, 'from', v_from, 'to', v_to,
    'byKind', v_rows,
    'eventsTotalUsd', v_events_total,
    'dailyTotalUsd', v_daily_total,
    -- 正負どちらもありうる。プラス = 明細にあって日次に無い原価（＝点検ボードの過少計上）
    'gapUsd', round(coalesce(v_events_total, 0) - coalesce(v_daily_total, 0), 4)
  );
end $$;

revoke all on function public.ai_cost_summary(date, date) from public, anon;
grant execute on function public.ai_cost_summary(date, date) to authenticated, service_role;
