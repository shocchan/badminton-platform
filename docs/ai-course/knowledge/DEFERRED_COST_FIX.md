# DEFERRED_COST_FIX — Realtimeモデルのテキスト出力単価

2026-09-10 に公式の料金表と突合して見つかった不整合。**CEO承認なしで本番DBを書き換えないため保留**。

## 対象

| | |
|---|---|
| 対象DB | Supabase `jdkwijdphlkrcoiggfqw` / `ai_model_prices`（seed は migration 側が正） |
| 対象モデル | `gpt-realtime-2.1` |
| 項目 | テキスト出力単価（`output_per_million`） |
| 現在値 | **16** USD / 1M tokens |
| 正しい値 | **24** USD / 1M tokens |
| 出典 | https://developers.openai.com/api/docs/pricing （2026-09-10 取得） |

音声の単価（入力32・出力64）は**公式と一致していた**。ずれているのはテキスト出力の1項目だけ。

## なぜ今直さないか

`aiModelPricing.test.ts` に「**DBが正・TSは写し**」というガードがあり、TS側だけ直すとテストが落ちる。
正しく直すには migration の seed を書き換えて本番へ当てる必要があり、これは本番DBへの書き込みになる。

## migration案

```sql
-- supabase/migrations/2026XXXXXXXXXX_fix_realtime_text_output_price.sql
--
-- gpt-realtime-2.1 のテキスト出力単価を公式の料金表に合わせる（16 → 24 USD/1M）。
-- 音声（32/64）は一致していたので触らない。
-- 出典: developers.openai.com/api/docs/pricing 2026-09-10
update public.ai_model_prices
   set output_per_million = 24,
       provenance = 'docs:developers.openai.com/api/docs/pricing 2026-09-10',
       updated_at = now()
 where model = 'gpt-realtime-2.1'
   and output_per_million = 16;
```

あわせて `src/lib/aiLesson/course/aiModelPricing.ts` の `outputPerMillion: 16` を `24` にし、
`provenance` を出典つきへ更新する（seed と TS が一致していないとテストが落ちる）。

## pricingへの実質影響

**ほぼ無い。**

AI会話の原価は**音声トークンが支配的**で、その単価は合っていた。
テキスト出力は realtime セッション内のごく一部（tool call とテキスト応答）にしか出ない。

| | 影響 |
|---|---|
| 音声1分の原価（¥25） | **変わらない**（音声単価は一致していた） |
| 回数券 300円の原価率（52%） | **変わらない** |
| 5回券 1,350円の原価率（58%） | **変わらない** |
| 各プランの原価率 | **変わらない** |

つまり**値決めをやり直す必要は無い**。単価表の正確さの問題として直す。

## 残っている本当の不確かさ

単価ではなく**「音声1分あたり何トークン流れるか」の仮定**（入力1800・出力1200 tokens/分）が、
OpenAIの実請求と一度も突合されていない。1分¥25という数字はここに乗っている。
`scripts/ai-course/reconcile-openai-cost.mjs` での突合は別途必要。
