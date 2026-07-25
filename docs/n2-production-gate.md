# N2文法トラック 本番公開ゲート＋デプロイ準備（Phase N2-B2 / 限定公開）

> 状態: 本番公開直前。**本番デプロイ・main マージは人間の明示承認まで実行しない。**
> learner公開は approved のみ。現在 **approved=0**（人間承認前）。

## 1. Batch 1（n2g-001〜010）approved 準備状況
- 教材本文（意味/中国語/接続/ニュアンス/使う場面/追加会話2・読解1・聴解1/類似/差分/誤用/中国語話者メモ/自分用型/問題3）は**全項目 draft で作成済み**。
- **自動 approved にはしていない。** 各項目に `verify_zh / verify_examples / verify_quiz` フラグ。
- approved化の前に人間が確認する未確定点（`docs/n2-grammar-review.csv` / `docs/n2-quiz-review.csv`）:
  1. 中国語訳・接続・ニュアンスの正確性（10項目）
  2. 30問の正解一意性・distractor妥当性（`ambiguityRisk` 欄）
  3. 003「以上は」/007「上は」= **独立維持＋相互リンク**（確定済み方針）で差の記述を確認
  4. 006「上で」= 3 sense（観点/順序/名詞修飾）の妥当性
- **reviewed 候補へ変更可能**: 上記1〜4を人間が確認できれば、CSVの `finalDecision` に基づき reviewed→approved へ（**人間の明示承認後のみ**、`n2GrammarContent.ts` の reviewStatus を 'approved' に変更→再ビルド）。

## 2. 本番公開ゲート（チェック）
| 項目 | 状態 | 根拠 |
|---|---|---|
| approved教材が1件以上 | ⏳ **人間承認待ち**（現0） | 承認で解消。0でもlearnerは「準備中」表示で破綻しない |
| draftがlearnerへ漏れない | ✅ | `learnerVisibleIndex`=approvedのみ。テスト担保 |
| review画面が一般learnerへ漏れない | ✅ **検証済** | 本番build(REVIEW_MODE=false)で review-preview を**tree-shake**（prodチャンクに setShowPreview/未承認=0） |
| ja/zh | ✅ | 全文言 ja/zh・parityテスト |
| N2一覧/詳細/問題ロード | ✅ | 一覧=index、詳細=dynamic import(data/content) |
| 前後移動・戻る | ✅ | approvedのみが対象（learner） |
| API不使用・Realtime誤起動なし | ✅ | 教材/問題は静的。fetch/startVoiceSessionなし |
| 通常AI会話コース・60Mission・認証/招待 非破壊 | ✅ | 変更は N2 追加のみ。既存215テスト green |
| 初期bundle非肥大化 | ✅ | AiCoursePage 145KB不変（N2は遅延・一覧44KB/data72KB/content27KB） |
| 秘密情報なし | ✅ | dist に service_role/sk_ 0 |
| console error | ⏳人間 | staging 実機確認 |
| mobile 320〜390 / keyboard focus | ⏳人間 | 実機確認（focus-visible ring 実装済） |

## 3. 限定公開方針（初回）
- 一般公開せず、**運営者テスト or 限定利用者**で開始。
- learner識別: 既存 `is_test`（`ai_delete_test_learners` 対象）を利用。Andyの本番データと混在させない。
- 実ユーザー進捗は変更しない（教材閲覧は進捗不変・API不使用）。invite/OTP は既存のまま（変更なし）。
- **新規DB変更なし**（is_test は既存カラム）。追加が要る場合は案のみ・未適用で停止。

## 4. 必要env（値は表示しない・既存）
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_AI_LESSON_DEMO_CODE` / `VITE_STRIPE_PUBLISHABLE_KEY`（本番）。N2文法トラックは**追加envなし**（静的教材・API不使用）。

## 5. main との差分・migration/Edge
- 変更は **フロントのみ**（N2文法トラック追加＋既存AIコース）。
- **migration不要**（N2教材は静的データ。DBテーブル追加なし）。
- **Edge Function 再デプロイ不要**（N2は Edge 非依存。`ai-lesson-token` は既に v10 稼働・変更なし）。

## 6. 本番デプロイ手順（人間承認後・未実行）
```
# 0) approved化（必要なら）: n2GrammarContent.ts の対象 reviewStatus を 'approved' に→ commit
# 1) 最終バックアップ: Cloudflare Pages 現行prod deployment ID記録 / Supabase PITR
# 2) 本番env確認（値非表示・4 VITE_変数）
# 3) main へマージ:  git checkout main && git merge --no-ff feature/ai-japanese-demo
#    ※ .claude/settings.json は main 版を維持: git checkout main -- .claude/settings.json
# 4) 本番デプロイ:  ./scripts/deploy-production.sh   （npm run build → wrangler pages deploy dist --branch=main）
#    → REVIEW_MODE=false（production build）で review-preview は露出しない
# 5) スモークテスト（§7）
# 6) 限定利用者へ案内（is_test）
```

## 7. スモークテスト手順（本番）
1. `/ja/` `/ja/activity` 200・通常サイト非破壊・決済初期化エラーなし。
2. `/ja/ai-course` `/zh/ai-course` 200・ログイン画面・Supabase初期化エラーなし。
3. ログイン後 → ロードマップ →「N2文法トラック」→ **approvedのみ表示**（0なら「準備中」）。**review-preview トグルが出ないこと**。
4. approved教材があれば: 詳細が essentials→もっと見る→前後移動→戻る で動く。問題1問表示。API/Realtime 起動なし（Networkタブ）。
5. console error なし。mobile 320〜390。
6. 既存AI会話レッスン・60Mission・復習ノート・成長画面 非破壊。

## 8. ロールバック手順
- フロント: Cloudflare Pages → 前デプロイへ Rollback（§6-1で記録したID）。
- コード: `main` をマージ前コミットへ戻す（未公開なら未マージのままでOK）。
- DB/Edge: 変更なし＝ロールバック不要。
- 教材のみ撤回: 対象 reviewStatus を approved→reviewed に戻して再デプロイ（learnerから即非表示）。

## 9. GO / NO-GO（暫定）
**暫定 NO-GO（人間承認前）。** 技術ゲートは概ね PASS（review非露出・非破壊・bundle・秘密情報）だが、**approved=0**（learnerに出す教材が未承認）。
→ **GO条件**: ①Batch1の10項目を人間レビューで approved 化（中国語/接続/問題の確認）②staging実機（console/mobile/ja-zh/前後移動）確認 ③限定利用者の識別（is_test）確定。この3点が揃えば限定公開GO。

## 10. GO時に実行する最終操作
`§6` の手順（approved化→バックアップ→main マージ→`deploy-production.sh`→スモーク→限定案内）。**現時点では未実行。**

## 11. 残るUX改善（実利用後）
- 詳細ページの情報設計の本格改善（今回は最低限の導線＝学び方5ステップ＋essentials折り畳み＋前後移動のみ）。
- 会話Mission との `linkedMissionIds` 対応付け。
- 聴解トラック（事前生成音声）・読解トラック・模擬試験（別Phase）。
- Batch 2〜10 の教材本文（人間レビュー前提で順次）。
