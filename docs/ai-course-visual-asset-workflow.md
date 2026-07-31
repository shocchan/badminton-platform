# 視覚アセット生成ワークフロー（Phase 2C+ §16・§66-§78)

## 状態遷移
planned（プロンプトのみ）→ generating → generated（ChatGPT上で生成済み）→ downloaded（inbox保存）→
imported（検証・配置済み）→ optimized（WebP/thumbnail）→ displayed（manifest登録・画面表示）
／rejected（3回再生成しても品質不足）／blocked（生成制限等）

## 生成経路（§67）
第一候補: Claude in Chrome → ログイン済みChatGPT → 画像生成機能。
禁止: 新規APIキー発行・.env変更・既存キーの無断転用・有料サービス契約・検索画像の無断利用。
専用チャット「AI日本語教材イラスト生成」で共通スタイルを先に送信（§68）。
パイロット5-6枚→品質評価→バッチ継続（§71）。品質問題は最大3回再生成→rejected（§72）。

## ダウンロード〜取り込み（§73-§74）
保存先: scratchpad/generated-images/inbox/（outputFilename=queueと一致・上書き前にハッシュ比較）。
取り込み: 照合→画像検証（0byte/寸法/比率）→SHA-256→メタデータ削除→WebP変換→thumbnail(320w)/detail(800w)→
public配置→manifest更新（filePath/width/height/reviewStatus=draft）→review docs再生成→テスト→build→staging。

## 進捗管理（§78）
scratchpad/generated-images/generation-queue.json（33件）・generation-progress.json（再開用: nextAssetId等）・
docs/foundation-visual-assets/generation-report.md。完了済み画像を再生成しない。

## ブラウザ安全条件（§76）
他会話の削除/編集・設定/プラン/支払い変更・共有リンク作成・PII/learner情報/顔写真の投入・
未承認ファイルのアップロードを行わない。一般化された教材プロンプトのみ使用。
