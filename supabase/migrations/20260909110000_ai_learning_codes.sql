-- 学習コード（2026-09-09 P0-2 / 監査E章の採用案）
--
-- 【目的】
-- 学習者に**何も覚えさせない**。渡すのは
--   ・個人専用URL（タップするだけ）
--   ・そのURLに入っている学習コード1つ（入力欄は1つだけ）
-- のどちらか。IDとパスワードの2つを覚えて、忘れたら先生に頼む——をやめる。
--
-- 【絶対に守ること】
-- `andy` `user001` `123456` のような**推測できる文字列だけでは入れない**。
-- コードは30文字集合×12桁（約59bit）で、総当たりは現実的でない。
-- さらに平文は保存せず、sha256 のハッシュだけを持つ。
-- 漏れたら失効させて再発行する（学習記録は user_id に紐づくので何も消えない）。
--
-- 【既存を壊さない】
-- 現行のID＋パスワード（Supabaseのパスワード認証）はそのまま残す。
-- この仕組みは**同じ auth ユーザーへの別の入口**を足すだけで、認証基盤は差し替えない。
--
-- rollback: 20260909110000_ai_learning_codes.rollback.sql

-- ── 1. コード台帳 ──
create table if not exists public.ai_learning_codes (
  id uuid primary key default gen_random_uuid(),
  /** どの auth ユーザーの入口か */
  user_id uuid not null,
  /**
   * 正規化した平文の sha256（hex）。**平文はどこにも保存しない。**
   * 正規化＝大文字化＋英数字以外を除去（ハイフンや空白の有無で入れないことが無いように）
   */
  code_hash text not null unique,
  /** 先頭3文字だけ。管理画面で「どれを配ったか」を見分けるため（推測の材料にはならない） */
  code_prefix text not null,
  /** 誰に配ったかのメモ（人名でなく用途を書く運用。PIIを入れない） */
  label text not null default '',
  issued_by text,
  issued_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0,
  revoked_at timestamptz,
  revoked_reason text,
  is_test boolean not null default false
);

comment on table public.ai_learning_codes is
  '学習コードの台帳。平文は保存せず sha256 のみ。1人に複数行あってよい（再発行で古い行を revoke する）';

create index if not exists ai_learning_codes_user_idx
  on public.ai_learning_codes (user_id, issued_at desc);
create index if not exists ai_learning_codes_active_idx
  on public.ai_learning_codes (revoked_at) where revoked_at is null;

alter table public.ai_learning_codes enable row level security;

-- 管理者だけが台帳を読める。学習者本人にも見せない（自分のコードは配布時のURLで持っている）
drop policy if exists ai_learning_codes_admin_read on public.ai_learning_codes;
create policy ai_learning_codes_admin_read on public.ai_learning_codes
  for select to authenticated using (public.ai_is_admin());

-- 書き込みポリシーは作らない（発行・失効はすべて security definer の関数を通す）
grant select on public.ai_learning_codes to authenticated;
grant all on public.ai_learning_codes to service_role;

-- ── 2. ログイン試行の記録（総当たり対策） ──
create table if not exists public.ai_code_login_attempts (
  id bigserial primary key,
  /** 接続元IPの sha256（生IPは保存しない）。取れないときは 'unknown' */
  ip_hash text not null,
  attempted_at timestamptz not null default now(),
  ok boolean not null,
  /** 失敗の種類だけ。入力されたコードは**絶対に**残さない */
  reason text not null default ''
);

create index if not exists ai_code_login_attempts_ip_idx
  on public.ai_code_login_attempts (ip_hash, attempted_at desc);
create index if not exists ai_code_login_attempts_recent_idx
  on public.ai_code_login_attempts (attempted_at desc);

alter table public.ai_code_login_attempts enable row level security;

drop policy if exists ai_code_login_attempts_admin_read on public.ai_code_login_attempts;
create policy ai_code_login_attempts_admin_read on public.ai_code_login_attempts
  for select to authenticated using (public.ai_is_admin());

grant select on public.ai_code_login_attempts to authenticated;
grant all on public.ai_code_login_attempts to service_role;
grant usage, select on sequence public.ai_code_login_attempts_id_seq to service_role;

-- ── 3. コードの生成 ──
/**
 * 紛らわしい文字を除いた30文字（0/O/1/I/L/U を使わない）。
 * 12桁＝30^12≒5.3e17（約59bit）。読み上げても書き写しても間違えにくい。
 */
create or replace function public.ai_generate_learning_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_out text := '';
  v_bytes bytea;
  i integer;
begin
  -- 暗号論的乱数から1文字ずつ引く（剰余の偏りは30/256なので無視できない量ではないが、
  -- ここでは1バイトを捨てて引き直すことで偏りを消す）
  while length(v_out) < 12 loop
    v_bytes := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      exit when length(v_out) >= 12;
      -- 240 = 30*8。240以上は捨てる＝残りは30で割り切れるので偏らない
      if get_byte(v_bytes, i) < 240 then
        v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % 30) + 1, 1);
      end if;
    end loop;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.ai_generate_learning_code() from public, anon, authenticated;
grant execute on function public.ai_generate_learning_code() to service_role;

/** 入力の正規化。大文字化して英数字以外を落とす（ハイフン・空白・小文字を許す） */
create or replace function public.ai_normalize_learning_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

grant execute on function public.ai_normalize_learning_code(text) to service_role;

-- ── 4. 発行（管理者のみ。平文はこの1回だけ返る） ──
/**
 * 学習コードを発行する。
 * p_revoke_existing = true（既定）なら、その人の有効な既存コードを失効させてから作る
 * ＝「再発行」。古いコードは即座に使えなくなる。
 *
 * **平文はここでしか返らない。** 台帳にはハッシュしか残らないので、
 * 画面を閉じたら管理者にも二度と見えない（もう一度発行すればよい）。
 */
create or replace function public.ai_admin_issue_learning_code(
  p_user_id uuid,
  p_label text default '',
  p_revoke_existing boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_hash text;
  v_id uuid;
  v_is_test boolean := false;
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_user');
  end if;

  -- テスト用の学習者に発行したコードは、本番の集計から外せるように印を付ける
  select coalesce(l.is_test, false) into v_is_test
    from public.ai_learners l where l.user_id = p_user_id limit 1;

  if coalesce(p_revoke_existing, true) then
    update public.ai_learning_codes
       set revoked_at = now(), revoked_reason = 'reissued'
     where user_id = p_user_id and revoked_at is null;
  end if;

  -- 衝突はまず起きないが、起きたら作り直す（unique 制約に任せて握り潰さない）
  for i in 1..5 loop
    v_code := public.ai_generate_learning_code();
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
    begin
      insert into public.ai_learning_codes (user_id, code_hash, code_prefix, label, issued_by, is_test)
        values (p_user_id, v_hash, substr(v_code, 1, 3), left(coalesce(p_label, ''), 80),
                coalesce(auth.jwt() ->> 'email', 'admin'), coalesce(v_is_test, false))
        returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;

  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'generate_failed');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    -- 表示用に4桁ずつ区切る（読み上げ・書き写しのため）。照合時は区切りを無視する
    'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4),
    'raw', v_code
  );
end;
$$;

revoke all on function public.ai_admin_issue_learning_code(uuid, text, boolean) from public, anon;
grant execute on function public.ai_admin_issue_learning_code(uuid, text, boolean) to authenticated;

-- ── 5. 失効 ──
create or replace function public.ai_admin_revoke_learning_code(p_id uuid, p_reason text default 'revoked')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.ai_learning_codes
     set revoked_at = now(), revoked_reason = left(coalesce(p_reason, 'revoked'), 80)
   where id = p_id and revoked_at is null;
  return jsonb_build_object('ok', found);
end;
$$;

revoke all on function public.ai_admin_revoke_learning_code(uuid, text) from public, anon;
grant execute on function public.ai_admin_revoke_learning_code(uuid, text) to authenticated;

-- ── 6. 照合（Edge Function からのみ。平文はここに来ない：ハッシュで照合する） ──
/**
 * ハッシュで持ち主を引く。**有効なコードのときだけ** user_id を返す。
 * 呼べるのは service_role だけ（＝Edge Function 経由）。
 * 使用のたびに last_used_at と use_count を進める（不審な使われ方を後から見るため）。
 */
create or replace function public.ai_resolve_learning_code(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_learning_codes%rowtype;
begin
  select * into v_row from public.ai_learning_codes
   where code_hash = p_code_hash limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_row.revoked_at is not null then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;

  update public.ai_learning_codes
     set last_used_at = now(), use_count = use_count + 1
   where id = v_row.id;

  return jsonb_build_object('ok', true, 'userId', v_row.user_id, 'codeId', v_row.id);
end;
$$;

revoke all on function public.ai_resolve_learning_code(text) from public, anon, authenticated;
grant execute on function public.ai_resolve_learning_code(text) to service_role;

-- ── 7. 総当たり対策（IPごとの試行制限） ──
/**
 * 直近15分の失敗が10回以上なら止める。
 * 成功は数えない（家族で同じ回線から入るような正しい使い方を巻き込まない）。
 * 記録は必ず残す（止めた回も含めて、後から攻撃の形が見える）。
 */
create or replace function public.ai_code_login_throttle(p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fails integer;
begin
  select count(*) into v_fails from public.ai_code_login_attempts
   where ip_hash = p_ip_hash and ok = false and attempted_at > now() - interval '15 minutes';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'code', 'too_many_attempts', 'retryAfter', 900);
  end if;
  return jsonb_build_object('ok', true, 'fails', v_fails);
end;
$$;

revoke all on function public.ai_code_login_throttle(text) from public, anon, authenticated;
grant execute on function public.ai_code_login_throttle(text) to service_role;

create or replace function public.ai_code_login_record(p_ip_hash text, p_ok boolean, p_reason text default '')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_code_login_attempts (ip_hash, ok, reason)
  values (coalesce(p_ip_hash, 'unknown'), coalesce(p_ok, false), left(coalesce(p_reason, ''), 40));
$$;

revoke all on function public.ai_code_login_record(text, boolean, text) from public, anon, authenticated;
grant execute on function public.ai_code_login_record(text, boolean, text) to service_role;

-- ── 8. 管理画面用の一覧 ──
/**
 * 生徒ごとの学習コードの状態（平文は返さない）。
 * 「配ったか」「使われているか」「最後にいつ入ったか」だけが分かればよい。
 */
create or replace function public.ai_admin_learning_codes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'userId', c.user_id,
      'codePrefix', c.code_prefix,
      'label', c.label,
      'issuedAt', c.issued_at,
      'issuedBy', c.issued_by,
      'lastUsedAt', c.last_used_at,
      'useCount', c.use_count,
      'revokedAt', c.revoked_at,
      'revokedReason', c.revoked_reason,
      'isTest', c.is_test
    ) order by c.issued_at desc)
    from public.ai_learning_codes c
  ), '[]'::jsonb),
  'recentFailures', coalesce((
    select count(*) from public.ai_code_login_attempts
     where ok = false and attempted_at > now() - interval '24 hours'
  ), 0));
end;
$$;

revoke all on function public.ai_admin_learning_codes() from public, anon;
grant execute on function public.ai_admin_learning_codes() to authenticated;
