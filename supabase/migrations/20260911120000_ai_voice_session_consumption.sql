-- ===================================================
-- AI会話: 会話が成立していない回は「回数」を消費しない（2026-09-11 CEO指示）
--
-- ■ 何が起きていたか
--   週3回の枠と回数券は、ai_start_session で**予約した瞬間**に1回ぶん減っていた。
--   接続する前に閉じた回、前の回の自動打ち切り（superseded-new）、0秒の回も、会話ゼロのまま減る。
--   QAアカウントでは回数券4枚のうち2枚が 0秒の superseded-new で消えた（¥300 の券でも同じことが起きる）。
--
-- ■ ルール（CEO指示）
--   実質的なAI会話が成立していない session は回数を消費しない。
--   ただし、会話が成立したあとの手動終了では返さない。
--
-- ■ 「会話成立」の定義は、このファイルの ai_voice_conversation_established() の1か所だけ。
--   クライアントは数を数えて送るだけで、しきい値を持たない。
--
-- ■ なぜ ai_learning_sessions の値（duration_seconds・completion_status・end_reason）で決めないか
--   ai_learning_sessions は本人が**全列を書き換えられる**（update ポリシーに WITH CHECK が無い）。
--   「0秒・中断なら返す」にすると、6分話してから 0秒・中断に書き換えるだけで回数が戻る。
--   そこで回数の状態は、本人が書けない新しい台帳 ai_voice_session_ledger に置く。
--   週の数え方も、本人が書き換えられる started_at / mode ではなく台帳で数える
--   （書き換えで週の枠を空ける抜け道も、ここで一緒に塞がる）。
--
-- ■ 判定の段階（ai_voice_settle_pending）
--   1. AIの会話トークンが一度も発行されていない回 → 必ず消費しない
--      （接続前に閉じた／マイク拒否／トークン取得失敗／接続前の自動打ち切り。OpenAI の費用も発生していない）
--      トークンの発行は Edge Function ai-lesson-token が、**発行する前に**台帳へ書く（書けなければ出さない）。
--      ※ 台帳へ書く版の Edge Function が動き始めた時刻（最初の記録）より後に予約した回にだけ使う。
--        それより前は、台帳へ書かない古い版がトークンを出していたかもしれないため、3 と同じ扱いにする。
--   2. 会話成立の報告が来た回 → その時点で消費する（回数券の回はここで1枚引く）
--   3. トークンは出たが、会話成立の報告が無いまま終わった回
--      - 材料を送らない版の画面（更新前のまま開いている画面）から始めた回 → これまでどおり消費する
--      - 一度もつながらなかったと報告された回（接続失敗・中国本土の回線など） → 直近7日で setupFailPerWeek 回まで消費しない
--      - つながったが会話にならなかった回（接続直後に閉じた・あいさつだけ・数秒で中断） → 直近7日で forgivePerWeek 回まで消費しない
--      - それを超えたら消費する。報告を送らない・偽る改造クライアントでタダで話し続ける抜け道の上限
--
-- ■ 回数券を引くタイミング
--   これまで: 予約した時点で -1。
--   今後:     会話が成立した時点で -1。成立しなければ引かない（返金の行を作る必要が無い）。
--
-- ■ 既存の行
--   この migration より前の音声セッションは、台帳へ「消費した回」として写す（これまでどおり数える）。
--   実在の生徒の既存の行（セッション・回数券）は1行も書き換えない。台帳へ行を足すだけ。
--
-- ■ 本番へ出す順番（docs/ai-course/knowledge/VOICE_CONSUMPTION_2026-09-11.md）
--   この migration → 直後に下の「既存の音声セッションを台帳へ写す」insert をもう一度だけ流す
--   （適用中に古い ai_start_session で作られた回を拾う。何度流しても同じ）
--   → すぐに Edge Function ai-lesson-token → すぐに1回トークンを取る（最初の記録を入れる）→ 画面。
--   どの順番で出ても、無料で話し放題にはならない（上の 1 の※と、3 の「材料を送らない版」）。
--   ⚠️ この migration を入れたまま、Edge Function だけを台帳へ書かない古い版へ戻してはいけない。
--      戻すときは、先に（または同時に）この migration の rollback を流す。
-- ===================================================

-- ── 0. 前回の「台帳へ書く版が動き始めた時刻」を消す ──
-- この migration を入れるたびに、Edge Function の最初の記録からやり直す。
-- 残っていると、rollback のあとで入れ直したとき、台帳へ書かない古い版が動いている間の回が
-- 「トークン無し＝消費しない」になり、話し放題になる
delete from public.ai_config where key = 'voice_claim_live_since';

-- ── 1. 回数の台帳（サーバーだけが書く） ──
create table if not exists public.ai_voice_session_ledger (
  session_id uuid primary key references public.ai_learning_sessions(id) on delete cascade,
  learner_id uuid not null references public.ai_learners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 予約した時刻（サーバーの時計）。週の数え方はこれで行う
  reserved_at timestamptz not null default now(),
  -- 週の枠の回（free）か、回数券を使う回（credit）か。予約時に決める
  charge_kind text not null check (charge_kind in ('free', 'credit')),
  session_max_seconds int not null,
  -- AIの会話トークンを発行した回数と時刻（ai-lesson-token が発行の前に書く）
  token_count int not null default 0 check (token_count >= 0),
  token_first_at timestamptz,
  token_last_at timestamptz,
  -- この回の画面が、会話成立の材料を送る版か（トークンを取るときに Edge Function が書く）
  reports_evidence boolean not null default false,
  -- 会話成立の材料（クライアントが送った数の最大値。減らせない）
  evidence jsonb not null default '{}'::jsonb,
  evidence_at timestamptz,
  established_at timestamptz,
  -- pending＝まだ決まっていない / consumed＝消費した / not_consumed＝消費しない
  outcome text not null default 'pending' check (outcome in ('pending', 'consumed', 'not_consumed')),
  outcome_reason text,
  settled_at timestamptz,
  -- 回数券を引いた行
  credit_entry_id uuid references public.ai_conversation_credits(id) on delete set null
);

comment on table public.ai_voice_session_ledger is
  'AI会話の回数の台帳。会話が成立しなかった回は消費しない。サーバー（security definer 関数）だけが書く（2026-09-11）';

create index if not exists ai_voice_session_ledger_learner_idx
  on public.ai_voice_session_ledger (learner_id, reserved_at desc);

alter table public.ai_voice_session_ledger enable row level security;
-- 本人にも見せない・書かせない（読み書きは下の関数からだけ）
revoke all on public.ai_voice_session_ledger from anon, authenticated;

-- 同じ回で回数券を2枚引かない（事前確認: 本番に重複 0 件）
create unique index if not exists ai_conversation_credits_session_charge_uniq
  on public.ai_conversation_credits (session_id)
  where reason = 'session' and session_id is not null;

-- この migration より前の音声セッションを、台帳へ「消費した回」として写す（これまでどおり数える）。
-- 事前確認（本番・件数だけ）: 音声セッション 41 行・回数券を使った回 5 行。既存の行は書き換えない。
-- 本人が書き換えられる started_at / mode の値は、この時点のものを台帳へ固定する（あとで書き換えても数は減らない）。
insert into public.ai_voice_session_ledger
  (session_id, learner_id, user_id, reserved_at, charge_kind, session_max_seconds,
   token_count, outcome, outcome_reason, settled_at, credit_entry_id)
select s.id, s.learner_id, l.user_id, coalesce(s.started_at, s.created_at, now()),
       case when c.id is not null then 'credit' else 'free' end,
       case when c.id is not null then 360 else 240 end,
       0, 'consumed', 'legacy_before_ledger', now(), c.id
  from public.ai_learning_sessions s
  join public.ai_learners l on l.id = s.learner_id
  left join lateral (
    select cc.id
      from public.ai_conversation_credits cc
     where cc.session_id = s.id and cc.reason = 'session'
     order by cc.created_at
     limit 1
  ) c on true
 where s.mode = 'voice'
on conflict (session_id) do nothing;

-- ── 2. 運用の上限（会話成立の定義ではない） ──
create or replace function public.ai_voice_consumption_rule()
returns jsonb
language sql immutable
set search_path = public
as $$
  select jsonb_build_object(
    -- つながったが会話にならなかった回を「消費しない」にできる回数（直近7日）
    'forgivePerWeek', 2,
    -- 一度もつながらなかった回（接続失敗）を「消費しない」にできる回数（直近7日）
    'setupFailPerWeek', 3,
    -- 1回の予約で発行できるトークンの数（再試行2回＋先生の切り替え）
    'maxTokensPerSession', 5,
    -- 予約からトークンを発行できる時間（ai-lesson-token の従来の10分と同じ）
    'tokenWindowMinutes', 10,
    -- 進行中のままの回を「終わった」とみなすまでの時間
    'settleAfterMinutes', 20,
    -- 「消費しない」と決めたあとで会話成立の報告が届いたとき、消費へ直せる時間
    'lateEvidenceMinutes', 30,
    -- 接続時間の上限を切るときの余裕（サーバーとブラウザの時計のずれ）
    'evidenceSlackSeconds', 5
  );
$$;

-- 台帳へ書く版の Edge Function が動き始めた時刻（最初にトークン発行を記録したとき、ai_config に残す）
create or replace function public.ai_voice_claim_live_since()
returns timestamptz
language sql stable
set search_path = public
as $$
  select (value #>> '{}')::timestamptz from public.ai_config where key = 'voice_claim_live_since';
$$;

-- ── 3. 会話成立の定義（ここだけ） ──
--
-- 材料（クライアントが数えてサーバーの台帳へ送る。台帳では最大値だけを残す）:
--   userTurns          … 生徒の有効な発話の数（咳・相づち・雑音は isMeaningfulUserTurn で除外済み）
--   aiRepliesAfterUser … 生徒が話し終えたあとに、AI が応答した数
--   tutorTurns         … AI が話した数（最初のあいさつを含む）
--   userSpeechStarts   … 生徒の声をマイクが拾った回数（短い相づちも含む）
--   connectedMs        … 実際につながっていた時間（切断中・エラー画面の時間は含めない。
--                         サーバー側で「最初のトークン発行からの実時間」を上限に切る）
--
-- 成立する（＝回数を消費する）:
--   ① 生徒が2回以上ちゃんと話し、AI が2回以上応答した
--      （画面の案内どおり「こんにちは」と言って先生が最初の質問をした、だけでは成立しない。
--        その質問に答えて、先生がまた返したら成立）
--   ② または、生徒が一度でも声を出していて、AI が話していて、90秒以上つながっていた（聞くだけで長く使った回）
-- 成立しない（＝消費しない）:
--   接続直後に閉じた／あいさつだけ／生徒が話したが AI が応答しないまま終わった／
--   数秒で中断した／AI が一度も話さなかった／生徒の声が一度も届かなかった
--
-- 部品: 送られてきた材料の数を安全に取り出す（数値でなければ0・負数は0・上限で切る）。
-- 定義より先に作る（SQL の関数は、作るときに中で呼ぶ関数があるかを確かめるため）
create or replace function public.ai_voice_evidence_int(p jsonb, k text, p_max bigint)
returns bigint
language sql immutable
set search_path = public
as $$
  select case
    when p is not null and jsonb_typeof(p) = 'object' and jsonb_typeof(p -> k) = 'number'
      then least(greatest(floor((p ->> k)::numeric), 0), greatest(p_max, 0))::bigint
    else 0
  end;
$$;

create or replace function public.ai_voice_conversation_established(p_evidence jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select
    (public.ai_voice_evidence_int(p_evidence, 'userTurns', 1000) >= 2
      and public.ai_voice_evidence_int(p_evidence, 'aiRepliesAfterUser', 1000) >= 2)
    or
    (public.ai_voice_evidence_int(p_evidence, 'connectedMs', 86400000) >= 90000
      and public.ai_voice_evidence_int(p_evidence, 'tutorTurns', 1000) >= 1
      and public.ai_voice_evidence_int(p_evidence, 'userSpeechStarts', 1000) >= 1);
$$;

-- ── 4. 消費を確定する（回数券の回はここで1枚引く・同じ回で2枚は引かない） ──
create or replace function public.ai_voice_mark_consumed(p_session_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.ai_voice_session_ledger%rowtype;
  v_credit uuid;
  v_week_cap int;
  v_other int;
begin
  select * into v from public.ai_voice_session_ledger where session_id = p_session_id for update;
  if not found or v.outcome = 'consumed' then
    return;
  end if;

  -- 週の枠の回として予約した回でも、消費する時点で週の枠がもう埋まっていたら回数券の回にする。
  -- 前の回を「終了して新しく始める」で閉じたあとに、その回の成立の報告が遅れて届いた場合など。
  -- そうしないと、週の上限を超えて週の枠の回が増える（残高は負になりうる。画面は0未満を出さない）
  if v.charge_kind = 'free' then
    select coalesce((value ->> 'perWeek')::int, 3) into v_week_cap
      from public.ai_config where key = 'conversation_beta';
    select count(*) into v_other
      from public.ai_voice_session_ledger
     where learner_id = v.learner_id
       and session_id <> v.session_id
       and outcome = 'consumed'
       and reserved_at >= now() - interval '7 days';
    if v_other >= coalesce(v_week_cap, 3) then
      v.charge_kind := 'credit';
      update public.ai_voice_session_ledger set charge_kind = 'credit' where session_id = p_session_id;
    end if;
  end if;

  if v.charge_kind = 'credit' and v.credit_entry_id is null then
    insert into public.ai_conversation_credits (user_id, delta, reason, session_id, note)
      values (v.user_id, -1, 'session', v.session_id, 'voice:' || p_reason)
      on conflict (session_id) where reason = 'session' and session_id is not null do nothing
      returning id into v_credit;
  end if;

  update public.ai_voice_session_ledger
     set outcome = 'consumed',
         outcome_reason = p_reason,
         settled_at = now(),
         credit_entry_id = coalesce(credit_entry_id, v_credit)
   where session_id = p_session_id;
end;
$$;

-- ── 5. 終わった回の「消費する／しない」を決める ──
-- 呼ぶのは ai_start_session と ai_my_conversation_budget（どちらも本人の learner だけ）
create or replace function public.ai_voice_settle_pending(p_learner_id uuid)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_rule jsonb := public.ai_voice_consumption_rule();
  v_live timestamptz := public.ai_voice_claim_live_since();
  r record;
  v_reason text;
  v_cap int;
  v_used int;
  v_n int := 0;
begin
  for r in
    select l.session_id, l.token_count, l.reserved_at, l.reports_evidence, l.evidence, l.evidence_at
      from public.ai_voice_session_ledger l
      left join public.ai_learning_sessions s on s.id = l.session_id
     where l.learner_id = p_learner_id
       and l.outcome = 'pending'
       and (s.id is null
            or s.completion_status is distinct from 'in_progress'
            or l.reserved_at < now() - make_interval(mins => (v_rule ->> 'settleAfterMinutes')::int))
     order by l.reserved_at
     for update of l
  loop
    v_n := v_n + 1;

    -- 段階1: トークンが一度も出ていない＝会話はありえなかった（台帳へ書く版が動き始めた後の予約だけ）
    if r.token_count = 0 and v_live is not null and r.reserved_at >= v_live then
      update public.ai_voice_session_ledger
         set outcome = 'not_consumed', outcome_reason = 'no_token', settled_at = now()
       where session_id = r.session_id;
      continue;
    end if;

    -- 材料を送らない版の画面から始めた回は、これまでどおり消費する
    -- （更新前の画面を開いたままの人の会話を、報告が無いからといってタダにしない）
    if r.token_count > 0 and not r.reports_evidence then
      perform public.ai_voice_mark_consumed(r.session_id, 'legacy_client');
      continue;
    end if;

    -- 段階3: トークンは出たが会話成立の報告が無い
    if r.token_count > 0
       and r.evidence_at is not null
       and public.ai_voice_evidence_int(r.evidence, 'connectedMs', 86400000) = 0
       and public.ai_voice_evidence_int(r.evidence, 'tutorTurns', 1000) = 0
       and public.ai_voice_evidence_int(r.evidence, 'userTurns', 1000) = 0
       and public.ai_voice_evidence_int(r.evidence, 'userSpeechStarts', 1000) = 0 then
      v_reason := 'setup_failed';
      v_cap := (v_rule ->> 'setupFailPerWeek')::int;
    else
      v_reason := 'not_established';
      v_cap := (v_rule ->> 'forgivePerWeek')::int;
    end if;

    select count(*) into v_used
      from public.ai_voice_session_ledger
     where learner_id = p_learner_id
       and outcome = 'not_consumed'
       and outcome_reason = v_reason
       and reserved_at >= now() - interval '7 days';

    if v_used < v_cap then
      update public.ai_voice_session_ledger
         set outcome = 'not_consumed', outcome_reason = v_reason, settled_at = now()
       where session_id = r.session_id;
    else
      perform public.ai_voice_mark_consumed(r.session_id, 'unestablished_over_cap');
    end if;
  end loop;
  return v_n;
end;
$$;

-- ── 6. 使った回数を数える（週・今日・受講期間の合計で共通） ──
-- 数える: 消費した回。p_include_pending のときは、トークンが出て進行中の回も（開始の判定だけ）。
-- 画面に出す残り（ai_my_conversation_budget）は消費した回だけを数える。
-- 閉じずに離れた回を数えると入口が「使い切りました」になり、「前の回を終了して新しく始める」へ進めないため。
create or replace function public.ai_voice_used_since(p_learner_id uuid, p_since timestamptz, p_include_pending boolean default true)
returns int
language sql stable
set search_path = public
as $$
  select count(*)::int
    from public.ai_voice_session_ledger l
   where l.learner_id = p_learner_id
     and l.reserved_at >= p_since
     and (l.outcome = 'consumed' or (p_include_pending and l.outcome = 'pending' and l.token_count > 0));
$$;

-- 数えた回のうち、いちばん古い回の時刻（「あと何日で1回もどるか」に使う）
create or replace function public.ai_voice_oldest_used_since(p_learner_id uuid, p_since timestamptz, p_include_pending boolean default true)
returns timestamptz
language sql stable
set search_path = public
as $$
  select min(l.reserved_at)
    from public.ai_voice_session_ledger l
   where l.learner_id = p_learner_id
     and l.reserved_at >= p_since
     and (l.outcome = 'consumed' or (p_include_pending and l.outcome = 'pending' and l.token_count > 0));
$$;

-- ── 7. トークン発行の記録（Edge Function ai-lesson-token が service_role で、発行の前に呼ぶ） ──
create or replace function public.ai_service_claim_voice_token(
  p_session_id uuid, p_user_id uuid, p_reports_evidence boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v public.ai_voice_session_ledger%rowtype;
  v_rule jsonb := public.ai_voice_consumption_rule();
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select * into v from public.ai_voice_session_ledger where session_id = p_session_id for update;
  if not found then
    -- 音声で予約されていない回（テキストの回）には音声トークンを出さない
    return jsonb_build_object('ok', false, 'code', 'not_voice_session');
  end if;
  if v.user_id is distinct from p_user_id then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if v.outcome = 'not_consumed' then
    -- 「消費しない」と決めた回を、あとから使い回させない
    return jsonb_build_object('ok', false, 'code', 'session_closed');
  end if;
  if now() > v.reserved_at + make_interval(mins => (v_rule ->> 'tokenWindowMinutes')::int) then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  end if;
  if v.token_count >= (v_rule ->> 'maxTokensPerSession')::int then
    return jsonb_build_object('ok', false, 'code', 'token_limit');
  end if;

  update public.ai_voice_session_ledger
     set token_count = token_count + 1,
         token_first_at = coalesce(token_first_at, now()),
         token_last_at = now(),
         reports_evidence = reports_evidence or coalesce(p_reports_evidence, false)
   where session_id = p_session_id;

  -- 台帳へ書く版の Edge Function が動き始めた時刻（最初の1回だけ残る）。
  -- 「トークン無し＝必ず消費しない」は、これより後に予約した回にだけ使う
  insert into public.ai_config (key, value)
    values ('voice_claim_live_since', to_jsonb(now()))
    on conflict (key) do nothing;

  return jsonb_build_object('ok', true, 'tokenCount', v.token_count + 1,
    'chargeKind', v.charge_kind, 'sessionMaxSeconds', v.session_max_seconds);
end;
$$;

-- OpenAI がトークンを返さなかったとき（ブラウザへ何も渡していない）だけ、記録を1つ戻す
create or replace function public.ai_service_release_voice_token(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  update public.ai_voice_session_ledger
     set token_count = token_count - 1,
         token_first_at = case when token_count - 1 = 0 then null else token_first_at end,
         token_last_at = case when token_count - 1 = 0 then null else token_last_at end
   where session_id = p_session_id
     and user_id = p_user_id
     and outcome = 'pending'
     and token_count > 0;

  return jsonb_build_object('ok', true, 'released', found);
end;
$$;

-- ── 8. 会話成立の材料を受け取る（クライアントが会話中に送る） ──
create or replace function public.ai_voice_report_evidence(p_session_id uuid, p_evidence jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v public.ai_voice_session_ledger%rowtype;
  v_rule jsonb := public.ai_voice_consumption_rule();
  v_live timestamptz := public.ai_voice_claim_live_since();
  v_max_ms bigint;
  v_merged jsonb;
  v_est boolean;
  v_outcome text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  select * into v from public.ai_voice_session_ledger where session_id = p_session_id for update;
  if not found or v.user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;
  if v.token_count = 0 and v_live is not null and v.reserved_at >= v_live then
    -- トークンが出ていない回は、つながっていない。何も記録しない
    return jsonb_build_object('ok', true, 'established', false, 'outcome', v.outcome, 'code', 'no_token');
  end if;

  -- つながっていた時間は「最初のトークン発行（無ければ予約）からの実時間」を超えられない（サーバーの時計で切る）
  v_max_ms := greatest(
    floor(extract(epoch from (now() - coalesce(v.token_first_at, v.reserved_at))) * 1000)::bigint
      + (v_rule ->> 'evidenceSlackSeconds')::int * 1000,
    0);

  -- 送られてきた数と、これまでの数の大きいほうを残す（あとから減らせない）
  v_merged := jsonb_build_object(
    'connectedMs', greatest(public.ai_voice_evidence_int(v.evidence, 'connectedMs', 86400000),
                            public.ai_voice_evidence_int(p_evidence, 'connectedMs', v_max_ms)),
    'userTurns', greatest(public.ai_voice_evidence_int(v.evidence, 'userTurns', 1000),
                          public.ai_voice_evidence_int(p_evidence, 'userTurns', 1000)),
    'aiRepliesAfterUser', greatest(public.ai_voice_evidence_int(v.evidence, 'aiRepliesAfterUser', 1000),
                                   public.ai_voice_evidence_int(p_evidence, 'aiRepliesAfterUser', 1000)),
    'tutorTurns', greatest(public.ai_voice_evidence_int(v.evidence, 'tutorTurns', 1000),
                           public.ai_voice_evidence_int(p_evidence, 'tutorTurns', 1000)),
    'userSpeechStarts', greatest(public.ai_voice_evidence_int(v.evidence, 'userSpeechStarts', 1000),
                                 public.ai_voice_evidence_int(p_evidence, 'userSpeechStarts', 1000))
  );
  v_est := public.ai_voice_conversation_established(v_merged);

  update public.ai_voice_session_ledger
     set evidence = v_merged,
         evidence_at = now(),
         established_at = case when v_est and established_at is null then now() else established_at end
   where session_id = p_session_id;

  if v_est then
    if v.outcome = 'pending' then
      perform public.ai_voice_mark_consumed(p_session_id, 'established');
    elsif v.outcome = 'not_consumed'
          and v.outcome_reason in ('not_established', 'setup_failed')
          and now() < v.reserved_at + make_interval(mins => (v_rule ->> 'lateEvidenceMinutes')::int) then
      -- 終了の処理が先に届いて「消費しない」になった回に、あとから成立の報告が届いた
      perform public.ai_voice_mark_consumed(p_session_id, 'established_late');
    end if;
  end if;

  select outcome into v_outcome from public.ai_voice_session_ledger where session_id = p_session_id;
  return jsonb_build_object('ok', true, 'established', v_est, 'outcome', v_outcome);
end;
$$;

-- ── 9. セッション開始（週の上限・回数券を台帳で数える） ──
CREATE OR REPLACE FUNCTION public.ai_start_session(p_mission_id text, p_lesson_kind text DEFAULT 'new'::text, p_mode text DEFAULT 'voice'::text, p_difficulty integer DEFAULT 2, p_target_expression text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_learner public.ai_learners%rowtype;
  v_access public.ai_course_access%rowtype;
  v_total_seconds bigint;
  v_limits jsonb;
  v_max_sessions int;
  v_max_seconds int;
  v_monthly_max_sessions int;
  v_monthly_max_seconds int;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_today_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Tokyo')) at time zone 'Asia/Tokyo';
  v_month_start date := date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
  v_usage public.ai_usage_daily%rowtype;
  v_month_sessions int;
  v_month_seconds int;
  v_active int;
  v_session_id uuid;
  -- プラン別の音声枠（2026-08-23 追加）
  v_mode text := coalesce(p_mode, 'voice');
  v_is_voice boolean := (coalesce(p_mode, 'voice') = 'voice');
  v_budgets jsonb;
  v_budget jsonb;
  v_voice_per_day int;
  v_voice_total int;
  v_text_per_day int;
  v_used_today int;
  v_used_total int;
  v_remaining_voice_total int := null;
  v_remaining_voice_today int := null;
  -- AI会話ベータ（2026-09-09 CEO指示）: 全員に週の上限をかけ、超えたぶんは回数券で使う
  v_beta jsonb;
  v_week_cap int;
  v_used_week int;
  v_credits int := 0;
  v_need_credit boolean := false;
  v_next_at timestamptz := null;
  v_session_seconds int;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;
  if not v_learner.is_active then
    return jsonb_build_object('ok', false, 'code', 'learner_suspended');
  end if;

  -- 同じ人の開始を1つずつ処理する（2つのタブで同時に押しても、回数券を二重に使わない）
  perform pg_advisory_xact_lock(hashtextextended('ai_start_session:' || v_learner.id::text, 0));
  -- 放置された回を閉じ、会話が成立しなかった回を「消費しない」に確定してから数える（2026-09-11）
  perform public.ai_release_stale_sessions(v_learner.id);
  perform public.ai_voice_settle_pending(v_learner.id);

  -- 閉じずに離れた音声の回（台帳でまだ決まっていない回）があるときは、回数の上限より先に案内する（2026-09-11）。
  -- その回がトークンを取っていると上限の数に入り、「今週は使い切りました」になって
  -- 「前の回を終了して新しく始める」へたどり着けないため。
  -- テキストの回はこれまでどおり上限のあとで確かめる（始められない音声のためにテキストを終わらせない）
  if exists (
    select 1
      from public.ai_learning_sessions s
      join public.ai_voice_session_ledger l on l.session_id = s.id
     where s.learner_id = v_learner.id
       and s.completion_status = 'in_progress'
       and l.outcome = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'code', 'session_already_active');
  end if;

  -- 受講権（利用期間・累計上限）のサーバー側チェック（2026-08-19 追加）。
  -- 行が無い learner と管理者は従来どおり通す（後方互換・段階導入）
  if not public.ai_is_admin() then
    select * into v_access from public.ai_course_access where user_id = auth.uid();
    if found then
      if now() < v_access.valid_from then
        return jsonb_build_object('ok', false, 'code', 'access_not_started');
      end if;
      if now() > v_access.valid_until then
        return jsonb_build_object('ok', false, 'code', 'access_expired');
      end if;
      -- AI体験パス等の累計上限（ai_seconds_limit・商品由来）。全期間の合計利用秒数で判定
      if v_access.ai_seconds_limit is not null then
        select coalesce(sum(seconds_used), 0) into v_total_seconds
          from public.ai_usage_daily where learner_id = v_learner.id;
        if v_total_seconds >= v_access.ai_seconds_limit then
          return jsonb_build_object('ok', false, 'code', 'plan_minutes_exhausted');
        end if;
      end if;

      -- ── プラン別の会話枠（2026-08-23）──
      -- plan_id が無い行（手動発行・既存の6か月生徒）は従来どおり共通上限のまま
      if v_access.plan_id is not null then
        select value into v_budgets from public.ai_config where key = 'plan_ai_budgets';
        v_budget := v_budgets -> v_access.plan_id;
        if v_budget is not null then
          v_voice_per_day := coalesce((v_budget->>'voiceSessionsPerDay')::int, 999);
          v_voice_total   := coalesce((v_budget->>'voiceSessionsTotal')::int, 999999);
          v_text_per_day  := coalesce((v_budget->>'textSessionsPerDay')::int, 999);

          -- 今日ぶん（JST）。mode ごとに数える＝テキストは音声の枠を減らさない。
          -- 音声は台帳で数える＝会話が成立しなかった回は数えない（2026-09-11）
          if v_is_voice then
            v_used_today := public.ai_voice_used_since(v_learner.id, v_today_start);
          else
            select count(*) into v_used_today from public.ai_learning_sessions
              where learner_id = v_learner.id
                and mode = v_mode
                and (started_at at time zone 'Asia/Tokyo')::date = v_today;
          end if;

          if v_is_voice then
            if v_used_today >= v_voice_per_day then
              return jsonb_build_object('ok', false, 'code', 'plan_voice_daily_limit',
                'voicePerDay', v_voice_per_day);
            end if;
            -- 受講期間ぜんぶの合計（この受講権が始まってから数える）
            v_used_total := public.ai_voice_used_since(v_learner.id, v_access.valid_from);
            if v_used_total >= v_voice_total then
              return jsonb_build_object('ok', false, 'code', 'plan_voice_total_exhausted',
                'voiceTotal', v_voice_total);
            end if;
            v_remaining_voice_total := greatest(v_voice_total - (v_used_total + 1), 0);
            v_remaining_voice_today := greatest(v_voice_per_day - (v_used_today + 1), 0);
          else
            if v_used_today >= v_text_per_day then
              return jsonb_build_object('ok', false, 'code', 'plan_text_daily_limit',
                'textPerDay', v_text_per_day);
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  /*
   * ── AI会話は「週◯回まで」（2026-09-09 CEO指示・全員に適用）──────────────
   * 窓は直近7日（ローリング）。上限を超えた人は、回数券があればそれを使って続けられる。
   *
   * 2026-09-11: 数えるのは「会話が成立した回（とトークンが出て進行中の回）」だけ。
   * 回数券は**ここでは引かない**。会話が成立した時点で ai_voice_mark_consumed が引く。
   */
  if v_is_voice then
    select value into v_beta from public.ai_config where key = 'conversation_beta';
    v_week_cap := coalesce((v_beta->>'perWeek')::int, 3);

    v_used_week := public.ai_voice_used_since(v_learner.id, now() - interval '7 days');

    if v_used_week >= v_week_cap then
      select coalesce(sum(delta), 0) into v_credits
        from public.ai_conversation_credits where user_id = auth.uid();
      if v_credits <= 0 then
        -- いつ戻るかを必ず返す。「使えません」だけで終わらせない
        v_next_at := public.ai_voice_oldest_used_since(v_learner.id, now() - interval '7 days')
          + interval '7 days';
        return jsonb_build_object('ok', false, 'code', 'voice_weekly_limit',
          'perWeek', v_week_cap, 'usedThisWeek', v_used_week, 'nextAvailableAt', v_next_at,
          'credits', 0);
      end if;
      v_need_credit := true;
    end if;
  end if;

  -- 同時アクティブセッション（別タブ・二重起動の防止）
  select count(*) into v_active from public.ai_learning_sessions
    where learner_id = v_learner.id and completion_status = 'in_progress';
  if v_active > 0 then
    return jsonb_build_object('ok', false, 'code', 'session_already_active');
  end if;

  select value into v_limits from public.ai_config where key = 'usage_limits';
  v_max_sessions := coalesce((v_limits->>'daily_max_sessions')::int, 10);
  v_max_seconds  := coalesce((v_limits->>'daily_max_seconds')::int, 2700);
  -- 月次上限は learner個別指定（admin_overrides.monthlyMaxSessions）を最優先
  v_monthly_max_sessions := coalesce(
    (v_learner.admin_overrides->>'monthlyMaxSessions')::int,
    (v_limits->>'monthly_max_sessions')::int, 80);
  v_monthly_max_seconds := coalesce(
    (v_learner.admin_overrides->>'monthlyMaxSeconds')::int,
    (v_limits->>'monthly_max_seconds')::int, 21600);

  -- 当日行をロックして確認（複数タブの同時開始を直列化）
  insert into public.ai_usage_daily (learner_id, usage_date)
    values (v_learner.id, v_today)
    on conflict (learner_id, usage_date) do nothing;
  select * into v_usage from public.ai_usage_daily
    where learner_id = v_learner.id and usage_date = v_today for update;

  -- 日次（スパイク防止）
  if v_usage.sessions_count >= v_max_sessions then
    return jsonb_build_object('ok', false, 'code', 'daily_session_limit');
  end if;
  if v_usage.seconds_used >= v_max_seconds then
    return jsonb_build_object('ok', false, 'code', 'daily_time_limit');
  end if;

  -- 月次（本当のアッパー）。当月の合算（今日の現在値を含む）で判定
  select coalesce(sum(sessions_count), 0), coalesce(sum(seconds_used), 0)
    into v_month_sessions, v_month_seconds
    from public.ai_usage_daily
    where learner_id = v_learner.id and usage_date >= v_month_start and usage_date <= v_today;
  if v_month_sessions >= v_monthly_max_sessions then
    return jsonb_build_object('ok', false, 'code', 'monthly_session_limit');
  end if;
  if v_month_seconds >= v_monthly_max_seconds then
    return jsonb_build_object('ok', false, 'code', 'monthly_time_limit');
  end if;

  insert into public.ai_learning_sessions
    (learner_id, mission_id, mode, lesson_kind, difficulty, target_expression, completion_status)
  values
    (v_learner.id, p_mission_id, v_mode, coalesce(p_lesson_kind, 'new'),
     coalesce(p_difficulty, 2), p_target_expression, 'in_progress')
  returning id into v_session_id;

  -- 日次の開始回数（スパイク防止の安全装置）は、従来どおり予約時に数える
  update public.ai_usage_daily
    set sessions_count = sessions_count + 1, updated_at = now()
    where learner_id = v_learner.id and usage_date = v_today;

  -- 音声の回は台帳に載せる。回数券の回でも、ここでは引かない（会話が成立したら引く）
  if v_is_voice then
    v_session_seconds := case when v_need_credit
      then coalesce((v_beta->>'paidSessionSeconds')::int, 360)
      else coalesce((v_beta->>'sessionSeconds')::int, 240) end;
    insert into public.ai_voice_session_ledger
      (session_id, learner_id, user_id, charge_kind, session_max_seconds)
    values
      (v_session_id, v_learner.id, auth.uid(),
       case when v_need_credit then 'credit' else 'free' end, v_session_seconds);
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'learnerId', v_learner.id,
    'remainingSessions', v_max_sessions - (v_usage.sessions_count + 1),
    'remainingMonthly', greatest(v_monthly_max_sessions - (v_month_sessions + 1), 0),
    -- プラン別の音声枠の残り（プランが無ければ null＝画面は従来どおり出さない）
    'remainingVoiceTotal', v_remaining_voice_total,
    'remainingVoiceToday', v_remaining_voice_today,
    -- 週の残りと、券を使う回か（画面で正直に出すため）
    'remainingVoiceWeek', case when v_is_voice
      then greatest(coalesce(v_week_cap, 0) - (coalesce(v_used_week, 0) + 1), 0) else null end,
    'usedCredit', v_need_credit,
    -- 会話が成立した場合の残り枚数（成立しなければ減らない）
    'creditsRemaining', case when v_is_voice
      then case when v_need_credit then v_credits - 1 else v_credits end else null end,
    'creditChargedOn', case when v_need_credit then 'conversation_established' else null end,
    -- 券で買った回は長く話せる（既定4分 / 券は6分）。秒数は画面には出さない
    'sessionMaxSeconds', case when v_is_voice then v_session_seconds else null end
  );
end;
$function$
;

-- ── 10. 画面に出す枠の情報 ──
create or replace function public.ai_my_conversation_budget()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner public.ai_learners%rowtype;
  v_access public.ai_course_access%rowtype;
  v_budgets jsonb;
  v_budget jsonb;
  v_beta jsonb;
  v_week_cap int;
  v_used_week int;
  v_credits int;
  v_next_at timestamptz;
  v_voice_total int;
  v_voice_per_day int;
  v_text_per_day int;
  v_used_total int;
  v_used_voice_today int;
  v_used_text_today int;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_today_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Tokyo')) at time zone 'Asia/Tokyo';
  v_plan jsonb := '{}'::jsonb;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;

  -- 終わった回の「消費する／しない」を先に確定する（ここで戻った回数が、そのまま画面に出る）
  perform public.ai_voice_settle_pending(v_learner.id);

  -- 週の枠は全員（プランの有無に関係なく）
  select value into v_beta from public.ai_config where key = 'conversation_beta';
  v_week_cap := coalesce((v_beta->>'perWeek')::int, 3);
  -- 画面に出す数は消費した回だけ（閉じずに離れた回で入口を塞がない）
  v_used_week := public.ai_voice_used_since(v_learner.id, now() - interval '7 days', false);
  select coalesce(sum(delta), 0)::int into v_credits
    from public.ai_conversation_credits where user_id = auth.uid();
  if v_used_week >= v_week_cap then
    v_next_at := public.ai_voice_oldest_used_since(v_learner.id, now() - interval '7 days', false)
      + interval '7 days';
  end if;

  -- プラン別の枠（持っている人だけ）
  select * into v_access from public.ai_course_access where user_id = auth.uid();
  if found and v_access.plan_id is not null then
    select value into v_budgets from public.ai_config where key = 'plan_ai_budgets';
    v_budget := v_budgets -> v_access.plan_id;
  end if;

  if v_budget is not null then
    v_voice_total   := coalesce((v_budget->>'voiceSessionsTotal')::int, 999999);
    v_voice_per_day := coalesce((v_budget->>'voiceSessionsPerDay')::int, 999);
    v_text_per_day  := coalesce((v_budget->>'textSessionsPerDay')::int, 999);

    v_used_total := public.ai_voice_used_since(v_learner.id, v_access.valid_from, false);
    v_used_voice_today := public.ai_voice_used_since(v_learner.id, v_today_start, false);
    select count(*) into v_used_text_today from public.ai_learning_sessions
     where learner_id = v_learner.id and mode = 'text'
       and (started_at at time zone 'Asia/Tokyo')::date = v_today;

    v_plan := jsonb_build_object(
      'planId', v_access.plan_id,
      'validUntil', v_access.valid_until,
      'voiceTotal', v_voice_total,
      'voiceRemainingTotal', greatest(v_voice_total - v_used_total, 0),
      'voicePerDay', v_voice_per_day,
      'voiceRemainingToday', greatest(v_voice_per_day - v_used_voice_today, 0),
      'textPerDay', v_text_per_day,
      'textRemainingToday', greatest(v_text_per_day - v_used_text_today, 0)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'hasBudget', true,
    'voicePerWeek', v_week_cap,
    'voiceUsedThisWeek', v_used_week,
    'voiceRemainingWeek', greatest(v_week_cap - v_used_week, 0),
    'nextVoiceAvailableAt', v_next_at,
    -- 成立の報告が遅れて届いた回で一時的に負になっても、画面には 0 未満を出さない
    'credits', greatest(v_credits, 0),
    'beta', true
  ) || v_plan;
end;
$$;

-- ── 11. 実行権限 ──
-- 内部の部品は、誰からも直接呼ばせない（security definer の関数の中からだけ使う）
revoke all on function public.ai_voice_consumption_rule() from public, anon, authenticated;
revoke all on function public.ai_voice_claim_live_since() from public, anon, authenticated;
revoke all on function public.ai_voice_conversation_established(jsonb) from public, anon, authenticated;
revoke all on function public.ai_voice_evidence_int(jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.ai_voice_mark_consumed(uuid, text) from public, anon, authenticated;
revoke all on function public.ai_voice_settle_pending(uuid) from public, anon, authenticated;
revoke all on function public.ai_voice_used_since(uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.ai_voice_oldest_used_since(uuid, timestamptz, boolean) from public, anon, authenticated;

-- Edge Function（service_role）だけ
revoke all on function public.ai_service_claim_voice_token(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.ai_service_claim_voice_token(uuid, uuid, boolean) to service_role;
revoke all on function public.ai_service_release_voice_token(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_service_release_voice_token(uuid, uuid) to service_role;

-- ログインした本人（自分の回だけ。中で auth.uid() を確かめる）
revoke all on function public.ai_voice_report_evidence(uuid, jsonb) from public, anon;
grant execute on function public.ai_voice_report_evidence(uuid, jsonb) to authenticated;

-- ついでに塞ぐ: 未ログインでも他人の進行中セッションを閉じられた（PUBLIC 実行・引数の learner を確かめない）。
-- 呼ぶのは ai_start_session の中だけ（security definer なので所有者の権限で呼べる）
revoke all on function public.ai_release_stale_sessions(uuid) from public, anon, authenticated;
-- ai_start_session は未ログイン（anon）に出していた（中で no_learner を返すだけだったが、出す理由が無い）
revoke all on function public.ai_start_session(text, text, text, integer, text) from public, anon;
grant execute on function public.ai_start_session(text, text, text, integer, text) to authenticated;

-- 新しい関数を API（PostgREST）にすぐ見せる
notify pgrst, 'reload schema';
