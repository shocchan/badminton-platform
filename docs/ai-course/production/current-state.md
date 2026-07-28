# 自律制作セッション 現在地（2026-07-28）

新しいセッションはまずこのファイルと `autonomous-loop-state.json` を読むこと。

## いまどこにいるか

- CEO指示「攻略型・完全版 v1.0」（§0-39・自律継続・上限8Phase/10時間）を実行中
- 完了: **3P-1**（完全Inventory・manifest5本・ベースライン確定）→ **3P-2**（Excel intake・
  全40シート登録・2,089候補終端状態・第一弾614意味分類）
- **停止中: AUTONOMOUS_SESSION_LIMIT**（3 Phase実行後コンテキスト上限）。再開点は autonomous-loop-state.json の resumeFrom
- ブランチ: `feature/ai-course-learning-polish`／テスト873／lint 51不変／main bundle 590.35KB／staging反映済み(3P-3)

## 3P-3の実行案（監督の修正が優先）

1. 会話contextual未達127語の削減（vocabConversationPractice拡張・判定規則不変・draft）
2. オノマトペ100候補の完成draft化（全field揃ったもののみ追加。未完成品を増やさない）
3. reuse_existing 64件のsense統合判断パケット（人間向け）

## 不変の原則

- 未完成は隠さず完成させる（非表示化の例外は権利・法務・内部監査のみ）
- 単一集計・手計算禁止（`generated/*.json` が唯一の情報源、同期ガードテストあり）
- human_reviewed/approved昇格・権利最終判断・共有Supabase/migration/RLS・本番/mainは人間のみ
- 監督ループ: 完了報告→再集計→<AUTONOMOUS_REVIEW>→<NEXT_PHASE_PROMPT>→Validator→意味検証→実行
- ブラウザ操作・ChatGPT入出力の鉄則はメモリファイル `ai-course-autonomous-loop` 参照
