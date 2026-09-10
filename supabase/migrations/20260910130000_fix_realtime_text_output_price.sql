-- gpt-realtime-2.1 のテキスト出力単価を公式の料金表に合わせる（16 → 24 USD/1M）。2026-09-10 Phase 8。
--
-- ■ 何が違っていたか
--   ai_model_prices（原価計算の単価表）の gpt-realtime-2.1 は
--     text input 4 / cached 0.4 / **text output 16** / audio input 32 / audio output 64
--   で seed されていた（20260824150000_ai_usage_events.sql）。
--   2026-09-10 に公式の料金表と突合したところ、テキスト出力だけ 24 だった。音声（32/64）は一致。
--   出典: https://developers.openai.com/api/docs/pricing （2026-09-10 取得）
--
-- ■ 影響
--   AI会話の原価は音声トークンが支配的で、その単価は合っていた。テキスト出力は realtime セッション内の
--   tool call とテキスト応答にしか出ないので、1分¥25・回数券の原価率・各プランの原価率は**変わらない**。
--   値決めをやり直す話ではなく、単価表の正確さの問題。音声価格・商品価格・回数券の価格は変更しない。
--
-- ■ 適用
--   本番DBへの書き込みなので **CEO 確認のうえで** scripts/ai-course/remote-sql.mjs --file <this> --write で当てる。
--   where 句に「いまの値が 16」を入れてあるので、二重に当てても・別の値に直された後に当てても何も起きない。
--   TS 側（src/lib/aiLesson/course/aiModelPricing.ts）は同じ commit で 24 に直してあり、
--   aiModelPricing.test.ts が「seed ＋ この update」と TS の一致を検査する。
update public.ai_model_prices
   set output_per_million = 24,
       provenance = 'repo:src/lib/aiLesson/course/courseConfig.ts REALTIME_COST(32/64) + list:realtime text 4/24 (developers.openai.com/api/docs/pricing 2026-09-10), cached audio 0.4 (未突合)',
       updated_at = now()
 where model = 'gpt-realtime-2.1'
   and output_per_million = 16;
