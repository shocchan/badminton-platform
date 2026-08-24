-- 受講権の「延長」と「格下げ防止」をDB側で原子的に行う（2026-08-24）。
--
-- ⚠️⚠️ **remote未適用。適用にはCEOの許可が要る** ⚠️⚠️
--   staging と production は同じ Supabase プロジェクトを共有しているため、
--   適用＝production への変更になる（[[kawabado-staging-first]]）。
--   rollback: 20260824140000_ai_course_access_extend.rollback.sql
--
-- ────────────────────────────────────────────────────────────────
-- なぜ要るか（実装と文言の食い違い＝実害2件）
-- ────────────────────────────────────────────────────────────────
-- (1) **再購入すると利用期間が短くなっていた。**
--     ai-course-stripe-webhook は ai_course_access を
--     `valid_until = now + accessDays` で upsert していた。既存の valid_until を
--     読んでいないため、残り20日ある人が1か月プランを買い足すと 50日 ではなく
--     30日になる。購入者メール・ドキュメント・既存テストはいずれも「期間を延長」と
--     書いており、**お金を払った人が期間を失う**状態だった。
--
-- (2) **1人1行（PK=user_id）なので、安いプランが高いプランを上書きできた。**
--     10万円の6か月コース受講中の人が600円の体験パスを買うと、
--     valid_until が now+30日に、plan_id が ai-trial-pass に、
--     trial_window_minutes が 60 になり、**10万円の受講権が消える**。
--     Webhook にプランの優劣を見る分岐が無かった。
--
-- ────────────────────────────────────────────────────────────────
-- 何をするか
-- ────────────────────────────────────────────────────────────────
--  A. ai_course_access_grants … 「どの購入をいつ受講権へ反映したか」の追記専用台帳。
--     purchase_id を unique にして**冪等性の直列化点**にする。
--  B. ai_plan_rank(text)      … 受講権の強さ。手動発行(null)が最強。
--  C. ai_grant_purchase_access(...) … 延長＋格下げガードを1トランザクションで行うRPC。
--     Webhook はこれだけを呼ぶ（アプリ側の read-modify-write を廃止する）。
--  D. ai_plan_purchases.status の CHECK に 'refunded' と 'awaiting_payment' を追加。
--     - 'refunded': Webhook の返金処理が既に書き込んでいるのに CHECK に無く、
--       **返金の記録が 23514 で落ちていた**（管理画面のバッジ定義には既にある）。
--     - 'awaiting_payment': Alipay / WeChat Pay は非同期決済で、
--       checkout.session.completed が payment_status='unpaid' のまま届く。
--       それを 'pending'（＝離脱）と同じ扱いにすると、支払い待ちの人が
--       管理画面で「未完了（離脱）」に見えてしまう。
--
-- ────────────────────────────────────────────────────────────────
-- 既存行に何が起きるか（**実データ11行に対する答え**）
-- ────────────────────────────────────────────────────────────────
--   このmigrationは **ai_course_access の既存行を1行も更新しない。**
--   （CREATE TABLE / CREATE FUNCTION / 別テーブルのCHECK差し替えのみ）
--
--   2026-08-24 時点の本番 ai_course_access は11行:
--     - source='manual' が7行（ユウキ・李・wang・サマー・アンディ＋ID発行自動付与2件）
--       → いずれも plan_id が NULL。ai_plan_rank(NULL)=100 で**最強**として扱われるため、
--         この7人が今後どのプランを買っても plan_id / trial_window_minutes /
--         ai_seconds_limit を上書きされない。期間だけが伸びる。
--         ＝ ai_start_session の「plan_id が NULL ならフェイルオープン」が維持される。
--     - source='test' が3行（plan_id NULL）→ 同上。
--     - source='purchase' が1行（ai-trial-pass・valid_until=2026-08-19＝期限切れ）
--       → 期限切れなので次の購入では格下げガードが働かず、買ったプランが正しく入る。
--
--   ai_plan_purchases は8行（provisioned 1・pending 7）。
--   本migrationは1行も更新しない。CHECK を広げるだけなので既存値は全て合格する。

-- ────────────────────────────────────────────────
-- A. 受講権へ反映済みの購入の台帳（追記専用）
--    ここに行があること＝その購入はもう受講権へ反映済み、が唯一の判定。
--    Webhook の status='provisioned' チェックは残す（二層で守る）が、
--    こちらは**同じ購入の同時配信でも二重延長しない**ことをDBが保証する。
-- ────────────────────────────────────────────────
create table if not exists public.ai_course_access_grants (
  id uuid primary key default gen_random_uuid(),
  /** 反映元の購入。unique が冪等性の要（Stripe再送・同時実行の直列化点） */
  purchase_id uuid not null unique references public.ai_plan_purchases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text,
  plan_version int,
  /** 実際に足した日数 */
  access_days int not null,
  /** 上位の受講権を守るため、期間だけ足して属性を入れ替えなかったか */
  downgrade_guarded boolean not null default false,
  granted_at timestamptz not null default now()
);

comment on table public.ai_course_access_grants is
  '購入 → 受講権への反映の追記専用台帳。purchase_id unique が冪等性の直列化点。ai_course_access は「合成後の現在の権利1行」を持ち、こちらは「どの購入が効いたか」の履歴を持つ';

create index if not exists ai_course_access_grants_user_idx
  on public.ai_course_access_grants (user_id, granted_at desc);

alter table public.ai_course_access_grants enable row level security;
-- 書き込みポリシーは作らない＝クライアントからは一切書けない（service_role のみ）
revoke all on public.ai_course_access_grants from anon, authenticated;
grant all on public.ai_course_access_grants to service_role;

-- 管理者だけ読める（購入の効き方を人が追えるようにする）
drop policy if exists ai_course_access_grants_select on public.ai_course_access_grants;
create policy ai_course_access_grants_select on public.ai_course_access_grants
  for select to authenticated
  using (public.ai_is_admin());
grant select on public.ai_course_access_grants to authenticated;

-- ────────────────────────────────────────────────
-- B. 受講権の「強さ」
--
--    数字の正準は src/lib/aiLesson/course/plans/planEntitlements.ts の
--    PLAN_STRENGTH_RANK。ずれは planAccessExtension.test.ts が検出する。
--
--    **NULL（手動発行）を最強にしている理由**:
--    ai_start_session は plan_id が NULL の行を「従来どおりの共通上限」として
--    通す（フェイルオープン）。6か月コースの実生徒・手動発行の生徒はすべて
--    plan_id NULL なので、ここを弱く扱うと 600円の購入1回で
--    10万円の受講権が体験パス（音声3回・60分）に化ける。
--    未知のプランIDも同じ理由で 100（弱いと決めつけない）。
-- ────────────────────────────────────────────────
create or replace function public.ai_plan_rank(p_plan_id text)
returns int
language sql
immutable
as $$
  select case coalesce(p_plan_id, '')
    when ''              then 100  -- 手動発行・従来契約。人が決めた契約は機械より強い
    when 'coach-6m'      then 90
    when 'ai-month'      then 50
    when 'ai-trial-pass' then 10
    else 100                       -- 未知のプランは弱いと決めつけない（フェイルセーフ）
  end;
$$;

comment on function public.ai_plan_rank(text) is
  '受講権の強さ。大きいほど強い。NULL（手動発行）と未知のプランは100＝最強（格下げで消さないため）';

-- ────────────────────────────────────────────────
-- C. 購入を受講権へ反映する（延長＋格下げガード・冪等）
--
--    ルール:
--      1. すでに反映済みの購入（grants に行がある）なら何もしない
--      2. 期間は**必ず延長**: valid_until = greatest(現在のvalid_until, now()) + 日数
--         （残っていれば足す／切れていれば今から／行が無ければ今から）
--      3. いま有効な受講権のほうが強い（rank が大きい）なら**格下げ**とみなし、
--         期間だけ足して plan_id / plan_version / source / ai_seconds_limit /
--         trial_window_minutes / trial_started_at / purchase_id / valid_from は触らない
--      4. それ以外（同格・格上げ・期限切れ・行なし）は購入したプランの内容を反映する
--
--    呼び出しは service_role（ai-course-stripe-webhook）のみ。
-- ────────────────────────────────────────────────
create or replace function public.ai_grant_purchase_access(
  p_user_id uuid,
  p_purchase_id uuid,
  p_plan_id text,
  p_plan_version int,
  p_access_days int,
  p_ai_seconds_limit int default null,
  p_trial_window_minutes int default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.ai_course_access%rowtype;
  v_had_row boolean := false;
  v_days int := greatest(coalesce(p_access_days, 0), 0);
  v_apply boolean := true;
  v_guarded boolean := false;
  v_line text;
  v_note text;
  v_grant_id uuid;
  v_until timestamptz;
  v_from timestamptz;
  v_plan text;
begin
  if p_user_id is null or p_purchase_id is null then
    return jsonb_build_object('ok', false, 'code', 'bad_arguments');
  end if;
  -- 日数の無いプラン（6か月コース＝accessDays null）はここでは扱わない。
  -- 開始日・終了日を人が決める契約なので、機械が勝手に期間を作らない
  if v_days <= 0 then
    return jsonb_build_object('ok', false, 'code', 'no_access_days');
  end if;

  -- ① 冪等性の直列化点。同じ購入の再送・同時配信はここで止まる
  insert into public.ai_course_access_grants
    (purchase_id, user_id, plan_id, plan_version, access_days)
  values
    (p_purchase_id, p_user_id, p_plan_id, p_plan_version, v_days)
  on conflict (purchase_id) do nothing
  returning id into v_grant_id;

  if v_grant_id is null then
    select * into v_existing from public.ai_course_access where user_id = p_user_id;
    return jsonb_build_object(
      'ok', true, 'already', true, 'downgradeGuarded', false,
      'validFrom', v_existing.valid_from, 'validUntil', v_existing.valid_until,
      'planId', v_existing.plan_id);
  end if;

  -- ② 現在の受講権を行ロックで読む
  select * into v_existing from public.ai_course_access where user_id = p_user_id for update;
  v_had_row := found;

  -- ③ 格下げガード。**いま有効な受講権のほうが強いときだけ**属性を守る
  if v_had_row
     and now() <= v_existing.valid_until
     and public.ai_plan_rank(v_existing.plan_id) > public.ai_plan_rank(p_plan_id)
  then
    v_apply := false;
    v_guarded := true;
  end if;

  -- ④ note は上書きせず追記する（手動発行の契約メモを購入で消さない）
  v_line := coalesce(nullif(p_note, ''), '購入自動発行')
    || case when v_guarded then '（上位の受講権を維持し、期間のみ延長）' else '' end;
  v_note := case
    when coalesce(v_existing.note, '') = '' then v_line
    else right(v_existing.note || E'\n' || v_line, 1000)
  end;

  -- ⑤ 反映（1文で原子的に行う。valid_until の加算は競合時も既存値から計算される）
  insert into public.ai_course_access as a (
    user_id, valid_from, valid_until, note, granted_by,
    plan_id, plan_version, source, ai_seconds_limit,
    trial_window_minutes, trial_started_at, purchase_id, updated_at
  ) values (
    p_user_id, now(), now() + make_interval(hours => v_days * 24), v_note,
    'ai-course-stripe-webhook',
    p_plan_id, p_plan_version, 'purchase', p_ai_seconds_limit,
    p_trial_window_minutes, null, p_purchase_id, now()
  )
  on conflict (user_id) do update set
    -- 期間は必ず延長。残っていれば足す・切れていれば今から
    valid_until          = greatest(a.valid_until, now()) + make_interval(hours => v_days * 24),
    -- 以下は「格下げでない」ときだけ入れ替える
    valid_from           = case when v_apply then now() else a.valid_from end,
    granted_by           = case when v_apply then 'ai-course-stripe-webhook' else a.granted_by end,
    plan_id              = case when v_apply then p_plan_id else a.plan_id end,
    plan_version         = case when v_apply then p_plan_version else a.plan_version end,
    source               = case when v_apply then 'purchase' else a.source end,
    ai_seconds_limit     = case when v_apply then p_ai_seconds_limit else a.ai_seconds_limit end,
    trial_window_minutes = case when v_apply then p_trial_window_minutes else a.trial_window_minutes end,
    -- 体験パスを買い直したら「開始前」へ戻す（60分がまた使える）
    trial_started_at     = case when v_apply then null else a.trial_started_at end,
    -- 返金時の取り消し対象。格下げのときは上位の購入を指したまま動かさない
    purchase_id          = case when v_apply then p_purchase_id else a.purchase_id end,
    note                 = v_note,
    updated_at           = now()
  returning a.valid_from, a.valid_until, a.plan_id into v_from, v_until, v_plan;

  update public.ai_course_access_grants
     set downgrade_guarded = v_guarded
   where id = v_grant_id;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'downgradeGuarded', v_guarded,
    'hadRow', v_had_row,
    'validFrom', v_from,
    'validUntil', v_until,
    'planId', v_plan
  );
end;
$$;

comment on function public.ai_grant_purchase_access(uuid, uuid, text, int, int, int, int, text) is
  '購入を受講権へ反映する。期間は必ず延長し、上位の受講権は上書きしない。同じ purchase_id の再実行は何もしない（冪等）';

revoke all on function public.ai_grant_purchase_access(uuid, uuid, text, int, int, int, int, text)
  from public, anon, authenticated;
grant execute on function public.ai_grant_purchase_access(uuid, uuid, text, int, int, int, int, text)
  to service_role;

-- ────────────────────────────────────────────────
-- D. ai_plan_purchases.status の CHECK を広げる
--    既存値（pending / paid / provisioned / failed）はすべて合格するので、
--    **既存8行に変更は起きない**。
--    制約名は作成時のデフォルト（ai_plan_purchases_status_check）だが、
--    リモートで別名になっている可能性に備えて status を参照する CHECK を総当りで外す。
-- ────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'ai_plan_purchases'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%provisioned%'
  loop
    execute format('alter table public.ai_plan_purchases drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.ai_plan_purchases
  add constraint ai_plan_purchases_status_check
  check (status in ('pending', 'awaiting_payment', 'paid', 'provisioned', 'failed', 'refunded'));

comment on column public.ai_plan_purchases.status is
  'pending=セッション作成 / awaiting_payment=非同期決済(Alipay・WeChat Pay)の入金待ち / paid=決済確認 / provisioned=アカウント発行・メール送信完了 / failed=発行失敗（要手動対応） / refunded=返金済み';
