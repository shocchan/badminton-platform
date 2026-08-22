# AIコース 運用ランブック（2026-08-21）

毎日の確認・異常時の対処・復旧手順をここに集約する。
決済の有効化手順は `selfserve-checkout-runbook.md`、法務の未決事項は `legal-open-questions.md`。

---

## 1. 毎日見るもの

管理画面 `https://kawabado.com/ja/ai-course/admin`（管理者ログインが必要）。

| タブ | 見るもの |
|---|---|
| **今日** | 要対応リスト＋**学習ファネル**（購入→発行→初回設定→会話開始／D1・D7再訪／会話エラー） |
| **教材** | 教材レビューの進捗。1日20件ずつ確認する |
| **運用** | **運用アラート**（未解決）／AIコスト残高／課題報告 |
| 受講権 | 購入台帳・発行済みアカウントの期間 |

ファネルの割合は必ず「n / 分母」の実数と併記される。**人数が少ない間は%を信用せず実数を見る。**

---

## 2. 自動で動いているもの（cron）

| ジョブ | 時刻(JST) | 中身 |
|---|---|---|
| `ai-course-monitor-daily` | 9:00 | 異常を検知しアラート化。重大は即メール |
| `payment-reminder-daily` | 10:00 | 大会の未入金督促 |
| `ai-course-lifecycle-daily` | 10:30 | 購入者へのフォロー3通（未開始24h / 体験終了 / 期限3日前） |

確認:
```sql
select jobid, jobname, schedule, active from cron.job;
select jobid, status, start_time at time zone 'Asia/Tokyo' as jst
  from cron.job_run_details order by start_time desc limit 10;
```

手動実行（`dryRun` は検知するだけ・書き込みもメールもしない）:
```sql
select net.http_post(
  url := 'https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/ai-course-monitor',
  headers := jsonb_build_object('Content-Type','application/json',
    'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='reminder_cron_secret')),
  body := '{"dryRun":true}'::jsonb, timeout_milliseconds := 30000);
-- 応答: select status_code, content from net._http_response order by created desc limit 1;
```

---

## 3. アラートの種類と対処

しきい値・通知先は **`ai_config` の `monitoring` キー**で一元管理（コードに散らさない）。

| 種類 | 重大度 | 意味 | 対処 |
|---|---|---|---|
| `provision_failed` | 🔴 重大 | 決済されたのに自動発行が失敗 | **入金済みなのに学習を始められない人がいる。** 台帳の理由を見て `scripts/ai-course/create-student-login.mjs` で手動発行 |
| `provision_stuck` | 🔴 重大 | 決済から30分たっても未発行 | Stripe側のwebhook再送を待つ。30分以上続くなら手動発行 |
| `conversation_error` | 🟠 注意 | 同じエラーコードが24時間で3件以上 | コードを見て原因を切り分け（`mic_denied` は利用者環境・それ以外は要調査） |
| `stuck_sessions` | 🟠 注意 | 会話が6時間以上 `in_progress` のまま | 学習者は次回ログイン時に復旧ダイアログで再開できる。**中断して戻っていない人**の可能性が高いので声をかける |
| `cron_failed` / `cron_stale` | 🟠 注意 | 定期ジョブが失敗／30時間動いていない | 上のSQLで `job_run_details` を確認 |
| `events_missing` | 🟠 注意 | 学習はあるのに計測イベントが0件 | `ai_log_course_event` RPC かフロントの配線が壊れている |

- 同じ事象は1行に集約され、件数と初回・最終発生が残る（**同じ内容を毎日大量に送らない**）
- 重大は1件でも即メール。注意はクールダウン（既定20時間）後
- **アラートに会話内容・氏名・メールは含まれない**（件数とエラーコードのみ）
- 対応が終わったら管理画面で「解決済み」にする。再発すると自動で未解決へ戻る

しきい値を変えるとき:
```sql
update ai_config set value = value || jsonb_build_object('conversation_error_threshold', 5)
 where key = 'monitoring';
```

---

## 4. 教材レビューの進め方

管理画面「教材」タブ。対象は **640件**（語彙140 / N2文法180 / 聴解320）。

1. 種別で絞る（例: 語彙）→ 状態を「未確認」にする
2. 内容を読む。聴解は**音声を再生して**確認する
3. 気づいたことを「修正メモ」に書く
4. **確認済み** または **修正が必要** を押す（1件ずつ・保存される）
5. 「次の未確認へ」で進む（末尾まで行くと先頭へ戻る）

- 1日20件で語彙140は7日、全640件は約32日
- 本文はここから編集できない。直しはコード側で行う（メモを見て後日まとめて）
- 判定は**追記で記録**されるので履歴が残る。間違えたら別の判定を入れ直せば戻せる
- 一括で確認済みにする操作は**意図的に用意していない**

---

## 4-2. ふりがな（N5/N4）の直し方

N5/N4目標の学習者には、読解の本文だけでなく**設問・選択肢・聴解の場面説明/原稿**にも
ふりがなを出している（2026-08-22）。表示は目標レベルで決まる（N3/N2には出さない＝本物の試験と同じ）。

- 読みは辞書 `src/lib/aiLesson/course/adventure/advRubyDict.ts` に集めてある
  - `RUBY_RUNS_FROM_PASSAGE` … 手書きの本文ルビから写した読み（本文を直したらここも直す）
  - `RUBY_RUNS_EXTRA` … 設問・選択肢・聴解にしか出ない語
  - `RUBY_CONTEXT_RULES` … 前後の字で読みが変わる語（入れる/入ります、行く/行う など）
  - `RUBY_TEXT_OVERRIDES` … その文字列だけの例外（同じ書き方で読みが2つあるもの）
- **キーは漢字の連なりまるごと。** 「三日」を「三」＋「日」に割ると "さんにち" になる
- 辞書に無い語があると、その文字列は**ふりがな無しで出る**（誤読は絶対に出さない）

教材を足したあとは必ず走らせる:

```bash
./node_modules/.bin/vite-node scripts/ai-course/check-ruby-coverage.ts
```

足りない語が一覧で出るので、辞書に読みを書き足す。
テスト `advRubyAuto.test.ts` が同じ判定に加えて、
「注釈を剥がすと元に戻る」「ふりがながかなだけ」「手書き本文ルビと読みが食い違わない」を検査する。

---

## 4-3. N5・N4ではAI会話を出さない（2026-08-22 CEO決定）

**目標レベルがN5・N4の学習者には、アプリのAI会話を一切出さない。** この時期の会話は先生が授業でやる。

- 理由: 語彙・文法・読解・聴解は初級まで作り込んであるが、AI会話の中身はその水準に届いていない。
  届いていないものを毎日の冒険に混ぜると、生徒の時間を薄いところに使わせることになる
- 判定は1か所: `advTypes.ts` の `aiConversationAvailable(goalType, targetJlpt)`
- そこから3か所が連動する
  1. `advRoute.ts` … hybridでも会話stageをルートに入れない（提示した道と毎日の中身を一致させる）
  2. `advQuest.ts` … 会話step・hybridの穴埋め・空クエストの逃げ道の3経路すべてを閉じる
  3. `AdvOnboarding.tsx` / `AdvShell.tsx` … 「AI会話は出ません」と選んだその場で伝える／先生画面の文言から外す
- **会話そのものを目的に選んだ人（goalType='conversation'）は対象外**。目標レベルを持たないため
- 2026-08-22 より前にhybrid×N5/N4で作られた保存済みルートには会話stageが残っている。
  その人が会話stageに立っても行き止まりにならないよう、通常stageとして扱う（テストで固定）
- 検査: `advNoAiConversationN5N4.test.ts`（目的×帯×時間×日付×教材の有無を総当たり）

---

## 5. バックアップと復旧

| 対象 | 方法 |
|---|---|
| DB | 1日2回の自動バックアップ（`com.kawabado.supabase-backup`）。手動は `launchctl start com.kawabado.supabase-backup` |
| フロント | 前のコミットへ戻して `./scripts/deploy-production.sh`（配信ハッシュまで自動検証される） |
| migration | 各 `*.sql` に対応する `*.rollback.sql` がある。`node scripts/ai-course/remote-sql.mjs --file <rollback> --write` |
| Edge Function | 前のコードで `supabase functions deploy <name> --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw` |

**DBの権限を締める変更は必ず「フロント本番反映 → 確認 → 締める」の順**
（2026-08-20 に逆順でやって申込フォームが数時間401になった）。

---

## 6. やってはいけないこと

- 学習者の受講権・購入・学習記録を、確認せずに削除・変更する
- 教材をAIの判断だけで `reviewed` にする
- 本番で実決済のテストをする（Stripeの手数料は返金しても戻らない）
- 素の `wrangler` で本番へ投げる（`deploy-production.sh` はハッシュ検証つき。素のwranglerには無い）
- 学習者へテスト通知を送る

---

## 7. 既知の未解決事項

| 事項 | 状態 |
|---|---|
| 返金・キャンセル条件 | 「プランにより異なります」のまま。特定継続的役務提供の該当確認が未了 → `legal-open-questions.md` |
| 教材の人間確認 | 640件すべて未確認（この文書の4章で進める） |
| 今日の冒険の地域ゲート | 体験パスの3地域制限が**マップ表示にしか効いていない**。step生成は範囲外（実害は小さいが一貫性が崩れる）。「3地域を攻略し尽くした体験者に何を出すか」は商品判断が要る |
| ~~N5・N4 の聴解~~ | ✅ 2026-08-22 に各60セットへ拡充（N3/N2と同じ20セット/種別）。全320セット・音声320件 |
| 孤児の受講権 | 1行が存在しない購入を参照している（QA時に購入行だけ削除した残骸）。**未修正・要判断** |
| Alipay / WeChat Pay | Stripeの権限が未申請。ダッシュボードでの有効化がCEO作業 |
| 匿名の破壊的権限 | 2026-08-21に6テーブルから剥奪済み（`20260821183000`） |
