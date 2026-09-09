-- 7日間の実力診断（無料）を、招待リンクから配れるようにする。2026-09-10 CEO決定。
--
-- ■ 何を配るか
--   JLPT本番まで約3か月のこの時期に、在日中国語話者がいちばん欲しいのは
--   「勉強する機会」ではなく「自分がいまどこにいて、あと何をやればいいか」。
--   だから商品名は「無料お試し」ではなく **7日間の実力診断**。
--   中身: 診断（8分）／ミニ模試/技能別準備度／錯題本／冒険は最初の3地域まで／**AI会話は0回**。
--
-- ■ なぜ招待リンク限定か
--   料金表には載せない（planCatalog で status='draft'）。¥600の体験パスと並べると
--   下位互換に見えるため。リンクを踏んだ人にだけ現れる形にする。
--
-- ■ ここで解く問題（いまの穴）
--   ai_redeem_invite は signup_grants を作るだけで、**受講権（ai_course_access）を作らない**。
--   だから招待から登録した人は、ログイン直後に「コースが開通していません」で止まる。
--   ここを埋めないと無料枠は成立しない。
--
--   フロントには一切触らない。学習者行ができた瞬間にDB側で受講権を作る
--   （他セッションが AdvShell / AiCoursePage を編集中のため、衝突する変更を持ち込まない）。
--
-- ■ 経路を分ける
--   小紅書・朋友圈・生徒紹介で**別のコード**を配る。どこから来たかが分かると、
--   次にどこへ配るかを数字で決められる。channel は招待→受講権まで持ち回る。
--
-- 追加中心。既存の列・関数の意味は変えない。rollback は同名の .rollback.sql。

-- ── 1. 招待コードに「何を配るか」を持たせる ────────────────────────────
-- これまでの招待は「登録してよい」だけを意味していた。プランと日数を持たせて、
-- 同じ仕組みで無料枠・別キャンペーンを配れるようにする。
alter table public.ai_course_invites
  add column if not exists plan_id     text,
  add column if not exists access_days integer,
  add column if not exists channel     text;

comment on column public.ai_course_invites.plan_id is
  'この招待で付ける受講権のプラン（planCatalog の PlanId。例 free-7d）。null＝受講権を作らない（従来どおり登録許可だけ）';
comment on column public.ai_course_invites.access_days is
  '受講権の日数。null かつ plan_id ありのときは 7 日を既定にする';
comment on column public.ai_course_invites.channel is
  '配布経路（xhs / moments / student_referral / other）。どこから来たかを受講権まで持ち回る';

-- ── 2. 登録許可（grant）にも同じ情報を持たせる ──────────────────────
-- 招待の照合と、学習者行ができる瞬間は別のタイミング（OTP を挟む）。
-- 招待の内容をここへ写しておかないと、学習者行ができた時点で何を配るか分からない。
alter table public.ai_course_signup_grants
  add column if not exists plan_id     text,
  add column if not exists access_days integer,
  add column if not exists channel     text;

-- ── 3. 招待の照合で、配る内容を grant へ写す ──────────────────────────
-- 既存の判定（有効・期限・回数・宛先メール）は**1行も変えない**。写す3列を足すだけ。
create or replace function public.ai_redeem_invite(p_code text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invite public.ai_course_invites%rowtype;
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  select * into v_invite from public.ai_course_invites
  where code = p_code and is_active limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_invite');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'invite_expired');
  end if;
  if v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'invite_exhausted');
  end if;
  if v_invite.allowed_email is not null and lower(v_invite.allowed_email) <> v_email then
    return jsonb_build_object('ok', false, 'reason', 'invite_email_mismatch');
  end if;

  -- 既にlearnerがある（＝登録済み）なら grant は不要。再ログインは通常のOTPで行う。
  insert into public.ai_course_signup_grants
    (email, invite_id, expires_at, is_test, plan_id, access_days, channel)
  values
    (v_email, v_invite.id, now() + interval '24 hours', v_invite.is_test,
     v_invite.plan_id, v_invite.access_days, v_invite.channel)
  on conflict (email) do update
    set invite_id   = excluded.invite_id,
        granted_at  = now(),
        expires_at  = excluded.expires_at,
        consumed_at = null,
        is_test     = excluded.is_test,
        plan_id     = excluded.plan_id,
        access_days = excluded.access_days,
        channel     = excluded.channel;

  return jsonb_build_object('ok', true, 'isTest', v_invite.is_test, 'planId', v_invite.plan_id);
end;
$function$;

-- ── 4. 学習者行ができた瞬間に受講権を作る ────────────────────────────
-- なぜトリガーか: 受講権はRLSで本人が作れない（作れたら誰でも自分に配れてしまう）。
-- かといってアプリから別RPCを呼ぶ形にすると、いま他セッションが編集中の
-- AiCoursePage を触ることになる。**DB側で閉じるのがいちばん安全で、いちばん壊れにくい。**
--
-- 守ること:
--   - 既に受講権がある人には**触らない**（有料の受講権を無料枠で上書きしない）
--   - plan_id を持たない招待では何もしない（従来の招待の意味を変えない）
--   - grant を消費済みにする（同じ招待で何度も配らない）
--   - 失敗しても学習者行の作成は止めない（例外を投げない）
create or replace function public.ai_provision_access_from_grant()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_email text;
  v_grant public.ai_course_signup_grants%rowtype;
  v_days  integer;
begin
  select lower(u.email) into v_email from auth.users u where u.id = new.user_id;
  if v_email is null then return new; end if;

  select * into v_grant from public.ai_course_signup_grants
   where email = v_email and consumed_at is null
   limit 1;
  if not found or v_grant.plan_id is null then return new; end if;

  -- 既に受講権がある人は対象外。**弱いものが強いものを上書きしない**
  if exists (select 1 from public.ai_course_access a where a.user_id = new.user_id) then
    update public.ai_course_signup_grants
       set consumed_at = now() where email = v_email;
    return new;
  end if;

  v_days := coalesce(v_grant.access_days, 7);
  insert into public.ai_course_access
    (user_id, valid_from, valid_until, plan_id, source, note, granted_by)
  values
    (new.user_id, now(), now() + make_interval(days => v_days),
     v_grant.plan_id, 'invite',
     coalesce('招待から自動発行 / ' || v_grant.channel, '招待から自動発行'),
     'ai_provision_access_from_grant');

  update public.ai_course_signup_grants
     set consumed_at = now() where email = v_email;
  return new;
exception when others then
  -- 受講権を作れなくても、学習者の登録そのものは通す（あとから手で付けられる）
  raise warning 'ai_provision_access_from_grant failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.ai_provision_access_from_grant() from public, anon, authenticated;

drop trigger if exists ai_learners_provision_access on public.ai_learners;
create trigger ai_learners_provision_access
  after insert on public.ai_learners
  for each row execute function public.ai_provision_access_from_grant();

-- ── 5. 経路つきの招待コードを発行する（管理者だけ） ──────────────────
create or replace function public.ai_admin_issue_invite(
  p_label       text,
  p_channel     text,
  p_plan_id     text default 'free-7d',
  p_access_days integer default 7,
  p_max_uses    integer default 100,
  p_expires_at  timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_code text;
  v_id uuid;
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- 紛らわしい字（0/O/1/I/L/U）を使わない8桁。学習コード・紹介コードと同じ文字集合
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTVWXYZ',
                           1 + floor(random() * 30)::int, 1), '')
    into v_code from generate_series(1, 8);

  insert into public.ai_course_invites
    (code, label, max_uses, expires_at, is_active, is_test, plan_id, access_days, channel)
  values
    (v_code, left(coalesce(p_label, ''), 80), p_max_uses, p_expires_at, true, false,
     p_plan_id, p_access_days, p_channel)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code,
                            'planId', p_plan_id, 'channel', p_channel);
end;
$$;

revoke all on function public.ai_admin_issue_invite(text, text, text, integer, integer, timestamptz)
  from public, anon;
grant execute on function public.ai_admin_issue_invite(text, text, text, integer, integer, timestamptz)
  to authenticated, service_role;

-- ── 6. AI会話の枠に free-7d を足す ──────────────────────────────────
-- **これを入れないと無料枠がタダで会話できてしまう。** ai_start_session は
-- 知らない plan_id を「従来どおりの共通上限」として通す（フェイルオープン）ので、
-- 0 を明示的に置く必要がある。
--
-- 値は src/lib/aiLesson/course/plans/planAiBudget.ts の PLAN_AI_BUDGETS と同じ。
-- 全体を置き直しているので、この1か所を読めば「いまの実効値」が分かる
-- （planAiBudget.test.ts が migration を時系列に読んで一致を機械検査している）。
insert into public.ai_config (key, value)
values ('plan_ai_budgets', '{
  "free-7d":       {"voiceSessionsTotal": 0,   "voiceSessionsPerDay": 0, "textSessionsPerDay": 0},
  "ai-trial-pass": {"voiceSessionsTotal": 3,   "voiceSessionsPerDay": 2, "textSessionsPerDay": 4},
  "ai-month":      {"voiceSessionsTotal": 8,   "voiceSessionsPerDay": 2, "textSessionsPerDay": 8},
  "coach-6m":      {"voiceSessionsTotal": 180, "voiceSessionsPerDay": 3, "textSessionsPerDay": 8}
}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ── 7. 受講権の強さに free-7d を足す ────────────────────────────────
-- **これが無いと無料枠が「未知のプラン＝最強(100)」に落ちる。**
-- 最強だと、有料の受講権を無料枠の行が上書きできてしまう（¥100,000 の6か月が
-- 7日間に化ける経路になる）。無料はいちばん弱い 5 に置く。
-- 数字は src/lib/aiLesson/course/plans/planEntitlements.ts の PLAN_STRENGTH_RANK と同じ
-- （planAccessExtension.test.ts が SQL と TS の一致を機械検査している）。
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
    when 'free-7d'       then 5    -- 無料枠。有料の受講権を絶対に上書きしない
    else 100                       -- 未知のプランは弱いと決めつけない（フェイルセーフ）
  end;
$$;

comment on function public.ai_plan_rank(text) is
  '受講権の強さ。大きいほど強い。NULL（手動発行）と未知のプランは100＝最強。無料枠(free-7d)は5＝最弱';

comment on function public.ai_provision_access_from_grant() is
  '招待（plan_id つき）から登録した人に受講権を自動で作る。既に受講権がある人には触らない';
comment on function public.ai_admin_issue_invite(text, text, text, integer, integer, timestamptz) is
  '経路つきの招待コードを発行する（管理者専用）。小紅書・朋友圈・生徒紹介で別コードを配るため';
