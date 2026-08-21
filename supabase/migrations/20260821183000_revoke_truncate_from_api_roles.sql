-- セキュリティ修正: API ロールから破壊的権限を剥奪（2026-08-21 監査で発見）
--
-- 何が問題だったか:
--   public スキーマの6テーブルで anon / authenticated に TRUNCATE 権限が付いていた。
--     ai_course_access（全受講権）／ai_terms_consents（同意記録）／ai_plan_applications
--     ／ai_cost_topups／ai_course_events／ai_course_alerts
--   **TRUNCATE は RLS を迂回する**。行単位のポリシーをいくら書いても、この権限があれば
--   テーブルごと空にできる。受講権が消えれば全受講生が学習できなくなる。
--
-- なぜ安全に剥奪できるか:
--   アプリは PostgREST 経由の SELECT/INSERT/UPDATE/DELETE しか発行しない。
--   Edge Function と cron は service_role（この変更の対象外）。
--   ＝通常の利用経路で TRUNCATE を使っている箇所は無い。
--
-- 影響範囲を最小にするため、**TRUNCATE だけ**を剥奪する。
-- REFERENCES / TRIGGER も本来不要だが、剥奪の副作用が読み切れないため今回は触らない。

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_cost_topups',
    'ai_course_access',
    'ai_course_alerts',
    'ai_course_events',
    'ai_plan_applications',
    'ai_terms_consents'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('revoke truncate on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- 今後 public スキーマに作る表でも同じことが起きないよう、既定権限からも外す
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
