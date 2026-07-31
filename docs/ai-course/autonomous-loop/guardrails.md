# 自律改善ループ ガードレール（§52/§54/§55・変更時はCEO承認必須）

## 絶対禁止（検出したら次Phaseを実行しない）

- mainへのmerge・本番デプロイ（scripts/deploy-production.sh）・公開範囲変更・一般利用者への公開
- 共有Supabaseの変更全般: migration適用・RLS変更/適用・policy変更・admin_overrides変更・learner追加/データ変更・本番バックフィル・データ削除
- Secrets/APIキー/.env/.claude/settings.json の作成・変更
- 認証・OTP・login-guard・Stripe・料金・決済の変更
- learnerの current_week / masteryState / XP / 通常会話履歴 の変更
- Andyさんアカウント・データへの一切の接触
- Realtime promptの全面変更・Edge Functionの本番変更・Realtimeセッション本接続
- 外部有料サービスの新規利用・課金が発生するAPIの新規利用・無制限API利用
- 教材/画像の human_reviewed / approved への自動昇格・人間判断の自動確定
- 不可逆Git操作（git reset --hard等での他変更の破壊・force push）・不可逆migration
- 公開LP変更・法務/規約/プライバシー判断

## ChatGPTへの共有禁止

APIキー・Secrets・Cookie・認証トークン・learner ID・email・Andyさん情報・実会話全文・
Supabase接続情報・支払い情報・個人情報・ブラウザ保存パスワード・リポジトリ全体のアップロード

## 自動継続可能（既存ガードレール内に限る・§54）

labPreview UI改善／staging限定UX改善／静的draft教材追加・監査／docs／tests／TS・lint増分修正／
lazy load・bundle改善／画像生成・最適化・VisualAsset整理／placeholder・SVG／ふりがな・中国語・診断問題draft／
session/localStorage／内部レビュー画面・Decision Console／dry-runスクリプト／migration **draft**（適用禁止）／
RLS・Edge **設計docs**／Release Candidate manifest／staging deploy・E2E／accessibility／responsive／
security audit／human decision packet作成

## 停止して人間判断（§55）

main／本番／公開範囲／共有DB適用／admin権限／Edge本番／Realtime本接続／APIキー追加／Secrets／
外部有料／Stripe／認証／OTP／learnerデータ移行／Andyさん適用／教材のhuman_reviewed・approved確定／
CEOの教育方針判断／料金・コース内容／公開LP／法務／不可逆操作 に到達した場合。
停止時は質問だけで終わらず decision-packets/ へ CEO Decision Packet を作成する。

## ループ制限（§57-§58）

- 1セッション最大5ループ or 実作業8時間相当の早い方（超過時 stopReason=AUTONOMOUS_SESSION_LIMIT）
- 1 Phase = 目的1〜3個・論理コミット2〜6件・既存機能を壊さない・stagingで確認可能
- ChatGPT提案の巨大Phaseは分割・極端な細分化もしない

## 品質ゲート（§70・全て満たさない限り次Phaseへ進まない）

git安全／テスト成功／tsc成功／build成功／lint増分0／Secret scan成功／PII scan成功／
staging deploy成功／console重大エラー0／禁止変更なし／人間判断なし／
ChatGPT decision=CONTINUE／prompt validator=pass（＋Claudeの意味判断）／blocking riskなし
