-- 20260910130000_fix_realtime_text_output_price の取り消し（24 → 16 に戻す）。
-- 公式の料金表とは合わなくなるので、戻すのは「適用が誤りだった」と分かったときだけ。
update public.ai_model_prices
   set output_per_million = 16,
       provenance = 'repo:src/lib/aiLesson/course/courseConfig.ts REALTIME_COST(32/64) + list:realtime text 4/16, cached audio 0.4 (未突合)',
       updated_at = now()
 where model = 'gpt-realtime-2.1'
   and output_per_million = 24;
