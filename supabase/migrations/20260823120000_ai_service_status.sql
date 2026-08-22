-- AI会話の稼働状態を、生徒の画面から読めるようにする（2026-08-23 CEO指示）。
--
-- なぜ要るか:
--   OpenAIのクレジットが尽きると全APIが即停止する。これまでは生徒が
--   ミッションを開いてから素のエラーに落ちる作りだった。
--   開く前に「AI会話はアップデート中です」と出せるように、状態だけを1本のRPCで返す。
--
-- 安全側の設計:
--   ai_config は管理者しか読めない（生徒に運用設定を見せない）。
--   そこで security definer の関数で **停止しているか／いつまでか だけ** を返す。
--   理由・メール送信時刻・しきい値などの運用情報は一切返さない。

create or replace function public.ai_service_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'chatPaused', coalesce(
      (select (value->>'paused_until')::timestamptz > now()
         from public.ai_config where key = 'ai_availability'),
      false),
    'until', (select value->>'paused_until'
                from public.ai_config where key = 'ai_availability')
  );
$$;

revoke all on function public.ai_service_status() from public;
grant execute on function public.ai_service_status() to authenticated, anon;

comment on function public.ai_service_status() is
  'AI会話が一時停止中かだけを返す。ai_config の中身は返さない（生徒から呼ばれる）。';
