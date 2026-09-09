# 学習継続・行動設計OS 徹底監査（2026-09-09）

出典: `~/badminton-sales @ ux-audit/quick-wins-2026-09-09` のコード実測と、
`scripts/ai-course/data/prewrite-snapshots/2026-09-09T03-56-59-163Z-ai_learners.json`（本番の読み取り済みスナップショット）。
**コードは1行も変更していない。DBへも書いていない。**

前回の全面点検（`2026-09-07_SERVICE_REVIEW.md`）と重ならない部分だけを書く。
決済・OGP・モデル原価・N5会話・パスワード再発行は前回で扱ったのでここでは触れない。

---

## Executive Summary

**教材と出題は完成している。壊れているのは「続いた」を数える物差しと、外から声をかける経路。**

このシステムは「今日の一手を決める」までは商品として成立している。今日の冒険は毎日1つのCTAに
畳まれ、復習は渋滞したら自動で分散され、攻略は「別の日に3回＋7日後」という証拠でしか認めない。
ここは競合が真似しにくい。

問題はその外側にある。3つ。

1. **「学習した日」の定義が3か所でバラバラで、しかも一番狭い定義が画面と管理を支配している。**
   かな道場だけの日・AI会話だけの日・途中まででやめた日は、どこにも「学習した日」として残らない。
   実例: 小蒋さんは3日かけてかな18行を終えたが、システム上の学習日数は **0日**、ストリークは
   **null**、管理画面の表示は **「未学習」**。この人に出る先生の一言は今も「はじめまして」。
2. **戻ってくる理由が、アプリの外に一つも出ていない。** 3日空いた人へのメールは
   `_shared/aiCourseLifecycle.ts` に本文もテストも**完成しているのに、どのEdge Functionからも呼ばれていない**。
   `ai_notification_queue` テーブルは1年前から存在して0行・参照コード0箇所。
3. **成長実感の一番いい部品が、いまの生徒に到達しない。** 「休みをお願いできるようになった」型の
   Can-do表示（`courseCanDo.ts` / `CanDoAchievementCard`）と Before/After 発話比較は実装済みだが、
   V2生徒のナビは「今日の冒険／冒険マップ／設定」の3つしかなく、成長タブが**存在しない**。
   半年の成長として出るのは「学習日数・問題数」だけ。CEOが「32%では不十分」と言ったその形になっている。

30日の問いへの答え: **いまの実装では、人が声をかけなければ30日はもたない。** 実測の最長連続学習日数は
3日で、4日目に届いた人はまだ一人もいない。半年の問いへの答え: **半年もたない。** questLog は
直近60件で切られるので、半年使った人は前半120日の記録が消える。

---

## Top 10 Gaps

| # | Gap | 実測の根拠 |
|---|---|---|
| 1 | 「学習した日」の定義が3つあり、最も狭いものが画面を支配 | 小蒋さん: かな18行/3日 → 学習日数0・streak null・管理画面「未学習」 |
| 2 | 3日離脱メールが実装済みで未配線 | `stalledDecision` の呼び出し元が `*.test.ts` 以外に0件 |
| 3 | questLog は「全step完了＋締めくくるボタン」でしか書かれない | `AdvShell.tsx:3583` の `allDone` 条件。途中までの日は記録ゼロ |
| 4 | 成長タブがV2生徒に存在しない（Can-do・Before/Afterが到達しない） | `CourseHeader.tsx:72` の `navItems(showLab, v2Mode=true)` は3項目 |
| 5 | 今日学んだ文法 → AI会話の接続が未実装 | `missionByGrammarId` を消費するコードが0件。会話は旧12週ミッションが選ぶ |
| 6 | AI会話の誤りが復習「問題」に戻らない（自己申告カードのみ） | 錯題本は mastery 台帳＝選択問題のみ。restate は1/3/7日の自己申告 |
| 7 | ミナモ列島の物語（章1〜10・約1,400行）がV2生徒に到達しない | `AiCoursePage.tsx:1158` 付近 `!advOn` ゲート。全13生徒が advEnabled=true |
| 8 | 復習系イベントが1つも配線されていない | `review_scheduled` / `review_completion` は型にあるが `trackAdv` 呼び出し0 |
| 9 | 再訪の集計が D1・D7 のみ。TTFVが「初回AI会話」基準 | `adminFunnel.ts` の `retention` は d1/d7。N5・N4と会話OFFの生徒はTTFV永久null |
| 10 | 週の希望日数（weeklyDays）を聞いて使っていない | 表示3か所のみ。計画にも催促にも影響しない |

---

## Retention Risk

### 実測（本番・テストアカウント除く8人）

| 生徒 | 登録 | 学習日数 | 最長連続 | 最終学習 | 完走した冒険 | 言い直し |
|---|---|---|---|---|---|---|
| sho | 7/19 | 5 | 3 | 8/26 | 3 | 0 |
| サマー | 8/15 | 6 | 2 | 8/31 | 4 | 0 |
| 李 | 8/14 | 4 | 2 | 9/09 | 3 | 0 |
| ユウキ | 8/17 | 4 | 2 | 8/31 | 1 | 0 |
| リン | 9/02 | 1 | 1 | 9/05 | 1 | 0 |
| eli | 8/23 | 1 | 1 | 9/07 | 0 | 0 |
| 小蒋 | 8/22 | 0※ | 0 | — | 0 | 0 |
| sijia | 8/23 | 0※ | 0 | — | 0 | 0 |

※ 小蒋さんはかな18行、sijiaさんは会話ミッション1回を実際に終えている。
   いまの定義では両方とも「学習日数0」になる（Gap 1）。

- **診断の完了率は 8/8（100%）。** オンボーディングは壊れていない。
- **診断後に一度も学習しなかった人が 2/8（25%）。** 離脱点はオンボーディングではなく、
  「ルート提示 → 最初の冒険の1step目」の1回だけ。
- **言い直し（restate）の実行は全生徒で0件。** PRODUCT_CANON §4 の毎日ループに
  「レポート → 言い直し → 復習登録」と書いてあるが、5分設定では restate step が
  そもそも生成されず（`advQuest.ts` の minutes===5 分岐に無い）、実在の生徒の半分は5分設定。

### D1 / D7 / D30 で切れる理由

| 地点 | 切れる理由 | 根拠 |
|---|---|---|
| **D1** | 初日に「できるようになった」が出ない。診断12問→ルート→1step目で終わる。翌日に来る理由が「明日も冒険がある」だけ | 初日の完了画面は step の✓と XP。Can-do は到達しない |
| **D3** | 2〜3日目で最初の「別日3回」が揃わないまま、7日待ちのstageに入って**新しいことが減る**。`pickContentStage` が前倒しで救うが、体感は「同じ束をまた解く」 | 実測の最長連続が3日で全員止まっている |
| **D7** | 空いた瞬間に届くものが何も無い。おかえりカードは**開いた人にしか出ない** | `ai_course_mail_log` 0行 / 通知キュー0行 |
| **D30** | 半年の成長表示が「日数・問題数」。1か月続けても「何ができるようになったか」が言語化されない | `advGrowthHorizons` は studyDays / completedQuests / passedCount / attempts の4つだけ |

---

## Learner Memory（何を覚えていて、何が次の学習を変えているか）

| 覚えているもの | 保存先 | 次の学習を変えるか |
|---|---|---|
| 出題された問題キー・誤答キー | `mastery[].questionKeys/wrongKeys` | **変える**（錯題本→復習バトル） |
| 攻略の別日3回・7日後確認 | `mastery[]` | **変える**（確認バトルを最優先） |
| 技能別スコア（語彙/文法/読解/聴解） | `skills` | **変える**（読解・聴解の配分） |
| 直近の弱点文法 | 誤答から導出 | **変える**（弱点補強step） |
| 目標レベル・試験日・1日の分数 | `targetJlpt` `examDateISO` `dailyMinutes` | **変える**（語彙バンド・step数） |
| 同じ束で別日3回不合格 | `stuckSkips` | **変える**（つまずき救済） |
| かなの進み | `kana.doneRowIds` | **変える**（かな道場の行） |
| 会話で直された言い方 | `ai_learning_sessions.report.corrections` | **一部**（1/3/7日の自己申告カードのみ。問題にならない） |
| 会話の難易度 | `learners.difficulty_level` | **変える**（旧エンジンの会話のみ） |
| 覚えたことば（図鑑） | `mastery` から導出 | **変えない**（表示のみ） |
| ことば集め | `proverbDex` | **変えない**（10日後の1回想起のみ） |
| 週に何日やりたいか | `weeklyDays` | **変えない** |
| 応答速度 | **記録していない** | — |
| 発音 | **記録していない**（音声はブラウザ→OpenAI直結） | — |
| 中断した学習（どこでやめたか） | **記録していない**（`quest_abandoned` は型のみ・未配線） | — |
| 難易度の好み | **記録していない**（V2バトルはtier固定） | — |

**判定: 台帳は厚い。だが「覚えていること」の半分は表示にしか使われていない。**
一番惜しいのは会話。売っている看板が会話なのに、会話の失敗だけが選択問題の復習ループに入らない。

---

## Next Best Action

**ここは良い。** `advQuest.generateTodayQuest` が
①期限切れ復習 → ②弱点 → ③ボス/読解stage → ④未習得教材 → ⑤新しいことば → ⑥会話 の順で
その日のstepを組み、Homeは常に「次の1つ」だけを青いボタンにする。
`nextStepIdx` で先頭が決まり、押せない時は必ず理由を出して先へ進む道を残す（原則15が実装されている）。

弱いのは3点。

1. **AI会話ミッションの中身が事前に分からない。** 題名は「AI会話ミッション」固定で、
   実際のテーマは旧エンジンの12週ミッションが決める。今日学んだ文法との接続は
   `advConversationBridge` に作ってあるが**誰も呼んでいない**。
2. **「昨日忘れた3語を2分」がない。** 復習は「復習 N問」（錯題本）で、CEOが例に挙げた
   語レベルの短時間復習は V1 の VocabularyHub 側にあり、そちらは sessionStorage 保存
   （`vocabPersistence.ts` は「まだどこからもimportしない」と明記）。
   V2生徒がマップの「オモイデ庭園」から入ると、その復習予定はタブを閉じると消える。
3. **完了後の次の一手が「明日」しかない日がある。** step完走後は締めくくりに進むだけで、
   おかわりバトル・語彙・図鑑への誘導は出るが、「今日はここまでが最善」と言い切る一言は無い。

---

## Minamo Islands（学習継続エンジンとして機能しているか）

**現状: 進捗の可視化としては接続済み。物語としては切断されている。**

接続されているもの:
- 地域の状態（done / current / next / locked）は `mastery` 台帳の実測から導出（`advMapModel`）
- 目標レベルが上がると道が地図の上へ物理的に伸びる（`advWorldSpine.TARGET_END`）
- Homeの上部に「いまいる街」のヒーロー画像が出る
- 会話は環状路の週ノードとして別レイヤーで進む

切断されているもの:
- **章1〜10の物語（`rpg/chapters*Data.ts` 約1,400行、Chapter1AdventurePanel 809行）は
  `!advOn` でゲートされ、実在の生徒13人全員に到達しない。**
- 地域を攻略しても、世界の側で起きる変化は「色が変わる・旗が立つ」だけ。
  会話をしても新しい場所は開かない（会話レーンは攻略判定を持たない）。
- ことば集め（`proverbDex`）は世界と無関係な別コレクション。

**繋ぐと効果が高い順:**
1. **stage攻略 → その地域の短い物語1枚（3〜4分）を解放。** 章データは既にある。
   `!advOn` のゲートを「初回だけ・攻略の直後だけ」に緩める差分で足りる。
2. **ことば集め → 地域の持ち物にする。** いまは40件のフラットな図鑑。地域ごとに配ると
   「この街で拾った」という記憶の掛かりができ、地図を開く理由になる。
3. **会話の完了 → 会話レーンのノードを1つ進める。** 現状は週番号でしか進まないので、
   会話を1回終えても地図は動かない。

---

## Comeback（離脱復帰）

| 空いた日数 | いま起きること | 判定 |
|---|---|---|
| 3日 | **アプリ外: 何も届かない。** 開けば「おかえりなさい。3日ぶりですね／今日は短くて大丈夫です。まず1つだけ」＋2週間スタンプ＋今日のことば | 開いた人には良い。開かない人には届かない |
| 7日 | 同上（文言が「今日は3分だけにしましょう」に変わる）。復習が溜まっていれば `advReviewForecast` が今日ぶんへ分散し、「◯件溜まっています」は**出さない** | 絶望させない設計は実装済み |
| 14日 | 同上。ペース警告は復帰初日だけ抑制される | 良い |
| 30日 | 同上。ただし `visit` の保持は30日なので「◯日ぶり」が出せる上限。受講権の期限切れが先に来る | 期限切れの案内はあるが学習の案内は無い |

**最大の穴: 3日離脱メールが実装済みで未配線。**
`_shared/aiCourseLifecycle.ts:485-540` に `stalledDecision` / `stalledDedupeKey` / `buildStalledMail`
（日中2言語・売り込みなし・「記録はぜんぶ残っています」）が揃い、`aiCourseStalled.test.ts` も通っている。
`ai-course-lifecycle-mails/index.ts` が呼んでいるのは trial 系3通だけ。

**さらに注意: IDログインの生徒には実メールが無い**（`@id.badminton-platform.pages.dev`）。
配線しても現生徒7人には届かない。届くのは実メールで登録する自力購入者と Friends Beta の招待者。
現生徒に届く経路は微信だけで、そこは人がやるしかない。

---

## Personalization

同じN3学習者でも、いまのHomeは**同じ形**になる。変わるのは中身の一部だけ。

| 差 | いま変わるか |
|---|---|
| 語彙は強いが話せない | **一部**。読解・聴解の配分は変わるが、会話の量は変わらない（会話は隔日固定） |
| 話せるが文法が弱い | **変わる**。弱点補強stepと錯題本が文法に寄る |
| 仕事の敬語だけ弱い | **変わらない**。場面別の弱点という軸が存在しない（技能は語彙/文法/読解/聴解/会話/実践/継続の7軸） |
| 週3日希望 vs 週7日希望 | **変わらない**（Gap 10） |
| 5分 vs 30分 | **変わる**（step数・語数） |

**判定: 「何を出すか」の最適化はある。「どう出すか」「どれだけ出すか」の最適化がない。**
そして画面の構造は全員同一なので、体感の個別性は先生の一言（`teacher` の文面）に依存している。

---

## Metrics（100人Betaで取るべきもの）

### いまあるもの（重複させない）

- **GA4 / `trackAdv`**: 46イベント配線済み。`day_2_returned` `day_7_active` も既にある
- **自前DB `ai_course_events`**: `app_open` / `onboarding_start` / `onboarding_completed` /
  `quest_completed` / `battle_completed` / `report_viewed` / `hint_requested` / `trial_*` /
  `upgrade_*` / `auth_*` / `error_occurred`（12種・1人1日400件上限・props 2KB）
- **集計**: `adminFunnel.buildCourseFunnel` が purchase / activity / **retention(d1,d7)** / ttfv / errors

CEOが挙げた14イベントのうち、**first_open=app_open / first_lesson_start=today_quest_started /
first_lesson_complete=today_quest_completed / conversation_start / streak / day_2 / day_7 は既にある。**
新しい名前で足すと二重計上になる。

### 足すべきもの（5つだけ）

| # | イベント | なぜ要るか | 実装の形 |
|---|---|---|---|
| M1 | `day_active`（1日1回・kindに実際の行動種別） | Gap 1・3を計測で塞ぐ。かな・会話・途中までの日を「来て手を動かした日」として残す | `ai_course_events` に既存RPCで1行 |
| M2 | `review_start` / `review_complete` | 復習ループが回っているかを**外から**確認できるようにする。いま型だけあって0件 | `trackAdv` + `logCourseEvent` |
| M3 | `next_action_click`（押されたstepのkind） | 「次の一手」が実際に押されているか。押されないstepの種類が分かる | AdvShell `runStep` の先頭 |
| M4 | `quest_abandoned`（stageKey＝どのstepで止まったか） | 型は既にある・未配線。D1離脱の場所が分かる唯一の手段 | AdvShell の画面離脱時 |
| M5 | `onboarding_abandoned`（phase名） | 診断9画面のどこで消えるか。いまは完了しか見えない | AdvOnboarding の unmount |

### 集計の追加（コードよりSQL側）

- `retention` に **d3 / d14 / d30** を足す。`app_open` が既に毎日入るので追加イベント不要
- **継続条件を login ではなく meaningful learning action にする。**
  提案する定義:
  > **その日に、①バトル・読解・聴解・模試のいずれかを1つ完走した ②AI会話を1回終えた
  > ③かな道場の行を1つ終えた ④新しいことばの学習を1回終えた ⑤言い直しに答えた
  > ——のどれかがあった日**
  >
  > 「開いただけ」「今日のことばを読んだだけ」は `visit` として別に数え、
  > 学習日には**混ぜない**（advVisit.ts が既にこの分離を守っている）。
- TTFV の基準を「初回AI会話」から「**初回step完走**」へ変える。
  いまの定義では N5・N4目標の人と会話OFFの人（李さん）は永久に測定不能。

---

## Priority

### P0 — 継続を大きく阻害する

#### P0-1 「学習した日」の定義を1つにする

- **current state**: 定義が3つ。`advStreak.activeDayKeys`（questLog∪mastery）／
  `adminFunnel`（sessions∪ai_usage_daily∪ai_course_events）／
  `adminAccountModel.lastStudyDateKey`（adv∪usage）。画面と管理は一番狭い定義を使う
- **problem**: かな道場・AI会話単独・ことば集め・途中までの日が「学習した日」に入らない
- **learner behavior**: 小蒋さんは3日で18行やったのに、次に開くと先生が「はじめまして」と言う。
  ストリークは一生1にならない。管理画面では「未学習」なので、しょっちゃんの朝の点検にも
  「学習していない人」として並ぶ
- **proposed solution**: `AdventureV2Profile` に `activeDays: string[]`（直近180日・上限つき）を足し、
  **stepを1つでも終えた瞬間**に当日キーを積む。`advStreak.activeDayKeys` / `advGrowthHorizons` /
  `advAdminUsage` はこの1つを読む。questLog は「完走した冒険」の意味のまま残す（数字の意味を混ぜない）
- **expected impact**: streak が実態に一致する。停滞アラートの偽陽性が消える。
  半年の成長表示の分母が正しくなる
- **difficulty**: 中（純関数＋保存1か所＋読み手3か所）
- **affected files**: `advTypes.ts` / `advProfile.ts` / `advStreak.ts` / `advGrowthHorizons.ts` /
  `adventure/advAdminUsage.ts` / `AdvShell.tsx`（step完了ハンドラ）
- **DB impact**: **なし**（jsonb内・migration不要）
- **conflict risk**: **低**。Friends Beta は `plans/` と `supabase/` 側、payment/login は別ファイル

#### P0-2 3日離脱メールを配線する

- **current state**: 判定・本文・冪等キー・テストが全部あり、呼び出し元が0
- **problem**: 途切れた人に、アプリの外から届くものが何も無い
- **learner behavior**: 3日空くと戻ってこない。実測で4日目に到達した人が一人もいない
- **proposed solution**: `ai-course-lifecycle-mails/index.ts` の日次処理に
  `stalledDecision` の分岐を1つ足す。`ai_course_mail_log` の dedupe_key はそのまま使える。
  **`isDeliverableEmail` で内部ドメインを外す挙動は変えない**（不達をログに残さない）
- **expected impact**: 自力購入者と Friends Beta 参加者に、離脱1回につき1通が届く。
  現生徒7人には届かない（微信は人の仕事）
- **difficulty**: 小（Edge Function 1ファイルに1分岐）
- **affected files**: `supabase/functions/ai-course-lifecycle-mails/index.ts` のみ
- **DB impact**: なし（既存の `ai_course_mail_log` / `mail_job_runs`）
- **conflict risk**: **中**。同じファイルを payment observability（9/9・commit 4be7ea9）が
  触ったばかり。**Friends Beta の招待メール実装と衝突しうる**ので、
  そちらがマージされてから入れる

#### P0-3 途中まででも記録が残るようにする

- **current state**: `questLog` は `allDone && 締めくくるボタン` でしか書かれない（`AdvShell.tsx:3583`）
- **problem**: 4stepのうち2step終えて閉じた日は、バトルが無ければ記録が丸ごと消える
- **learner behavior**: 忙しい日にやったことが翌日に見えない。「昨日もやったのに0日」
- **proposed solution**: P0-1 の `activeDays` で解決する（同じ差分）。
  加えて `quest_completed` イベントに `partial` フラグを足し、完走率を分母つきで見られるようにする
- **expected impact**: 「時間がない日の学習」が可視化され、Micro Commitment が成立する
- **difficulty**: 小（P0-1 に含まれる）
- **affected files**: 同上 ＋ `courseEvents.ts`（props追加のみ）
- **DB impact**: なし
- **conflict risk**: 低

### P1 — retention に強く効く

#### P1-1 成長タブをV2生徒に戻す（Can-do・Before/After）

- **current state**: `navItems(showLab, v2Mode=true)` は home / roadmap / settings の3つ。
  `GrowthOverview`（Can-do / Before-After / 技能サマリ）は実装済みで到達しない
- **problem**: 「何ができるようになったか」が画面のどこにも出ない。半年の段は日数と問題数だけ
- **proposed solution**: 旧コースの成長画面をそのまま出すのではなく、**V2の週まとめ（`view==='weekly'`）に
  Can-do 1枚を足す**。材料は `courseCanDo.CAN_DO_BY_CATEGORY` × 会話の `ItemProgress`。
  会話をしていない生徒には出さない（無いものを出さない）。
  試験ルートの Can-do は `advMapModel` の `abilityJa` を使って
  「N3の敬語で休暇を相談する問題に7割以上で3日通った」という**実測の言い方**にする
- **expected impact**: D30 の「続ける理由」が外発（XP・スタンプ）から内発（できるようになった）へ移る
- **difficulty**: 中
- **affected files**: `AdvShell.tsx`（weeklyビュー）/ `courseCanDo.ts`（読むだけ）/
  新規 `advCanDo.ts`（試験ルート側の言い換え）
- **DB impact**: なし
- **conflict risk**: 低

#### P1-2 今日の文法をAI会話のテーマにする

- **current state**: `advContent.ts:414` が `missionByGrammarId` を作り、消費するコードが0。
  会話は旧12週ミッション（`buildLessonPlan`）が選ぶ
- **problem**: 学ぶ → 使う のループが切れている。会話が「今日の続き」に見えない
- **proposed solution**: `AdvShell` の `conversation_mission` step が `props.onStartConversation` を
  呼ぶとき、`ConversationMissionSpec`（themeJa / starterJa / acceptKeys）を渡す。
  `AiCoursePage` 側は plan の main.mission を差し替えず、**mission の targetExpression だけを
  今日の文法で上書き**する（旧エンジンの復習スケジュールを壊さない）
- **expected impact**: 会話1回あたりの学習密度が上がる。`detectTargetUsage` が既にあるので
  「今日の表現を自分で使えた」を初日に出せる（First Win）
- **difficulty**: 大（2つのエンジンの境界に触る）
- **affected files**: `AdvShell.tsx` / `AiCoursePage.tsx` / `advContent.ts`（既存の戻り値を使うだけ）
- **DB impact**: なし
- **conflict risk**: **中**。`AiCoursePage.tsx` は login / payment / Friends Beta が集中する場所

#### P1-3 会話の誤りを「問題」として復習に戻す

- **current state**: `advRestateReview` が1/3/7日後に自己申告カードで出す（9/7実装・利用実績0）
- **problem**: 選択問題の誤答は錯題本→バトルで潰せるのに、会話の誤りは自己申告で終わる
- **proposed solution**: `report.corrections` の `original` / `improved` から
  **2択の並べ替え問題**を機械的に作り（原文 vs 直した文）、錯題本バトルの末尾に1〜2問混ぜる。
  正誤は `mastery` に `conv:` プレフィックスのキーで積む。
  ※ AIで問題を生成しない（原価ゼロ・決定的）
- **expected impact**: 「会話で直された→数日後に問題で出会う→できた」が成立し、
  会話を売っている商品の看板が実装で裏付けられる
- **difficulty**: 中
- **affected files**: `advRestateReview.ts` / `advMistakeNotebook.ts` / `AdvShell.tsx`
- **DB impact**: なし
- **conflict risk**: 低

#### P1-4 5分設定に言い直しstepを入れる

- **current state**: `advQuest.ts` の `minutes===5` 分岐に restate が無い。実在生徒の半数が5分設定
- **problem**: PRODUCT_CANON §4 の毎日ループに書いてある工程が、半数の生徒に一度も出ない
- **proposed solution**: 5分設定でも、素材がある日は restate（2分）を**1つだけ**入れる。
  その日の他のstepを1つ減らす（足さない）
- **difficulty**: 小
- **affected files**: `advQuest.ts` のみ
- **DB impact**: なし / **conflict risk**: 低

#### P1-5 計測を5つ足し、D3/D14/D30を集計する

- 上の Metrics 節のとおり。`ai_course_events` の既存RPCで足りる
- **affected files**: `courseEvents.ts`（kind追加）/ `advAnalytics.ts`（配線）/ `adminFunnel.ts`（集計）
- **DB impact**: なし（RPCは `p_kind` を文字列で受ける）
- **conflict risk**: 低

### P2 — 体験を大きく改善する

- **P2-1 ミナモ列島の物語を攻略の報酬にする。** stage攻略の直後だけ、その地域の章を1枚出す。
  `!advOn` ゲートの条件変更＋章の呼び出し。1,400行の既存資産が動き出す
- **P2-2 語彙の間隔反復をDBに載せる。** `vocabPersistence.ts` は「未接続」のまま、
  テーブル（`ai_course_vocab_item_progress` 他）は migration 済み。
  V2生徒がマップの復習地域から入ると sessionStorage の予定を触ることになる。
  **接続するか、V2生徒の導線から外すかの二択。** 中途半端が一番悪い
- **P2-3 weeklyDays を使う。** 「今週はあと2日」と言い、休む予定の日には催促しない。
  聞いた以上は使う（聞いて捨てるのは信頼の問題）
- **P2-4 会話ミッションの題名に中身を出す。** 「AI会話ミッション」→「AI会話：休みをお願いする」

### P3 — あると良い

- **P3-1 応答速度の記録。** 問題ごとの解答秒数を `mastery` に足す（難易度適応の材料）
- **P3-2 復習間隔の適応。** いまは 1/3/7/30・別日3回・7日後がすべて固定。
  正答率で間隔を伸縮させる（ただし100人のデータを見てから）
- **P3-3 questLog 60件上限の見直し。** 半年利用で前半が消える。
  日単位のサマリ（日付＋完走数）なら180日ぶんでも数KBに収まる
- **P3-4 場面別の弱点軸。** 「仕事の敬語だけ弱い」を表現できる軸がいま無い

---

## Implementation Plan

### 段階1: 100人Beta の前（机上で決めてよい／1〜2週）

| 順 | 項目 | 理由 |
|---|---|---|
| 1 | **P0-1 学習した日の定義統一** | これが無いと、100人の行動データが最初から歪む。計測の土台 |
| 2 | **P1-5 計測5つ + D3/D14/D30** | 100人が来る前に入れないと、その100人のデータが取れない |
| 3 | **P0-2 3日離脱メール配線** | Friends Beta のマージ後。1分岐で終わる |
| 4 | **P1-4 5分設定の言い直し** | 1ファイル。canon との食い違いを消す |

### 段階2: 100人Beta の最中（人が見て判断する／Beta 1〜4週目）

| 順 | 項目 | 見るもの |
|---|---|---|
| 5 | **P1-1 Can-do を週まとめへ** | D7→D14 の残存が動くか |
| 6 | **P2-4 会話ミッションの題名** | 会話stepの押下率（M3） |
| 7 | **P2-2 語彙復習の去就を決める** | 復習地域の到達数を見て、繋ぐか外すか |

### 段階3: 実データが出てから（100人の行動を見て決める）

| 項目 | 決める材料 |
|---|---|
| **P1-2 文法→会話の接続** | 会話stepの完走率と、会話をした人としない人のD30差 |
| **P1-3 会話の誤りを問題化** | restate の実行率（いま0件。まず出ているか） |
| **P2-1 物語の解放** | stage攻略に到達した人数。到達0なら物語より手前に問題がある |
| **P3-2 復習間隔の適応** | 固定間隔での正答率分布。分布が無いうちに適応を作らない |

**机上で作らないもの**: 復習間隔の適応、場面別の弱点軸、通知の増量、ゲーミフィケーションの追加。
どれも「100人が実際にどこで止まるか」を見ないと、当てずっぽうの機能が増えるだけになる。

---

## Conflict Report

現在進行中の実装と、この監査の提案がぶつかる箇所。

| 提案 | 衝突相手 | リスク | 回避 |
|---|---|---|---|
| P0-2 離脱メール配線 | **Friends Beta**（未コミット: `supabase/functions/ai-course-beta-invite/`）と **payment observability**（commit 4be7ea9） | **中**。どちらも `ai-course-lifecycle-mails` 周辺とメールログを触る | Friends Beta がマージされてから、1分岐だけ追加 |
| P1-2 文法→会話 | **login**（commit cd70a67 が `AiCoursePage` 周辺）／**Friends Beta**（plan gate） | **中**。`AiCoursePage.tsx` は今いちばん人が入っているファイル | 段階3へ回す。Beta が落ち着いてから |
| P0-1 学習した日の定義 | なし | **低**。`adventure/` 配下と jsonb 内で閉じる | そのまま進めてよい |
| P1-5 計測 | **100人dashboard**（`adminFunnel` を拡張中の可能性） | **低〜中**。`retention` の型に d3/d14/d30 を足す | dashboard 側の担当と型を先に合わせる |
| P1-1 Can-do | **testimonial**（`AdminTestimonialsCard` / `TestimonialPrompt`） | **低**。表示場所が近いだけ | 週まとめの中に置く（Homeを増やさない） |
| P2-2 語彙復習のDB化 | **Supabase migration の順番** | **中**。`20260728000000_ai_course_vocab_persistence.sql` が未適用の可能性 | 適用状況の確認が先。適用しないなら導線を外す判断 |

**触ってはいけないもの（この監査では一切提案しない）**: `payment` / `login` / `auth` /
`admin` の権限まわり / `ai_course_access` の受講権判定 / Stripe webhook。

---

## 学習者OS 採点

| 項目 | 点 | 根拠 |
|---|---|---|
| Knowledge 知識を教えられる | **9** | N3語彙14,791問・N2語彙21,343問・読解220セット・聴解200セット・文法draft N5〜N1。在庫は使用量の数百倍 |
| Practice 練習できる | **8** | バトル・読解・聴解・中ボス・模試・AI会話。自由産出は会話のみ |
| Memory 学習者を覚えている | **6** | 台帳は厚いが、かな・会話単独・途中までが「学習」に入らない。応答速度・中断は未記録 |
| Personalization 個人最適化 | **5** | 何を出すかは変わる。どれだけ・どう出すかは全員同じ。weeklyDaysは無視 |
| Guidance 次に何をすべきか | **8** | 今日の冒険＝1CTA。押せない時も理由と逃げ道がある。会話の中身だけ不明 |
| Motivation 続ける理由 | **5** | XP・ストリーク・スタンプ・ことば集め（外発）は揃った。内発（できるようになった）が画面に無い |
| Habit 習慣化 | **3** | アプリ外の接点ゼロ。実測の最長連続3日・4日目到達0人 |
| Recovery 離脱後の復帰 | **6** | おかえりカード・渋滞レスキュー・「まず1つだけ」は実装済み。**戻る前に届くものが無い** |
| Progress 成長実感 | **4** | 半年の段が日数と問題数。Can-do と Before/After は到達しない |
| World / Experience | **4** | 地図は実データ連動。物語1,400行が到達しない。世界の変化が色と旗だけ |
| Human Support 人へ接続 | **7** | 先生ノート・相談3件・停滞検知は管理側にある。学習者から呼ぶ導線が弱い |
| Switching Cost 離れにくさ | **6** | 錯題本・図鑑・台帳は貯まる。ただし questLog 60件上限と単一jsonbで半年もたない |

**合計 71 / 120。**

---

## 最大の問い — GPTより、これを使い続けた方が得か

**いまは「条件つきで得」。ただしその条件を学習者に見せていない。**

### 勝っている理由（本物）

1. **今日の一手を、本人に決めさせない。** GPTは「何をやりますか」と聞く。ここは聞かない。
   PRODUCT_CANON 原則4が実装まで通っている。仕事を持つ学習者にとって、
   この差は毎日3分の意思決定コストの差になる。
2. **「できた」を1回で認めない。** 別の日に3回・7割以上・未出問題3割以上・複数の出題形式、
   さらに7日後の確認。GPTに「もう覚えました」と言えば信じてもらえるが、
   ここは信じない。これは**学習者が自分を騙せない**という価値で、AIには作れない。
3. **間違いが1か所に貯まる。** 錯題本は「自分がどこで転んだか」の台帳で、
   中国語圏の受験文化で最も信頼される形。GPTには昨日の誤答が無い。

### 負けている理由

1. **貯まっているものを見せていない。** 乗り換えを止める本体は教材ではなく台帳なのに、
   「あなたの間違いが N件ここに残っている」「あなたが覚えた語が N語」は
   Homeの主役になっていない。見せていない資産は、無いのと同じ。
2. **戻ってくる理由が外に出ていない。** GPTは戻ってこなくても学習者は困らない。
   この商品は戻ってこないと価値が0になる。にもかかわらず、外から届く経路が0本。
3. **「できるようになった」を言えていない。** GPTは毎回「上手ですね」と言ってくれる。
   ここは正直さを優先して数字しか出さない。正直さは正しいが、
   **実測に基づいて「できるようになった」と言い切る形**（Can-do）は既に作ってあるのに出していない。

### 結論

**教材を増やすのはもう止めてよい。** 在庫は使用量の数百倍ある。
これから作るべきものは、「誰に・何を・いつ・どの順で・どの難易度で・いつ復習させ・どう次の一歩を踏ませたか」
を**1つの物差しで記録し、学習者本人に見せ、途切れたら外から声をかける**——この4つだけ。

その4つのうち3つ（記録の物差し・見せる・声をかける）は、
**新しい機能ではなく、既にあるものの配線**で片づく。
