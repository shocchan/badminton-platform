-- 個人復習パック（adventureV2.personalPacks）を生徒側の保存で失わないようにする。
--
-- 20260817020000（先生からの一言）の定義に personalPacks の保護を1本足しただけ。
-- 既存の保護（answerSheets / interviewPrep.enabledAt / teacherNotes）は同じ動作のまま。
--
-- なぜ必要か: パックは先生が ai_learners を直接 update して発行するのに対し、
-- 生徒は ai_save_learner_settings 経由で保存する。発行の直前に読み込んだ古い
-- プロファイルを生徒が保存すると、発行したパックが消える（答案用紙で実際に起きた競合）。
--
-- 何を守り、何を守らないか:
--   personalPacks（先生が発行した教材）  → **DB側が正**。生徒の保存では上書きさせない
--   personalPack（本人の答えた記録）      → クライアント値をそのまま採る（本人のものなので）
create or replace function public.ai_save_learner_settings(p_settings jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  cur jsonb;
  merged jsonb := coalesce(p_settings, '{}'::jsonb);
begin
  select settings into cur from public.ai_learners where user_id = auth.uid() for update;
  if not found then
    return null;
  end if;
  -- トップレベル: クライアントが知らないキーはDB側を温存（クライアントが知っているキーはクライアントが勝つ）
  merged := coalesce(cur, '{}'::jsonb) || merged;
  if jsonb_typeof(merged->'adventureV2') = 'object' and jsonb_typeof(cur->'adventureV2') = 'object' then
    -- 先生発行の答案用紙は常にDB側の現在値を勝たせる（発行と生徒の保存の競合＝過去監査F1）
    if cur->'adventureV2' ? 'answerSheets' then
      merged := jsonb_set(merged, '{adventureV2,answerSheets}', cur->'adventureV2'->'answerSheets', true);
    end if;
    -- 先生発行の個人復習パックも同じ扱い（教材はDB側が正・本人の記録 personalPack は触らない）
    if cur->'adventureV2' ? 'personalPacks' then
      merged := jsonb_set(merged, '{adventureV2,personalPacks}', cur->'adventureV2'->'personalPacks', true);
    end if;
    if cur->'adventureV2' ? 'interviewPrep' then
      if jsonb_typeof(merged->'adventureV2'->'interviewPrep') = 'object' then
        -- 発行時刻だけDB側優先。本人が書いた notes / worksheet はクライアント値を尊重する
        if cur->'adventureV2'->'interviewPrep' ? 'enabledAt' then
          merged := jsonb_set(merged, '{adventureV2,interviewPrep,enabledAt}',
            cur->'adventureV2'->'interviewPrep'->'enabledAt', true);
        end if;
      else
        -- キー自体を知らない旧クライアント: 丸ごと温存
        merged := jsonb_set(merged, '{adventureV2,interviewPrep}', cur->'adventureV2'->'interviewPrep', true);
      end if;
    end if;
    -- 先生からの一言: 本文・件数はDB側が正。readAtISO だけクライアントの既読を引き継ぐ
    if jsonb_typeof(cur->'adventureV2'->'teacherNotes') = 'array' then
      merged := jsonb_set(merged, '{adventureV2,teacherNotes}', (
        select coalesce(jsonb_agg(
          case
            when cli.read_at is not null and (db_note->>'readAtISO') is null
              then jsonb_set(db_note, '{readAtISO}', to_jsonb(cli.read_at))
            else db_note
          end
          order by ord
        ), '[]'::jsonb)
        from jsonb_array_elements(cur->'adventureV2'->'teacherNotes') with ordinality as t(db_note, ord)
        left join lateral (
          select c->>'readAtISO' as read_at
          from jsonb_array_elements(
            case when jsonb_typeof(merged->'adventureV2'->'teacherNotes') = 'array'
              then merged->'adventureV2'->'teacherNotes' else '[]'::jsonb end
          ) c
          where c->>'id' = db_note->>'id'
          limit 1
        ) cli on true
      ), true);
    end if;
  end if;
  update public.ai_learners
    set settings = merged, updated_at = now()
    where user_id = auth.uid();
  return merged;
end
$function$;
