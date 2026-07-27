# Phase 2E-1.11 完了報告書（First-Run Guided Journey & Learner Recovery UX）

日付: 2026-07-27〜28（夜間セッション overnight-20260727-c・ループ#1）
依頼元: ChatGPT「AI日本語学習監督」の分析（decision=CONTINUE・prompts/2e1-11-prompt.md）
ブランチ: feature/ai-course-learning-polish ／ staging反映済み

## 1. 初回判定（§3）

6状態を一箇所（`firstRunJourney.ts`）で決定的に導出:

| 状態 | 条件 |
|---|---|
| true_first_run | 初回記録なし＋学習履歴なし＋復習予定なし |
| onboarding_in_progress | 初回記録あり・未完了 |
| onboarding_completed | completedAt あり |
| **returning_learner** | 初回記録はないが学習履歴 or 復習予定がある（**初回へ戻さない**） |
| corrupted_onboarding | JSON破損・step値が不正 |
| incompatible_schema | schemaVersion不一致 |

ローカル状態のみ参照（正式DB・learnerデータ非参照）。重い全教材走査はしない。

## 2. 4ステップJourney（§4-§5・§11）

1. **学習の目的**（4択・自由入力なし・既存トラックへ対応。新しい正式トラックは作らない）
2. **短い確認**（既存の開始診断へ。問題数上限は変えない・「テストではありません」と明示）
3. **最初の練習**（学習者向けの推薦理由。例:「N3で大切な使い分けを確認します」）
4. **完了**（復習の仕組みを一文:「今日まよったことばは、忘れかけるころにもう一度出てきます。」）

- 進捗表示: 「ステップ n / 4」＋ステップ名＋`aria-current="step"`＋sr-only説明（色だけに依存しない）
- 戻っても回答（目的・確認済み）は消えない／完了後は戻れない（完了処理の再実行防止）
- 完了は複数回記録しない（`completedAt` を上書きしない）
- 各画面の第一CTAは一つ、補助CTAは最大2つ
- 内部用語（remedial／retained_preview／masteryState／roleDriven／contextual等）は表示しない（テストで担保）

## 3. Recovery UX（§7-§8）

| 状況 | 対応 |
|---|---|
| 問題を読み込めない | 簡潔な説明＋再試行＋ホーム（stack trace非表示） |
| 問題が不足 | 学習を止めず代替の練習へ／代替がなければホーム |
| ローカル状態が壊れている | **初回状態だけ再構築**。語彙進捗・復習予定は消さない。「すべての進捗を削除」は提示しない |
| 保存できない | クラッシュせず簡潔に通知し学習継続。保存成功を偽らない |

`LearnerErrorBoundary`: 学習Journey範囲の描画エラーを捕捉。**再試行は上限2回**（無限ループ防止）・
ホームへ戻れる・consoleには開発情報を残すが学習者には出さない・開発者詳細はlabPreviewの折りたたみ内のみ。

## 4. 実ブラウザ確認（staging・sho認証済み）

- 空状態から初回案内が表示され、Step1（4択・aria-current）→Step2（「テストではありません」）→
  **リロードでStep2から再開**→Step3（推薦理由「N3で大切な使い分けを確認します」）→Step4→練習画面へ遷移、を完走
- 学習履歴がある状態では初回案内が出ないことをテストで担保

## 5. 品質ゲート

| 項目 | 結果 |
|---|---|
| テスト | **669件全パス**（2E-1.10の644 → +25。初回判定12・初回UI13） |
| tsc | 0エラー |
| lint | 45E/6W=51（ベースライン一致。実装中に検出した+2E/+1Wをすべて解消） |
| build | 成功 |
| bundle | main 590.30KB **増加0**・FirstRunJourney 4.05KB（lazy） |
| staging | console error 0 |

## 6. ガードレール遵守

共有Supabase・migration・RLS・Secrets・認証・OTP・決済・learner正式データ・Andyさん・
current_week・masteryState・XP・会話履歴・Realtime prompt・Edge Function・admin_overrides・
教材本体・human_reviewed・approved・本番・main：**すべて変更なし**。

## 7. インシデント（正直な報告・R9）

実機検証で「初回状態」を再現するため、CEO端末のstagingタブの sessionStorage 3キーを
一時退避してから削除しました。退避値を `window` 変数に置いたまま `location.href` で遷移したため
**退避値が失われ、`ai_course_vocab_preview_v1`（ことば図鑑の試作進捗・1/78語相当）を復元できませんでした。**

- 影響範囲: sessionStorage（タブを閉じれば消える範囲）の「試作」進捗のみ。
  画面にも「※試作確認のため、この記録は正式保存されません」と表示されている非正式データ
- **正式データ（Supabaseのcurrent_week・masteryState・XP・会話履歴・レッスン進捗）は非接触で影響なし**
- 再発防止: 退避が必要な検証はページ遷移を挟まない単一スクリプト内で完結させる。
  空プロファイルの検証は別タブ/別プロファイルで行う（risk-register R9 に記録）

## 8. 未完成・人間判断待ち

- Step2/Step3から診断・練習へ遷移した後、Journeyへ自動で戻る導線は未実装（現在はことば図鑑トップ経由）
- 実スマートフォンのタッチ・ソフトキーボード確認（CEO確認事項）
- contrast自動計測・会話generic 127語のcontextual化
- **CEO判断**: root P0=1・root P1=13／admin_overridesのRLS／正式DB保存方式
