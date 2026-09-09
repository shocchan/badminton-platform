-- 受講権の付与RPCを本番へ入れ直す（2026-09-09 実決済テストで発覚）
--
-- 【何が起きたか】
-- CEOが本番で¥600をカード決済。Stripeは正常に決済し、webhookも届き、
-- 学習アカウント（s7fc67a3）と signup grant まで作られた。
-- そこから受講権を付ける段で、こう落ちた:
--
--   access grant failed: 404 PGRST202
--   Could not find the function public.ai_grant_purchase_access(...) in the schema cache
--
-- 実際に本番DBを見ると、20260824140000_ai_course_access_extend.sql のうち
--   A. ai_course_access_grants テーブル
--   B. ai_plan_rank 関数
--   C. ai_grant_purchase_access 関数
-- が**1つも存在していなかった**（列の追加とCHECKだけが別経路で入っていた）。
-- webhook 側は 2026-08-27 のデプロイでこのRPCを呼ぶようになっていたので、
-- **8/27以降に誰かが支払っていたら、課金だけされてアカウントは渡らなかった。**
-- 今回の実決済テストで初めて表に出た。
--
-- 【このファイルの範囲】
-- 20260824140000 の A・B・C だけを、内容を変えずにそのまま入れる。
-- **D（ai_plan_purchases.status の CHECK）は含めない。**
-- 2026-09-09 に 20260909100000 で 'expired' を足しており、
-- 元ファイルのDを流すと 'expired' が消えて ai_expire_purchase が壊れるため。
--
-- 全文が冪等（create table if not exists / create or replace function /
-- create index if not exists / drop policy if exists）なので、
-- 万一すでに一部が入っていても安全に流せる。
--
-- rollback: 20260909150000_ai_grant_purchase_access_repair.rollback.sql

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
