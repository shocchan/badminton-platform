# Phase 2E-1.14 依頼文（ChatGPT「AI日本語学習監督」生成・2026-07-28 ループ#4）

decision = **CONTINUE**（READY_FOR_PREPRODUCTION ではない）

> 監督の判断: 2E-1.13で初回学習ループが「画面遷移だけでなく実データ上も」成立した。
> 未達の理由は ①診断/練習/最終回答直後のreload復帰が実ブラウザ未検証 ②schema不一致Recovery未検証
> ③sandbox導線未接続 ④root P0=1/P1=13未判断 ⑤正式DB保存未実装 ⑥admin_overrides RLS未解決
> ⑦実スマホ/200%zoom/contrast未確認。

## Phase 2E-1.14「Journey Resume Integrity & Version Recovery」

### 0. 目的
新しい教材・学習機能・内部管理画面を増やさない。学習者が途中で再読込した場合や、
アプリ更新で保存schemaとコードが食い違った場合でも「回答を失わない／復習予定を重複生成しない／
完了を偽らない／最後の安全な地点から再開できる／技術用語を見せず復帰できる」状態に仕上げる。

目的3つ: ①診断・練習の全中間地点でのreload再開 ②最終回答・復習予定・Journey完了の
部分成功からの冪等Recovery ③schema不一致Recoveryと分離sandbox検証入口の完成。

### 1. 作業条件
ブランチ feature/ai-course-learning-polish・labPreview限定・stagingまで。
禁止: mainマージ／本番デプロイ／共有Supabase／migration／RLS／Secrets・APIキー／認証・OTP／
料金・決済／learner正式データ／Andyさん／current_week／masteryState／XP／会話履歴／
Realtime prompt全面変更／Edge Function本番／admin_overrides／教材本文・meaningZh・exJa/exZh・
cognate・role確定値／human_reviewed・approved／root P0・P1判断／**復習規則変更／練習語数変更／
診断問題数変更**／storage.clear／wildcard・prefix・正規表現削除／**通常進捗キーを削除して初回状態を再現**／
大型state管理ライブラリ／外部有料サービス／不要な常時ローディング／新しい内部管理ダッシュボード。
必要になったら STOP_FOR_HUMAN。

### 2. 最初に行う状態遷移監査
診断（session作成→問題表示→回答保存→次問題→最終回答→結果確定→active task完了→Step3更新→route）と
練習（session作成→card完了→quiz回答→正誤確定→assess選択→Sense結果確定→復習予定生成→次の語→
3語目完了→completionSnapshot確定→active task完了→Step4更新→route）について、
**何を／どのstorageへ／どの順序で／何回／どの冪等キーで**保存しているかを整理し、
各段階の中間失敗と「どこから再開すべきか」を明示する。

### 3. Resume Checkpoint
診断: diagnosis_not_started / question_active / answer_saved / completed / contract_completed / return_pending
練習: practice_not_started / card_active / card_completed / quiz_active / quiz_answer_saved /
assess_active / assess_saved / review_schedule_written / word_completed / practice_completed /
practice_contract_completed / step4_return_pending
名称は既存設計に合わせて変更可。**学習者画面に内部状態名を出さない。**

### 4. Reload受入シナリオ（staging実ブラウザ）
診断: 問題表示前／表示中／回答選択後・確定前／確定後・次問題前／最終回答直後／
結果確定後・Step3遷移前／Step3表示中。
期待: 回答済みを再回答させない・未確定回答を正解扱いにしない・結果を二重生成しない・
completedTaskIds重複なし・token再利用なし・Step3へ自動復帰。

練習: card（表示直後／完了直後）・quiz（表示中／選択後確定前／正誤確定後）・
assess（選択前／選択後保存前／保存直後）・語の境界（1語目後／2語目後／3語目最終評価直後）・
Journey境界（予定生成後contract未完了／contract完了後Step4未更新／Step4更新後route前／Step4表示中）。
期待: 完了済みフェーズを再実行しない・未確定を確定扱いにしない・同じSenseの予定を重複生成しない・
checked/independent/supported/needsReview一致・最終的にStep4復帰・Journey完了一度のみ。

### 5. 部分成功Recovery
- 予定あり・契約未完了 → 既存予定を再利用・重複生成しない・contract完了を再試行・Step4へ
- 契約完了・Step4未更新 → token再消費しない・completedTaskIds再追加しない・
  保存済みsnapshotからStep4復元・currentStepだけ安全に修復
- Step4更新済み・route未遷移 → Step4へ遷移し completion処理を再実行しない
- completionSnapshot欠損 → 安全に再導出できる場合のみ再構築。**推測で数値を作らない。**
  再導出不能なら一部結果欠損Recovery。復習予定は変更しない

Recoveryは小さな決定的関数へ集約し、renderごとに副作用を繰り返さない。

### 6. 復習予定の冪等性
wordId／senseId／localDate／result type／source practice task ID 等から決定的な冪等キーを作る
（既存の同等仕組みでも可）。同じ回答の再送・reload・back・assess二重保存・contract Recovery・
Step4再表示・Journey完了再表示で同一予定が増えないこと。
上書き時は LearningClock と既存の間隔反復ルールに従う。**新しい復習規則を作らない。**

### 7. Sandbox UI接続
既存 `createJourneySandbox` を labPreview の学習者向け初回Journey入口へ接続。
labPreview限定・一般受講生非表示・「初回学習を安全に試す」等の明確な検証表示・
通常状態を読まない/書かない・sandbox用のJourney/診断/練習/復習予定・
終了時はsandbox allowlistのみ削除・通常ホームへ戻れる・控えめな表示・内部管理画面は新設しない。
**今後の検証で通常Journeyキーを一時削除・退避する必要がない状態にする。**

### 8. Schema Version Recovery
same schema / safely migratable / incompatible / corrupted / newer-than-client を区別。
- migratable: 情報を失わず明確な変換規則がある場合のみ自動移行
- incompatible: 自動完了しない・通常の語彙進捗と復習予定を削除しない・Journey状態のみ再構築・
  既存完了snapshotは保持・簡潔なRecovery（再読込／Journeyを最初から／ホームへ）
- newer-than-client: 状態を書き戻して上書きしない・安全な再読込を案内・Journey状態を保持・
  **reload loopを作らない**・技術詳細はlabPreviewの折りたたみのみ

### 9. Reload Recovery UI 文言
使う: 「続きから始めます」「前回のところまで戻りました」「回答する前の状態に戻りました」
「練習結果を確認しています」「学習の続き方を確認できませんでした」「もう一度読み込む」
「この学習を最初からやり直す」「ホームへ戻る」
**避ける**: hydration／checkpoint／schema／token／contract／partial commit／orphaned／
incompatible version／localStorage

### 10. Step4結果の整合性
Recovery後も checked/independent/supported/needsReview・練習語・次回予定・明日件数が実結果と一致。
一部欠損時は 0と断定しない・該当グラフを描かない・確認できた情報のみ表示・
欠損通知は簡潔に・第一CTAは維持。

### 11. SVGアクセシビリティ
`LearningIllustrations.tsx` を監査し、各SVGを「装飾（aria-hidden・focus不可・周囲の文字で意味が伝わる）」
と「意味あり（accessible name・必要ならdescription・同じ情報を文字でも表示・重複読み上げを避ける）」に分類。
対象: ステップイラスト／ステッパー／見る・ためす・ふりかえる／横棒グラフ／復習タイムライン。
**グラフやタイムラインは、隣接する件数・予定テキストを主情報にしてSVGを装飾扱いにする方が適切な場合がある。**

### 12. 200% Zoom・Contrast
外部有料サービス・大型依存なしで可能な範囲。対象: Step1／診断／練習card／quiz／assess／Step4／
Recovery／sandbox／stepper／focus ring。自動計測できない場合も使用トークンと未確認箇所を正確に報告。

### 13. モバイル
320×568／375×667／390×844／430×932／768×1024／desktop。
対象: reload復帰カード／schema Recovery／sandbox表示／card・quiz・assess／Step4／グラフ／
タイムライン／200%zoom相当。要件: 横overflow 0・44px未満主要操作0・長い中国語補助が切れない・
safe-area想定余白・keyboardのみで操作可能・focusが見える・Recovery CTAが画面外へ消えない。
実スマートフォンは人間判断事項として残してよい。

### 14. Storage Registry
キーが増えるなら必ず登録。再集計して報告: registry総数／sessionStorage数／localStorage数／
resettable数／non-resettable数／learner-impacting数／lab-only数／Journey reset allowlist数／
sandbox allowlist数。registry外キーの使用を可能な範囲でテスト検出。**通常進捗の退避・削除をしない。**

### 15. テスト
Checkpoint各種／Reload各地点／Recovery／back／Step4再表示／Journey完了再表示／
review schedule一件／completedTaskIds重複なし／token再利用なし／
Sandbox（開始・通常状態非読込非書込・sandbox診断/練習/予定・終了時sandboxキーのみ削除・一般受講生非表示）／
UI・a11y（Recovery focus・alert・SVG aria・320px・200%zoom・contrast対象・44px・keyboard完走・reduced motion）／
回帰（既存701テスト・完全完走・復習予定接続・LearningClock・role推薦・Decision Console・
Connectivity Inspector・Error Boundary）／tsc・lint・build・staging console・network 4xx・画像404。

### 16. staging実ブラウザ確認
- **Journey C（診断reload）**: 途中reload → 回答保持または安全な未確定復帰 → 診断完了 → Step3復帰
- **Journey D（練習reload）**: 1語目card/quizでreload → 続きから再開 → 2語目完了後reload →
  3語目assess直後reload → 復習予定重複なし → Step4復帰 → 実結果一致
- **Journey E（部分成功Recovery）**: sandbox内に「schedule生成済み・contract未完了」等を作り、
  Recovery後に重複なくStep4到達。**通常キーを操作しない。**
- **Journey F（schema Recovery）**: sandbox内で古い/不整合schemaを作り、通常進捗非影響・
  Journey Recovery表示・再開または安全な再スタート・無限reloadなしを確認

### 17. 推奨コミット
2〜6件（推奨4件）。例: `feat(...)` 系3件＋`test(learning): cover reload schema recovery and accessibility`

### 18. 完了条件（要点）
診断途中/最終回答後reload・Step3復帰・card/quiz/assess途中reload・1〜3語目後reload・
schedule生成後/contract完了後/Step4更新後reload・Step4実結果一致・復習予定重複なし・
completedTaskIds重複なし・token再利用なし・Journey完了一度のみ・部分成功Recovery・
snapshot欠損Recovery・schema 5分類・reload loopなし・sandbox UI接続と非影響と限定削除・
一般受講生非表示・SVG a11y・200%zoom・contrast確認または正確な未確認報告・
モバイル全幅overflow0・44px未満0・keyboard完走・全テスト成功・tsc 0・lint増分0・build成功・
bundle増減報告・lazy chunk報告・staging console error 0・4xx 0・画像404 0・
教材本体/human_reviewed/approved/Supabase/migration/RLS/認証/OTP/learner正式データ/
masteryState/XP/current_week/会話履歴/admin_overrides/本番 すべて変更なし・main未マージ。

### 19. STOP_FOR_HUMAN条件
reload復帰の正式DB保存が必要になった場合、learner正式データに触れる必要が出た場合ほか
（§1禁止事項に該当する変更が必要になった時点で停止）。
