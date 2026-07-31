# Phase 2E-1.5 完了報告書（教材第二校正・認証済み実機UX監査・Premium UI最終調整）

日付: 2026-07-27 ／ ブランチ: feature/ai-japanese-demo ／ staging反映済み
関連: `phase-2e1-5-dual-ai-review.md`・`phase-2e1-5-ai-review-summary.md`・`phase-2e1-5-auto-fix-log.json`・`authenticated-ux-audit.md`・`mobile-navigation.md`・`vocabulary-relations.md`

## 1. 二重AIレビュー（§2-§7）

- ChatGPT独立監査を新規チャット「AI日本語教材 第二校正」で実施。7バッチ（15-25語）で**140/140語**収集
- 共有したのは教材データのみ（learner名/ID/email/Andyさん情報/shoアカウント/認証情報/APIキー/Supabase情報は一切非共有）
- `vocabChatgptReview.ts` に140件のExternalVocabularyReviewを格納（レビュー画面lazy chunk専用・mainに入れない）
- `buildReviewComparisons()`: Claude評価と突き合わせ→一致/不一致/優先度P0-P3を導出。
  採用済み提案は `resolveAdopted()` で解決済み扱い（未採用分は不一致のまま残す）
- 集計: **consensus 52 / disagreement 73 / human_required 15。P0=1・P1=4・P2=83・P3=52**
- AIレビューで human_reviewed / approved には一切しない（テスト担保・全140語draft維持）

## 2. 自動修正（§8・両AI high confidence一致のみ・全60件+draft分類90件）

- 中国語例文の自然化31件（主語・量詞・目的語補完: 买水。→我买水。等）
- 明白な誤訳・不整合4語: fi-komaru（不认识汉字→不会读汉字）・fi-ikutsu（「要几个？」の意図付加→例文再設計「りんごはいくつありますか。／有几个苹果？」）・fi-houhou（原文にない「单词」除去）・fi-sorede（結束性: 会社に遅刻を明示）
- meaningZh軽微拡張9件・既存cognate分類の訂正8件（fi-jouhou mostly_same→false_friend「情报=谍报」等）・learningFocusZh注記10件・ふりがな同期2件
- unreviewed→両AI合意のdraft cognate分類90語（基礎49＋N3 41・すべて人間確認待ち）
- **適用しなかったもの**: fi-namae（ChatGPT自身がhuman:true→P0のまま例文維持）・cognate不一致10語＋fi-kyoumi・
  role提案約40語（optional→diagnosticはカリキュラム判断）・fi-jiyuu例文訳（対象語との対応優先）
- 全件 `phase-2e1-5-auto-fix-log.json` に before/after/カテゴリで記録・`AUTO_FIXED_ITEM_IDS`（43語）と同期

## 3. レビュー永続化（§11-§12）

- sessionStorage v1 → **localStorage v2**（`ai_course_vocab_review_local_v2`・schemaVersion 2・一度だけ移行）
- export形式はv1固定（過去exportとの互換）。容量超過時は壊さずフラグ→UI警告。dataVersion不一致警告。全消去はconfirm付き
- 実機確認: 判定→リロード→保持を確認済み

## 4. レビューUI（§13）

- デフォルトフィルター「重要項目（P0/P1）」=5件。P0/P1/P2/P3・AI一致/不一致/人間確認必須/自動修正済みフィルター追加
- AI比較カード: Claude/ChatGPT別の5フィールドstatus・不一致リング・両者rationale・suggested draft表示（人間承認ではない旨明記）
- 実機でフィルター件数がdualReviewSummary()と完全一致を確認（73/15/43/1）

## 5. N3診断再設計（§21）

- 16問（診断11＋probe5）: 自他（決まる/変わる）・助詞（〜に慣れる）・活用（続けて/続いて）・false friend（都合）
- probeはrequired語のroleを変えず次元記録のみ・回答済み次元は再出題しない・12〜18問レンジをテスト担保

## 6. モバイルナビ案A・Premium調整（§16-§19）

- labPreviewモバイル: 主要4項目＋「その他」シート（成長・設定・Escape/外側クリック/aria-expanded）。一般受講生は変更なし
- Typographyトークン（--type-display〜--type-ruby-size）・ruby rt 0.6em
- ロードマップ文言に物語性（まず確認→必要なことばを学ぶ→問題で確認→日を空けて復習＋why）
- 成長画面に次の一手CTA 1つ（要復習>0ならクイック復習、なければ今日のことば）

## 7. 語彙関連・画像

- VocabularyRelation 14件（自他ペア5＋類義9・高確信のみ・対称解決・詳細画面に最大2件）
- 画像: 乗る/降りる/入る/出る4枚を対構図で追加インポート（計28枚・全draft・WebP 800w+320wサムネ）
- 未生成8枚（対比4: 高い安い/近い遠い/新しい古い/多い少ない・場面4: 買い物/駅/病院/レストラン）は次フェーズへ繰り越し（正直な報告）

## 8. 品質ゲート

- テスト: **577件全パス**（+2: 収集完了検証・自動修正反映検証）
- tsc -b --force: エラー0 ／ ESLint: 45E/6W=51件（ベースライン一致・AIコース領域0・増分0）
- バンドル: main 590.30KB（+1.1KB）/ gzip 169.96KB（+0.46KB）— 予算+5KB/+2KB内。
  レビューデータはVocabReviewPanel lazy chunk（80.8KB）のみ
- staging: console error 0・画像404 0・認証済み実機監査は `authenticated-ux-audit.md`
- 変更禁止領域（設定/Secrets/Supabase/migration/RLS/認証/Stripe/本番/Andyさん系）は非接触

## 9. 残タスク・人間レビュー待ち

1. **P0**: fi-namae の例文（王姓の読み・姓名範囲）— CEO判断待ち
2. **P1**: fi-komaru（meaning提案）・fi-tsugou/fi-taihen（Sense未レビュー）・fi-kyoumi（FF vs mostly_same）
3. cognate不一致10語の判定（nihongo/kaishain/nanji/tomodachi/yasui/genki/kibun/soudan/zenzen/yakusoku）
4. role提案（基礎会話トラック optional→diagnostic）の採否
5. 残画像8枚の生成・モバイル実表示の目視確認（Chrome非フルスクリーン時）
6. Phase 2E-2 前提条件は依頼書§43を参照
