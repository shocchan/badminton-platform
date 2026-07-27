# Phase 2E-1.10 完了報告書（Release Readiness Learner Journey & Learning Loop Closure）

日付: 2026-07-27（夜間自律セッション overnight-20260727-c・ループ0＝CEO直接依頼）
ブランチ: feature/ai-course-learning-polish ／ staging反映済み
モデル: Fable 5 → Opus 5（同一セッション継続・§49の再確認手順を実施）

## 1. 今回の目的

内部監査の高度化ではなく、2E-1.9で発見した構造的欠陥を**実際の学習体験へ接続**すること。
「間違えたことばが翌日・3日後・7日後に戻る」「roleが推薦に効く」「会話コア語が診断・会話に出る」
「学習完了と次回予定が分かる」状態を作った。

## 2. 間隔反復（Priority 1・§3-§5）

| 出題結果 | 次回 | 段階 |
|---|---|---|
| 誤答 | 翌日 | day1 |
| 補助あり正解 | 3日後 | day3 |
| 自力正解 | 7日後 | day7 |
| **別の日**に2回目の自力正解 | 14日後 | retention_candidate |

- 同日の再正解では段階を進めない／「覚えたと思う」で予定は消えない／「まだ不安」は予定を作り優先度を上げる
- Sense別管理・弱点次元の追加解除・期限超過優先の決定的ソート・壊れたstorageで落ちない
- `LearningClock` でローカル日付を単一情報源化（UTC変換で日付がずれない・テストで固定時刻注入）
- **retained_previewは正式な習得ではない**（利用者向けには「定着を確認中」等のみ表示・テストで担保）
- 保存先 `ai_course_vocab_schedule_preview_v1`（sessionStorage）＝**正式保存ではない**

## 3. role→推薦の接続（Priority 2・§8-§9）

11段階の決定的優先順位を実装:
期限超過→今日期限→前回誤答→本人が不安→remedial→pack required→pack diagnostic→単元→optional→enrichment→探索

- 各推薦に**説明可能な理由**を付与（「前回まちがえたことばです」等・根拠不明なAI推薦表現なし）
- `roleDriven` でroleが順位に効いたことを可視化
- confirmed diagnosticは後回し／N2で transparent_same 基礎語を新語優先しない／同じ語を毎日繰り返さない
- `compareRolePreview`: role提案57件を**教材へ確定せず**影響だけ試験表示（教材不変をテストで担保）

## 4. 会話コア11語の接続（Priority 3・§10-§11）

対象11語（実データから導出・手入力リストなし）: 住む・働く・勉強する・行く・来る・食べる・見る・話す・聞く・飲む・先生

- **診断**: `CONVERSATION_CORE_POOL` を追加（助詞・活用・使い分けを確認）。
  診断セットへ**決定的ローテーションで最大2問ずつ**（問題数の上限は変えない・未出題語をconfirmedにしない）
- **会話**: fi-sensei の対象語別練習を追加 → **会話コア11語すべてが練習へ接続**（§11のRelease Minimum達成）

## 5. 接続監査の改善（§26）

| surface | 変更前 | 変更後 |
|---|---|---|
| 診断 | connected 129 / partial 11 | **connected 140 / partial 0** |
| 復習 | partial 140 | **connected 140** |
| 会話 | connected 12 / unverified 128 | connected 13 / unverified 127 |

接続品質4段階（none/generic/contextual/verified）を導入:
**verified 320・contextual 113・generic 127・none 0**（560）。
会話の127語は「AI会話への一般導線のみ」＝genericで、**完成した接続として数えない**。

## 6. 学習ループUI（Priority 4・6・§6・§15-§17）

- ことば図鑑の第一表示に「今日の復習」（件数＋所要時間・内訳は折りたたみ・0件なら非表示）
- ホーム第一CTAの最優先を語彙の期限復習へ（理由と件数を明示・第一CTAは一つのまま）
- **学習完了画面**: 今日できたこと／次の復習（「行く」は明日もう一度確認します・明日n語）／
  第一CTA「今日の学習を終える」＋補助CTA2つ
- 内部state名（day1・retention_candidate・independent等）を利用者向けに表示しない

## 7. リリース分類・P0継承・用語（Priority 5・§18-§20）

- **release_blocker 14 / before_beta_recommended 77 / can_defer 0**（91件すべてをブロッカーにしない）
- 重大度を分離: `localSeverity` / `inheritedSeverity` / `effectiveSeverity` / `severitySource`
  → **root P0=1（fi-namae:example のみ）・root P1=13**。継承だけのP0はブロッカーにしない
- `rootIssueId` で同じ根本問題を重複カウントしない
- 用語修正: `adopted`→`queuedForReview`「レビュー対象に選定」・`excludedAdopted`→`excludedAlreadyApplied`
  （「採用91」が教材採用・公開承認に見える誤解を解消）

## 8. 実ブラウザ確認（§34）

sho認証済みstagingで実施:

- **Journey B（復習）**: 昨日誤答の状態を注入→「今日の復習 2語（約1分）」→問題→完了画面→
  「「行く」は明日もう一度確認します／明日 2語」まで実機で完走。スクリーンショット取得
- **モバイル**（iframe実測・OSウィンドウはリサイズ不可のため）:
  320/375/390/430/768 全幅で**横overflow 0**・第一CTA高**48px**・**44px未満のタップ領域0**
- 空状態: 期限0件では復習カードを出さない（今日のことばが第一表示）
- 検証用データは実施後に消去。既存の学習進捗キーは無傷（確認済み）
- **未実施**: 実機スマートフォンのタッチ・ソフトキーボード挙動（CEO確認推奨）

## 9. 品質ゲート

| 項目 | 結果 |
|---|---|
| テスト | **644件全パス**（セッション開始時612 → +32） |
| 内訳 | 間隔反復13・推薦9・学習ループUI5・リリース分類4・接続品質1 |
| tsc | 0エラー |
| lint | 45E/6W=51（ベースライン一致・増分0。途中+1警告を検出し即修正） |
| build | 成功 |
| bundle | **main 590.30KB 増加0**・VocabularyHub 54.81KB（lazy） |
| staging | console error 0・4xx 0・画像404 0 |

## 10. ガードレール遵守

共有Supabase・migration・RLS・Secrets・認証・OTP・決済・learnerデータ・Andyさん・
current_week・masteryState・XP・会話履歴・Realtime prompt・Edge Function・本番・main：**すべて変更なし**。
教材の human_reviewed / approved も変更していない。

## 11. 未完成・人間判断待ち

- 初回オンボーディング4ステップ（目標→ふりがな→短い診断→最初の学習）の専用フロー
- 会話 generic 127語 → contextual 化（N3会話重要語の上位20語程度が次の候補）
- contrast自動計測・専用エラー画面
- **CEO判断**: root P0=1（fi-namae例文）・root P1=13（cognate不一致等）
- **正式公開ブロッカー**: admin_overrides のRLS問題／語彙進捗・復習スケジュールの正式DB保存

## 12. 判定

**READY_FOR_PREPRODUCTION ではない**（§28）。preview範囲の学習ループは閉じたが、
root P0/P1のCEO判断・初回Journey・正式DB保存・admin_overrides が残る。
詳細は `docs/ai-course/release-readiness-matrix.md`。
