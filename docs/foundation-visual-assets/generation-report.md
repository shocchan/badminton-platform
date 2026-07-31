# 画像生成進捗レポート（§78）

- 最終更新: 2026-07-27 03:40 JST
- 生成経路: Claude in Chrome → ログイン済みChatGPT（Plus）→ 専用チャット「日本語教材イラスト生成」
- 共通スタイルプロンプト送信済み・パイロット6枚の品質評価PASS（成人向け・動作明確・文字なし・スタイル統一）

| 状態 | 件数 | 内訳 |
|---|---|---|
| displayed（取込・表示可・draft） | 12 | 動詞10（行く/来る/食べる/働く/住む/勉強する/飲む/見る/聞く/話す）＋対比2（大小/暑寒） |
| generating途中/破棄 | 2 | 読む（写実調×2回・再指示でも不改善） |
| queued（未生成） | 21 | 残り動詞・形容詞対比4種・場面5種ほか |

- 取込処理: 0byte/寸法/4:3/SHA-256重複チェック→メタデータ除去→WebP変換（detail 800w 20-43KB・thumb 320w 4-9KB）→public配置→manifest登録（reviewStatus=draft）→docs再生成→テスト
- 再開ポイント: generation-progress.json の nextAssetId = va-verb-yomu-scene（3回目試行から）
- すべてdraft・labPreview限定表示・approvedなし（人間レビュー待ち）
