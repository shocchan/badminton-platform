# Phase 2E-1.12 完了報告書（Guided Journey Continuity & Safe Local State Isolation）

日付: 2026-07-28（夜間セッション overnight-20260727-c・ループ#2）
依頼元: ChatGPT「AI日本語学習監督」（decision=CONTINUE・prompts/2e1-12-prompt.md）
ブランチ: feature/ai-course-learning-polish ／ staging反映済み

## 1. ローカル状態の安全分離（§11-§14・R9再発防止の中核）

`courseStorageRegistry.ts` を新設し、**9キー**を登録:

| キー | owner | resettable | 学習者影響 |
|---|---|---|---|
| ai_course_vocab_preview_v1 | learner_progress | **false** | 学習した語・自己評価・問題結果が失われる |
| ai_course_vocab_schedule_preview_v1 | learner_progress | **false** | 翌日/3日後/7日後の復習予定が失われる |
| ai_course_first_run_v1 | learner_journey | true | 初回案内を最初から（学習記録は残る） |
| ai_course_journey_task_v1 | learner_journey | true | 進行中の往復情報のみ |
| ai_course_journey_sandbox_v1 | learner_journey | true | 検証用の一時状態のみ |
| 教材レビューv2/v1・判断ドラフト・Console UI | lab_review / lab_ui | false | 学習者に影響しない |

- `JOURNEY_RESET_ALLOWLIST` = Journey用3キーのみ。**allowlist外の削除要求は refused として拒否**
- `storage.clear()`・prefix一致削除・正規表現削除は**使わない**（StorageLike型が clear を持たないことでも担保）
- `createJourneySandbox`: 検証用の分離namespace。通常キーを読まず・書かず、終了時はsandboxキーのみ削除
  → **R9（検証で学習進捗を消した事故）を構造的に再発不能にした**

## 2. Journey Task Contract（§4-§5）

`journeyTaskContract.ts`: journeyId／activeTaskType／activeTaskId／activeTaskStatus（6状態）／
使い捨てcompletionToken／usedTokens／completedTaskIds／completionSnapshot。

完了は **journeyId・taskId・未使用tokenの3点一致**でのみ成立:

| 拒否理由 | 意味 |
|---|---|
| no_contract / journey_mismatch / task_mismatch | URL書換えやbrowser backだけでは完了にならない |
| token_used / already_completed | 完了画面の再表示・backでも二重完了しない |
| save_failed | 保存できなければ完了成功を返さない（偽らない） |

## 3. 診断・練習からの自動復帰（§6-§8）

- 診断完了 → 契約completed＋`completeCheck()` → **Step3へ自動復帰**
- 練習完了 → 契約completed＋`completePractice()` → **Step4へ自動復帰**
- Step4は実結果を表示（確認した項目／自分でできた／ヒントがあった／もう一度確認する）。
  **取得できなかった値は0と断定せず**「一部の結果を表示できませんでした」と伝える
- 中断復帰カード:「確認の続きがあります／最初の練習の続きがあります」＋続きから／いったんホームへ

## 4. 実機で検出・修正した不具合

**契約はcompletedになるがJourneyのstepがStep2のまま止まる**不具合を、staging実機の往復検証で発見。
契約完了とJourneyステップ進行を必ず同時に行うよう修正し、回帰テスト3件を追加。
修正後、実機で **診断完了 → step:practice・「ステップ 3 / 4」表示・契約completed（checkedCount 28）** を確認。

## 5. 実機確認の範囲（正直な記載）

| 項目 | 結果 |
|---|---|
| Step1→2（目的選択） | ✅ 確認 |
| Step2→診断（契約発行: in_progress・token発行） | ✅ 確認 |
| 診断完了→**Step3自動復帰** | ✅ 確認（修正後） |
| Step3→練習（契約発行: practice・in_progress） | ✅ 確認 |
| 練習完了→Step4自動復帰 | ⚠️ **未完了**。ブラウザ自動操作が繰り返しタイムアウトし、
  3語の完走まで到達できなかった。**ユニットテストでは担保**（診断完了→Step3・練習完了→Step4・二重完了防止） |
| CDN伝播 | 初回はハードリロードが必要だった（新チャンク配信を確認して再検証） |

## 6. 品質ゲート

| 項目 | 結果 |
|---|---|
| テスト | **688件全パス**（2E-1.11の669 → +19。契約・分離16＋往復回帰3） |
| tsc | 0エラー |
| lint | 45E/6W=51（ベースライン一致） |
| build | 成功 |
| bundle | main 590.30KB **増加0**・FirstRunJourney 5.89KB lazy・VocabularyHub 57.16KB |

## 7. ガードレール遵守

共有Supabase・migration・RLS・Secrets・認証・OTP・決済・learner正式データ・Andyさん・
current_week・masteryState・XP・会話履歴・admin_overrides・教材本体・human_reviewed・approved・
本番・main：**すべて変更なし**。消失した試作進捗の推測復元も行っていない（§21遵守）。

## 8. 未完成・人間判断待ち

- 練習完了→Step4のstaging実機確認（ユニットテスト済み・次回セッションで再試行）
- browser back/forwardの実機テスト（契約側の二重完了防止はテスト済み）
- サンドボックスUIの導線（コードは実装済みだがJourney開始導線への接続は未実施）
- 実機スマートフォン・contrast自動計測
- **CEO判断**: root P0=1・root P1=13／admin_overridesのRLS／正式DB保存方式
