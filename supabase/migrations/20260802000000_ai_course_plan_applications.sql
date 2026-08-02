-- 申込記録と同意記録（最小構成・2026-08-02）。
--
-- ⚠️ **このマイグレーションはまだ適用していない。**
--    staging と production は同じ Supabase プロジェクトを共有しているため、
--    適用＝production への変更になる。CEOの許可を得てから実行すること。
--      npx supabase db push  もしくは
--      node scripts/ai-course/apply-remote-migration.mjs（手順は docs 参照）
--
-- 設計方針:
-- - 契約・決済の状態はここに持たない（人が確認して個別に案内する運用）
-- - **申込者が見た価格ラベルとプラン版をそのまま保存する。**
--   カタログの価格を後で変えても、申込時点の表示を再現できる（証拠として使うため）
-- - 同意記録は申込とは別テーブル。ログイン後のlearnerにも同じ形で紐づけられるようにする

create table if not exists public.ai_plan_applications (
  application_id        text primary key,
  selected_plan_id      text not null,
  -- 申込者が画面で実際に見た価格の文字列。カタログを直しても**書き換えない**
  displayed_price_label text not null,
  plan_version          integer not null,
  application_at        timestamptz not null default now(),
  locale                text not null check (locale in ('ja', 'zh')),
  application_status    text not null default 'submitted'
    check (application_status in ('submitted', 'contacted', 'accepted', 'declined', 'cancelled')),
  name                  text not null check (length(name) between 1 and 100),
  email                 text not null check (length(email) between 3 and 254),
  note                  text not null default '' check (length(note) <= 2000),
  created_at            timestamptz not null default now()
);

create index if not exists ai_plan_applications_status_idx
  on public.ai_plan_applications (application_status, application_at desc);

create table if not exists public.ai_terms_consents (
  id            uuid primary key default gen_random_uuid(),
  -- 申込前は application_id、ログイン後は learner の id
  subject_id    text not null,
  subject_kind  text not null check (subject_kind in ('application', 'learner')),
  terms_version text not null check (length(terms_version) between 1 and 40),
  consented_at  timestamptz not null,
  locale        text not null check (locale in ('ja', 'zh')),
  created_at    timestamptz not null default now()
);

create index if not exists ai_terms_consents_subject_idx
  on public.ai_terms_consents (subject_kind, subject_id);

-- ── RLS ──
alter table public.ai_plan_applications enable row level security;
alter table public.ai_terms_consents   enable row level security;

-- 申込は**ログイン前の訪問者**が出すので anon の insert を許す。
-- ただし読み取りは管理者だけ。許すと他人の氏名・メールが全部見える。
drop policy if exists ai_plan_applications_insert on public.ai_plan_applications;
create policy ai_plan_applications_insert on public.ai_plan_applications
  for insert to anon, authenticated with check (true);

drop policy if exists ai_plan_applications_select on public.ai_plan_applications;
create policy ai_plan_applications_select on public.ai_plan_applications
  for select to authenticated using (public.ai_is_admin());

drop policy if exists ai_plan_applications_update on public.ai_plan_applications;
create policy ai_plan_applications_update on public.ai_plan_applications
  for update to authenticated using (public.ai_is_admin()) with check (public.ai_is_admin());

drop policy if exists ai_terms_consents_insert on public.ai_terms_consents;
create policy ai_terms_consents_insert on public.ai_terms_consents
  for insert to anon, authenticated with check (true);

drop policy if exists ai_terms_consents_select on public.ai_terms_consents;
create policy ai_terms_consents_select on public.ai_terms_consents
  for select to authenticated using (public.ai_is_admin());

-- 同意記録は**あとから書き換えない**（証拠なので）。update/delete のポリシーを作らない＝誰も出来ない

-- ⚠️ 既知の弱点: anon が insert できるので、広告を出す前に
--    bot対策（Turnstile等）またはEdge Function経由のレート制限が要る。
--    → docs/ai-course/legal-open-questions.md
