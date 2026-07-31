# Phase 2E-1.15 依頼文（ChatGPT「AI日本語学習監督」生成・2026-07-28 ループ#5）

decision = **CONTINUE**

## Phase 2E-1.15「Result Meaning Clarity & Version-Safe Learner Recovery」

### 0. 目的
新しい教材・学習機能・内部管理画面を追加しない。目的は3つ。
1. Step4の結果表示を、**クイズ正誤と自己評価の二軸**が学習者に正しく伝わる表示へ改善する
2. Journey schemaを分類し、未対応・破損・新しいversionを学習者向けRecoveryへ安全に接続する
3. 部分成功Recoveryをstaging実ブラウザで実証し、復習予定・完了処理の重複がないことを確認する

**復習間隔・採点・自己評価による予定生成規則は変更しない。**

### 1. 作業条件
ブランチ feature/ai-course-learning-polish・labPreview限定・stagingまで。
禁止: mainマージ／本番デプロイ／共有Supabase／migration／RLS／Secrets・APIキー／認証・OTP／
料金・決済／learner正式データ／Andyさん／current_week／masteryState／XP／会話履歴／
Realtime prompt全面変更／Edge Function本番／admin_overrides／教材本文・meaningZh・exJa・exZh／
cognate・role確定値／human_reviewed・approved／root P0・P1判断／**復習間隔変更／正誤判定変更／
自己評価の意味変更／「まだ不安」「覚えたと思う」の予定生成規則変更**／診断問題数変更／練習語数変更／
storage.clear／prefix・wildcard・正規表現削除／通常進捗削除による検証／外部有料サービス／
大型ライブラリ追加／新しい内部管理ダッシュボード。必要になったら STOP_FOR_HUMAN。

### 2. Step4表示問題の原因監査
確認された例: checked=3 / independent=0 / supported=0 / needsReview=0
（入力: クイズ誤答＋自己評価「覚えたと思う」）

この数値が内部仕様上なぜ成立するかをコードとデータから確認し、最低限
**quiz correctness／hint usage／self assessment／review schedule decision／presentation category**
を分離する。現在の independent／supported／needsReview が何を数えているか、互いに排他的か、
checked の完全な内訳を意図しているかを明文化する。

> **数値を合計に合わせるために、既存結果を別カテゴリへ勝手に再分類しないこと。**

### 3. 学習者向け結果モデル
内部の正誤・補助・自己評価を保持したまま、learner-facing専用の派生表示モデルを作る。
推奨概念: checkedCount／correctCount／incorrectCount／answeredWithSupportCount／
feltConfidentCount／feltUnsureCount／scheduledForReviewCount／nextReviewDate／partial（名称変更可）。

要件: checkedCountと正誤内訳が可能な範囲で整合する／自己評価を正誤の代わりにしない／
**クイズ誤答＋「覚えたと思う」を「自分でできた」と表示しない**／「覚えたと思う」で予定を消さない
既存ルールを維持／ヒント未使用と正解を混同しない／データ欠損時に0と断定しない／
partialなら確認できた項目だけ表示／internal state名を表示しない。

### 4. 第一CTA
一つだけ・補助CTA最大2つ。
**合計と内訳が一致しない場合は、内訳を合計の分解として見せない。**
例:「今日確認したことば：3」「正しく答えられた：2」「明日もう一度確認：1」のように、
それぞれ別軸だと分かる表示にする。

### 5. 表示文言
成人中国語母語者向けのやさしい日本語。
推奨: 今日確認したことば／正しく答えられた／ヒントを使った／まだ少し不安／もう一度確認する／
次の復習／一部の結果を表示できませんでした。
避ける: independent／supported／needsReview／retained／confidence score／mastery／
assessment state／review classification／partial snapshot。
中国語補助は付けてよいが画面密度を上げすぎない。

### 6. 結果グラフ
既存の横棒グラフを監査する。要件:
- **合計の完全な内訳でない指標を stacked breakdown のように見せない**
- 0件の棒を描かない／欠損値を0として描かない／件数を必ず文字でも表示
- グラフはaria-hidden・テキストを主情報に
- クイズ正誤と自己評価を同じ軸の競合カテゴリとして扱わない
- 188px相当でも横overflowを作らない
- 適切なら棒グラフを正誤結果のみに限定し、自己評価・復習予定は別のテキストカードへ分離
- 大規模なデザイン刷新は不要

### 7. Schema分類
保存済みJourney状態を `same_schema` / `safely_migratable` / `incompatible_schema` /
`corrupted_state` / `newer_than_client` へ分類。**判定を一箇所へ集約し決定的にする。**
- same_schema: 通常読込
- safely_migratable: 明確な変換規則があり情報を失わない場合のみ自動移行。
  現在のv1→v2互換処理をこの分類へ統合。**再読込しても再移行しない**
- incompatible / corrupted: 「学習の続き方を確認できませんでした。」＋
  「この初回学習を最初から始める」「ホームへ戻る」。Journey状態のみ対象・
  語彙進捗と復習予定を削除しない・sandboxならsandbox状態のみ・自動完了しない・
  完了済みsnapshotが安全なら保持・技術詳細はlabPreview折りたたみ内だけ
- newer_than_client: 「新しい状態で保存されています。ページを読み直してください。」＋
  「もう一度読み込む」「ホームへ戻る」。**保存状態を上書きしない**・無限reloadしない・
  reload試行回数を制限・Journey状態保持

### 9. Reload loop防止
`recoveryAttemptCount` / `lastRecoveryReason` / `lastRecoveryAt` / `lastSeenSchemaVersion` を持つ。
**既存キーを使えるなら新規キーを増やさない。**
自動reloadは最大1回程度・以後は明示CTA・renderごとにreloadしない・
newer-than-clientへ書込みしない・sandboxと通常Journeyを混同しない。内部情報は学習者へ出さない。

### 10. 部分成功Recoveryの実機実証（Journey E）
sandbox の staging実ブラウザで確認する。
- **E1**: 復習予定あり・active task未完了 → Recovery実行 → 同じ予定を再生成しない・
  contractだけ完了・Step4復帰・completionSnapshot整合
- **E2**: contract completed・step behind → token再消費なし・completedTaskIds再追加なし・
  currentStepだけ修復・Step4復帰
- E3以降（snapshot欠損など）も同様に確認

### 11. Schema Recovery実機（Journey F）
- **F1 migratable**: task・snapshot保持・**一度のみ移行**・通常状態非影響
- **F2 incompatible**: Recovery画面・自動完了なし・初回Journeyのみ安全に再スタート・
  通常の語彙進捗と復習予定を保持
- **F3 corrupted**: render crashなし・Recovery画面・Journeyのみ再構築・通常状態保持
- **F4 newer-than-client**: 状態上書きなし・自動reload loopなし・明示的再読込CTA・ホームへ戻れる

### 12. Contrast確認
外部サービスなしで、主要色トークンのcontrastを計算する**小さな開発用テストまたはスクリプト**を追加。
対象: body text／secondary text／primary CTA／secondary CTA／disabled text／error text／
success text／focus ring／stepper／result graph label／timeline label／Recovery UI。
少なくとも通常本文・主要CTA・エラー・focusについてWCAG AA相当の結果を報告する。
未達があればこのPhaseの対象画面に限定して既存トークンの安全な代替を使う。
**全アプリのテーマ変更はしない。**

### 13. 188px相当の操作領域
現状: 横overflow 0・44px未満操作5件。
5件の操作名と実寸を特定し、主要／補助を分類。1列化・折返し・縦積みで改善可能か検討する。
**横overflowを再発させない／min-width固定だけで解決しない。**
すべてを44pxにできない場合は理由と残件を正確に報告する。通常モバイル幅では44px未満0を維持。

### 14. Sandbox と Storage
新しい状態を追加する場合はregistryへ登録し、総数・session/local・resettable/non-resettable・
learner-impacting・lab-only・各allowlist数を再集計して報告する。

> 以降（§15テスト・§16実機・§17コミット・§18完了条件・§19 STOP_FOR_HUMAN）は
> 前Phaseと同じ観点。抽出時にtruncatedとなったが、§10-§14に同等の受入条件が列挙されている。
