# 【PAID PILOT INDEPENDENT CHECK REPORT】

実施: 2026-08-02 ／ branch `feature/ai-course-adventure-v2-final-completion` ／ RC tag `ai-course-adventure-v2-rc4`
staging: https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1

判定基準（自分に課した厳しさ）:

- **コードがあるだけ・型がある・unit testが通るだけでは PASS にしない**
- **学習者が実際に触るruntime（stagingにログインした画面／実API）で確認できたものだけ PASS**
- 実装はあるが今回runtimeで確認していないものは **NOT_PROVEN**

今回、監査のために staging に一時QA learnerを作り、**実際にログインした状態でV2画面を操作**した。
（作業後に削除済み。`auth_users=5 learners=1 qa_left=0` を確認）

---

## 先に：FAIL・PARTIAL・NOT_PROVEN の一覧（隠さない）

### FAIL（0件）

なし。

### PARTIAL（9件）

| # | 領域 | 何が足りないか |
|---|---|---|
| 3 | Today Adventure中心性 | V2の外側に**旧コースのナビ（ホーム／成長／ロードマップ／学習記録／設定）が上下2箇所**に出ており、「成長」は12週の会話マップという**別の進捗モデル**へ飛ぶ |
| 4 | N2 Journey | Home→文法→バトル→正誤フィードバックまでruntime確認。**AI会話step・完了画面・復習登録まで1日を通しきっていない** |
| 10 | 人間レッスン連携 | 3件表示はruntime確認。ただし**この画面に次の一歩のCTAが無い**（戻る矢印のみ） |
| 11 | Pilot運用手順 | 文書は完成。ただし**招待発行〜学習開始までを実際に1回通していない**（リハーサル未実施） |
| 15 | Performance | 実転送量は実測（455kB gzip）。**実機・低速回線でのLCP/操作可能までの時間は測っていない** |
| 16 | UI・mobile・accessibility | 375pxで横スクロール0・console error 0を実機確認。**アクセシビリティ（キーボード操作・スクリーンリーダー）は未検証** |
| 17 | 先生選択・音声 | 音声ルーティングは実API・実音声でPASS。**先生を切り替える操作自体をUIで実行していない** |
| 18 | AI会話・Report・復習 | 実APIで12ステップPASS。**UIから会話を起動していない**（マイク必要） |
| 19 | RC・rollback | RC4 tag・手順書あり。**切り戻しを実際に実行していない** |

### NOT_PROVEN（6件）

| # | 領域 | なぜ証拠不足か |
|---|---|---|
| 2 | 初回Journey | 監査では `seed-adventure-profile.mjs` でV2を有効化したため、**オンボーディング画面（目的→レベル→先生→診断）を通っていない** |
| 5 | N3 Journey | 純関数テストのみ。N3学習者をruntimeで作って触っていない |
| 6 | 会話Journey | 同上 |
| 7 | Hybrid Journey | 同上 |
| 8 | 日次成長表示（完了画面） | 実装済みだが、**5stepを完走していないため完了画面へ到達していない** |
| 12 | 継続・離脱analytics | イベント定義と発火箇所はあるが、`trackCourse` は gtag 前提で **実際にイベントが飛んだ証跡を取っていない** |

---

## 項目別

### 1
- **領域**: PRODUCT_CANON
- **判定**: PASS
- **配点**: 5 / **獲得点**: 5
- **実装証拠**: `docs/ai-course/PRODUCT_CANON.md`（中核3行・絶対原則18・正準Journey・Homeの必須表示・4つのCoverage定義）
- **runtime証拠**: 文書のため runtime は対象外。ただし canon の要求がruntimeに出ていることは項目3・9で確認
- **テスト証拠**: —
- **staging証拠**: —
- **未達**: なし
- **残リスク**: 文書は参照されて初めて効く。`product-alignment-audit.md` / `PILOT_OPERATIONS.md` / `PILOT_RC.md` から参照済みだが、**今後のpromptで実際に読まれるかは運用次第**

### 2
- **領域**: 初回Journey（目的→レベル→先生→診断→ルート→最初の冒険）
- **判定**: NOT_PROVEN
- **配点**: 5 / **獲得点**: 1
- **実装証拠**: `src/components/ai-course/adventure/AdvOnboarding.tsx`（goal/level/teacher/companion/診断の各phase）
- **runtime証拠**: **なし。** 監査では `seed-adventure-profile.mjs` でV2を有効化し、オンボーディングを飛ばしてHomeから開始した
- **テスト証拠**: `advPersona.test.ts`「初回: 診断 → ルートが生成され、現在地が決まる」4 Persona PASS（**純関数レベル**）
- **staging証拠**: なし
- **未達**: 診断10問を実際に解いてルートが出るまでのUI通し
- **残リスク**: **Pilotで最初に触る画面がここ。**離脱が最も起きやすい場所を一度も実機で見ていない
- **修正task**: `AUD-01` オンボーディングをstagingで1周し、診断→ルート生成→最初の冒険までスクリーンショットを取る

### 3
- **領域**: Today Adventure中心性
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `AdvShell.tsx` home view（目的地・現在地・先生の一言・step一覧・今日のゴール・単一CTA・二次メニュー折りたたみ）
- **runtime証拠**: stagingにログインして実描画を確認。
  `N2合格まであと127日` / `現在地：N3文法攻略（攻略率 0%）＝N2攻略の経由地` /
  `今日はこの5つだけ・約22分` / `今鍛えている試験力：言語知識｜文法` / `今日のゴール` /
  **`bg-blue-600` の主要CTAは1個**（`まず「新しい文法を学ぶ」から始める`）。他14個は透明背景のナビ・副次
- **テスト証拠**: `advPersona.test.ts` 48 PASS
- **staging証拠**: スクリーンショット（375×812）＋ DOM計測 `{"primaryByClass":1,"overflowX":false}`
- **未達**: **V2シェルの外側に旧コースのナビが上下2箇所で描画されている**（ホーム／成長／ロードマップ／学習記録／設定）。
  「成長」を押すと `ミナモ列島の冒険の進み` `会話の旅 Week1〜` という**V2とは別の進捗モデル**が出る
- **残リスク**: 有料学習者が「自分の進捗」を2つの異なる指標で見ることになり、どちらを信じるか分からなくなる。
  **前回の整合監査で ALIGNED と判定したのは、V2シェル内部だけを見ていた過大評価**
- **修正task**: `AUD-02` V2有効時は旧ナビの「成長／ロードマップ／学習記録」を隠すか、V2の対応画面へ差し替える

### 4
- **領域**: N2 Journey
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `advRoute.ts` / `advQuest.ts` / `AdvShell.tsx` / `AdvBattleRunner.tsx`
- **runtime証拠**: N2目標のQA learnerで
  Home → `まず「新しい文法を学ぶ」から始める` → 文法解説（〜ばかりでなく・接続・例文・よくある誤り・ニュアンス比較）
  → `この文法でバトルに挑む` → バトル `1/5` 4択 → 正答 → **`正解！`＋正解理由＋`ほかの選択肢が違う理由`** まで到達。
  さらに**リロード＋言語切替後もstep1の完了（✓）が保持**されていた＝サーバー同期・復帰が実際に効いている
- **テスト証拠**: `advPersona.test.ts` Persona A 全PASS（ルートは `基礎→N3→N2→総合模試`、最終段は実力に依らず同一）
- **staging証拠**: 上記DOMテキスト取得、zh側も `当前位置：N3语法攻略…＝通往N2的中途站` を確認
- **未達**: AI会話step・言い直し・完了画面・復習登録まで**1日を通しきっていない**
- **残リスク**: 途中までは動くことを確認したが、**「今日の冒険を締めくくる」体験が未検証**
- **修正task**: `AUD-03` N2学習者で5stepを完走し、完了画面と復習登録までスクリーンショットを取る

### 5
- **領域**: N3 Journey
- **判定**: NOT_PROVEN
- **配点**: 5 / **獲得点**: 1
- **実装証拠**: `advRoute.ts`（`pre_n5`/`n5` から `foundation_camp` 始まり）
- **runtime証拠**: **なし**
- **テスト証拠**: `advPersona.test.ts` Persona B 3件 PASS（基礎段から開始・復習が入る・step数≤6）— **純関数のみ**
- **staging証拠**: なし
- **未達**: N3学習者のruntime確認
- **残リスク**: N3は基礎補強の量が多く、**「やらされ感」が出やすい**。実画面での分量感を見ていない
- **修正task**: `AUD-04`

### 6
- **領域**: 会話Journey
- **判定**: NOT_PROVEN
- **配点**: 5 / **獲得点**: 1
- **実装証拠**: `advRoute.ts` `conversationStartArea()` / `advQuest.ts` の実践step配分
- **runtime証拠**: **なし**
- **テスト証拠**: Persona C 3件 PASS（会話開始地点・実践stepが必ず入る・JLPT準備度は出さない）— 純関数のみ
- **staging証拠**: なし
- **未達**: 会話目的learnerのruntime確認
- **残リスク**: 会話目的の人に試験問題が多く出ると即解約になりうる。**実配分を実機で見ていない**
- **修正task**: `AUD-05`

### 7
- **領域**: Hybrid Journey
- **判定**: NOT_PROVEN
- **配点**: 5 / **獲得点**: 1
- **実装証拠**: 同上（hybrid分岐）
- **runtime証拠**: **なし**
- **テスト証拠**: Persona D 3件 PASS（試験・会話の両方が入る／会話満点でもJLPT総合は出ない）— 純関数のみ
- **staging証拠**: なし
- **未達**: runtime確認
- **残リスク**: 1日30分設定での分量が実機で妥当か不明
- **修正task**: `AUD-06`

### 8
- **領域**: 日次成長表示（完了画面）
- **判定**: NOT_PROVEN
- **配点**: 5 / **獲得点**: 1
- **実装証拠**: `AdvShell.tsx` complete view（今日できたこと／今日の表現／**今日の手ごたえ**（解いていない技能は出さない）／**直した表現**／定着率／次の復習／**次の冒険**）＋ `advWeekly.ts` `buildDailySummary()`
- **runtime証拠**: **なし。**5stepを完走していないため到達していない
- **テスト証拠**: `advWeekly.test.ts`「今日解いた技能だけを返す」「記録が無ければ noRecord」PASS
- **staging証拠**: 配信バンドルに `今日の手ごたえ` `次の冒険` の文字列があることのみ確認（**描画の証拠ではない**）
- **未達**: 完了画面の実描画
- **残リスク**: **有料価値がいちばん伝わるべき画面**。文字列の存在だけでPASSにはできない
- **修正task**: `AUD-03`（同一task）

### 9
- **領域**: 週次成長表示
- **判定**: PASS
- **配点**: 5 / **獲得点**: 5
- **実装証拠**: `src/lib/aiLesson/course/adventure/advWeekly.ts` ＋ `AdvShell.tsx` weekly view
- **runtime証拠**: stagingで実描画。
  `今週はまだ学習の記録がありません。5分の冒険からで大丈夫です。` /
  `学習した日：0日 ／ やりきった冒険：0回` /
  技能ごとの変化が **文字・語彙／文法／読解／聴解すべて「未判定」**（0%と表示していない） /
  `変化を出すには、同じ技能を2週続けて10問以上解く必要があります。数字を作らず「未判定」と表示しています。` /
  主要CTA 1個（`今日の冒険へ`）＋ 二次リンク（先生レッスンの準備）
- **テスト証拠**: `advWeekly.test.ts` 10 PASS（母数不足で変化を出さない・先週の記録が無ければ出さない 等）
- **staging証拠**: 上記DOMテキスト
- **未達**: 学習記録がある状態での表示（数字が入ったときの見え方）は未確認
- **残リスク**: データが溜まった状態での可読性は未検証。ただし**盛らない挙動はruntimeで確認できた**

### 10
- **領域**: 人間レッスン連携
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `advHumanLesson.ts` `buildLessonPrepSummary()`（learnerView最大3件・teacherSkillRows）
- **runtime証拠**: stagingで実描画。`次の先生レッスンで扱うこと` の下に
  `長文読解の時間配分を相談したい` / `文法の底上げ` / `語彙の底上げ` の**ちょうど3件**。
  `AIが毎日の量を担当し、先生は難所攻略と方向修正に集中します。`
- **テスト証拠**: `advPersona.test.ts`「先生レッスンの候補が最大3件に絞られる」4 Persona PASS
- **staging証拠**: 上記DOMテキスト
- **未達**: **この画面に次の一歩のCTAが無い**（戻る矢印のみ）。canon 原則15「学習後は必ず次の一歩を示す」に反する
- **残リスク**: 厳密には行き止まりではない（戻れる）が、canonを自ら破っている
- **修正task**: `AUD-07` prep画面に「今日の冒険へ」CTAを追加

### 11
- **領域**: Pilot運用手順
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `docs/ai-course/PILOT_OPERATIONS.md`（申込→入金→同意→招待→V2有効化→学習開始確認→障害時fallback→休会/解約/削除→切り戻し／週次運用）
- **runtime証拠**: `seed-adventure-profile.mjs` は**実際に実行してV2が有効になることを確認**（QA learnerで成功）。
  `stage-verify-session.mjs --create/--cleanup` も実行し、前後件数一致を確認
- **テスト証拠**: —
- **staging証拠**: V2有効化後にHomeが描画されたこと（項目3）
- **未達**: **`issue-pilot-invites.mjs` を一度も実行していない**（招待コード発行→学習者がログインする経路が未リハーサル）。
  引数はスクリプト実装と突き合わせて記載したが、実行して確かめてはいない
- **残リスク**: Pilot当日に招待コードで詰まると、入金後に学習を開始できない
- **修正task**: `AUD-08` `--learner A --email <自分のアドレス> --expires <日付> --confirm` で1回発行し、実際にログインまで通す（テスト用コードは後で revoke）

### 12
- **領域**: 継続・離脱analytics
- **判定**: NOT_PROVEN
- **配点**: 5 / **獲得点**: 1
- **実装証拠**: `advAnalytics.ts`（イベント追加・`ALLOWED_KEYS` で本文/氏名/メールを遮断・`bucketOf()` で階級化）、`AdvShell.tsx` の発火箇所
- **runtime証拠**: **なし。**`trackCourse` は gtag が存在するときだけ送る実装で、**イベントが実際に飛んだ証跡を取っていない**
- **テスト証拠**: なし（analytics専用テストは書いていない）
- **staging証拠**: なし
- **未達**: 1件でもよいので実際にイベントが送信されることの確認
- **残リスク**: **Pilotの継続率が測れないまま3名を受け入れることになる。**
  「計測できているつもり」がいちばん危ない状態
- **修正task**: `AUD-09` stagingでGA4のDebugViewか `dataLayer` を見て、`adv_today_quest_viewed` などが飛ぶことを確認する

### 13
- **領域**: 教材サンプル監査
- **判定**: PASS
- **配点**: 5 / **獲得点**: 5
- **実装証拠**: `scripts/ai-course/sample-pilot-materials.ts`（層化抽出）、
  レビュー結果 `generated/pilot-sample/review-vocab.md` / `review-reading-listening.md`
- **runtime証拠**: 修正後の教材が実際に出題されることをバトル画面で確認（項目4）
- **テスト証拠**: `vocabContent.test.ts` に回帰3件追加し**実データ全件**で
  複数正解0・設問への答え露出0・読みの誤答は実在語のみ を固定（21 PASS）
- **staging証拠**: 修正後の音声25セットを再生成し `sets=200 audio=200 failures=0`
- **未達**: サンプルは全体の一部（語彙200/10,126＝2.0%、読解40/220＝18.2%、聴解40/200＝20.0%）
- **残リスク**: **未サンプル部分に同種の欠陥が残っている可能性は高い。**
  ただし語彙の2件は生成ロジックの修正なので**全問に効いている**（機械検査で全件0を確認済み）

### 14
- **領域**: Coverage表現の正確性
- **判定**: PASS
- **配点**: 5 / **獲得点**: 5
- **実装証拠**: `PRODUCT_CANON.md` §8 に4種の定義を明記
- **runtime証拠**: —
- **テスト証拠**: 実測 — Word Coverage 100%（2,167/2,167に2問以上）／Exam-format Coverage 100%（27形式）／
  **Human-reviewed Coverage 0%**／Pilot Beta Coverage: 自動検査100%・独立AIレビュー 語彙2.0%・読解18.2%・聴解20.0%
- **staging証拠**: —
- **未達**: なし
- **残リスク**: **「CORE Question Coverage 100%」を「N2/N3試験を100%網羅」と読み替えられる危険は残る。**
  canonで禁止し、報告でも併記しているが、対外文言には出さないこと。
  CORE内訳: 2,647 = 層C 2,454 ＋ 既存foundation語彙bank 137 ＋ 機能語56（文法bank）＋ 未分類0

### 15
- **領域**: Performance
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `vite.config.ts` の `manualChunks` ／ `AdvShell.tsx` の語彙bank動的import
- **runtime証拠**: stagingからの**実転送量（gzip）を実測**。
  V2入場 = index 163.3 + AiCoursePage 67.7 + AdvShell 42.6 + reading 108.4 + listening 72.7 = **455 kB**
  （模試を開くときだけ語彙bank 323 kB を追加取得）。改修前は779 kB
- **テスト証拠**: —
- **staging証拠**: `curl -H "Accept-Encoding: gzip"` による実測値
- **未達**: **実機・低速回線でのLCP／CTAが押せるまでの時間を測っていない**
- **残リスク**: 455kBでも中国のモバイル回線では体感が悪い可能性。数字は改善したが**体験としては未検証**
- **修正task**: `AUD-10` 実機（またはネットワークスロットリング）でHome表示までの時間を測る

### 16
- **領域**: UI・mobile・accessibility
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `AdvShell.tsx` ほか（`min-h-[44px]`/`min-h-[48px]` のタップ領域・`aria-label`・`role="radiogroup"`）
- **runtime証拠**: 375×812 で **横スクロール0**（`scrollWidth === innerWidth`）、**console error 0**、
  ja/zh 両方でHomeが正しく描画。先生画像は実際にロード（`naturalWidth` 520 / 680）
- **テスト証拠**: `teacherAvatar.test.tsx` 12 PASS（alt・aria-hidden・fallback）
- **staging証拠**: スクリーンショット（375×812・ja）＋ zh のDOM計測
- **未達**: **キーボード操作・スクリーンリーダーでの通し確認をしていない。**1440px も未確認
- **残リスク**: アクセシビリティは「実装してある」だけで**検証していない**
- **修正task**: `AUD-11` キーボードのみでHome→step→バトルまで操作できるか確認

### 17
- **領域**: 先生選択・音声
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `advTeacher.ts` / `supabase/functions/ai-lesson-token/index.ts`（allowlist）/ `voiceSession.ts`
- **runtime証拠**: **実API・実音声でPASS**（`generated/teacher-voice-smoke.json` verdict=PASS）。
  teacherId未送信→marin 304,462B ／ shoko→marin 355,462B ／ **yuto→cedar 274,882B**、いずれも日本語transcriptあり。
  不正値4種（alloy/yuto2/YUTO/数値）はすべて既定へfallback。
  Home画面に `翔子先生` と `案内の先生を変える（いまは翔子先生）` が描画されることも確認
- **テスト証拠**: `advTeacherVoice.test.ts` 16 PASS ／ `advTeacher.test.ts` 16 PASS
- **staging証拠**: 上記smoke JSON、Homeの描画
- **未達**: **UIで先生を切り替える操作を実行していない**（切替後にsessionが作り直されることの実機確認）
- **残リスク**: 音声ルーティングは強く実証できているが、**切替UI経由の経路は単体テスト止まり**
- **修正task**: `AUD-12`

### 18
- **領域**: AI会話・Report・復習
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `CourseVoiceLesson.tsx` / `supabase/functions/ai-lesson-report` / `advRestate.ts`
- **runtime証拠**: **実APIで12ステップPASS**（`generated/conversation-e2e.json`）。
  ai_start_session（実RPC）→ ai-lesson-token（実Edge Function・cedar適用）→ Realtime実音声3ターン →
  発話ログ保存（実DB・RLS通過）→ ai-lesson-report（実LLM）→ 言い直し素材 → セッション完了 →
  復習登録（翌日）→ 再読込でサーバー値が残ることまで確認
- **テスト証拠**: `advBridge.test.ts` ほか
- **staging証拠**: 上記E2E JSON
- **未達**: **UIから会話を起動していない**（マイク許可が要るため）。
  学習者が実際に見る「会話画面→レポート画面→言い直し画面」の描画は未確認
- **残リスク**: サーバー側の鎖は通っているが、**画面としての体験は未検証**。
  マイク許可の出し方で詰まる学習者が出る可能性
- **修正task**: `AUD-13` 実機（スマホ）で会話を1回行い、レポート・言い直し・復習登録までの画面を確認

### 19
- **領域**: RC・rollback
- **判定**: PARTIAL
- **配点**: 5 / **獲得点**: 2.5
- **実装証拠**: `docs/ai-course/PILOT_RC.md` ／ `docs/ai-course/adventure-v2/rollback/README.md`（deploy前のソース実体＋sha256）
- **runtime証拠**: RC4 tag作成・push済み。stagingは最新RCで稼働
- **テスト証拠**: —
- **staging証拠**: 配信中のチャンクが `dist/assets/` と一致することを確認
- **未達**: **切り戻しを一度も実行していない**（rc3へ戻して再デプロイするリハーサル未実施）
- **残リスク**: 手順書はあるが、**本当に戻せるかは試していない**
- **修正task**: `AUD-14` stagingでrc3へ切り戻し→rc4へ戻す往復を1回行う

### 20
- **領域**: P0／P1・tests・build
- **判定**: PASS
- **配点**: 5 / **獲得点**: 5
- **実装証拠**: —
- **runtime証拠**: stagingが正常稼働（項目3・4・9・10で実描画確認）
- **テスト証拠**: `npx vitest run` → **1,602 PASS / 0 FAIL / 3 skipped、exit code 0**
  （worker RPCタイムアウトでexit 1になっていた問題も解消済み）
  tsc エラー0 ／ eslint 0 ／ `npm run build:staging` 成功
- **staging証拠**: deploy成功・チャンク200・console error 0
- **未達**: なし
- **残リスク**: **P0/P1が0なのは「今回見つけた範囲で0」。**
  教材サンプルは全体の2〜20%しか見ていないので、未発見のP0が残っている可能性は現実的にある

---

## 集計

```
合計点        : 53.5 / 100
PASS数        : 5   （1・9・13・14・20）
PARTIAL数     : 9   （3・4・10・11・15・16・17・18・19）
FAIL数        : 0
NOT_PROVEN数  : 6   （2・5・6・7・8・12）

Weekend Paid Pilot Ready : NO
Production Ready         : NO
```

### YES条件の充足状況

| 条件 | 判定 |
|---|---|
| P0 0 | ✅（今回見つけた範囲で） |
| P1 0 | ✅（同上） |
| **正準Journey 4種PASS** | ❌ N2はPARTIAL、N3・会話・HybridはNOT_PROVEN（runtime未確認） |
| AI会話実API PASS | ✅（12ステップ） |
| 先生別音声PASS | ✅（実音声・cedar確認） |
| Home primary CTA 1 | ✅（DOM計測で1個） |
| **dead end 0** | ❌ 先生レッスン準備画面に次の一歩のCTAが無い |
| Pilot運用手順COMPLETE | 🔺 文書は完成、招待発行のリハーサル未実施 |
| staging PASS | ✅ |
| tests／build PASS | ✅ |

**2条件が未達のため Weekend Paid Pilot Ready = NO。**

---

## 前回報告の過大評価（自己申告）

前回の `product-alignment-audit.md` および最終報告で、次を実際より高く評価していた。

1. **「Today Adventure Centrality: PASS」「Dead Ends: 0」**
   → V2シェルの内部だけを見て判定していた。実際にログインすると**旧コースのナビが上下2箇所**にあり、
   「成長」は別の進捗モデルへ飛ぶ。また先生レッスン準備画面には次の一歩が無い。
   正しくは **PARTIAL**。

2. **「N2/N3/会話/Hybrid Journey すべてPASS」**
   → 根拠は `advPersona.test.ts` の**純関数テスト**であり、runtimeで通した証拠ではなかった。
   今回N2だけ部分的にruntime確認できたが、残り3つは **NOT_PROVEN** が正しい。

3. **「Pilot Analytics COMPLETE」**
   → イベント定義と発火コードはあるが、**1件も飛んだ証跡が無い**。正しくは **NOT_PROVEN**。

4. **「Weekly Progress COMPLETE / Report・Retry・Review PASS」**
   → Weeklyは今回runtimeで確認できたので PASS のままでよい。
   Report・Retry・Reviewは**API経路のPASSであって画面のPASSではない**。正しくは **PARTIAL**。

---

## Pilot開始前にやるべきこと（優先順）

| task | 内容 | なぜ先か |
|---|---|---|
| `AUD-08` | 招待コード発行→ログインを1回リハーサル | **入金後に開始できない事故を防ぐ** |
| `AUD-01` | オンボーディング（診断含む）をstagingで1周 | 最初に触る画面が未検証 |
| `AUD-03` | N2で5step完走し完了画面・復習登録を確認 | 有料価値が伝わる画面が未検証 |
| `AUD-13` | 実機スマホでAI会話を1回（マイク許可含む） | 会話は商品の中核で、UI経路が未検証 |
| `AUD-02` | V2有効時に旧ナビを隠す／差し替える | 進捗指標が二重で学習者が混乱する |
| `AUD-07` | 先生レッスン準備画面にCTAを追加 | canon原則15違反・1行で直る |
| `AUD-09` | analyticsが実際に飛ぶことを確認 | 継続率が測れないままPilotに入らない |
| `AUD-04/05/06` | N3・会話・Hybridをruntimeで1周 | 3名の目的が全員N2とは限らない |
| `AUD-10/11/12/14` | 低速回線・キーボード操作・先生切替・切り戻し | Pilot中でも可 |
