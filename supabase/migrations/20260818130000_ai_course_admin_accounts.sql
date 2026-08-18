-- 管理ページ刷新（2026-08-18）: アカウント台帳RPC＋受講権の商品ひも付け列＋テストアカウント埋め戻し
--
-- 背景:
--  1. 管理画面の母集合が ai_learners（初回ログインで初めて生まれる）だったため、
--     アカウント発行済み・未ログインの生徒（実例: andy/wang）が管理画面から見えなかった。
--     母集合を auth.users に変える（今後の単発販売・システム販売の自動発行アカウントも必ずここに乗る）。
--  2. アカウントの種別（生徒/テスト/管理者/その他）を「メールのドメイン目視」で推測していた。
--     DB由来の列（ai_admins / ai_course_access.source / ai_learners.is_test）だけで導出できるようにする。
--     実生徒 kana の表示名が『テスト』である事故（表示名目視に依存する危うさ）の恒久解消。
--  3. 受講権（ai_course_access）に商品とのひも付けが無く、購入で自動発行された行と
--     手動発行の行を区別できなかった。plan_id / source 等の受け皿を先に用意する。
--
-- 方針（刷新仕様 原則7: 既存データを壊さない）:
--  - 列追加＋埋め戻し＋読み取り専用RPC追加のみ。既存行の期間・note は一切変更しない。
--  - kana/李の期間矛盾の是正は末尾のコメントアウトSQL（実行はCEO判断）。

-- ────────────────────────────────────────────────
-- 1. ai_course_access: 商品ひも付け・発行元の列を追加
--    PK=user_id の「現在有効な受講権1行」方針は維持（購入履歴台帳 ai_plan_purchases は別件・§9）
-- ────────────────────────────────────────────────
alter table public.ai_course_access
  add column if not exists plan_id text,                -- planCatalog.ts の PlanId（手動発行なら null）
  add column if not exists plan_version int,            -- 付与時点のカタログ版（価格改定の言った言わない防止）
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'purchase', 'test')),   -- 発行元。purchase は将来の決済フロー専用
  add column if not exists ai_seconds_limit int,        -- AI会話の累計上限秒（体験パス60分=3600の受け皿。実効判定は別件・§9-2）
  add column if not exists purchase_id uuid;            -- 将来の購入台帳(ai_plan_purchases)への参照（テーブルはまだ無いのでFKなし）

comment on column public.ai_course_access.plan_id is '紐づく商品（src/lib/aiLesson/course/plans/planCatalog.ts の PlanId）。手動発行なら null';
comment on column public.ai_course_access.source is '発行元: manual=管理画面 / purchase=決済フロー（将来） / test=受入テスト';
comment on column public.ai_course_access.ai_seconds_limit is 'AI会話の累計上限秒（商品由来）。null=商品由来の上限なし。サーバー側の実効判定は未実装（別件）';

-- ────────────────────────────────────────────────
-- 2. 全アカウント台帳RPC（auth.users 起点の外部結合・1行=1アカウント）
--    ガードは既存 ai_admin_learner_logins と同じ「where ai_is_admin()」方式（非管理者は0行）。
--    集計はすべて実在データ（ai_usage_daily 全期間 / ai_learning_sessions の正確な count）。
--    2026-08-18 に本番実データでSELECT本体を検証済み（sho: conv=25・累計$7.68、15アカウント）。
-- ────────────────────────────────────────────────
create or replace function public.ai_admin_list_accounts()
returns table(
  user_id uuid,
  email text,
  user_created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin_account boolean,
  learner_id uuid,
  usage_total_sessions bigint,
  usage_total_seconds bigint,
  usage_total_cost_usd numeric,
  usage_last_date date,
  conv_sessions_total bigint
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    exists(select 1 from public.ai_admins ad where ad.email = u.email::text) as is_admin_account,
    l.id,
    coalesce(du.total_sessions, 0),
    coalesce(du.total_seconds, 0),
    coalesce(du.total_cost_usd, 0),
    du.last_date,
    coalesce(cs.conv_total, 0)
  from auth.users u
  -- learner は user_id ごとに最新1行（実運用では1人1行）
  left join lateral (
    select l2.id from public.ai_learners l2
    where l2.user_id = u.id
    order by l2.created_at desc
    limit 1
  ) l on true
  -- AI会話の全期間 count（管理画面の「直近30件で頭打ち」表示の根治）
  left join lateral (
    select count(*)::bigint as conv_total
    from public.ai_learning_sessions s
    where s.learner_id = l.id
  ) cs on true
  -- 利用量の全期間集計（当月集計は既存の ai_usage_daily 直読みが担う）
  left join lateral (
    select
      sum(d.sessions_count)::bigint  as total_sessions,
      sum(d.seconds_used)::bigint    as total_seconds,
      sum(d.estimated_cost_usd)::numeric as total_cost_usd,
      max(d.usage_date)              as last_date
    from public.ai_usage_daily d
    where d.learner_id = l.id
  ) du on true
  where public.ai_is_admin()
  order by u.created_at;
$$;

-- ai_admin_learner_logins と同じ権限モデル（anon には一切与えない）
revoke all on function public.ai_admin_list_accounts() from public, anon;
grant execute on function public.ai_admin_list_accounts() to authenticated;

-- ────────────────────────────────────────────────
-- 3. 埋め戻し: テスト4アカウントに is_test / source='test' を立てる
--    対象はメール指定（2026-08-18 本番実測: 全15アカウント中この4件がテスト用）。
--    実生徒6（li/summer/andy/yuki/wang/kana）・CEO・雑多4件には触れない。
--    ※ kana は表示名が『テスト』だが実生徒。表示名では判定しないこと。
-- ────────────────────────────────────────────────
update public.ai_learners l
set is_test = true
from auth.users u
where l.user_id = u.id
  and u.email in (
    'test@id.badminton-platform.pages.dev',                       -- 男性ボイスよう
    'kaiwa@id.badminton-platform.pages.dev',                      -- アンディさん再現（N3＋会話）
    'jlpt@id.badminton-platform.pages.dev',                       -- サマーさん再現（JLPT→N2）
    'qa-temporary-1786940477761@kawabado-stage-verify.invalid'    -- QA TEMPORARY
  );

-- 受講権の発行元をテストに（qa-temporary は access 行なし＝対象0行で正常）
update public.ai_course_access a
set source = 'test'
from auth.users u
where a.user_id = u.id
  and u.email in (
    'test@id.badminton-platform.pages.dev',
    'kaiwa@id.badminton-platform.pages.dev',
    'jlpt@id.badminton-platform.pages.dev',
    'qa-temporary-1786940477761@kawabado-stage-verify.invalid'
  );

-- 登録許可チケット側も揃える（行が無いメールは対象0行で正常）
update public.ai_course_signup_grants
set is_test = true
where email in (
    'test@id.badminton-platform.pages.dev',
    'kaiwa@id.badminton-platform.pages.dev',
    'jlpt@id.badminton-platform.pages.dev',
    'qa-temporary-1786940477761@kawabado-stage-verify.invalid'
  );

-- ────────────────────────────────────────────────
-- 4.【実行しない・CEO判断待ち】kana / 李 の期間データ是正
--    管理画面には「矛盾」バッジ・警告バナーで見える化済み。直すかどうかはCEOが決める。
--
-- (a) kana: valid_from が 2026-09-01(JST) だが、8/18 に登録・ログイン済み。
--     生徒ゲートは「開始前」をブロックするため、**現在 kana は学習画面に入れない**。
--     いま から使わせるなら開始日を登録日に合わせる（契約note「9月からの3ヶ月」はそのまま残る）:
-- update public.ai_course_access set valid_from = '2026-08-18T00:00:00+09:00', updated_at = now()
--   where user_id = 'ac283aaa-2165-45f2-a76f-c7202628f09e';  -- kana
--
-- (b) 李: note は「9月から利用のため11月末まで」だが valid_from が 2026-08-18。
--     契約どおり9月開始に直すなら（→ 8月中は李さんが学習画面に入れなくなる点に注意）:
-- update public.ai_course_access set valid_from = '2026-09-01T00:00:00+09:00', updated_at = now()
--   where user_id = '8c0b1a8c-0b84-4078-b0a4-3519548af5af';  -- li
