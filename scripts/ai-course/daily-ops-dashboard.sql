-- GATE⑤ 日次運用ダッシュボード（read-only・単一結果セット）。
-- 実行: node scripts/ai-course/remote-sql.mjs --file scripts/ai-course/daily-ops-dashboard.sql --label daily-ops
--
-- 目的: 3名Pilot期間中、毎日10秒で「学習が動いているか／異常が出ていないか」を見る。
-- 列名は 2026-07-30 に information_schema で実査した実際の定義に合わせている（推測しない）。
-- 個人情報は出さない（learner名・メールは出さない）。
-- 閾値と対処は docs/ai-course/production/pilot-operations.md を参照。
select section, metric, value from (
  -- ① 学習が動いているか
  select 1 ord, 'learners' section, 'total' metric, count(*)::text value from public.ai_learners
  union all select 2, 'learners', 'active_7d',
    count(distinct learner_id)::text from public.ai_learning_sessions where started_at > now() - interval '7 days'
  union all select 3, 'learners', 'active_24h',
    count(distinct learner_id)::text from public.ai_learning_sessions where started_at > now() - interval '24 hours'
  union all select 4, 'lessons', 'sessions_24h',
    count(*)::text from public.ai_learning_sessions where started_at > now() - interval '24 hours'
  union all select 5, 'lessons', 'completed_24h',
    count(*)::text from public.ai_learning_sessions
    where started_at > now() - interval '24 hours' and ended_at is not null
  -- 1時間以上前に始まって未終了＝中断（会話が壊れた可能性のシグナル）
  union all select 6, 'lessons', 'abandoned_24h',
    count(*)::text from public.ai_learning_sessions
    where started_at > now() - interval '24 hours' and ended_at is null and started_at < now() - interval '1 hour'
  union all select 7, 'lessons', 'error_code_24h',
    count(*)::text from public.ai_learning_sessions
    where started_at > now() - interval '24 hours' and error_code is not null

  -- ② 進捗同期（sync失敗の間接指標: 行が増えているか）
  union all select 10, 'sync', 'unit_progress_rows', count(*)::text from public.ai_course_unit_progress
  union all select 11, 'sync', 'unit_progress_updated_24h',
    count(*)::text from public.ai_course_unit_progress where updated_at > now() - interval '24 hours'
  union all select 12, 'sync', 'vocab_progress_rows', count(*)::text from public.ai_course_vocab_item_progress
  union all select 13, 'sync', 'vocab_updated_24h',
    count(*)::text from public.ai_course_vocab_item_progress where updated_at > now() - interval '24 hours'
  union all select 14, 'sync', 'learners_with_unit_progress',
    count(distinct learner_id)::text from public.ai_course_unit_progress

  -- ③ AIコスト・使用量（上限に近づいていないか）
  union all select 20, 'ai_usage', 'sessions_this_month',
    coalesce(sum(sessions_count)::text, '0') from public.ai_usage_daily where usage_date >= date_trunc('month', current_date)
  union all select 21, 'ai_usage', 'seconds_this_month',
    coalesce(sum(seconds_used)::text, '0') from public.ai_usage_daily where usage_date >= date_trunc('month', current_date)
  union all select 22, 'ai_usage', 'cost_usd_this_month',
    coalesce(round(sum(estimated_cost_usd)::numeric, 4)::text, '0') from public.ai_usage_daily
    where usage_date >= date_trunc('month', current_date)
  union all select 23, 'ai_usage', 'cost_usd_24h',
    coalesce(round(sum(estimated_cost_usd)::numeric, 4)::text, '0') from public.ai_usage_daily
    where usage_date >= current_date - 1
  union all select 24, 'ai_usage', 'cap_monthly_sessions',
    coalesce((select value->>'monthly_max_sessions' from public.ai_config where key = 'usage_limits'), '(unset)')
  union all select 25, 'ai_usage', 'cap_cost_warn_usd',
    coalesce((select value->>'monthly_cost_warn_usd' from public.ai_config where key = 'usage_limits'), '(unset)')

  -- ④ 問い合わせ・不具合報告（未対応が溜まっていないか）
  union all select 30, 'support', 'issue_reports_unresolved',
    count(*)::text from public.ai_issue_reports where not resolved
  union all select 31, 'support', 'issue_reports_24h',
    count(*)::text from public.ai_issue_reports where created_at > now() - interval '24 hours'
  union all select 32, 'support', 'feedback_24h',
    count(*)::text from public.ai_feedback where created_at > now() - interval '24 hours'
  union all select 33, 'support', 'contacts_new',
    count(*)::text from public.contacts where status = 'new'

  -- ⑤ 認証・権限の異常（想定外のentitlement/override・ロックアウト）
  union all select 40, 'security', 'entitlement_rows', count(*)::text from public.ai_course_entitlements
  union all select 41, 'security', 'learners_with_admin_overrides',
    count(*)::text from public.ai_learners where admin_overrides <> '{}'::jsonb
  union all select 42, 'security', 'otp_throttled_24h',
    count(*)::text from public.ai_otp_throttle where last_sent_at > now() - interval '24 hours'
  union all select 43, 'security', 'login_locked_now',
    count(*)::text from public.login_attempts where locked_until is not null and locked_until > now()
  -- max_uses is null = 無制限（20260720000000_ai_course_security.sql:23 のセマンティクスに合わせる。
  -- `used_count < max_uses` だけで書くとNULLで常に除外され「招待0件」と誤警報する）
  union all select 44, 'security', 'invites_usable',
    count(*)::text from public.ai_course_invites
    where is_active and (max_uses is null or used_count < max_uses)
    and (expires_at is null or expires_at > now())

  -- ⑥ 復習生成（学習ループが回っているか）
  union all select 50, 'review', 'due_today',
    count(*)::text from public.ai_course_vocab_item_progress where next_review_on <= current_date
  union all select 51, 'review', 'scheduled_total',
    count(*)::text from public.ai_course_vocab_item_progress where next_review_on is not null
) t order by ord;
