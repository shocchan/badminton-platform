# Phase 2E-1.13 依頼文（ChatGPT「AI日本語学習監督」生成・2026-07-28夜間ループ#3）

> 注: 全文10,593字のうち主要節を抽出。§13末尾・§16末尾・§17-19の一部はブラウザ抽出の制限で
> truncatedとなったが、内容は「registry回帰／受入目標値／推奨コミット／完了条件」で、
> §20の完了報告項目に同じ観点が列挙されている。実行時はこのファイルの範囲で十分。

あなたはClaude Codeです。以下の条件でPhase 2E-1.13「First-Run Journey E2E Closure & Learner Interaction Hardening」を実施してください。

## 0. Phaseの目的
新しい学習機能や内部管理画面を追加しない。既に実装済みの初回Journeyを実ブラウザ上で
Step1（目的選択）→Step2（短い診断）→Step3（最初の実練習）→Step4（実結果と次回予定）まで
**完全に完走できることを証明**し、戻る・進む・再読込・二重操作・遷移遅延でも壊れないlearner-facing品質へ硬化する。
**特に前Phaseで未確認だった「練習完了→Step4自動復帰」を最優先で実証すること。**

## 1. 作業条件
ブランチ: feature/ai-course-learning-polish。labPreview限定・stagingまで。
禁止: mainマージ／本番デプロイ／共有Supabase変更／migration適用／RLS変更／Secrets・APIキー変更／
認証・OTP変更／料金・決済変更／learner正式データ変更／Andyさん接触／current_week・masteryState・XP・会話履歴変更／
Realtime prompt全面変更／Edge Function本番変更／admin_overrides変更／教材本文・meaningZh・exJa/exZh・cognate・role確定値変更／
human_reviewed・approved変更／root P0・P1判断／Decision Console判断反映／
**練習語数の検証都合による変更／復習間隔変更／自動操作を通すためだけの学習ロジック短縮**／
storage.clear／wildcard・prefix・正規表現によるstorage削除／大型E2Eライブラリの新規導入／外部有料サービス／
**timeout値の根拠なき大幅延長**。必要になったらSTOP_FOR_HUMAN。

## 2. 目的（3つ）
A: 完全Journeyの実ブラウザ完走（実際の診断問題と3語練習を通して）
B: ナビゲーションと二重操作の硬化（back/forward/reload/二重クリック/古いtoken）
C: 遷移待ちと失敗時のlearner-facing UX

## 3. 最初に行う原因調査（推測で済ませない）
前Phaseで練習3語完走時にブラウザ自動操作が繰り返しtimeoutした原因を特定する。切り分け対象:
selector不安定／練習問題の状態待ち／CTAがdisabledのまま／animation・transition待ち／lazy chunk読込／
completion event未発火／Task Contract保存待ち／completion token検証失敗／Step4 route遷移失敗／
Journey stateとcontract更新の競合／同一render内の古いstate参照／CDN上の古いchunk／
service worker・ブラウザcache／テストデータ初期化不足／sandboxと通常namespaceの混在／
**自動操作だけの問題か手動操作でも再現するか**。
根拠は開発時の限定的なログ・React state・storage snapshot・route状態から示す。学習者画面に技術ログを出さない。

## 4. 安全なstaging検証状態
**CEO端末の通常進捗を削除しない。** 前Phaseの`createJourneySandbox`をlearner-facing検証入口へ最小限接続する。
要件: labPreview限定／「初回Journeyを検証する」等の明確な検証表示／通常進捗キーを読まない・書かない／
sandbox Journey・診断・練習・復習予定のみ使用／sandbox終了時はsandbox allowlistのみ削除／通常ホームへ戻れる／
一般受講生非表示／内部管理ダッシュボードを新設しない／検証導線は学習者画面のlabPreview補助として小さく表示。
**sandbox内でも実際の診断・練習componentを使う（偽の完了ボタンだけで検証しない）。**

## 5. 完全Journey E2Eシナリオ（staging実ブラウザ）
**Journey A（標準初回完走）**: sandbox初回状態→Step1目的選択→Step2→診断開始→全診断完了→
Step3自動復帰→推薦理由確認→3語練習開始→3語すべて完了→**Step4自動復帰**→実結果確認→次回予定確認→
第一CTA一つ→Journey完了→通常ホームへ移行→再度開いてもオンボーディングを表示しない。
各段階で確認: journeyId／currentStep／activeTaskType／activeTaskId／activeTaskStatus／token使用状態／
completedTaskIds／completionSnapshot／journeyCompletedAt／復習予定件数。
**Journey B（ヒント・再確認を含む完走）**: 少なくとも1問でヒントありまたは不正解を作り、Step4の
ヒント件数・もう一度確認する件数・次回予定・復習予定が実結果と一致することを確認。
**検証のために教材や採点規則を変えない。**

## 6. 練習完了→Step4（最優先受入条件）
練習最終項目完了時に以下を**一つの整合した遷移**として扱う: 最終回答の確定／練習結果snapshot確定／
復習予定の冪等生成／active task完了検証／completion token消費／completedTaskIds追加／
Journey currentStepをStep4へ更新／completionSnapshot保存／route遷移／Step4描画／focus移動／完了通知。
途中で失敗した場合、どこまで成功したかを判定し、全処理を最初から再実行して重複を作らない。
可能なら明示的な小さなtransaction-like関数またはstate transition関数へ集約（正式DB transactionは不要）。

## 7. 遷移中UX
練習完了後、Step4表示まで明確な待機がある場合に表示: 「今日の結果をまとめています」／progress indicator／
同じ完了ボタンの再操作防止／aria-busy／読み上げ用の短いstatus。
要件: すぐ遷移する場合は不要なちらつきを出さない／一定時間以上かかる場合のみ表示／内部用語を出さない／
無限spinnerにしない／timeout時はRecoveryへ／完了保存済みなら再試行で重複処理しない。

## 8. 遷移失敗Recovery
- 練習完了済み・Step4遷移だけ失敗: 「練習は終わっています。結果画面をもう一度開きます。」→結果画面を開く／ホームへ。**練習を再実行させない**
- snapshot保存失敗: 完了成功を偽らない／メモリ上の結果を一時表示可／再保存／ホームへ／復習予定を重複生成しない
- token検証失敗: URLやrouteだけで成功扱いにしない／契約を再読込／completedTaskIdsで既完了を確認／不明ならRecovery／**新tokenを無条件発行しない**
- 古いchunk・schema不一致: ハードリロードを学習者へ第一解決策として強制しない／安全な再読込／Journey状態保持／incompatibleならRecovery／通常進捗非削除

## 9. Browser Back／Forward実ブラウザ検証
診断: 途中でback／Journeyから続きへ／完了後back／Step3からforward・back／完了token再利用なし。
練習: 1語目後にback／Journey中断カード／続きから2語目へ／最終語完了直後にback／Step4表示後にback／
forwardで古い練習完了処理を再実行しない。
Journey完了後: backでStep4へ戻っても完了を二重記録しない／forwardでホームへ／オンボーディング再表示なし／復習予定重複なし。

## 10. Reload／Cache
診断途中／Step3表示中／練習途中／練習最終回答直後／Step4表示中／Journey完了後／sandbox状態／
CDN更新直後／通常reload／cache利用reload。
**古いchunkと新しいJourney schemaが混在した場合は、壊れた状態を自動完了させずRecoveryへ。**

## 11. 二重操作防止
診断完了ボタン連打／練習回答ボタン連打／最終「次へ」連打／Step4第一CTA連打／double-click／
Enter key repeat／touch double tap想定／route遷移中の再操作。
要件: completion token一度のみ／Journey完了一度のみ／復習予定一度のみ／completedTaskIds重複なし／
結果snapshot一つ／learner-facingには処理中表示／**disabledだけでなく処理側でも冪等**。

## 12. Task Contract cleanup
Journey完了後のcontractを監査: 完了確認に必要な最小情報を残す／使用済みtokenが無制限に増えない／
completedTaskIdsが不必要に増えない／古いactiveTaskを残さない／completionSnapshotを失わない／
Journey完了後の再表示に耐える／sandbox終了時はsandbox contractだけ削除／通常contractを誤削除しない。
上限やcleanup方針をコードとテストで明示。

## 13. storage registry回帰
現在のregistry 9キーを再集計して報告・テスト。**registry外で直接削除するコードを追加しない。**

## 14. 学習者向けStep4（実環境で確認）
今日確認した項目数／自力でできた／ヒントがあった／もう一度確認する／次回予定／明日の復習予定／
実際に練習した語／結果欠損時の表示／第一CTA一つ／補助CTA最大2つ。
**表示禁止**: completionToken／activeTaskStatus／completedTaskIds／snapshot／storage／contract／
roleDriven／retained_preview／masteryState／generic・contextual・verified／day1・day3・day7。

## 15. モバイル・アクセシビリティ（実レイアウトエンジン）
320×568／375×667／390×844／430×932／768×1024／desktop。
対象: 練習最終画面・結果集計中・Step4・遷移失敗Recovery・中断カード・sandbox表示・browser back後・長い語彙・中国語補助。
要件: 横overflowなし／44px未満主要操作なし／spinner・statusの読み上げ／aria-busy／Step4見出しfocus／
完了aria-live一度のみ／keyboard完走／Enter連打安全／200% zoom／prefers-reduced-motion／safe-area想定余白／色だけに依存しない。
実スマートフォンは引き続き人間確認事項として残してよい。

## 16. Performance（原因調査で計測）
練習最終回答→contract完了／contract完了→Step4 route開始／route開始→Step4描画／lazy chunk取得時間／
storage write回数／不要な再render数／timeout発生地点。開発・staging限定計測とし学習者画面へ技術値を出さない。

## 17-19. テスト・コミット・完了条件（要点）
テスト: 練習完了transition（final answer／snapshot／review schedule／task completion／token consumption／
currentStep update／route／focus／aria-live／partial failure recovery）／Browser navigation／Reload／
二重操作／Storage（registry恒等式・unregistered key検出・各allowlist・normal progress保持・
review schedule保持・Decision Console保持・unrelated key保持・storage clear非使用・wildcard削除非使用）／
UI・a11y／回帰（既存688テスト・初回6状態・LearningClock・間隔反復・role推薦・Decision Console等）。

## 20. 完了報告形式
実数付きで: 変更ファイル・コミット・**timeout根本原因**・手動操作での再現有無・
最終回答からcontract完了まで／contract完了からroute開始まで／route開始からStep4描画まで・storage write回数・
sandbox導線・通常状態非影響・Journey A完走・Journey B完走・各ステップ到達・Step4実結果・次回予定・第一CTA・
Journey完了一度のみ・onboarding再表示なし・browser back/forward・各reload・duplicate click・Enter repeat・
token二重利用・復習予定重複・completedTaskIds重複・遷移中status・timeout Recovery・Task Contract cleanup・
usedTokens管理・registry総数（session/local/resettable/non-resettable/learner-impacting/lab-only）・
各allowlist数・各キー保持・storage clear未使用・wildcard削除未使用・320/375/390/430/768/desktop・
44px tap target・200% zoom・keyboard完走・Step4 focus・aria-live・aria-busy・reduced motion・
テスト総数・tsc・lint・build・bundle・lazy chunk・staging console・network 4xx・画像404・
各未変更確認・未完成・人間判断事項・次Phase候補。
