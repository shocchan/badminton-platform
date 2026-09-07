# AI日本語コース 全面点検（2026-09-07）

読みやすい版: https://claude.ai/code/artifact/2e1ed0d2-e52c-4e7f-a8f1-bae485c78c06

出典: 本番Supabase（読み取りのみ・`scripts/ai-course/remote-sql.mjs`）／`~/badminton-sales @ integration/unify-2026-08-28`／公開ページの実測。
**書き込みは一切していない。**

## 結論

教材・出題・復習の作り込みは、この価格帯として十分に良い。壊れているのは中身ではなく
「人が入ってきて、続けて、払うところ」。

## 実測（2026-09-07 10:20 JST）

| 指標 | 実測 |
|---|---|
| 自力決済の完了 | **0 / 13**（実在の購入行は全件 `status=pending`＝Stripe決済画面で離脱） |
| `source='purchase'` のアクセス権 | 1件のみ・それも `is_test=true`（8/19）＝**自力決済の売上はまだゼロ** |
| 最後のAI会話セッション | **2026-08-23**（wangさん）。以降15日間ゼロ |
| 最長連続学習日数 | **3日**（全生徒の記録上の最高） |
| 送信済みフォローメール | **0通**（`ai_course_mail_log` 0行） |
| `ai_notification_queue` | 0行・アプリからの参照コード0箇所 |
| 実測AI原価 | $0.135/分（`ai_usage_daily` 68.3分 / $9.25） |
| イベント | app_open 344 / onboarding_completed 18 / battle 41 / quest 11（8/22〜9/7） |

生徒7人（CEO除く）: summer(XP395,最長1日,最終8/31) / yuki(110,2日,8/25) / n5learner(95,-,8/24) /
li(20,1日,9/6) / lin(20,1日,9/5) / wang(0,-,8/23) / eli(0,-,8/23)。
wang・eli は `targetJlpt` 未設定＝オンボーディング未完了。

## P0（いますぐ）

1. **中国の人が払える決済手段が実際には無い。** LPは「信用卡・支付宝・微信支付」を掲載するが、
   Stripeの `alipay_payments` / `wechat_pay_payments` capability は未申請（自社runbookに明記）。
   `payment_method_types` の指定も無い。13/13が決済画面で離脱している最有力の説明。
   → capability申請＋通るまでLPの表記を下ろす＋微信での手動導線をLPに明示。
2. **学習が途切れた人に何も届かない。** 稼働メールは `trial_not_started` / `trial_ended` /
   `expiring_soon` の購入導線3通だけ。学習系の通知は設計上ゼロ。
   → 既存 pg_cron に「2日空いた人」を1通足す。当面は毎朝の点検ボードに出して手で送るだけでも可。
3. **N5・N4にAI会話が出ないことがLPに書かれていない。** `aiConversationAvailable`（8/22 CEO決定）
   の仕様はアプリ内では注意表示があるが、¥600体験パスの売り文句は「AI语音会话3次」のまま。
   → LP/FAQに条件を1行。中期的には初級専用の会話モード。
4. **アプリ側ページのOGPがバド交流会のまま。** 微信でログインURLを送るたびに
   「川口・蕨バドミントン交流会」のカードが出る。→ AIコース配下でOGPを上書き。

## P1（質）

5. **AIの頭脳が gpt-4o-mini**（chat/report/translate 全部）。原価は制約でない
   （6ヶ月プランで音声180回≒$97＝売価の14%）。→ まず `AI_LESSON_REPORT_MODEL` だけ上位へ。
6. **会話で直された言い方が二度と出てこない。** 错题本/SRSに乗るのは選択問題の誤答だけで、
   `report.corrections[]` は当日の言い直しカードと復習ノートで終わる。
   → corrections を復習台帳に登録し翌日の冒険に1ステップ差す。**差別化の芯になる。**
7. **AI先生に生徒の記憶が無い。** `understoodSummary` を毎ターン生成して**保存も再利用もしていない**。
   → 終了時に corrections と併せて「生徒メモ」として蓄積し、次回プロンプト冒頭へ。
8. **1回4分の上限**（`ai_config.usage_limits.session_max_seconds=240`）。原価的にはプラン別に
   伸ばせる。LP内の「3〜10分钟」と料金カードの「4分钟」も不一致。
9. **パスワード再発行の導線が無い**（8/23監査 P1-8 が2週間未着手）。7人中4人がセッション0。

## P2（SEO・集客）

- **技術的SEOは直すところがほぼ無い**: canonical（study.→kawabado.com も正）・hreflang・
  JSON-LD（Course/FAQPage/BreadcrumbList）・プリレンダー22KB・robots.txt・llms.txt・sitemap。
  唯一 **hreflang が二重出力**（ja/zh/x-default が各2回）。
- **検索流入がそもそも無い**（LP閲覧26）。狙う相手は小红书・微信で探す。伸ばすなら日本語側
  （「中国人 日本語 会話」「在日中国人 日本語 話せない」等）。ただし P0 が片付くまで着手しない。
- **中国本土から音声会話は繋がらない**（ブラウザが `api.openai.com` へ直接WebRTC）。
  facebook/GA/GTM も本土では止まる。→ 失敗時のエラー文言を分岐。
- **「使っている人の声」が弱い**。4枚とも匿名、4枚目は不具合の話。
  → Before/After（`courseBeforeAfter`）を許可を取って1件載せるほうが強い。

## 止めることの提案

教材を増やすのを一旦止める。在庫はN3語彙14,791問・N2語彙21,343問・読解220セット・聴解200セットあり、
使われている量の数百倍。作る対象を「教材」から「戻ってくる理由」へ。
