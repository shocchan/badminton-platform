# Phase 2E-1.16 依頼文（ChatGPT「AI日本語学習監督」生成・2026-07-28 ループ#6）

decision = **CONTINUE**

> 監督の評価: 2E-1.15は判定規則を変えずにStep4の問題を解消した。特に
> **前Phase終盤の独断修正を自らrevertし、正誤・本人の感覚・復習予定を別軸として再設計した判断は適切**。

## Phase 2E-1.16「Learner Recovery Closure & Preproduction Evidence」

### 0. 目的
新しい教材・練習規則・学習機能・内部管理画面を追加しない。
1. **contract_pending Recoveryを学習者向けUIへ接続**し、復習予定を重複させずStep4へ戻れるようにする
2. **schema RecoveryのF1〜F4をstaging実ブラウザで実証**する
3. Journey範囲のfocus視認性を改善し、preproduction判断に必要なlearner-facing証跡を揃える

正式DB保存・RLS・教材承認は対象外。

### 1. 作業条件
ブランチ feature/ai-course-learning-polish・labPreview限定・stagingまで。
禁止（前Phaseに加えて）: **ヒント利用記録の新規追加／hint件数を0として表示**／
全アプリのテーマ刷新／新しい内部管理ダッシュボード。
その他は前Phaseと同じ（main・本番・Supabase・migration・RLS・Secrets・認証・OTP・決済・
learner正式データ・Andyさん・current_week・masteryState・XP・会話履歴・admin_overrides・
教材本文・meaningZh・exJa/exZh・cognate・role確定値・human_reviewed・approved・root P0/P1・
復習間隔・正誤判定・自己評価の意味・予定生成規則・診断問題数・練習語数・storage.clear・
prefix/wildcard/正規表現削除・通常進捗削除による検証）。

### 2. Step4の維持
checkedの完全な内訳はクイズ結果のみ／自己評価を正誤へ混ぜない／復習予定を正誤内訳へ混ぜない／
hint usageはnullのまま「ヒントを使った：0」と表示しない／partialと欠損を0と断定しない／
復習規則を変更しない／**3カード構成を大きく崩さない**。
**このPhaseでは結果分類の再設計を行わない。**

### 3. contract_pending RecoveryのUI接続
対象状態: 練習結果が確定済み・復習予定が生成済み・active taskまたはcontractが未完了・Step4未到達。

Recovery処理の順序:
1. 保存済みpractice結果を確認
2. 既存の復習予定を確認（**同一予定を再生成しない**）
3. 元のcompletion tokenが有効なら**一度だけ**利用
4. 既にtoken使用済みなら completedTaskIds 等から完了を確認
5. **contract完了だけを再試行**
6. completionSnapshot を保存済み結果から取得
7. Journey step を done へ
8. Step4へ遷移し、focusをStep4見出しへ移す

**復習予定や回答を再実行してはいけない。**

学習者向け表示:
- 処理前:「練習結果の保存を完了します。」第一CTA「結果画面へ進む」／補助「ホームへ戻る」
- 成功: Step4へ移動
- 失敗:「練習は終わっていますが、結果画面を開けませんでした。」＋「もう一度試す」「ホームへ戻る」

技術用語を表示しない。

### 4. contract_pendingの冪等性
復習予定は増えない／completion tokenは最大1回／completedTaskIdsは重複しない／
Journey完了日時は最大1件／completionSnapshotを重複作成しない／
Step4再表示で処理を再実行しない／browser back後も二重処理なし。

### 5. E1 実機実証（sandbox）
schedule件数不変・contract completed・token利用最大1回・completedTaskIds重複なし・
step done・Step4表示・実結果一致・reload後もStep4・back後も二重処理なし・通常進捗非影響。
**自動操作が難しい場合は手動実ブラウザ確認でも構わない。**

### 6. F1 safely_migratable（実機）
sandboxでv1状態を作り、v2 clientで確認。
safely_migratable判定／v1→v2変換／journeyId・task情報・completedTaskIds・completionSnapshot・
回答と進行位置を保持／**migrationは一度だけ**／再読込時はsame_schema／通常状態非影響／
語彙進捗・復習予定は非変更。**欠損項目を推測で生成しない。**

### 7. F2 incompatible（実機）
incompatible_schema判定／自動完了なし／render crashなし／Recovery画面／
第一CTA「初回学習を最初から始める」・補助「ホームへ戻る」／Journey sandbox状態のみ再構築／
通常状態非変更／復習予定非削除／無限reloadなし。
**既存の完了snapshotが安全に読める場合でも、Journeyを勝手に完了させない。**

### 8. F3 corrupted
不正JSON／必須field欠損／不正な型／不可能な状態組合せ。
corrupted_state判定／Error Boundaryへ落ちずRecovery表示／Journey sandbox状態のみ再構築可能／
通常状態非変更／stack trace非表示／labPreview詳細は折りたたみ／Recovery CTAでループしない。
**すべてを1つの実機シナリオにまとめられない場合、代表1件を実機・残りをテストで担保してよい。
その区別を報告すること。**

### 9-10. F4 newer_than_client ／ Recovery UXの共通要件
補助CTA最大2つ／二重クリック安全／Enter連打安全／処理中は再操作不可／成功を偽らない／
focus移動／role="alert"または適切な通知／技術用語なし／ホームへ戻った後も通常状態維持／
sandbox終了時はsandbox allowlistのみ削除。
**待機が観測されない場合は常時spinnerを追加しない。**

### 11. Focus ringの局所改善
現在の共通focus ringは indigo-400（2.98:1）で3:1にわずかに未達。
**全アプリのテーマや共通ActionButtonを変更せず**、learner-facing Journey／Recovery範囲のみで改善する。
優先手段: Journey内でより高contrastなring tokenを指定／ringにoffsetを追加／outlineとの併用／
componentの局所class override。
要件: 主要背景に対して3:1以上（CTA・Recovery CTA・ステップ選択・中断カード・ナビゲーション・
第一CTA・補助CTA）／keyboard focusが視認可能／mouse click時に不必要に常時表示しない／
`:focus-visible`を優先／通常デザインを大きく変えない。
**共通ActionButtonを全アプリ変更する必要がある場合は実装せず、人間判断事項として残す。**

### 12. Contrast再計測
前Phaseの20項目を維持し、focus ring改善後に再計測。
報告: 計測項目数／合格数／未達数／focus ring比率／背景別の最小比率／gray-500維持／
Recovery UI／Step 4／sandbox banner。WCAG AA相当の本文・主要CTA・エラー・focusを確認。

### 13. 188px・モバイル回帰
188px相当／320／375／390／430／768／desktop で 横overflow 0・44px未満の主要操作0 を維持。
